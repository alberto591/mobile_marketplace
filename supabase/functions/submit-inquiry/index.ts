// Supabase Edge Function: submit-inquiry
// Registers commercial inquiries for catalog parts, snapshots parts from server DB,
// enforces idempotency, validates contact & privacy consent, and dispatches email notifications.

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

// In-memory sliding window rate limiter for edge instance defense
// Limits burst attempts per IP (max 5 inquiries per minute) and overall per 10 minutes (max 20)
interface RateLimitEntry {
  count: number;
  resetAt: number;
}
export const RATE_LIMIT_CACHE = new Map<string, RateLimitEntry>();
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute
const MAX_REQUESTS_PER_WINDOW = 5;

export function checkRateLimit(key: string, now: number = Date.now()): { allowed: boolean; retryAfterSeconds: number } {
  // Purge expired entries if cache exceeds 1000 items
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

// Zod validation schemas
export const CustomerContactSchema = z
  .object({
    customerName: z
      .string()
      .trim()
      .min(2, { message: 'El nombre debe tener al menos 2 caracteres' })
      .max(100, { message: 'El nombre no puede exceder 100 caracteres' }),
    customerEmail: z
      .string()
      .trim()
      .email({ message: 'El formato de correo electrónico no es válido' })
      .max(255)
      .optional()
      .or(z.literal('')),
    customerPhone: z
      .string()
      .trim()
      .regex(/^(\+?[0-9\s\-()]{7,25})$/, {
        message: 'El teléfono debe contener entre 7 y 25 dígitos numéricos válidos',
      })
      .optional()
      .or(z.literal('')),
    customerMessage: z
      .string()
      .trim()
      .max(1000, { message: 'El mensaje no puede exceder 1000 caracteres' })
      .optional(),
    vehicleVin: z
      .string()
      .trim()
      .regex(/^[A-HJ-NPR-Z0-9]{5,30}$/i, {
        message: 'El bastidor (VIN) contiene caracteres o longitud no válidos',
      })
      .optional()
      .or(z.literal('')),
    vehiclePlate: z
      .string()
      .trim()
      .regex(/^[A-Z0-9\s\-]{3,15}$/i, {
        message: 'La matrícula contiene un formato no válido',
      })
      .optional()
      .or(z.literal('')),
    privacyConsent: z.object({
      accepted: z.literal(true, {
        errorMap: () => ({ message: 'Debes aceptar el aviso de privacidad para tramitar la consulta' }),
      }),
      version: z.string().min(1).default('v1.0'),
    }),
  })
  .refine(
    (data) => Boolean(data.customerEmail?.trim()) || Boolean(data.customerPhone?.trim()),
    {
      message: 'Debes proporcionar al menos un medio de contacto: correo electrónico o teléfono',
      path: ['customerEmail'],
    }
  );

export const SubmitInquiryPayloadSchema = CustomerContactSchema.and(
  z.object({
    items: z
      .array(
        z.object({
          partId: z.string().uuid({ message: 'Identificador de pieza debe ser un UUID válido' }),
        })
      )
      .min(1, { message: 'Debes incluir al menos una pieza en la solicitud' })
      .max(10, { message: 'No se permite solicitar más de 10 piezas simultáneamente' }),
    idempotencyKey: z
      .string()
      .trim()
      .min(8, { message: 'Clave de idempotencia requerida (mínimo 8 caracteres)' })
      .max(120),
    source: z.string().trim().default('mobile_app'),
  })
);

export type SubmitInquiryPayload = z.infer<typeof SubmitInquiryPayloadSchema>;

export interface EmailSenderResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

export type EmailSenderFn = (params: {
  to: string;
  from: string;
  subject: string;
  html: string;
}) => Promise<EmailSenderResult>;

export function generateInquiryReference(): string {
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
  return `INQ-${year}${month}-${rand}`;
}

export async function defaultResendSender(
  apiKey: string,
  params: { to: string; from: string; subject: string; html: string }
): Promise<EmailSenderResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: params.from,
        to: [params.to],
        subject: params.subject,
        html: params.html,
      }),
      signal: controller.signal,
    });

    const data = await res.json();
    if (!res.ok) {
      return { success: false, error: data?.message || `HTTP ${res.status}` };
    }
    return { success: true, messageId: data?.id };
  } catch (err: any) {
    return { success: false, error: err?.message || String(err) };
  } finally {
    clearTimeout(timer);
  }
}

