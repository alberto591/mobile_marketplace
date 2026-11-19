// Supabase Edge Function: create-payment-intent
// Validates selected parts against real DB, enforces single-seller invariant,
// calculates trusted test pricing (9.50 EUR shipping, 10% platform fee, tax UNCONFIGURED),
// validates seller connected-account readiness, manages stable idempotency,
// persists parent order & seller suborder, and creates Stripe Direct Charge PaymentIntent.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';
import { z } from 'https://esm.sh/zod@3.24.2';

declare const Deno: {
  env: {
    get: (key: string) => string | undefined;
  };
  serve: (handler: (req: Request) => Promise<Response>) => void;
};

export const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// In-memory sliding window rate limiter
interface RateLimitEntry {
  count: number;
  resetAt: number;
}
export const RATE_LIMIT_CACHE = new Map<string, RateLimitEntry>();
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const MAX_REQUESTS_PER_WINDOW = 10;

export function checkRateLimit(key: string, now: number = Date.now()): { allowed: boolean; retryAfterSeconds: number } {
  if (RATE_LIMIT_CACHE.size > 1000) {
    for (const [k, v] of RATE_LIMIT_CACHE.entries()) {
      if (now > v.resetAt) RATE_LIMIT_CACHE.delete(k);
    }
  }

  const existing = RATE_LIMIT_CACHE.get(key);
  if (!existing || now > existing.resetAt) {
    RATE_LIMIT_CACHE.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return { allowed: true, retryAfterSeconds: 0 };
  }

  if (existing.count >= MAX_REQUESTS_PER_WINDOW) {
    const retryAfter = Math.max(1, Math.ceil((existing.resetAt - now) / 1000));
    return { allowed: false, retryAfterSeconds: retryAfter };
  }

  existing.count += 1;
  return { allowed: true, retryAfterSeconds: 0 };
}

// Validation schemas
export const SpanishPostalCodeRegex = /^(?:0[1-9]|[1-4]\d|5[0-2])\d{3}$/;

export const DeliveryAddressSchema = z.object({
  line1: z.string().trim().min(5).max(150),
  line2: z.string().trim().max(150).optional(),
  city: z.string().trim().min(2).max(80),
  province: z.string().trim().min(2).max(80),
  postalCode: z.string().trim().regex(SpanishPostalCodeRegex, {
    message: 'El código postal debe ser un código español válido de 5 dígitos (01000 - 52999)',
  }),
  country: z.literal('ES'),
});

export const CustomerOrderContactSchema = z.object({
  customerName: z.string().trim().min(2).max(100),
  customerEmail: z.string().trim().email().max(255),
  customerPhone: z.string().trim().min(6).max(30),
});

export const CheckoutInitSchema = z.object({
  contact: CustomerOrderContactSchema,
  address: DeliveryAddressSchema,
  partIds: z.array(z.string().uuid()).min(1).max(10),
  idempotencyKey: z.string().trim().min(10).max(120),
  // Access token of an unpaid order this client created earlier in the same checkout
  // (e.g. the buyer cancelled the sheet and then edited the address). Its parts are
  // released so the new order can reserve them.
  previousOrderAccessToken: z.string().regex(/^[a-f0-9]{64}$/).optional(),
});

export type CheckoutInitPayload = z.infer<typeof CheckoutInitSchema>;

// Helper functions
export function generateOrderReference(): string {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, '0');
  const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  let rand = '';
  const cryptoObj = typeof crypto !== 'undefined' ? crypto : (globalThis as any).crypto;
  const bytes = new Uint8Array(4);
  cryptoObj.getRandomValues(bytes);
  for (let i = 0; i < 4; i++) {
    rand += chars[bytes[i] % chars.length];
  }
  return `ORD-${year}${month}-${rand}`;
}

export function generateAccessToken(): string {
  const cryptoObj = typeof crypto !== 'undefined' ? crypto : (globalThis as any).crypto;
  const bytes = new Uint8Array(32);
  cryptoObj.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export async function computePayloadHash(payload: CheckoutInitPayload): Promise<string> {
  const sortedPartIds = [...payload.partIds].sort().join(',');
  const rawString = `${payload.contact.customerName.toLowerCase()}|${payload.contact.customerEmail.toLowerCase()}|${payload.contact.customerPhone}|${payload.address.line1.toLowerCase()}|${payload.address.postalCode}|${sortedPartIds}`;
  const cryptoObj = typeof crypto !== 'undefined' ? crypto : (globalThis as any).crypto;
  const encoded = new TextEncoder().encode(rawString);
  const hashBuffer = await cryptoObj.subtle.digest('SHA-256', encoded);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

// ---------------------------------------------------------------------------
// Part reservations & PaymentIntent lifecycle
// ---------------------------------------------------------------------------

// deno-lint-ignore no-explicit-any
type SupabaseClient = any;

export const ORDER_SELECT = `
  id,
  order_reference,
  total_products_cents,
  total_shipping_cents,
  total_tax_cents,
  total_order_cents,
  tax_status,
  is_test_order,
  payload_hash,
  access_token,
  status,
  order_suborders (
    id,
    suborder_reference,
    stripe_account_id,
    stripe_payment_intent_id,
    platform_fee_cents,
    payment_status,
    order_items ( part_id )
  )
`;

// Orders whose PaymentIntent can still be paid. PAYMENT_FAILED is included because a
// declined card leaves the PaymentIntent in requires_payment_method: the buyer can retry.
const RESUMABLE_ORDER_STATUSES = new Set(['PENDING_PAYMENT', 'PAYMENT_FAILED']);
const SETTLED_ORDER_STATUSES = new Set(['PAYMENT_PROCESSING', 'PAID', 'PARTIALLY_PAID', 'PROCESSING', 'COMPLETED']);

export function jsonResponse(body: unknown, status: number, extraHeaders: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json', ...extraHeaders },
  });
}

