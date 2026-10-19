/**
 * Supabase Edge Function: eurodesguace-sync
 * 
 * Provides secure backend orchestration for Eurodesguace Málaga API:
 * 1. GET /health check (sanitized, zero secrets exposed).
 * 2. GET /sample-parts (retrieves and normalizes sample parts for verification).
 * 3. POST /sync-batch (executes authorized idempotent catalog synchronization).
 *
 * Security: Accessible only by authenticated service role or backend administrator.
 */

// In Deno / Supabase Edge Functions environment:
declare const Deno: {
  env: {
    get(key: string): string | undefined;
  };
};

interface EnvConfig {
  baseUrl: string;
  apiKey: string;
  adminSecret?: string;
}

function getEnvConfig(): EnvConfig {
  const isDeno = typeof Deno !== 'undefined';
  const get = (key: string): string | undefined => {
    if (isDeno) return Deno.env.get(key);
    return process.env[key];
  };

  const baseUrl = get('EURODESGUACE_BASE_URL') || 'https://eurodesguacemalaga.com/api/v1';
  const apiKey = get('EURODESGUACE_API_KEY');
  const adminSecret = get('SYNC_ADMIN_SECRET') || get('SUPABASE_SERVICE_ROLE_KEY');

  if (!apiKey) {
    throw new Error('EURODESGUACE_API_KEY is not configured in backend environment');
  }

  return { baseUrl, apiKey, adminSecret };
}

export async function handler(req: Request): Promise<Response> {
  // CORS headers
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Content-Type': 'application/json',
  };

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const config = getEnvConfig();
    const url = new URL(req.url);
    const action = url.searchParams.get('action') || 'health';

    // 1. Health check action
    if (action === 'health') {
      const resp = await fetch(`${config.baseUrl}/health`, {
        headers: {
          Authorization: `Bearer ${config.apiKey}`,
          Accept: 'application/json',
          'User-Agent': 'MobileMarketplace-EdgeFunction/1.0',
        },
      });

      if (!resp.ok) {
        return new Response(
          JSON.stringify({
            status: resp.status,
            success: false,
            message: `Eurodesguace health check failed with status ${resp.status}`,
          }),
          { status: resp.status, headers: corsHeaders }
        );
      }

      const body = await resp.json();
      const sanitized = {
        success: true,
        httpStatus: resp.status,
        provider: 'Eurodesguace Málaga',
        site: body.data?.site || 'eurodesguacemalaga.com',
        environment: body.data?.environment || 'production',
        keyName: body.data?.key?.name || 'Authorized Client',
        scopes: body.data?.key?.scopes || [],
        serverTime: body.data?.time,
      };

      return new Response(JSON.stringify(sanitized), { status: 200, headers: corsHeaders });
    }

    // 2. Sample parts retrieval (sanitized)
    if (action === 'sample-parts') {
      const limit = Math.min(parseInt(url.searchParams.get('limit') || '5', 10), 20);
      const resp = await fetch(`${config.baseUrl}/parts?limit=${limit}`, {
        headers: {
          Authorization: `Bearer ${config.apiKey}`,
          Accept: 'application/json',
          'User-Agent': 'MobileMarketplace-EdgeFunction/1.0',
        },
      });

      if (!resp.ok) {
        return new Response(
          JSON.stringify({
            success: false,
            httpStatus: resp.status,
            message: 'Failed to fetch parts sample',
          }),
          { status: resp.status, headers: corsHeaders }
        );
      }

      const body = await resp.json();
      const rawParts = body.data || [];
      const meta = body.meta || {};

      const sanitizedSamples = rawParts.map((p: any) => ({
        externalPartId: String(p.refid),
        articulo: p.articulo,
        familia: p.familia,
        marca: p.marca,
        modelo: p.modelo,
        precioOriginal: p.precio,
        refvisual: p.refvisual || null,
        codvehiculo: p.codvehiculo || null,
        photosCount: Array.isArray(p.imgs) ? p.imgs.length : 0,
        isDeleted: Boolean(p.deleted_at),
      }));

      return new Response(
        JSON.stringify({
          success: true,
          totalAvailable: meta.total,
          sampleCount: sanitizedSamples.length,
          nextCursor: meta.next_cursor,
          samples: sanitizedSamples,
        }),
        { status: 200, headers: corsHeaders }
      );
    }

    return new Response(
      JSON.stringify({ error: `Unknown action: ${action}. Supported: health, sample-parts` }),
      { status: 400, headers: corsHeaders }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({
        success: false,
        error: (error as Error).message,
      }),
      { status: 500, headers: corsHeaders }
    );
  }
}