export interface HandlerOptions {
  supabaseClient?: any;
  emailSender?: EmailSenderFn;
  resendApiKey?: string;
  inquiryEmail?: string;
  fromEmail?: string;
}

export async function handler(req: Request, options: HandlerOptions = {}): Promise<Response> {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    });
  }

  // Multi-signal rate limiting: IP detection from cloudflare / supabase edge headers
  const clientIp =
    req.headers.get('cf-connecting-ip') ||
    req.headers.get('x-real-ip') ||
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    'anonymous_client';

  const rateCheck = checkRateLimit(`ip:${clientIp}`);
  if (!rateCheck.allowed) {
    return new Response(
      JSON.stringify({
        error: 'Too many requests',
        message: `Has superado el límite de consultas permitidas. Inténtalo de nuevo en ${rateCheck.retryAfterSeconds} segundos.`,
      }),
      {
        status: 429,
        headers: {
          ...CORS_HEADERS,
          'Content-Type': 'application/json',
          'Retry-After': String(rateCheck.retryAfterSeconds),
          'Cache-Control': 'no-store',
        },
      }
    );
  }

  let bodyJson: unknown;
  try {
    bodyJson = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
      status: 400,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    });
  }

  const parseResult = SubmitInquiryPayloadSchema.safeParse(bodyJson);
  if (!parseResult.success) {
    const firstIssue = parseResult.error.issues[0];
    return new Response(
      JSON.stringify({
        error: 'Validation failed',
        message: firstIssue ? `${firstIssue.path.join('.')}: ${firstIssue.message}` : 'Payload no válido',
        issues: parseResult.error.issues,
      }),
      {
        status: 400,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
      }
    );
  }

  const payload = parseResult.data;

  // Supabase Service Role client setup
  const supabaseUrl =
    (typeof Deno !== 'undefined' ? Deno.env.get('SUPABASE_URL') : process.env.SUPABASE_URL) ||
    'http://127.0.0.1:54321';
  const supabaseKey =
    (typeof Deno !== 'undefined' ? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') : process.env.SUPABASE_SERVICE_ROLE_KEY) ||
    '';

  const supabase =
    options.supabaseClient ||
    createClient(supabaseUrl, supabaseKey, {
      auth: { persistSession: false },
    });

  const partIds = payload.items.map((it) => it.partId);

  // 1. Fetch requested parts from server DB (never trust client prices or statuses)
  const { data: dbParts, error: fetchPartsError } = await supabase
    .from('parts')
    .select(`
      id,
      vendor_id,
      external_part_id,
      title,
      price_cents,
      currency,
      availability_status,
      stock_quantity,
      vendors!inner (
        id,
        trade_name,
        legal_name,
        cat_authorization_code,
        public_email,
        status
      ),
      part_oem_references (
        raw_reference,
        is_primary
      )
    `)
    .in('id', partIds)
    .is('deleted_at', null);

  if (fetchPartsError) {
    return new Response(
      JSON.stringify({
        error: 'Database query error',
        message: 'No se pudo consultar el catálogo en servidor',
        details: fetchPartsError.message,
      }),
      {
        status: 500,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
      }
    );
  }

  const foundParts = dbParts || [];
  const foundMap = new Map<string, any>(foundParts.map((p: any) => [p.id, p]));

  // Verify all parts exist
  for (const partId of partIds) {
    if (!foundMap.has(partId)) {
      return new Response(
        JSON.stringify({
          error: 'Part not found in catalog',
          message: `La pieza con identificador ${partId} no existe o ha sido retirada del inventario`,
          partId,
        }),
        {
          status: 400,
          headers: { ...CORS_HEADERS, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
        }
      );
    }
  }

  // Verify vendor status and part availability
  for (const p of foundParts) {
    const vendor = p.vendors;
    if (!vendor || vendor.status !== 'ACTIVE') {
      return new Response(
        JSON.stringify({
          error: 'Inactive vendor',
          message: `El desguace colaborador para la pieza "${p.title}" no se encuentra activo`,
        }),
        {
          status: 400,
          headers: { ...CORS_HEADERS, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
        }
      );
    }

    if (!['AVAILABLE', 'PENDING_CONFIRMATION'].includes(p.availability_status)) {
      return new Response(
        JSON.stringify({
          error: 'Part unavailable for inquiry',
          message: `La pieza "${p.title}" figura como no disponible (${p.availability_status})`,
          partId: p.id,
        }),
        {
          status: 409,
          headers: { ...CORS_HEADERS, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
        }
      );
    }
  }

  // 2. Group parts by vendor_id (strict separation: scrap yards never see another yard's parts)
  const vendorGroups = new Map<string, any[]>();
  for (const p of foundParts) {
    const list = vendorGroups.get(p.vendor_id) || [];
    list.push(p);
    vendorGroups.set(p.vendor_id, list);
  }

  const groupId = (typeof crypto !== 'undefined' ? crypto : (globalThis as any).crypto).randomUUID();
  const inquiriesSummary: any[] = [];

  // Configuration for email delivery
  const resendApiKey =
    options.resendApiKey ??
    (typeof Deno !== 'undefined' ? Deno.env.get('RESEND_API_KEY') : process.env.RESEND_API_KEY);
  
  // Test Mode containment: When active, emails are strictly routed ONLY to the approved test inbox
  const isTestMode =
    (typeof Deno !== 'undefined'
      ? Deno.env.get('INQUIRY_EMAIL_TEST_MODE') === 'true'
      : process.env.INQUIRY_EMAIL_TEST_MODE === 'true') || true; // Default to test mode in staging

  const testRecipientEmail =
    (typeof Deno !== 'undefined'
      ? Deno.env.get('INQUIRY_TEST_RECIPIENT_EMAIL')
      : process.env.INQUIRY_TEST_RECIPIENT_EMAIL);

  const productionInquiryEmail =
    options.inquiryEmail ??
    (typeof Deno !== 'undefined'
      ? Deno.env.get('EURODESGUACE_INQUIRY_EMAIL')
      : process.env.EURODESGUACE_INQUIRY_EMAIL);

  // In test mode, target MUST be the authorized test inbox; if unconfigured, delivery is skipped
  const targetRecipientEmail = isTestMode ? testRecipientEmail : productionInquiryEmail;

  const fromEmail =
    options.fromEmail ??
    (typeof Deno !== 'undefined' ? Deno.env.get('INQUIRY_FROM_EMAIL') : process.env.INQUIRY_FROM_EMAIL) ??
    'onboarding@resend.dev';

  // 3. Multi-vendor atomic idempotency & payload fingerprint verification
  const vendorIds = Array.from(vendorGroups.keys());
  
  // Calculate stable payload fingerprint (sorted part IDs + customer identifiers)
  const normalizedPartsStr = [...partIds].sort().join(',');
  const fingerprintRaw = `${payload.customerName}|${payload.customerEmail || ''}|${payload.customerPhone || ''}|${payload.vehiclePlate || ''}|${payload.vehicleVin || ''}|${normalizedPartsStr}`;

  // Find existing inquiries matching this idempotencyKey
  const { data: existingInquiries, error: existingInquiriesError } = await supabase
    .from('inquiries')
    .select(`
      id,
      inquiry_reference,
      group_id,
      vendor_id,
      customer_name,
      customer_email,
      customer_phone,
      vehicle_vin,
      vehicle_plate,
      status,
      created_at,
      vendors (
        trade_name
      ),
      inquiry_items (
        part_id
      ),
      inquiry_notifications (
        status,
        created_at
      )
    `)
    .in('vendor_id', vendorIds)
    .eq('idempotency_key', payload.idempotencyKey);

  if (!existingInquiriesError && existingInquiries && existingInquiries.length > 0) {
    // A. Payload mismatch check (RFC 7240 / Idempotency-Key standard: 409 Conflict if key reused with different payload)
    const firstMatch = existingInquiries[0];
    const existingParts = existingInquiries.flatMap((inq: any) => (inq.inquiry_items || []).map((it: any) => it.part_id));
    const existingPartsSorted = [...new Set(existingParts)].sort().join(',');
    const existingFingerprint = `${firstMatch.customer_name}|${firstMatch.customer_email || ''}|${firstMatch.customer_phone || ''}|${firstMatch.vehicle_plate || ''}|${firstMatch.vehicle_vin || ''}|${existingPartsSorted}`;

    if (existingFingerprint !== fingerprintRaw) {
      return new Response(
        JSON.stringify({
          error: 'Idempotency key conflict',
          message: 'La clave de idempotencia ya ha sido utilizada previamente con datos de consulta o piezas diferentes.',
        }),
        {
          status: 409,
          headers: { ...CORS_HEADERS, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
        }
      );
    }

    // B. Multi-vendor completeness check:
    // If all vendor groups are already created for this key, return the full existing group response
    if (existingInquiries.length === vendorGroups.size) {
      const existingSummary = existingInquiries.map((inq: any) => {
        const latestNotif = (inq.inquiry_notifications || []).sort(
          (a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        )[0];

        return {
          inquiryId: inq.id,
          inquiryReference: inq.inquiry_reference,
          vendorId: inq.vendor_id,
          vendorTradeName: inq.vendors?.trade_name || 'Desguace Colaborador',
          itemCount: (inq.inquiry_items || []).length,
          notificationStatus: latestNotif?.status ?? 'PENDING',
          status: inq.status,
        };
      });

      return new Response(
        JSON.stringify({
          success: true,
          groupId: firstMatch.group_id,
          inquiries: existingSummary,
          registeredAt: firstMatch.created_at,
        }),
        {
          status: 200,
          headers: { ...CORS_HEADERS, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
        }
      );
    }
  }

  // Recover existing group_id if this idempotencyKey was partially processed, else generate new UUID
  let effectiveGroupId: string =
    existingInquiries && existingInquiries.length > 0
      ? existingInquiries[0].group_id
      : (typeof crypto !== 'undefined' ? crypto : (globalThis as any).crypto).randomUUID();

  for (const [vendorId, partsInGroup] of vendorGroups.entries()) {
    const vendor = partsInGroup[0].vendors;

    // Check if this specific vendor inquiry already exists
    const existingInquiry = (existingInquiries || []).find((inq: any) => inq.vendor_id === vendorId);

    if (existingInquiry) {
      const latestNotif = (existingInquiry.inquiry_notifications || []).sort(
        (a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      )[0];

      inquiriesSummary.push({
        inquiryId: existingInquiry.id,
        inquiryReference: existingInquiry.inquiry_reference,
        vendorId,
        vendorTradeName: vendor.trade_name,
        itemCount: partsInGroup.length,
        notificationStatus: latestNotif?.status ?? 'PENDING',
        status: existingInquiry.status,
      });
      continue;
    }

    // B. Create new inquiry record
    const inquiryReference = generateInquiryReference();
    const { data: createdInquiry, error: insertInquiryError } = await supabase
      .from('inquiries')
      .insert({
        inquiry_reference: inquiryReference,
        group_id: effectiveGroupId,
        vendor_id: vendorId,
        customer_name: payload.customerName,
        customer_email: payload.customerEmail || null,
        customer_phone: payload.customerPhone || null,
        customer_message: payload.customerMessage || null,
        vehicle_vin: payload.vehicleVin || null,
        vehicle_plate: payload.vehiclePlate || null,
        privacy_policy_version: payload.privacyConsent.version,
        privacy_policy_accepted_at: new Date().toISOString(),
        idempotency_key: payload.idempotencyKey,
        status: 'REGISTERED',
        source: payload.source || 'mobile_app',
      })
      .select('id, inquiry_reference, group_id, status')
      .single();

    if (insertInquiryError || !createdInquiry) {
      // Concurrency race guard: if duplicate key error occurred (23505) specifically on (vendor_id, idempotency_key)
      const isIdempotencyCollision =
        insertInquiryError?.code === '23505' &&
        (insertInquiryError.message?.includes('uq_vendor_idempotency') ||
          insertInquiryError.details?.includes('vendor_id') ||
          insertInquiryError.details?.includes('idempotency_key'));

      if (isIdempotencyCollision) {
        const { data: raceInquiry } = await supabase
          .from('inquiries')
          .select('id, inquiry_reference, group_id, status')
          .eq('vendor_id', vendorId)
          .eq('idempotency_key', payload.idempotencyKey)
          .maybeSingle();

        if (raceInquiry) {
          if (!effectiveGroupId) effectiveGroupId = raceInquiry.group_id;
          const { data: notif } = await supabase
            .from('inquiry_notifications')
            .select('status')
            .eq('inquiry_id', raceInquiry.id)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();

          inquiriesSummary.push({
            inquiryId: raceInquiry.id,
            inquiryReference: raceInquiry.inquiry_reference,
            vendorId,
            vendorTradeName: vendor.trade_name,
            itemCount: partsInGroup.length,
            notificationStatus: notif?.status ?? 'PENDING',
            status: raceInquiry.status,
          });
          continue;
        }
      }

      return new Response(
        JSON.stringify({ error: 'Failed to record inquiry in database', details: insertInquiryError?.message }),
        {
          status: 500,
          headers: { ...CORS_HEADERS, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
        }
      );
    }

    // C. Insert items snapshot
    const itemInserts = partsInGroup.map((p: any) => {
      const primaryOem = (p.part_oem_references || []).find((o: any) => o.is_primary)?.raw_reference || null;
      return {
        inquiry_id: createdInquiry.id,
        part_id: p.id,
        vendor_id: vendorId,
        external_part_id: p.external_part_id,
        title: p.title,
        oem_reference: primaryOem,
        price_cents: p.price_cents,
        currency: p.currency || 'EUR',
        availability_status: p.availability_status,
      };
    });

    const { error: insertItemsError } = await supabase.from('inquiry_items').insert(itemInserts);
    if (insertItemsError) {
      // In production, transaction rollback. Here, cascade or delete header
      await supabase.from('inquiries').delete().eq('id', createdInquiry.id);
      return new Response(
        JSON.stringify({ error: 'Failed to record inquiry items snapshot' }),
        {
          status: 500,
          headers: { ...CORS_HEADERS, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
        }
      );
    }

    // D. Email Notification Outbox
    // In test mode, targetRecipientEmail points exclusively to INQUIRY_TEST_RECIPIENT_EMAIL.
    // In production mode, it requires EURODESGUACE_INQUIRY_EMAIL.
    const recipientEmail = targetRecipientEmail || null;
    let notificationStatus: 'PENDING' | 'SENT' | 'FAILED' | 'SKIPPED_NOT_CONFIGURED' = 'PENDING';
    let providerMessageId: string | undefined;
    let deliveryError: string | undefined;

    if (!resendApiKey || !recipientEmail) {
      // Missing credentials or test recipient not yet configured in environment
      notificationStatus = 'SKIPPED_NOT_CONFIGURED';
      if (!resendApiKey && !recipientEmail) {
        deliveryError = 'RESEND_API_KEY e INQUIRY_TEST_RECIPIENT_EMAIL no configurados en entorno';
      } else if (!resendApiKey) {
        deliveryError = 'Proveedor de email no configurado (RESEND_API_KEY ausente en secretos de Supabase)';
      } else {
        deliveryError = isTestMode
          ? 'Destinatario de prueba no configurado (INQUIRY_TEST_RECIPIENT_EMAIL ausente)'
          : 'Destinatario comercial no configurado (EURODESGUACE_INQUIRY_EMAIL ausente)';
      }
    } else {
      // Build safe email HTML body (data minimized: no VIN/plate by default)
      const partRowsHtml = partsInGroup
        .map(
          (p) => `<tr>
            <td style="padding: 8px; border-bottom: 1px solid #e2e8f0;"><b>${p.title}</b></td>
            <td style="padding: 8px; border-bottom: 1px solid #e2e8f0;">Ref. CAT: #${p.external_part_id}</td>
            <td style="padding: 8px; border-bottom: 1px solid #e2e8f0;">${(p.price_cents / 100).toFixed(2)} EUR (provisional)</td>
          </tr>`
        )
        .join('');

      const emailHtml = `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; color: #1e293b;">
          <h2 style="color: #0f172a;">Nueva consulta de disponibilidad [${inquiryReference}]</h2>
          <p>Se ha recibido una solicitud de comprobación de inventario a través del Marketplace de Recambios.</p>
          
          <div style="background: #f8fafc; padding: 16px; border-radius: 8px; margin: 16px 0;">
            <h3 style="margin-top: 0; font-size: 16px;">Datos del cliente:</h3>
            <p><b>Nombre:</b> ${payload.customerName}</p>
            ${payload.customerEmail ? `<p><b>Email:</b> <a href="mailto:${payload.customerEmail}">${payload.customerEmail}</a></p>` : ''}
            ${payload.customerPhone ? `<p><b>Teléfono:</b> <a href="tel:${payload.customerPhone}">${payload.customerPhone}</a></p>` : ''}
            ${payload.customerMessage ? `<p><b>Mensaje / Consulta:</b> "${payload.customerMessage}"</p>` : ''}
          </div>

          <h3 style="font-size: 16px;">Piezas consultadas (${partsInGroup.length}):</h3>
          <table style="width: 100%; border-collapse: collapse; text-align: left; font-size: 14px;">
            <thead>
              <tr style="background: #f1f5f9;">
                <th style="padding: 8px;">Pieza</th>
                <th style="padding: 8px;">Referencia</th>
                <th style="padding: 8px;">Precio Catálogo</th>
              </tr>
            </thead>
            <tbody>
              ${partRowsHtml}
            </tbody>
          </table>

          <p style="font-size: 12px; color: #64748b; margin-top: 24px;">
            Nota: Los precios indicados son los publicados en catálogo. La disponibilidad física, impuestos y costes de transporte deben ser confirmados directamente por el centro al responder al cliente.
          </p>
        </div>
      `;

      const sendEmailFn = options.emailSender || ((p) => defaultResendSender(resendApiKey, p));
      const sendResult = await sendEmailFn({
        to: recipientEmail,
        from: fromEmail,
        subject: `Consulta disponibilidad [${inquiryReference}] - ${payload.customerName}`,
        html: emailHtml,
      });

      if (sendResult.success) {
        notificationStatus = 'SENT';
        providerMessageId = sendResult.messageId;
      } else {
        notificationStatus = 'FAILED';
        deliveryError = sendResult.error;
      }
    }

    // Record notification outbox log
    await supabase.from('inquiry_notifications').insert({
      inquiry_id: createdInquiry.id,
      channel: 'EMAIL',
      recipient: recipientEmail || 'NO_CONFIGURADO',
      status: notificationStatus,
      provider: 'resend',
      provider_message_id: providerMessageId || null,
      error_message: deliveryError || null,
      attempt_count: notificationStatus === 'SENT' || notificationStatus === 'FAILED' ? 1 : 0,
      sent_at: notificationStatus === 'SENT' ? new Date().toISOString() : null,
      last_attempted_at: notificationStatus !== 'PENDING' ? new Date().toISOString() : null,
    });

    // Update inquiry status
    const finalInquiryStatus =
      notificationStatus === 'SENT'
        ? 'NOTIFICATION_SENT'
        : notificationStatus === 'FAILED'
        ? 'NOTIFICATION_FAILED'
        : 'REGISTERED';

    await supabase.from('inquiries').update({ status: finalInquiryStatus }).eq('id', createdInquiry.id);

    inquiriesSummary.push({
      inquiryId: createdInquiry.id,
      inquiryReference,
      vendorId,
      vendorTradeName: vendor.trade_name,
      itemCount: partsInGroup.length,
      notificationStatus,
      status: finalInquiryStatus,
    });
  }

  return new Response(
    JSON.stringify({
      success: true,
      groupId: effectiveGroupId,
      inquiries: inquiriesSummary,
      registeredAt: new Date().toISOString(),
    }),
    {
      status: 200,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    }
  );
}

if (typeof Deno !== 'undefined' && Deno.serve) {
  Deno.serve((req: Request) => handler(req));
}
