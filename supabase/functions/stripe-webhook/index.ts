// Supabase Edge Function: stripe-webhook
// Securely receives Stripe webhook events, verifies HMAC-SHA256 signature against raw body,
// rejects livemode events in staging, deduplicates by stripe_event_id, and transitions
// order and suborder statuses idempotently without storing unnecessary personal data.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';
import { sendOpsAlert, sendOrderPaidNotifications } from '../_shared/order-emails.ts';
import { recordServerEvent } from '../_shared/product-events.ts';

declare const Deno: {
  env: {
    get: (key: string) => string | undefined;
  };
  serve: (handler: (req: Request) => Promise<Response>) => void;
};

export const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'stripe-signature, authorization, x-client-info, apikey, content-type',
};

// Webhook HMAC-SHA256 verification
export async function verifyStripeSignature(
  rawBody: string,
  signatureHeader: string,
  secret: string
): Promise<{ valid: boolean; reason?: string }> {
  if (!signatureHeader || !secret) {
    return { valid: false, reason: 'Falta cabecera de firma Stripe-Signature o webhook secret' };
  }

  const parts = signatureHeader.split(',');
  let timestampStr: string | undefined;
  const signatures: string[] = [];

  for (const p of parts) {
    const [k, v] = p.trim().split('=');
    if (k === 't') timestampStr = v;
    if (k === 'v1' && v) signatures.push(v);
  }

  if (!timestampStr || signatures.length === 0) {
    return { valid: false, reason: 'Cabecera de firma Stripe con formato no válido' };
  }

  const timestamp = parseInt(timestampStr, 10);
  const now = Math.floor(Date.now() / 1000);
  // Tolerance: 5 minutes (300 seconds)
  if (Math.abs(now - timestamp) > 300) {
    return { valid: false, reason: 'Firma expirada por desfase temporal (tolerancia máxima: 5 minutos)' };
  }

  const payloadToSign = `${timestampStr}.${rawBody}`;
  const cryptoObj = typeof crypto !== 'undefined' ? crypto : (globalThis as any).crypto;
  const encoder = new TextEncoder();
  const key = await cryptoObj.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const signatureBuffer = await cryptoObj.subtle.sign('HMAC', key, encoder.encode(payloadToSign));
  const expectedSignature = Array.from(new Uint8Array(signatureBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

  // Constant-time comparison: do not leak how many leading characters matched.
  const timingSafeEqual = (a: string, b: string): boolean => {
    if (a.length !== b.length) return false;
    let diff = 0;
    for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
    return diff === 0;
  };
  const matched = signatures.some((s) => timingSafeEqual(s, expectedSignature));
  if (!matched) {
    return { valid: false, reason: 'Firma HMAC-SHA256 no coincide' };
  }

  return { valid: true };
}

export async function handler(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'METHOD_NOT_ALLOWED', message: 'Método no permitido' }), {
      status: 405,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const webhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET');
  const allowUnsignedTestEvents = Deno.env.get('STRIPE_ALLOW_UNSIGNED_TEST_EVENTS') === 'true';

  if (!supabaseUrl || !supabaseServiceKey) {
    return new Response(
      JSON.stringify({ error: 'CONFIG_ERROR', message: 'Servicio no configurado correctamente.' }),
      { status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
    );
  }

  const signatureHeader = req.headers.get('stripe-signature') || '';
  const rawBody = await req.text();

  // Signature validation (mandatory unless explicitly in mock unit test mode)
  if (!allowUnsignedTestEvents) {
    if (!webhookSecret) {
      return new Response(
        JSON.stringify({ error: 'CONFIG_ERROR', message: 'STRIPE_WEBHOOK_SECRET no configurado' }),
        { status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

    const verification = await verifyStripeSignature(rawBody, signatureHeader, webhookSecret);
    if (!verification.valid) {
      return new Response(
        JSON.stringify({ error: 'INVALID_SIGNATURE', message: verification.reason }),
        { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }
  }

  let event: any;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return new Response(JSON.stringify({ error: 'INVALID_JSON', message: 'El cuerpo no es un JSON válido' }), {
      status: 400,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  }

  if (!event || !event.id || !event.type) {
    return new Response(JSON.stringify({ error: 'INVALID_EVENT', message: 'Evento Stripe incompleto' }), {
      status: 400,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  }

  // Reject unexpected livemode events in staging
  if (event.livemode === true) {
    return new Response(
      JSON.stringify({ error: 'LIVEMODE_REJECTED', message: 'Eventos livemode no permitidos en entorno Staging' }),
      { status: 403, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
    );
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { persistSession: false },
  });

  // Deduplication check
  const { data: existingEvent, error: dedupQueryError } = await supabase
    .from('stripe_webhook_events')
    .select('id, processing_status')
    .eq('stripe_event_id', event.id)
    .maybeSingle();

  if (dedupQueryError) {
    return new Response(
      JSON.stringify({ error: 'DB_ERROR', message: 'Error consultando registro de deduplicación', details: dedupQueryError.message }),
      { status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
    );
  }

  if (existingEvent) {
    if (existingEvent.processing_status === 'PROCESSED') {
      return new Response(
        JSON.stringify({ received: true, deduplicated: true, status: existingEvent.processing_status }),
        { status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }
    // If event previously failed, allow this webhook retry attempt to reprocess
  }

  // Record receipt in webhook events table
  const paymentIntentId = event.data?.object?.id || event.data?.object?.payment_intent || null;
  const accountId = event.account || null;
  let recordedEventId: string | null = existingEvent?.id || null;

  if (!existingEvent) {
    const { data: recordedEvent, error: insertEventError } = await supabase
      .from('stripe_webhook_events')
      .insert({
        stripe_event_id: event.id,
        event_type: event.type,
        livemode: Boolean(event.livemode),
        account_id: accountId,
        payment_intent_id: paymentIntentId,
        processing_status: 'RECEIVED',
      })
      .select('id')
      .single();

    if (insertEventError) {
      if (insertEventError.code === '23505') {
        // Concurrent duplicate insertion race condition caught
        return new Response(JSON.stringify({ received: true, deduplicated: true }), {
          status: 200,
          headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
        });
      }

      return new Response(
        JSON.stringify({ error: 'DB_ERROR', message: 'Error registrando evento de webhook', details: insertEventError.message }),
        { status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

    recordedEventId = recordedEvent?.id || null;
  }

  // Process event by type
  let processingError: string | null = null;
  let processingWarning: string | null = null;

  try {
    switch (event.type) {
      case 'payment_intent.succeeded': {
        const pi = event.data.object;
        if (pi?.id) {
          const { data: suborder, error: subError } = await supabase
            .from('order_suborders')
            .select('id, order_id, vendor_id, stripe_account_id, payment_status, total_cents, currency')
            .eq('stripe_payment_intent_id', pi.id)
            .maybeSingle();

          if (subError) {
            processingError = `Error consultando subpedido para PI ${pi.id}: ${subError.message}`;
          } else if (!suborder) {
            processingError = `Subpedido no encontrado para PaymentIntent: ${pi.id}`;
          } else if (event.account && suborder.stripe_account_id && suborder.stripe_account_id !== event.account) {
            processingError = `Conflicto de cuenta conectada: evento de ${event.account} no coincide con el subpedido (${suborder.stripe_account_id})`;
          } else {
            // Idempotent transition: only update if not already SUCCEEDED
            const wasAlreadySucceeded = suborder.payment_status === 'SUCCEEDED';
            if (!wasAlreadySucceeded) {
              const { error: subUpdateError } = await supabase
                .from('order_suborders')
                .update({
                  payment_status: 'SUCCEEDED',
                  fulfillment_status: 'AWAITING_SELLER_FULFILLMENT',
                  updated_at: new Date().toISOString(),
                })
                .eq('id', suborder.id);
              if (subUpdateError) throw new Error(`Error actualizando subpedido: ${subUpdateError.message}`);
            }

            // Defense in depth: the amount Stripe collected must be the order total we computed.
            // The buyer has been charged either way, so the order is settled and flagged for review.
            const receivedCents = typeof pi.amount_received === 'number' ? pi.amount_received : pi.amount;
            const receivedCurrency = String(pi.currency || '').toUpperCase();
            if (receivedCents !== suborder.total_cents || receivedCurrency !== String(suborder.currency).toUpperCase()) {
              processingWarning = `REVISIÓN MANUAL: importe cobrado ${receivedCents} ${receivedCurrency} no coincide con el subpedido (${suborder.total_cents} ${suborder.currency}). PI ${pi.id}.`;
            }

            // Each part is one physical unit: take the paid parts out of the catalog for good.
            const { data: soldResult, error: soldError } = await supabase.rpc('mark_order_parts_sold', {
              p_order_id: suborder.order_id,
            });
            if (soldError) throw new Error(`Error marcando piezas como vendidas: ${soldError.message}`);
            const soldConflicts: string[] = soldResult?.conflictPartIds ?? [];
            if (soldConflicts.length > 0) {
              // Already sold to another order: needs a refund. Logged, not retried (retrying cannot fix it).
              processingWarning = `${processingWarning ? processingWarning + ' | ' : ''}REVISIÓN MANUAL: piezas ya vendidas a otro pedido (${soldConflicts.join(', ')}). Pedido ${suborder.order_id} cobrado: tramitar reembolso.`;
            }

            // Check if all suborders for parent order are succeeded
            const { data: allSuborders } = await supabase
              .from('order_suborders')
              .select('payment_status')
              .eq('order_id', suborder.order_id);

            const allPaid = allSuborders?.every((s) => s.payment_status === 'SUCCEEDED');
            const targetStatus = allPaid ? 'PAID' : 'PARTIALLY_PAID';

            const { error: orderUpdateError } = await supabase
              .from('orders')
              .update({
                status: targetStatus,
                updated_at: new Date().toISOString(),
              })
              .eq('id', suborder.order_id);
            if (orderUpdateError) throw new Error(`Error actualizando pedido: ${orderUpdateError.message}`);

            if (!wasAlreadySucceeded) {
              await recordServerEvent(supabase, {
                eventName: 'purchase_completed',
                vendorId: suborder.vendor_id ?? null,
                orderId: suborder.order_id,
                amountCents: suborder.total_cents,
                metadata: {
                  paymentIntentId: pi.id,
                  orderStatus: targetStatus,
                },
              });
            }

            // Tell the seller to ship and confirm to the buyer. Sent once per suborder
            // (order_notifications); a mail failure is logged and never fails the payment.
            const outcomes = await sendOrderPaidNotifications({
              supabase,
              suborderId: suborder.id,
              config: {
                resendApiKey: Deno.env.get('RESEND_API_KEY'),
                fromEmail: Deno.env.get('ORDER_FROM_EMAIL') || Deno.env.get('INQUIRY_FROM_EMAIL'),
                // Safe default: real buyers and sellers are only emailed when explicitly enabled.
                testMode: Deno.env.get('ORDER_EMAIL_TEST_MODE') !== 'false',
                testRecipientEmail:
                  Deno.env.get('ORDER_TEST_RECIPIENT_EMAIL') || Deno.env.get('INQUIRY_TEST_RECIPIENT_EMAIL'),
                sellerFallbackEmail:
                  Deno.env.get('ORDER_SELLER_FALLBACK_EMAIL') || Deno.env.get('EURODESGUACE_INQUIRY_EMAIL'),
                vendorPortalBaseUrl: Deno.env.get('VENDOR_PORTAL_BASE_URL'),
              },
            });
            const undelivered = outcomes.filter((o) => o.status === 'FAILED' || o.status === 'SKIPPED_NOT_CONFIGURED');
            if (undelivered.length > 0) {
              const detail = undelivered.map((o) => `${o.audience}: ${o.error ?? o.status}`).join('; ');
              processingWarning = `${processingWarning ? processingWarning + ' | ' : ''}AVISO NO ENVIADO (${detail})`;
            }
          }
        }
        break;
      }

      case 'payment_intent.payment_failed': {
        const pi = event.data.object;
        if (pi?.id) {
          const { data: suborder, error: subError } = await supabase
            .from('order_suborders')
            .select('id, order_id, stripe_account_id, payment_status')
            .eq('stripe_payment_intent_id', pi.id)
            .maybeSingle();

          if (subError) {
            processingError = `Error consultando subpedido para PI ${pi.id}: ${subError.message}`;
          } else if (!suborder) {
            processingError = `Subpedido no encontrado para PaymentIntent: ${pi.id}`;
          } else if (event.account && suborder.stripe_account_id && suborder.stripe_account_id !== event.account) {
            processingError = `Conflicto de cuenta conectada: evento de ${event.account} no coincide con el subpedido (${suborder.stripe_account_id})`;
          } else {
            // Stripe does not guarantee event order: a late payment_failed (e.g. a declined first
            // card) must never downgrade a payment that already succeeded. After a decline the
            // PaymentIntent is still payable, so the part reservation is kept.
            if (suborder.payment_status === 'PENDING' || suborder.payment_status === 'PROCESSING') {
              await supabase
                .from('order_suborders')
                .update({
                  payment_status: 'FAILED',
                  updated_at: new Date().toISOString(),
                })
                .eq('id', suborder.id)
                .in('payment_status', ['PENDING', 'PROCESSING']);

              await supabase
                .from('orders')
                .update({
                  status: 'PAYMENT_FAILED',
                  updated_at: new Date().toISOString(),
                })
                .eq('id', suborder.order_id)
                .in('status', ['PENDING_PAYMENT', 'PAYMENT_PROCESSING']);
            }
          }
        }
        break;
      }

      case 'payment_intent.processing': {
        const pi = event.data.object;
        if (pi?.id) {
          const { data: suborder, error: subError } = await supabase
            .from('order_suborders')
            .select('id, order_id, stripe_account_id, payment_status')
            .eq('stripe_payment_intent_id', pi.id)
            .maybeSingle();

          if (subError) {
            processingError = `Error consultando subpedido para PI ${pi.id}: ${subError.message}`;
          } else if (!suborder) {
            processingError = `Subpedido no encontrado para PaymentIntent: ${pi.id}`;
          } else if (event.account && suborder.stripe_account_id && suborder.stripe_account_id !== event.account) {
            processingError = `Conflicto de cuenta conectada: evento de ${event.account} no coincide con el subpedido (${suborder.stripe_account_id})`;
          } else {
            if (suborder.payment_status !== 'PROCESSING' && suborder.payment_status !== 'SUCCEEDED') {
              await supabase
                .from('order_suborders')
                .update({
                  payment_status: 'PROCESSING',
                  updated_at: new Date().toISOString(),
                })
                .eq('id', suborder.id);
            }

            await supabase
              .from('orders')
              .update({
                status: 'PAYMENT_PROCESSING',
                updated_at: new Date().toISOString(),
              })
              .eq('id', suborder.order_id)
              .in('status', ['PENDING_PAYMENT', 'PAYMENT_FAILED']);
          }
        }
        break;
      }

      case 'payment_intent.canceled': {
        const pi = event.data.object;
        if (pi?.id) {
          const { data: suborder, error: subError } = await supabase
            .from('order_suborders')
            .select('id, order_id, stripe_account_id, payment_status')
            .eq('stripe_payment_intent_id', pi.id)
            .maybeSingle();

          if (subError) {
            processingError = `Error consultando subpedido para PI ${pi.id}: ${subError.message}`;
          } else if (!suborder) {
            // PaymentIntent never linked to an order (e.g. cancelled during checkout cleanup).
            break;
          } else if (event.account && suborder.stripe_account_id && suborder.stripe_account_id !== event.account) {
            processingError = `Conflicto de cuenta conectada: evento de ${event.account} no coincide con el subpedido (${suborder.stripe_account_id})`;
          } else if (suborder.payment_status !== 'SUCCEEDED') {
            const now = new Date().toISOString();
            await supabase
              .from('order_suborders')
              .update({ payment_status: 'CANCELLED', fulfillment_status: 'CANCELLED', updated_at: now })
              .eq('id', suborder.id)
              .in('payment_status', ['PENDING', 'FAILED', 'PROCESSING']);
            await supabase
              .from('orders')
              .update({ status: 'CANCELLED', updated_at: now })
              .eq('id', suborder.order_id)
              .in('status', ['PENDING_PAYMENT', 'PAYMENT_FAILED', 'PAYMENT_PROCESSING']);

            const { error: releaseError } = await supabase.rpc('release_order_reservations', {
              p_order_id: suborder.order_id,
            });
            if (releaseError) throw new Error(`Error liberando piezas reservadas: ${releaseError.message}`);
          }
        }
        break;
      }

      case 'charge.refunded': {
        const charge = event.data.object;
        const piId = charge.payment_intent;
        if (piId) {
          const { data: suborder, error: subError } = await supabase
            .from('order_suborders')
            .select('id, order_id, stripe_account_id, payment_status')
            .eq('stripe_payment_intent_id', piId)
            .maybeSingle();

          if (subError) {
            processingError = `Error consultando subpedido para PI ${piId}: ${subError.message}`;
          } else if (!suborder) {
            processingError = `Subpedido no encontrado para PaymentIntent: ${piId}`;
          } else if (event.account && suborder.stripe_account_id && suborder.stripe_account_id !== event.account) {
            processingError = `Conflicto de cuenta conectada: evento de ${event.account} no coincide con el subpedido (${suborder.stripe_account_id})`;
          } else {
            await supabase
              .from('order_suborders')
              .update({
                payment_status: 'REFUNDED',
                updated_at: new Date().toISOString(),
              })
              .eq('id', suborder.id);

            await supabase
              .from('orders')
              .update({
                status: 'REFUNDED',
                updated_at: new Date().toISOString(),
              })
              .eq('id', suborder.order_id);

            // Record refund idempotently
            await supabase.from('order_refunds').upsert({
              suborder_id: suborder.id,
              stripe_refund_id: `re_${event.id}`,
              amount_cents: charge.amount_refunded || 0,
              reason: 'Reembolso notificado por pasarela Stripe',
              status: 'SUCCEEDED',
            }, { onConflict: 'stripe_refund_id' });
          }
        }
        break;
      }

      case 'account.updated': {
        const account = event.data.object;
        if (account?.id) {
          const onboardingStatus =
            account.charges_enabled && account.details_submitted
              ? 'COMPLETED'
              : account.details_submitted
              ? 'PENDING'
              : 'RESTRICTED';

          await supabase
            .from('vendors')
            .update({
              stripe_charges_enabled: Boolean(account.charges_enabled),
              stripe_payouts_enabled: Boolean(account.payouts_enabled),
              stripe_details_submitted: Boolean(account.details_submitted),
              stripe_onboarding_status: onboardingStatus,
              updated_at: new Date().toISOString(),
            })
            .eq('stripe_account_id', account.id);
        }
        break;
      }

      default:
        // Ignore unhandled event types cleanly
        break;
    }
  } catch (err: any) {
    processingError = err.message;
  }

  // A charge that needs a person (refund for a part already sold, amount mismatch) must not
  // wait for someone to read the events table: email operations right away.
  if (processingWarning && processingWarning.includes('REVISIÓN MANUAL')) {
    const alertStatus = await sendOpsAlert({
      resendApiKey: Deno.env.get('RESEND_API_KEY'),
      fromEmail: Deno.env.get('ORDER_FROM_EMAIL') || Deno.env.get('INQUIRY_FROM_EMAIL'),
      opsAlertEmail: Deno.env.get('OPS_ALERT_EMAIL'),
      subject: 'Pago que requiere revisión manual',
      details: [
        ...processingWarning.split(' | '),
        `Evento Stripe: ${event.id} (${event.type})`,
        `PaymentIntent: ${paymentIntentId ?? 'desconocido'}`,
        `Cuenta conectada: ${accountId ?? 'desconocida'}`,
      ],
    });
    if (alertStatus !== 'SENT') {
      processingWarning = `${processingWarning} | ALERTA A OPERACIONES NO ENVIADA (${alertStatus})`;
    }
  }

  // Update webhook event processing status
  if (recordedEventId) {
    await supabase
      .from('stripe_webhook_events')
      .update({
        processing_status: processingError ? 'FAILED' : 'PROCESSED',
        error_message: processingError ?? processingWarning,
        processed_at: new Date().toISOString(),
      })
      .eq('id', recordedEventId);
  }

  return new Response(
    JSON.stringify({
      received: true,
      processed: !processingError,
      eventType: event.type,
      error: processingError,
    }),
    { status: processingError ? 500 : 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
  );
}

if (typeof Deno !== 'undefined' && Deno.serve) {
  Deno.serve(handler);
}