export function isRealStripePaymentIntentId(id: string | null | undefined): id is string {
  return typeof id === 'string' && id.startsWith('pi_') && !id.startsWith('pi_staging_mock_');
}

interface StripePaymentIntentSummary {
  id: string;
  status: string;
  client_secret: string | null;
}

async function stripeRetrievePaymentIntent(
  paymentIntentId: string,
  stripeAccountId: string,
  stripeSecretKey: string
): Promise<StripePaymentIntentSummary> {
  const res = await fetch(`https://api.stripe.com/v1/payment_intents/${encodeURIComponent(paymentIntentId)}`, {
    headers: { Authorization: `Bearer ${stripeSecretKey}`, 'Stripe-Account': stripeAccountId },
  });
  const body = await res.json();
  if (!res.ok) {
    throw new Error(body?.error?.message || `Stripe HTTP ${res.status}`);
  }
  return { id: body.id, status: body.status, client_secret: body.client_secret ?? null };
}

/**
 * Cancels a PaymentIntent in Stripe. Returns the PaymentIntent's final state:
 * 'canceled' when it can no longer be paid, 'paid' when it already succeeded or is processing.
 */
async function stripeCancelPaymentIntent(
  paymentIntentId: string,
  stripeAccountId: string,
  stripeSecretKey: string
): Promise<'canceled' | 'paid'> {
  const res = await fetch(`https://api.stripe.com/v1/payment_intents/${encodeURIComponent(paymentIntentId)}/cancel`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${stripeSecretKey}`,
      'Stripe-Account': stripeAccountId,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'cancellation_reason=abandoned',
  });
  if (res.ok) return 'canceled';

  // Cancel fails when the PaymentIntent is already canceled, processing or succeeded: read its state.
  const current = await stripeRetrievePaymentIntent(paymentIntentId, stripeAccountId, stripeSecretKey);
  if (current.status === 'canceled') return 'canceled';
  if (current.status === 'succeeded' || current.status === 'processing') return 'paid';
  throw new Error(`No se pudo cancelar el PaymentIntent ${paymentIntentId} (estado: ${current.status})`);
}

/** Marks an unpaid order as cancelled and returns its parts to the catalog. */
export async function cancelOrderAndReleaseParts(supabase: SupabaseClient, orderId: string): Promise<void> {
  const now = new Date().toISOString();
  await supabase
    .from('order_suborders')
    .update({ payment_status: 'CANCELLED', fulfillment_status: 'CANCELLED', updated_at: now })
    .eq('order_id', orderId)
    .in('payment_status', ['PENDING', 'FAILED']);
  await supabase
    .from('orders')
    .update({ status: 'CANCELLED', updated_at: now })
    .eq('id', orderId)
    .in('status', ['PENDING_PAYMENT', 'PAYMENT_FAILED']);
  const { error } = await supabase.rpc('release_order_reservations', { p_order_id: orderId });
  if (error) {
    throw new Error(`Error liberando reservas del pedido ${orderId}: ${error.message}`);
  }
}

/**
 * Cancels another unpaid order (its PaymentIntent in Stripe first) and releases its parts.
 * Returns 'paid' if that order turned out to be paid, in which case nothing is released.
 */
export async function abandonUnpaidOrder(
  supabase: SupabaseClient,
  orderId: string,
  stripeSecretKey: string | undefined
): Promise<'cancelled' | 'paid'> {
  const { data: suborders, error } = await supabase
    .from('order_suborders')
    .select('stripe_payment_intent_id, stripe_account_id, payment_status')
    .eq('order_id', orderId);
  if (error) throw new Error(`Error consultando subpedidos del pedido ${orderId}: ${error.message}`);

  for (const s of suborders ?? []) {
    if (s.payment_status === 'SUCCEEDED' || s.payment_status === 'PROCESSING') return 'paid';
  }

  for (const s of suborders ?? []) {
    if (!isRealStripePaymentIntentId(s.stripe_payment_intent_id)) continue;
    if (!stripeSecretKey) {
      throw new Error('STRIPE_SECRET_KEY no configurado: no se puede cancelar el PaymentIntent anterior');
    }
    const outcome = await stripeCancelPaymentIntent(s.stripe_payment_intent_id, s.stripe_account_id, stripeSecretKey);
    if (outcome === 'paid') return 'paid';
  }

  await cancelOrderAndReleaseParts(supabase, orderId);
  return 'cancelled';
}

export type ReservationResult = { ok: true } | { ok: false; conflictPartIds: string[] };

/**
 * Reserves every part of an order atomically. Expired reservations held by other
 * orders are taken over only after those orders' PaymentIntents are cancelled.
 */
export async function reservePartsForOrder(
  supabase: SupabaseClient,
  orderId: string,
  partIds: string[],
  ttlMinutes: number,
  stripeSecretKey: string | undefined
): Promise<ReservationResult> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const { data, error } = await supabase.rpc('reserve_parts_for_order', {
      p_order_id: orderId,
      p_part_ids: partIds,
      p_ttl_minutes: ttlMinutes,
    });
    if (error) throw new Error(`Error reservando piezas: ${error.message}`);

    if (data?.ok) return { ok: true };

    const conflictPartIds: string[] = data?.conflictPartIds ?? [];
    if (conflictPartIds.length > 0) return { ok: false, conflictPartIds };

    const staleOrderIds: string[] = data?.staleOrderIds ?? [];
    if (staleOrderIds.length === 0) return { ok: false, conflictPartIds: partIds };

    for (const staleOrderId of staleOrderIds) {
      const outcome = await abandonUnpaidOrder(supabase, staleOrderId, stripeSecretKey);
      if (outcome === 'paid') return { ok: false, conflictPartIds: partIds };
    }
  }
  return { ok: false, conflictPartIds: partIds };
}

export function partNotAvailableResponse(conflictPartIds: string[]): Response {
  return jsonResponse(
    {
      error: 'PART_NOT_AVAILABLE',
      message: 'Una o más piezas acaban de ser reservadas o vendidas a otro comprador. Revisa tu carrito.',
      conflictPartIds,
    },
    409
  );
}

interface ResumeContext {
  supabase: SupabaseClient;
  stripeSecretKey: string | undefined;
  stripePublishableKey: string | undefined;
  allowMockPaymentIntent: boolean;
  reservationTtlMinutes: number;
  payloadHash: string;
}

// deno-lint-ignore no-explicit-any
function orderResponseBody(order: any, suborder: any, clientSecret: string | null, status: string) {
  return {
    success: true,
    orderReference: order.order_reference,
    suborderReference: suborder?.suborder_reference,
    accessToken: order.access_token,
    clientSecret,
    stripeAccountId: suborder?.stripe_account_id,
    pricing: {
      subtotalCents: order.total_products_cents,
      shippingCents: order.total_shipping_cents,
      taxCents: order.total_tax_cents,
      totalCents: order.total_order_cents,
      platformFeeCents: suborder?.platform_fee_cents ?? 0,
      isTestOrder: order.is_test_order,
      taxStatus: order.tax_status,
    },
    status,
  };
}

/**
 * Idempotent retry of a checkout (same idempotency key): e.g. the buyer cancelled the
 * PaymentSheet and taps Pay again, or the first response was lost. Returns the real
 * client_secret of the existing PaymentIntent and renews the part reservation.
 */
// deno-lint-ignore no-explicit-any
export async function resumeExistingOrder(ctx: ResumeContext, existingOrder: any): Promise<Response> {
  if (existingOrder.payload_hash !== ctx.payloadHash) {
    return jsonResponse(
      {
        error: 'IDEMPOTENCY_CONFLICT',
        message: 'Esta clave de idempotencia ya fue utilizada para un pedido con piezas o datos de entrega diferentes.',
      },
      409
    );
  }

  const suborder = existingOrder.order_suborders?.[0];
  const withKey = (body: Record<string, unknown>) => ({ ...body, publishableKey: ctx.stripePublishableKey ?? null });

  if (SETTLED_ORDER_STATUSES.has(existingOrder.status)) {
    return jsonResponse(withKey(orderResponseBody(existingOrder, suborder, null, existingOrder.status)), 200);
  }

  if (!RESUMABLE_ORDER_STATUSES.has(existingOrder.status)) {
    return jsonResponse(
      {
        error: 'ORDER_NOT_PAYABLE',
        message: 'Este intento de pago ya no está activo. Vuelve a pulsar "Pagar" para iniciar uno nuevo.',
        status: existingOrder.status,
      },
      409
    );
  }

  const paymentIntentId: string | null = suborder?.stripe_payment_intent_id ?? null;
  if (!paymentIntentId) {
    // The first request is still creating the PaymentIntent.
    return jsonResponse(
      { error: 'CHECKOUT_IN_PROGRESS', message: 'Estamos preparando tu pago. Inténtalo de nuevo en unos segundos.' },
      409,
      { 'Retry-After': '2' }
    );
  }

  let clientSecret: string;
  if (isRealStripePaymentIntentId(paymentIntentId)) {
    if (!ctx.stripeSecretKey) {
      return jsonResponse({ error: 'CONFIG_ERROR', message: 'STRIPE_SECRET_KEY no configurado.' }, 500);
    }
    let pi: StripePaymentIntentSummary;
    try {
      pi = await stripeRetrievePaymentIntent(paymentIntentId, suborder.stripe_account_id, ctx.stripeSecretKey);
    } catch (err: any) {
      return jsonResponse({ error: 'STRIPE_NETWORK_ERROR', message: 'Error de red conectando con Stripe', details: err.message }, 502);
    }

    if (pi.status === 'succeeded' || pi.status === 'processing') {
      return jsonResponse(withKey(orderResponseBody(existingOrder, suborder, null, 'PAYMENT_PROCESSING')), 200);
    }
    if (pi.status === 'canceled' || !pi.client_secret) {
      await cancelOrderAndReleaseParts(ctx.supabase, existingOrder.id);
      return jsonResponse(
        {
          error: 'ORDER_NOT_PAYABLE',
          message: 'Este intento de pago ha caducado. Vuelve a pulsar "Pagar" para iniciar uno nuevo.',
          status: 'CANCELLED',
        },
        409
      );
    }
    clientSecret = pi.client_secret;
  } else if (ctx.allowMockPaymentIntent) {
    clientSecret = `${paymentIntentId}_secret_mock`;
  } else {
    return jsonResponse({ error: 'CONFIG_ERROR', message: 'PaymentIntent simulado con el modo mock desactivado.' }, 500);
  }

  // Renew the reservation so the parts stay held while the buyer pays.
  const partIds: string[] = (suborder.order_items ?? []).map((i: { part_id: string }) => i.part_id);
  const reservation = await reservePartsForOrder(
    ctx.supabase,
    existingOrder.id,
    partIds,
    ctx.reservationTtlMinutes,
    ctx.stripeSecretKey
  );
  if (!reservation.ok) {
    if (isRealStripePaymentIntentId(paymentIntentId) && ctx.stripeSecretKey) {
      try {
        const outcome = await stripeCancelPaymentIntent(paymentIntentId, suborder.stripe_account_id, ctx.stripeSecretKey);
        if (outcome === 'paid') {
          return jsonResponse(withKey(orderResponseBody(existingOrder, suborder, null, 'PAYMENT_PROCESSING')), 200);
        }
      } catch {
        // Keep the order pending: the webhook will settle it.
        return partNotAvailableResponse(reservation.conflictPartIds);
      }
    }
    await cancelOrderAndReleaseParts(ctx.supabase, existingOrder.id);
    return partNotAvailableResponse(reservation.conflictPartIds);
  }

  return jsonResponse(withKey(orderResponseBody(existingOrder, suborder, clientSecret, 'PENDING_PAYMENT')), 200);
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

  const clientIp = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown_ip';
  const rateLimit = checkRateLimit(clientIp);
  if (!rateLimit.allowed) {
    return new Response(
      JSON.stringify({
        error: 'RATE_LIMIT_EXCEEDED',
        message: 'Demasiadas solicitudes de checkout. Por favor, espera unos instantes.',
      }),
      {
        status: 429,
        headers: {
          ...CORS_HEADERS,
          'Content-Type': 'application/json',
          'Retry-After': String(rateLimit.retryAfterSeconds),
        },
      }
    );
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const stripeSecretKey = Deno.env.get('STRIPE_SECRET_KEY');
  const stripePublishableKey = Deno.env.get('EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY') || Deno.env.get('STRIPE_PUBLISHABLE_KEY');
  const isStagingTestMode = Deno.env.get('CHECKOUT_TEST_MODE') !== 'false';
  const isTaxUnconfigured = Deno.env.get('TAX_UNCONFIGURED') !== 'false';
  const fixedShippingCents = parseInt(Deno.env.get('STAGING_SHIPPING_CENTS') || '950', 10);
  const commissionBasisPoints = parseInt(Deno.env.get('COMMISSION_BASIS_POINTS') || '1000', 10); // 10%
  const allowMockPaymentIntent = Deno.env.get('CHECKOUT_ALLOW_MOCK_PAYMENT_INTENT') === 'true';
  const parsedTtl = parseInt(Deno.env.get('RESERVATION_TTL_MINUTES') || '30', 10);
  const reservationTtlMinutes = Number.isFinite(parsedTtl) ? Math.min(Math.max(parsedTtl, 5), 120) : 30;

  if (!supabaseUrl || !supabaseServiceKey) {
    return new Response(
      JSON.stringify({ error: 'CONFIG_ERROR', message: 'Servicio no configurado correctamente.' }),
      { status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
    );
  }

  // Strictly prevent live-mode keys while commercial gates (taxes, commercial shipping) are unconfigured
  if (stripeSecretKey && (stripeSecretKey.startsWith('sk_live_') || stripeSecretKey.startsWith('rk_live_'))) {
    return new Response(
      JSON.stringify({
        error: 'LIVEMODE_PAYMENTS_FORBIDDEN',
        message: 'Los pagos en modo real están terminantemente bloqueados mientras el régimen fiscal y de envíos permanezca sin configurar.',
      }),
      { status: 403, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
    );
  }

  if (stripePublishableKey && stripePublishableKey.startsWith('pk_live_')) {
    return new Response(
      JSON.stringify({
        error: 'LIVEMODE_PAYMENTS_FORBIDDEN',
        message: 'Claves públicas de producción (pk_live_...) no permitidas en entorno Staging.',
      }),
      { status: 403, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
    );
  }

  // Fail fast: Do not return mock PaymentIntents in standard execution unless explicitly requested by unit test flags
  if (!stripeSecretKey && !allowMockPaymentIntent) {
    return new Response(
      JSON.stringify({
        error: 'CONFIG_ERROR',
        message: 'STRIPE_SECRET_KEY no configurado en el servidor para procesar cobros de prueba reales.',
      }),
      { status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
    );
  }

  // Real payloads are a few KB. Rejecting oversized bodies before parsing also keeps
  // schema validation from being fed huge collections.
  const MAX_BODY_BYTES = 64 * 1024;
  if (Number(req.headers.get('content-length') || '0') > MAX_BODY_BYTES) {
    return new Response(JSON.stringify({ error: 'PAYLOAD_TOO_LARGE', message: 'La petición es demasiado grande' }), {
      status: 413,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  }

  let body: unknown;
  try {
    const rawBody = await req.text();
    if (rawBody.length > MAX_BODY_BYTES) throw new Error('payload too large');
    body = JSON.parse(rawBody);
  } catch {
    return new Response(JSON.stringify({ error: 'INVALID_JSON', message: 'El cuerpo de la petición no es un JSON válido' }), {
      status: 400,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  }

  const parsed = CheckoutInitSchema.safeParse(body);
  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0];
    return new Response(
      JSON.stringify({
        error: 'VALIDATION_ERROR',
        message: firstIssue ? `${firstIssue.path.join('.')}: ${firstIssue.message}` : 'Error de validación',
        issues: parsed.error.issues,
      }),
      { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
    );
  }

  const payload = parsed.data;
  const payloadHash = await computePayloadHash(payload);

  const supabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { persistSession: false },
  });

  const resumeCtx: ResumeContext = {
    supabase,
    stripeSecretKey,
    stripePublishableKey,
    allowMockPaymentIntent,
    reservationTtlMinutes,
    payloadHash,
  };

  // 0. The buyer changed the checkout data after cancelling a previous attempt:
  //    abandon that unpaid order (cancel its PaymentIntent, release its parts).
  if (payload.previousOrderAccessToken) {
    const { data: previousOrder, error: previousOrderError } = await supabase
      .from('orders')
      .select('id, order_reference, access_token, status, idempotency_key')
      .eq('access_token', payload.previousOrderAccessToken)
      .maybeSingle();

    if (previousOrderError) {
      return jsonResponse({ error: 'DB_ERROR', message: 'Error consultando el pedido anterior' }, 500);
    }

    if (
      previousOrder &&
      previousOrder.idempotency_key !== payload.idempotencyKey &&
      RESUMABLE_ORDER_STATUSES.has(previousOrder.status)
    ) {
      try {
        const outcome = await abandonUnpaidOrder(supabase, previousOrder.id, stripeSecretKey);
        if (outcome === 'paid') {
          return jsonResponse(
            {
              error: 'PREVIOUS_ORDER_ALREADY_PAID',
              message: 'Tu intento de pago anterior ya se ha completado. No se ha creado un pedido nuevo.',
              orderReference: previousOrder.order_reference,
              accessToken: previousOrder.access_token,
            },
            409
          );
        }
      } catch (err: any) {
        return jsonResponse(
          { error: 'STRIPE_NETWORK_ERROR', message: 'No se pudo anular el intento de pago anterior', details: err.message },
          502
        );
      }
    }
  }

  // 1. Idempotency check: see if order already exists with this idempotencyKey
  const { data: existingOrder, error: existingOrderError } = await supabase
    .from('orders')
    .select(ORDER_SELECT)
    .eq('idempotency_key', payload.idempotencyKey)
    .maybeSingle();

  if (existingOrderError) {
    return jsonResponse({ error: 'DB_ERROR', message: 'Error verificando idempotencia de pedido' }, 500);
  }

  if (existingOrder) {
    return resumeExistingOrder(resumeCtx, existingOrder);
  }

  // 2. Fetch parts from database and validate availability
  const { data: dbParts, error: partsError } = await supabase
    .from('parts')
    .select(`
      id,
      vendor_id,
      external_part_id,
      title,
      price_cents,
      availability_status,
      deleted_at,
      reserved_until,
      sold_order_id,
      vendors (
        id,
        trade_name,
        legal_name,
        cat_authorization_code,
        cat_verified,
        status,
        stripe_account_id,
        stripe_charges_enabled,
        stripe_payouts_enabled,
        stripe_details_submitted,
        stripe_onboarding_status
      )
    `)
    .in('id', payload.partIds);

  if (partsError) {
    return new Response(
      JSON.stringify({ error: 'DB_ERROR', message: 'Error consultando catálogo de piezas', details: partsError.message }),
      { status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
    );
  }

  if (!dbParts || dbParts.length !== payload.partIds.length) {
    const foundIds = new Set(dbParts?.map((p) => p.id) ?? []);
    const missing = payload.partIds.filter((id) => !foundIds.has(id));
    return new Response(
      JSON.stringify({
        error: 'PARTS_NOT_FOUND',
        message: 'Una o más piezas seleccionadas no existen en el catálogo.',
        missingPartIds: missing,
      }),
      { status: 404, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
    );
  }

  // Check availability
  for (const p of dbParts) {
    // RESERVED parts with an expired reservation can be bought again: reservePartsForOrder
    // cancels the previous buyer's PaymentIntent before taking them over.
    const reservationLive =
      p.availability_status === 'RESERVED' && (!p.reserved_until || new Date(p.reserved_until).getTime() > Date.now());
    const purchasable =
      p.deleted_at === null &&
      p.sold_order_id === null &&
      (p.availability_status === 'AVAILABLE' || (p.availability_status === 'RESERVED' && !reservationLive));
    if (!purchasable) {
      return new Response(
        JSON.stringify({
          error: 'PART_NOT_AVAILABLE',
          message: `La pieza "${p.title}" (${p.external_part_id}) no está disponible para compra inmediata.`,
          partId: p.id,
        }),
        { status: 422, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }
  }

  // 3. Single-vendor validation
  const vendorIds = Array.from(new Set(dbParts.map((p) => p.vendor_id)));
  if (vendorIds.length > 1) {
    return new Response(
      JSON.stringify({
        error: 'MULTI_VENDOR_NOT_SUPPORTED',
        message: 'El primer lanzamiento de checkout procesa un único desguace por pedido. Por favor, tramita los recambios de cada desguace por separado.',
      }),
      { status: 422, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
    );
  }

  const vendorId = vendorIds[0];
  const firstPart = dbParts[0];
  const vendor = firstPart.vendors as any;

  if (!vendor || vendor.status !== 'ACTIVE' || !vendor.cat_verified) {
    return new Response(
      JSON.stringify({
        error: 'VENDOR_NOT_ACTIVE',
        message: 'El desguace vendedor no se encuentra activo o verificado en la plataforma.',
      }),
      { status: 422, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
    );
  }

  // 4. Seller Stripe readiness check
  const sellerStripeAccountId = vendor.stripe_account_id;
  if (!sellerStripeAccountId && !allowMockPaymentIntent) {
    return new Response(
      JSON.stringify({
        error: 'SELLER_PAYMENT_NOT_READY',
        message: `El desguace "${vendor.trade_name}" no tiene vinculada una cuenta de Stripe Connect activa para cobros directos.`,
      }),
      { status: 422, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
    );
  }

  // If real Stripe secret key is present and real account is provided, validate eligibility & sync status
  if (stripeSecretKey && sellerStripeAccountId && !allowMockPaymentIntent) {
    try {
      const accountRes = await fetch(`https://api.stripe.com/v1/accounts/${sellerStripeAccountId}`, {
        headers: {
          Authorization: `Bearer ${stripeSecretKey}`,
        },
      });
      if (!accountRes.ok) {
        const errJson = await accountRes.json();
        return new Response(
          JSON.stringify({
            error: 'STRIPE_ACCOUNT_INVALID',
            message: `No se pudo verificar la cuenta Stripe Connect del vendedor: ${errJson.error?.message || 'Error de API'}`,
          }),
          { status: 422, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
        );
      }
      const accountData = await accountRes.json();
      const chargesEnabled = Boolean(accountData.charges_enabled);
      const payoutsEnabled = Boolean(accountData.payouts_enabled);
      const detailsSubmitted = Boolean(accountData.details_submitted);
      const onboardingStatus = chargesEnabled && detailsSubmitted
        ? 'COMPLETED'
        : detailsSubmitted
        ? 'PENDING'
        : 'RESTRICTED';

      // Synchronize latest status safely to DB cache (zero manual SQL tampering)
      await supabase
        .from('vendors')
        .update({
          stripe_charges_enabled: chargesEnabled,
          stripe_payouts_enabled: payoutsEnabled,
          stripe_details_submitted: detailsSubmitted,
          stripe_onboarding_status: onboardingStatus,
          updated_at: new Date().toISOString(),
        })
        .eq('id', vendor.id);

      if (!chargesEnabled) {
        return new Response(
          JSON.stringify({
            error: 'STRIPE_ACCOUNT_NOT_ELIGIBLE',
            message: `La cuenta Stripe Connect del vendedor no está habilitada para cargos (charges_enabled: false).`,
            details: {
              chargesEnabled,
              payoutsEnabled,
              detailsSubmitted,
              onboardingStatus,
            },
          }),
          { status: 422, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
        );
      }
    } catch (err: any) {
      return new Response(
        JSON.stringify({ error: 'STRIPE_NETWORK_ERROR', message: 'Error de red conectando con Stripe', details: err.message }),
        { status: 502, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }
  }

  // 5. Trusted Pricing Calculation
  let subtotalCents = 0;
  for (const p of dbParts) {
    subtotalCents += p.price_cents;
  }

  const shippingCents = isStagingTestMode ? fixedShippingCents : 0;
  if (!isStagingTestMode) {
    return new Response(
      JSON.stringify({
        error: 'COMMERCIAL_SHIPPING_UNCONFIGURED',
        message: 'No existen tarifas de envío comerciales configuradas para producción.',
      }),
      { status: 422, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
    );
  }

  const taxCents = 0;
  const taxStatus = isTaxUnconfigured ? 'UNCONFIGURED' : 'NOT_APPLICABLE';
  const totalCents = subtotalCents + shippingCents + taxCents;

  // 10% platform fee on parts subtotal only
  const platformFeeCents = Math.round((subtotalCents * commissionBasisPoints) / 10000);
  const sellerNetCents = totalCents - platformFeeCents;

  // 6. Create Parent Order and Suborder in Database
  const orderReference = generateOrderReference();
  const suborderReference = `${orderReference}-01`;
  const accessToken = generateAccessToken();

  const { data: newOrder, error: insertOrderError } = await supabase
    .from('orders')
    .insert({
      order_reference: orderReference,
      customer_name: payload.contact.customerName,
      customer_email: payload.contact.customerEmail,
      customer_phone: payload.contact.customerPhone,
      shipping_address_line1: payload.address.line1,
      shipping_address_line2: payload.address.line2 || null,
      shipping_city: payload.address.city,
      shipping_province: payload.address.province,
      shipping_postal_code: payload.address.postalCode,
      shipping_country: payload.address.country,
      currency: 'EUR',
      total_products_cents: subtotalCents,
      total_shipping_cents: shippingCents,
      total_tax_cents: taxCents,
      total_order_cents: totalCents,
      tax_status: taxStatus,
      is_test_order: isStagingTestMode,
      idempotency_key: payload.idempotencyKey,
      payload_hash: payloadHash,
      access_token: accessToken,
      status: 'PENDING_PAYMENT',
    })
    .select('id')
    .single();

  if (insertOrderError) {
    // 23505: a concurrent request with the same idempotency key created the order first.
    if (insertOrderError.code === '23505') {
      const { data: raceOrder } = await supabase
        .from('orders')
        .select(ORDER_SELECT)
        .eq('idempotency_key', payload.idempotencyKey)
        .maybeSingle();

      if (raceOrder) {
        return resumeExistingOrder(resumeCtx, raceOrder);
      }
    }

    return jsonResponse({ error: 'DB_ERROR', message: 'Error creando registro de pedido' }, 500);
  }

  // From here on, any failure cancels the order and releases whatever it reserved.
  const failOrder = async (body: Record<string, unknown>, status: number): Promise<Response> => {
    try {
      await cancelOrderAndReleaseParts(supabase, newOrder.id);
    } catch {
      // The reservation expires on its own after the TTL.
    }
    return jsonResponse(body, status);
  };

  // Insert suborder
  const { data: newSuborder, error: insertSuborderError } = await supabase
    .from('order_suborders')
    .insert({
      order_id: newOrder.id,
      suborder_reference: suborderReference,
      vendor_id: vendorId,
      stripe_account_id: sellerStripeAccountId || 'acct_mock_test',
      currency: 'EUR',
      subtotal_cents: subtotalCents,
      shipping_cents: shippingCents,
      tax_cents: taxCents,
      total_cents: totalCents,
      platform_fee_cents: platformFeeCents,
      seller_net_cents: sellerNetCents,
      payment_status: 'PENDING',
      fulfillment_status: 'AWAITING_PAYMENT',
    })
    .select('id')
    .single();

  if (insertSuborderError) {
    return failOrder({ error: 'DB_ERROR', message: 'Error creando subpedido de desguace' }, 500);
  }

  // Insert order items
  const itemsToInsert = dbParts.map((p) => ({
    suborder_id: newSuborder.id,
    part_id: p.id,
    vendor_id: p.vendor_id,
    external_part_id: p.external_part_id,
    title: p.title,
    oem_reference: null,
    unit_price_cents: p.price_cents,
    quantity: 1,
  }));

  const { error: insertItemsError } = await supabase.from('order_items').insert(itemsToInsert);
  if (insertItemsError) {
    return failOrder({ error: 'DB_ERROR', message: 'Error creando instantánea de piezas' }, 500);
  }

  // 7. Reserve the parts atomically: each part is a single physical unit.
  let reservation: ReservationResult;
  try {
    reservation = await reservePartsForOrder(
      supabase,
      newOrder.id,
      payload.partIds,
      reservationTtlMinutes,
      stripeSecretKey
    );
  } catch (err: any) {
    return failOrder({ error: 'RESERVATION_ERROR', message: 'No se pudieron reservar las piezas', details: err.message }, 502);
  }
  if (!reservation.ok) {
    await failOrder({}, 409);
    return partNotAvailableResponse(reservation.conflictPartIds);
  }

  // 8. Create Stripe PaymentIntent (Direct Charge)
  let paymentIntentId: string;
  let clientSecret: string;

  if (stripeSecretKey && sellerStripeAccountId && !allowMockPaymentIntent) {
    try {
      const stripeParams = new URLSearchParams();
      stripeParams.set('amount', totalCents.toString());
      stripeParams.set('currency', 'eur');
      stripeParams.set('payment_method_types[0]', 'card');
      stripeParams.set('application_fee_amount', platformFeeCents.toString());
      stripeParams.set('description', `Pedido ${orderReference} - ${vendor.trade_name}`);
      stripeParams.set('metadata[order_id]', newOrder.id);
      stripeParams.set('metadata[order_reference]', orderReference);
      stripeParams.set('metadata[suborder_id]', newSuborder.id);
      stripeParams.set('metadata[suborder_reference]', suborderReference);
      stripeParams.set('metadata[is_test_order]', 'true');

      const stripeRes = await fetch('https://api.stripe.com/v1/payment_intents', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${stripeSecretKey}`,
          'Stripe-Account': sellerStripeAccountId,
          'Idempotency-Key': `${payload.idempotencyKey}-pi`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: stripeParams.toString(),
      });

      if (!stripeRes.ok) {
        const stripeErr = await stripeRes.json();
        return failOrder(
          {
            error: 'STRIPE_CHARGE_FAILED',
            message: `Fallo al crear PaymentIntent con Stripe: ${stripeErr.error?.message || 'Error desconocido'}`,
          },
          502
        );
      }

      const stripePi = await stripeRes.json();
      paymentIntentId = stripePi.id;
      clientSecret = stripePi.client_secret;
    } catch (err: any) {
      return failOrder({ error: 'STRIPE_CALL_ERROR', message: 'Error comunicando con pasarela de pago', details: err.message }, 502);
    }
  } else if (allowMockPaymentIntent) {
    paymentIntentId = `pi_staging_mock_${Date.now()}`;
    clientSecret = `${paymentIntentId}_secret_${generateAccessToken().slice(0, 16)}`;
  } else {
    return failOrder(
      {
        error: 'CONFIG_ERROR',
        message: 'No es posible procesar el cargo: falta STRIPE_SECRET_KEY o cuenta de vendedor y el modo mock está desactivado.',
      },
      500
    );
  }

  // Link the PaymentIntent to the suborder. Without this link the webhook cannot settle
  // the order, so on failure the PaymentIntent is cancelled before it can be paid.
  const { error: linkPiError } = await supabase
    .from('order_suborders')
    .update({ stripe_payment_intent_id: paymentIntentId, updated_at: new Date().toISOString() })
    .eq('id', newSuborder.id);

  if (linkPiError) {
    if (isRealStripePaymentIntentId(paymentIntentId) && stripeSecretKey && sellerStripeAccountId) {
      try {
        await stripeCancelPaymentIntent(paymentIntentId, sellerStripeAccountId, stripeSecretKey);
      } catch {
        // Nobody has the client secret yet, so it cannot be paid.
      }
    }
    return failOrder({ error: 'DB_ERROR', message: 'Error vinculando el pago al pedido' }, 500);
  }

  return new Response(
    JSON.stringify({
      success: true,
      orderReference,
      suborderReference,
      accessToken,
      clientSecret,
      stripeAccountId: sellerStripeAccountId || 'acct_mock_test',
      publishableKey: stripePublishableKey ?? null,
      pricing: {
        subtotalCents,
        shippingCents,
        taxCents,
        totalCents,
        platformFeeCents,
        isTestOrder: isStagingTestMode,
        taxStatus,
      },
      status: 'PENDING_PAYMENT',
    }),
    { status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
  );
}

if (typeof Deno !== 'undefined' && Deno.serve) {
  Deno.serve(handler);
}
