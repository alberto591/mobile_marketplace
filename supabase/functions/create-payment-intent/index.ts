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

  let body: unknown;
  try {
    body = await req.json();
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

  // 1. Idempotency check: see if order already exists with this idempotencyKey
  const { data: existingOrder, error: existingOrderError } = await supabase
    .from('orders')
    .select(`
      id,
      order_reference,
      customer_name,
      customer_email,
      customer_phone,
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
        vendor_id,
        stripe_account_id,
        stripe_payment_intent_id,
        subtotal_cents,
        shipping_cents,
        total_cents,
        platform_fee_cents,
        seller_net_cents,
        payment_status,
        fulfillment_status
      )
    `)
    .eq('idempotency_key', payload.idempotencyKey)
    .maybeSingle();

  if (existingOrderError) {
    return new Response(
      JSON.stringify({ error: 'DB_ERROR', message: 'Error verificando idempotencia de pedido', details: existingOrderError.message }),
      { status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
    );
  }

  if (existingOrder) {
    // Check if payload fingerprint matches
    if (existingOrder.payload_hash !== payloadHash) {
      return new Response(
        JSON.stringify({
          error: 'IDEMPOTENCY_CONFLICT',
          message: 'Esta clave de idempotencia ya fue utilizada para un pedido con piezas o datos de entrega diferentes.',
        }),
        { status: 409, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

    const suborder = existingOrder.order_suborders?.[0];
    return new Response(
      JSON.stringify({
        success: true,
        orderReference: existingOrder.order_reference,
        suborderReference: suborder?.suborder_reference,
        accessToken: existingOrder.access_token,
        clientSecret: suborder?.stripe_payment_intent_id ? `${suborder.stripe_payment_intent_id}_secret_reused` : null,
        stripeAccountId: suborder?.stripe_account_id,
        publishableKey: stripePublishableKey ?? null,
        pricing: {
          subtotalCents: existingOrder.total_products_cents,
          shippingCents: existingOrder.total_shipping_cents,
          taxCents: existingOrder.total_tax_cents,
          totalCents: existingOrder.total_order_cents,
          platformFeeCents: suborder?.platform_fee_cents ?? 0,
          isTestOrder: existingOrder.is_test_order,
          taxStatus: existingOrder.tax_status,
        },
        status: existingOrder.status,
      }),
      { status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
    );
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
    if (p.deleted_at !== null || p.availability_status !== 'AVAILABLE') {
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
    // If 23505 race condition on idempotency_key occurred
    if (insertOrderError.code === '23505') {
      const { data: raceOrder } = await supabase
        .from('orders')
        .select(`
          order_reference,
          access_token,
          total_products_cents,
          total_shipping_cents,
          total_tax_cents,
          total_order_cents,
          tax_status,
          is_test_order,
          order_suborders (suborder_reference, stripe_account_id, stripe_payment_intent_id, platform_fee_cents)
        `)
        .eq('idempotency_key', payload.idempotencyKey)
        .single();

      if (raceOrder) {
        const sub = raceOrder.order_suborders?.[0];
        return new Response(
          JSON.stringify({
            success: true,
            orderReference: raceOrder.order_reference,
            suborderReference: sub?.suborder_reference,
            accessToken: raceOrder.access_token,
            clientSecret: sub?.stripe_payment_intent_id ? `${sub.stripe_payment_intent_id}_secret` : null,
            stripeAccountId: sub?.stripe_account_id,
            publishableKey: stripePublishableKey ?? null,
            pricing: {
              subtotalCents: raceOrder.total_products_cents,
              shippingCents: raceOrder.total_shipping_cents,
              taxCents: raceOrder.total_tax_cents,
              totalCents: raceOrder.total_order_cents,
              platformFeeCents: sub?.platform_fee_cents ?? 0,
              isTestOrder: raceOrder.is_test_order,
              taxStatus: raceOrder.tax_status,
            },
          }),
          { status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
        );
      }
    }

    return new Response(
      JSON.stringify({ error: 'DB_ERROR', message: 'Error creando registro de pedido', details: insertOrderError.message }),
      { status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
    );
  }

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
    return new Response(
      JSON.stringify({ error: 'DB_ERROR', message: 'Error creando subpedido de desguace', details: insertSuborderError.message }),
      { status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
    );
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
    return new Response(
      JSON.stringify({ error: 'DB_ERROR', message: 'Error creando instantánea de piezas', details: insertItemsError.message }),
      { status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
    );
  }

  // 7. Create Stripe PaymentIntent (Direct Charge)
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
        return new Response(
          JSON.stringify({
            error: 'STRIPE_CHARGE_FAILED',
            message: `Fallo al crear PaymentIntent con Stripe: ${stripeErr.error?.message || 'Error desconocido'}`,
          }),
          { status: 502, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
        );
      }

      const stripePi = await stripeRes.json();
      paymentIntentId = stripePi.id;
      clientSecret = stripePi.client_secret;
    } catch (err: any) {
      return new Response(
        JSON.stringify({ error: 'STRIPE_CALL_ERROR', message: 'Error comunicando con pasarela de pago', details: err.message }),
        { status: 502, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }
  } else if (allowMockPaymentIntent) {
    paymentIntentId = `pi_staging_mock_${Date.now()}`;
    clientSecret = `${paymentIntentId}_secret_${generateAccessToken().slice(0, 16)}`;
  } else {
    return new Response(
      JSON.stringify({
        error: 'CONFIG_ERROR',
        message: 'No es posible procesar el cargo: falta STRIPE_SECRET_KEY o cuenta de vendedor y el modo mock está desactivado.',
      }),
      { status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
    );
  }

  // Update suborder with payment_intent_id
  await supabase
    .from('order_suborders')
    .update({ stripe_payment_intent_id: paymentIntentId, updated_at: new Date().toISOString() })
    .eq('id', newSuborder.id);

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
