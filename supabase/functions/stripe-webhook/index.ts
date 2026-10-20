// Supabase Edge Function: stripe-webhook
// Securely receives Stripe webhook events, verifies HMAC-SHA256 signature against raw body,
// rejects livemode events in staging, deduplicates by stripe_event_id, and transitions
// order and suborder statuses idempotently without storing unnecessary personal data.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';

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

  const matched = signatures.some((s) => s === expectedSignature);
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

  try {
    switch (event.type) {
      case 'payment_intent.succeeded': {
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
            // Idempotent transition: only update if not already SUCCEEDED
            if (suborder.payment_status !== 'SUCCEEDED') {
              await supabase
                .from('order_suborders')
                .update({
                  payment_status: 'SUCCEEDED',
                  fulfillment_status: 'AWAITING_SELLER_FULFILLMENT',
                  updated_at: new Date().toISOString(),
                })
                .eq('id', suborder.id);
            }

            // Check if all suborders for parent order are succeeded
            const { data: allSuborders } = await supabase
              .from('order_suborders')
              .select('payment_status')
              .eq('order_id', suborder.order_id);

            const allPaid = allSuborders?.every((s) => s.payment_status === 'SUCCEEDED');
            const targetStatus = allPaid ? 'PAID' : 'PARTIALLY_PAID';

            await supabase
              .from('orders')
              .update({
                status: targetStatus,
                updated_at: new Date().toISOString(),
              })
              .eq('id', suborder.order_id);
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
            if (suborder.payment_status !== 'FAILED') {
              await supabase
                .from('order_suborders')
                .update({
                  payment_status: 'FAILED',
                  updated_at: new Date().toISOString(),
                })
                .eq('id', suborder.id);
            }

            await supabase
              .from('orders')
              .update({
                status: 'PAYMENT_FAILED',
                updated_at: new Date().toISOString(),
              })
              .eq('id', suborder.order_id);
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
              .eq('id', suborder.order_id);
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

  // Update webhook event processing status
  if (recordedEventId) {
    await supabase
      .from('stripe_webhook_events')
      .update({
        processing_status: processingError ? 'FAILED' : 'PROCESSED',
        error_message: processingError,
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
