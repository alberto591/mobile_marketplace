// Supabase Edge Function: report-order-issue
// Lets a guest buyer report a problem or request a return from order/[reference].tsx,
// authenticated by the order's non-guessable `access_token`.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';
import { checkSharedRateLimit } from '../_shared/rate-limit.ts';
import { handleReportOrderIssue } from '../_shared/order-issues.ts';

declare const Deno: {
  env: { get: (key: string) => string | undefined };
  serve: (handler: (req: Request) => Promise<Response>) => void;
};

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status: number, extra: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...extra },
  });

export async function handler(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });
  if (req.method !== 'POST') return json({ success: false, error: 'METHOD_NOT_ALLOWED' }, 405);

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceKey) {
    return json({ success: false, error: 'CONFIG_ERROR', message: 'Servicio no configurado.' }, 500);
  }

  const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

  const clientIp = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
  const rate = await checkSharedRateLimit({
    supabase,
    scope: 'report-order-issue',
    key: clientIp,
    maxRequests: 10,
    windowSeconds: 300,
  });
  if (!rate.allowed) {
    return json(
      { success: false, error: 'RATE_LIMITED', message: 'Demasiadas solicitudes. Espera unos minutos.' },
      429,
      { 'Retry-After': String(rate.retryAfterSeconds) }
    );
  }

  const MAX_BODY_BYTES = 16 * 1024;
  let payload: unknown;
  try {
    const raw = await req.text();
    if (raw.length > MAX_BODY_BYTES) throw new Error('too large');
    payload = JSON.parse(raw);
  } catch {
    return json({ success: false, error: 'INVALID_JSON', message: 'Petición no válida.' }, 400);
  }

  const result = await handleReportOrderIssue({
    supabase,
    payload,
    emailConfig: {
      resendApiKey: Deno.env.get('RESEND_API_KEY'),
      fromEmail: Deno.env.get('ORDER_FROM_EMAIL') || Deno.env.get('INQUIRY_FROM_EMAIL'),
      opsAlertEmail:
        Deno.env.get('OPS_ALERT_EMAIL') ||
        Deno.env.get('ORDER_TEST_RECIPIENT_EMAIL') ||
        Deno.env.get('INQUIRY_TEST_RECIPIENT_EMAIL'),
    },
  });

  return json(result.body, result.status);
}

if (typeof Deno !== 'undefined' && Deno.serve) {
  Deno.serve(handler);
}
