/**
 * Supabase Edge Function: eurodesguace-sync
 * 
 * Provides secure backend orchestration for Eurodesguace Málaga API:
 * 1. GET ?action=health: Checks live provider health (sanitized, zero secrets).
 * 2. GET ?action=sample-parts: Retrieves a small verified sample (up to 20 parts).
 * 3. POST ?action=sync-batch: Fetches one batch (max 50) from the provider and persists it
 *    through ingest_catalog_batch, resuming from the stored cursor. ?dry_run=1 only inspects.
 * 4. GET ?action=ping: Public heartbeat (does not call the provider).
 *
 * Security: health, sample-parts and sync-batch call the provider API with our key, so
 * they require SYNC_ADMIN_SECRET or the service_role key. Only ping is public.
 * Zero private API keys, tokens or internal hashes are exposed to client callers.
 */

import { normalizeEurodesguaceBatch } from '../_shared/eurodesguace-normalize.ts';

// In Deno / Supabase Edge Functions environment:
declare const Deno: {
  env: {
    get(key: string): string | undefined;
  };
  serve?: (handler: (req: Request) => Promise<Response>) => void;
};

interface EnvConfig {
  baseUrl: string;
  apiKey: string;
  supabaseUrl?: string;
  supabaseServiceRoleKey?: string;
  adminSecret?: string;
  integrationId: string;
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

  // source_integrations row seeded for Eurodesguace Málaga (migration 20261019000001)
  const integrationId = get('EURODESGUACE_INTEGRATION_ID') || '00000000-0000-4000-a000-000000000201';

  return { baseUrl, apiKey, supabaseUrl, supabaseServiceRoleKey, adminSecret, integrationId };
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
    // 0. Lightweight heartbeat (instant check)
    // -------------------------------------------------------------------------
    if (action === 'ping') {
      return new Response(
        JSON.stringify({
          success: true,
          status: 'ok',
          service: 'eurodesguace-sync',
          timestamp: new Date().toISOString(),
        }),
        { status: 200, headers: corsHeaders }
      );
    }

    // Every action below calls the provider API with our key (and counts against its
    // rate limit), so all of them are administrative: only 'ping' is public.
    const authHeader = req.headers.get('authorization') || req.headers.get('x-admin-secret') || '';
    const token = authHeader.replace(/^Bearer\s+/i, '').trim();
    const isAuthorized =
      Boolean(config.adminSecret && token === config.adminSecret) ||
      Boolean(config.supabaseServiceRoleKey && token === config.supabaseServiceRoleKey);

