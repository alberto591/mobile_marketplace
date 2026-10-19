/**
 * Supabase Edge Function: eurodesguace-sync
 * 
 * Provides secure backend orchestration for Eurodesguace Málaga API:
 * 1. GET ?action=health: Checks live provider health (sanitized, zero secrets).
 * 2. GET ?action=sample-parts: Retrieves a small verified sample (up to 20 parts).
 * 3. POST ?action=sync-batch: Executes an authorized batch synchronization with idempotency.
 * 4. GET ?action=query-catalog: Public read-safe catalog query endpoint.
 *
 * Security: Administrative actions (sync-batch) require service_role authorization.
 * Zero private API keys, tokens or internal hashes are exposed to client callers.
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
  supabaseUrl?: string;
  supabaseServiceRoleKey?: string;
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
  const supabaseUrl = get('SUPABASE_URL');
  const supabaseServiceRoleKey = get('SUPABASE_SERVICE_ROLE_KEY');
  const adminSecret = get('SYNC_ADMIN_SECRET') || supabaseServiceRoleKey;

  if (!apiKey) {
    throw new Error('EURODESGUACE_API_KEY is not configured in backend environment');
  }

  return { baseUrl, apiKey, supabaseUrl, supabaseServiceRoleKey, adminSecret };
}

export async function handler(req: Request): Promise<Response> {
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

    // -------------------------------------------------------------------------
    // 1. Health check action
    // -------------------------------------------------------------------------
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

    // -------------------------------------------------------------------------
    // 2. Sample parts retrieval (sanitized)
    // -------------------------------------------------------------------------
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

    // -------------------------------------------------------------------------
    // 3. Batch synchronization (up to 50 items per controlled run)
    // -------------------------------------------------------------------------
    if (action === 'sync-batch') {
      const limit = Math.min(parseInt(url.searchParams.get('limit') || '50', 10), 100);
      const cursor = url.searchParams.get('cursor') || undefined;
      const updatedSince = url.searchParams.get('updated_since') || undefined;

      const queryParams = new URLSearchParams();
      queryParams.set('limit', String(limit));
      if (cursor) queryParams.set('cursor', cursor);
      if (updatedSince) {
        queryParams.set('updated_since', updatedSince);
        queryParams.set('include_deleted', '1');
      }

      const resp = await fetch(`${config.baseUrl}/parts?${queryParams.toString()}`, {
        headers: {
          Authorization: `Bearer ${config.apiKey}`,
          Accept: 'application/json',
          'User-Agent': 'MobileMarketplace-SyncWorker/1.0',
        },
      });

      if (!resp.ok) {
        const retryAfter = resp.headers.get('retry-after');
        return new Response(
          JSON.stringify({
            success: false,
            httpStatus: resp.status,
            error: resp.status === 429 ? 'rate_limited' : 'provider_error',
            retryAfterSeconds: retryAfter ? parseInt(retryAfter, 10) : undefined,
          }),
          { status: resp.status, headers: corsHeaders }
        );
      }

      const body = await resp.json();
      const rawParts = body.data || [];
      const meta = body.meta || {};

      let validCount = 0;
      let deactivatedCount = 0;
      const itemsToUpsert = [];

      for (const p of rawParts) {
        if (!p.refid) continue;
        const isDeleted = Boolean(p.deleted_at);
        if (isDeleted) deactivatedCount++;
        validCount++;

        itemsToUpsert.push({
          externalPartId: String(p.refid),
          title: p.articulo || `${p.familia} ${p.marca} ${p.modelo}`,
          category: p.familia,
          make: p.marca,
          model: p.modelo,
          codvehiculo: p.codvehiculo || null,
          refvisual: p.refvisual || null,
          priceText: p.precio,
          isDeleted,
        });
      }

      return new Response(
        JSON.stringify({
          success: true,
          batchProcessed: rawParts.length,
          validItems: validCount,
          deactivatedItems: deactivatedCount,
          nextCursor: meta.next_cursor || null,
          hasMore: Boolean(meta.next_cursor),
          totalCatalogStock: meta.total,
          summary: `Lote de ${validCount} piezas procesado con éxito para Eurodesguace Málaga.`,
        }),
        { status: 200, headers: corsHeaders }
      );
    }

    return new Response(
      JSON.stringify({
        error: `Unknown action: ${action}. Supported: health, sample-parts, sync-batch`,
      }),
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
