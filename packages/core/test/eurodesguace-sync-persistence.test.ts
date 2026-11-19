import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { handler } from '../../../supabase/functions/eurodesguace-sync/index.js';
import {
  normalizeEurodesguacePart,
  normalizeReference,
  parsePriceToCents,
} from '../../../supabase/functions/_shared/eurodesguace-normalize.js';
import { normalizeOEMReference } from '../src/index.js';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

describe('Eurodesguace batch normalization', () => {
  it('parses provider prices to integer cents without floating point', () => {
    expect(parsePriceToCents('42,95')).toBe(4295);
    expect(parsePriceToCents('120,00')).toBe(12000);
    expect(parsePriceToCents('1.250,50')).toBe(125050);
    expect(parsePriceToCents('35 €')).toBe(3500);
    expect(parsePriceToCents('19.9')).toBe(1990);
    expect(parsePriceToCents('0,07')).toBe(7);
  });

  it('returns 0 (inquiry only) for missing or malformed prices', () => {
    for (const bad of ['', null, undefined, 'consultar', '-5,00', '12,345', '1e5']) {
      expect(parsePriceToCents(bad)).toBe(0);
    }
  });

  it('normalizes references exactly like the core domain', () => {
    expect(normalizeReference('6f0-857 508.B')).toBe(normalizeOEMReference('6f0-857 508.B'));
    expect(normalizeReference('a-1')).toBeNull();
  });

  it('maps a provider row, treating empty strings as missing and dropping bad image urls', () => {
    const part = normalizeEurodesguacePart({
      refid: 31285,
      articulo: '',
      familia: 'OPTICA',
      marca: 'SEAT',
      modelo: 'IBIZA',
      precio: '42,95',
      refvisual: '',
      codvehiculo: 'V-9',
      imgs: ['https://cdn.example/a.jpg', 'javascript:alert(1)', '', 7],
      deleted_at: '',
    });

    expect(part).toMatchObject({
      externalPartId: '31285',
      title: 'OPTICA SEAT IBIZA',
      categoryId: 'OPTICA',
      priceCents: 4295,
      isDeleted: false,
      deletedAt: null,
      referenceRaw: null,
      referenceNormalized: null,
      donorVehicleCode: 'V-9',
      images: ['https://cdn.example/a.jpg'],
    });
    expect(normalizeEurodesguacePart({ articulo: 'sin id' })).toBeNull();
  });
});

describe('sync-batch persistence', () => {
  const originalEnv = { ...process.env };
  const AUTH = { Authorization: 'Bearer test-admin-secret' };
  const providerBatch = {
    data: [
      { refid: 1, articulo: 'Faro', familia: 'OPTICA', marca: 'SEAT', modelo: 'IBIZA', precio: '45,00', imgs: [] },
      { refid: 2, articulo: 'Puerta', familia: 'CARROCERIA', marca: 'FORD', modelo: 'FOCUS', precio: '90,00', deleted_at: '2026-11-01T10:00:00Z' },
    ],
    meta: { next_cursor: 'CUR-2', total: 4000 },
  };

  beforeEach(() => {
    process.env.EURODESGUACE_API_KEY = 'provider-key';
    process.env.EURODESGUACE_BASE_URL = 'https://api.test-desguace.com/v1';
    process.env.SUPABASE_URL = 'https://proj.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key';
    process.env.SYNC_ADMIN_SECRET = 'test-admin-secret';
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
  });

  it('resumes from the stored cursor, saves the batch and reports what changed', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(json([{ last_cursor: 'CUR-1' }]))
      .mockResolvedValueOnce(json(providerBatch))
      .mockResolvedValueOnce(json({ processed: 2, created: 1, updated: 1, deactivated: 1, needsPriceConfirmation: 0 }));

    const res = await handler(
      new Request('http://localhost/eurodesguace-sync?action=sync-batch&limit=50', { method: 'POST', headers: AUTH })
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toMatchObject({ success: true, persisted: true, created: 1, updated: 1, deactivatedItems: 1, hasMore: true, nextCursor: 'CUR-2' });

    const [checkpointUrl] = fetchSpy.mock.calls[0];
    expect(String(checkpointUrl)).toContain('/rest/v1/source_integrations?id=eq.00000000-0000-4000-a000-000000000201');

    const [providerUrl] = fetchSpy.mock.calls[1];
    expect(String(providerUrl)).toContain('cursor=CUR-1');
    expect(String(providerUrl)).toContain('include_deleted=1');

    const [ingestUrl, ingestInit] = fetchSpy.mock.calls[2];
    expect(String(ingestUrl)).toBe('https://proj.supabase.co/rest/v1/rpc/ingest_catalog_batch');
    const sent = JSON.parse(String((ingestInit as RequestInit).body));
    expect(sent.p_next_cursor).toBe('CUR-2');
    expect(sent.p_parts.map((p: any) => `${p.externalPartId}:${p.priceCents}:${p.isDeleted}`)).toEqual(['1:4500:false', '2:9000:true']);
    // The provider key never travels to the database, nor the service key to the provider
    expect(JSON.stringify(sent)).not.toContain('provider-key');
    expect(JSON.stringify(fetchSpy.mock.calls[1][1])).not.toContain('service-role-key');
  });

  it('fails loudly and does not report success when the batch cannot be saved', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(json([{ last_cursor: null }]))
      .mockResolvedValueOnce(json(providerBatch))
      .mockResolvedValueOnce(json({ message: 'boom' }, 500));

    const res = await handler(
      new Request('http://localhost/eurodesguace-sync?action=sync-batch', { method: 'POST', headers: AUTH })
    );
    expect(res.status).toBe(502);
    expect((await res.json()).error).toBe('persistence_failed');
  });

  it('drops a stored cursor the provider rejects so the next run starts a new pass', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(json([{ last_cursor: 'STALE' }]))
      .mockResolvedValueOnce(json({ error: 'invalid_cursor' }, 400))
      .mockResolvedValueOnce(json([], 200));

    const res = await handler(
      new Request('http://localhost/eurodesguace-sync?action=sync-batch', { method: 'POST', headers: AUTH })
    );
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.cursorReset).toBe(true);
    const [, resetInit] = fetchSpy.mock.calls[2];
    expect((resetInit as RequestInit).method).toBe('PATCH');
    expect(JSON.parse(String((resetInit as RequestInit).body)).last_cursor).toBeNull();
  });

  it('does not write anything in dry-run mode', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(json(providerBatch));

    const res = await handler(
      new Request('http://localhost/eurodesguace-sync?action=sync-batch&dry_run=1', { method: 'POST', headers: AUTH })
    );
    const body = await res.json();

    expect(body.persisted).toBe(false);
    expect(body.notPersistedReason).toBe('dry_run');
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
});