    if (!isAuthorized && (action === 'health' || action === 'sample-parts')) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'unauthorized',
          message: `Operación administrativa denegada: ${action} requiere autorización explícita de service_role`,
        }),
        { status: 401, headers: corsHeaders }
      );
    }

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
      // Security Guardrail: administrative sync requires service_role authorization
      if (!isAuthorized) {
        return new Response(
          JSON.stringify({
            success: false,
            error: 'unauthorized',
            message: 'Operación administrativa denegada: sync-batch requiere autorización explícita de service_role',
          }),
          { status: 401, headers: corsHeaders }
        );
      }

      const MAX_BATCH_LIMIT = 50;
      const rawLimit = parseInt(url.searchParams.get('limit') || '50', 10);
      const limit = Math.min(Math.max(1, isNaN(rawLimit) ? 50 : rawLimit), MAX_BATCH_LIMIT);
      const updatedSince = url.searchParams.get('updated_since') || undefined;
      const dryRun = url.searchParams.get('dry_run') === '1';
      const startedAt = new Date().toISOString();

      // Persistence target (PostgREST with the service role). Without it the batch is only
      // inspected, and the response says so explicitly: persisted=false.
      const canPersist = Boolean(config.supabaseUrl && config.supabaseServiceRoleKey) && !dryRun;
      const restBase = `${(config.supabaseUrl || '').replace(/\/+$/, '')}/rest/v1`;
      const restHeaders = {
        apikey: config.supabaseServiceRoleKey || '',
        Authorization: `Bearer ${config.supabaseServiceRoleKey || ''}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      };

      // Cursor: explicit ?cursor wins; otherwise resume where the last persisted batch stopped.
      // A NULL stored cursor means "start a new full pass over the catalog".
      let cursor = url.searchParams.get('cursor') || undefined;
      let resumedFromCheckpoint = false;
      if (!cursor && canPersist && !updatedSince) {
        const checkpointRes = await fetch(
          `${restBase}/source_integrations?id=eq.${config.integrationId}&select=last_cursor`,
          { headers: restHeaders }
        );
        if (!checkpointRes.ok) {
          return new Response(
            JSON.stringify({ success: false, error: 'checkpoint_read_failed', httpStatus: checkpointRes.status }),
            { status: 502, headers: corsHeaders }
          );
        }
        const rows = await checkpointRes.json();
        if (!Array.isArray(rows) || rows.length === 0) {
          return new Response(
            JSON.stringify({ success: false, error: 'integration_not_found', integrationId: config.integrationId }),
            { status: 500, headers: corsHeaders }
          );
        }
        cursor = rows[0].last_cursor || undefined;
        resumedFromCheckpoint = Boolean(cursor);
      }

      // include_deleted is always sent so parts sold or withdrawn by the scrapyard are
      // taken off the catalog. Query parameters must not change while a cursor is in use.
      const queryParams = new URLSearchParams();
      queryParams.set('limit', String(limit));
      queryParams.set('include_deleted', '1');
      if (cursor) queryParams.set('cursor', cursor);
      if (updatedSince) queryParams.set('updated_since', updatedSince);

      const resp = await fetch(`${config.baseUrl}/parts?${queryParams.toString()}`, {
        headers: {
          Authorization: `Bearer ${config.apiKey}`,
          Accept: 'application/json',
          'User-Agent': 'MobileMarketplace-SyncWorker/1.0',
        },
      });

      if (!resp.ok) {
        // A stored cursor the provider no longer accepts (expired, or created with other
        // parameters) would block every future run: drop it so the next run starts a new pass.
        let cursorReset = false;
        if (resumedFromCheckpoint && (resp.status === 400 || resp.status === 404 || resp.status === 422)) {
          const resetRes = await fetch(`${restBase}/source_integrations?id=eq.${config.integrationId}`, {
            method: 'PATCH',
            headers: restHeaders,
            body: JSON.stringify({
              last_cursor: null,
              last_attempt_at: startedAt,
              sync_status: 'FAILED',
              error_summary: `Cursor rechazado por el proveedor (HTTP ${resp.status}); se reinicia la pasada.`,
            }),
          });
          cursorReset = resetRes.ok;
        }
        const retryAfter = resp.headers.get('retry-after');
        return new Response(
          JSON.stringify({
            success: false,
            httpStatus: resp.status,
            error: resp.status === 429 ? 'rate_limited' : 'provider_error',
            retryAfterSeconds: retryAfter ? parseInt(retryAfter, 10) : undefined,
            cursorReset,
          }),
          { status: resp.status, headers: corsHeaders }
        );
      }

      const body = await resp.json();
      const rawParts = body.data || [];
      const meta = body.meta || {};
      const nextCursor: string | null = meta.next_cursor ? String(meta.next_cursor) : null;

      const parts = normalizeEurodesguaceBatch(rawParts);
      const deactivatedCount = parts.filter((p) => p.isDeleted).length;

      let persistence: Record<string, unknown> | null = null;
      if (canPersist) {
        const ingestRes = await fetch(`${restBase}/rpc/ingest_catalog_batch`, {
          method: 'POST',
          headers: restHeaders,
          body: JSON.stringify({
            p_integration_id: config.integrationId,
            p_parts: parts,
            p_next_cursor: nextCursor,
            p_started_at: startedAt,
          }),
        });
        if (!ingestRes.ok) {
          const detail = await ingestRes.text();
          return new Response(
            JSON.stringify({
              success: false,
              error: 'persistence_failed',
              httpStatus: ingestRes.status,
              message: 'El lote se descargó del proveedor pero no se pudo guardar; el cursor no ha avanzado.',
              detail: detail.slice(0, 300),
            }),
            { status: 502, headers: corsHeaders }
          );
        }
        persistence = await ingestRes.json();
      }

      return new Response(
        JSON.stringify({
          success: true,
          persisted: canPersist,
          notPersistedReason: canPersist
            ? undefined
            : dryRun
            ? 'dry_run'
            : 'SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY no configurados',
          batchProcessed: rawParts.length,
          validItems: parts.length,
          deactivatedItems: deactivatedCount,
          created: persistence?.created,
          updated: persistence?.updated,
          needsPriceConfirmation: persistence?.needsPriceConfirmation,
          nextCursor,
          hasMore: Boolean(nextCursor),
          catalogPassComplete: !nextCursor,
          totalCatalogStock: meta.total,
          summary: canPersist
            ? `Lote de ${parts.length} piezas guardado en el catálogo de Eurodesguace Málaga.`
            : `Lote de ${parts.length} piezas inspeccionado sin guardar.`,
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

if (typeof Deno !== 'undefined' && typeof Deno.serve === 'function') {
  Deno.serve(handler);
}
