// Supabase Edge Function: vendor-order
// Backend of the seller page (/vendor/order in the web app). No account: the request is
// authorised by the suborder action token sent to the seller in the "order paid" email.
//   POST { token, action: 'get' }
//   POST { token, action: 'ship', carrier, trackingNumber }

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';
import { handleVendorOrderRequest } from '../_shared/vendor-order.ts';

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

// Per-instance limiter: slows down scripted guessing of tokens (which are 244 bits anyway).
const RATE_LIMIT = new Map<string, { count: number; resetAt: number }>();
function allowRequest(key: string, now = Date.now()): boolean {
  if (RATE_LIMIT.size > 1000) {
    for (const [k, v] of RATE_LIMIT.entries()) if (now > v.resetAt) RATE_LIMIT.delete(k);
  }
  const entry = RATE_LIMIT.get(key);
  if (!entry || now > entry.resetAt) {
    RATE_LIMIT.set(key, { count: 1, resetAt: now + 60_000 });
    return true;
  }
  entry.count += 1;
  return entry.count <= 30;
}

export async function handler(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });
  if (req.method !== 'POST') return json({ success: false, error: 'METHOD_NOT_ALLOWED' }, 405);

  const clientIp = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
  if (!allowRequest(clientIp)) {
    return json({ success: false, error: 'RATE_LIMITED', message: 'Demasiadas peticiones. Espera un minuto.' }, 429, {
      'Retry-After': '60',
    });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceKey) {
    return json({ success: false, error: 'CONFIG_ERROR', message: 'Servicio no configurado.' }, 500);
  }

  const MAX_BODY_BYTES = 8 * 1024;
  let payload: unknown;
  try {
    const raw = await req.text();
    if (raw.length > MAX_BODY_BYTES) throw new Error('too large');
    payload = JSON.parse(raw);
  } catch {
    return json({ success: false, error: 'INVALID_JSON', message: 'Petición no válida.' }, 400);
  }

  const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
  const result = await handleVendorOrderRequest({
    supabase,
    payload,
    emailConfig: {
      resendApiKey: Deno.env.get('RESEND_API_KEY'),
      fromEmail: Deno.env.get('ORDER_FROM_EMAIL') || Deno.env.get('INQUIRY_FROM_EMAIL'),
      testMode: Deno.env.get('ORDER_EMAIL_TEST_MODE') !== 'false',
      testRecipientEmail: Deno.env.get('ORDER_TEST_RECIPIENT_EMAIL') || Deno.env.get('INQUIRY_TEST_RECIPIENT_EMAIL'),
    },
  });
  return json(result.body, result.status);
}

if (typeof Deno !== 'undefined' && Deno.serve) {
  Deno.serve(handler);
}
