import { describe, expect, it, vi } from 'vitest';
import {
  EurodesguaceAdapter,
  EurodesguaceHttpClient,
  EurodesguaceHttpError,
  EURODESGUACE_PROVIDER_ID,
  isOk,
  normalizeEurodesguacePart,
  parseEuroCommaToCents,
} from '../src/index.js';
import type { EurodesguaceRawPart } from '../src/adapters/eurodesguace/eurodesguace.types.js';

describe('Eurodesguace Málaga — Normalizer & Money Parsing', () => {
  it('correctly parses European comma-decimal string to integer cents', () => {
    expect(parseEuroCommaToCents('42,95')).toBe(4295);
    expect(parseEuroCommaToCents('100,00')).toBe(10000);
    expect(parseEuroCommaToCents('0,50')).toBe(50);
    expect(parseEuroCommaToCents('1250')).toBe(125000);
    expect(parseEuroCommaToCents('12,5')).toBe(1250);
  });

  it('rejects invalid or dangerous price strings without using NaN or floating point', () => {
    expect(() => parseEuroCommaToCents('gratis')).toThrow();
    expect(() => parseEuroCommaToCents('-42,95')).toThrow();
    expect(() => parseEuroCommaToCents('42,95,00')).toThrow();
    expect(() => parseEuroCommaToCents('   ')).toThrow();
  });

  it('normalizes valid Eurodesguace raw part payload into canonical Part', () => {
    const raw: EurodesguaceRawPart = {
      refid: '91010',
      familia: 'CLIMATIZACION',
      articulo: 'MANDO CALEFACCION / AIRE ACONDICIONADO',
      marca: 'CITROEN',
      modelo: 'NEMO',
      precio: '42,95',
      peso: 0.85,
      anopieza: 2012,
      refvisual: '5073401000013',
      codvehiculo: '00041',
      imgs: ['https://eurodesguacemalaga.com/imgs/91010_1.jpg', 'https://eurodesguacemalaga.com/imgs/91010_2.jpg'],
      estado: 'BUENO',
      updated_at: '2026-09-14T08:30:00Z',
    };

    const res = normalizeEurodesguacePart(raw, 'vendor_eurodesguace');
    expect(isOk(res)).toBe(true);

    if (isOk(res)) {
      const part = res.data;
      expect(part.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
      expect(part.vendorId).toBe('vendor_eurodesguace');
      expect(part.source.providerId).toBe(EURODESGUACE_PROVIDER_ID);
      expect(part.source.externalPartId).toBe('91010');
      expect(part.price.amountInCents).toBe(4295);
      expect(part.price.currency).toBe('EUR');
      expect(part.availability.status).toBe('AVAILABLE');
      expect(part.availability.stockQuantity).toBe(1);
      expect(part.oemReferences.length).toBe(1);
      expect(part.oemReferences[0].normalized).toBe('5073401000013');
      expect(part.oemReferences[0].brandName).toBe('REFERENCIA_VISUAL');
      expect(part.images.length).toBe(2);
      expect(part.images[0].isPrimary).toBe(true);
      expect(part.donorVehicle?.make).toBe('CITROEN');
      expect(part.donorVehicle?.model).toBe('NEMO');
      expect(part.donorVehicle?.yearFrom).toBe(2012);
    }
  });

  it('handles empty fields, absent photos, and empty strings cleanly without crashing', () => {
    const raw: EurodesguaceRawPart = {
      refid: '91099',
      familia: 'MOTOR',
      articulo: 'MOTOR COMPLETO',
      marca: '',
      modelo: '',
      precio: '850,00',
      peso: null,
      anopieza: null,
      refvisual: null,
      codvehiculo: null,
      imgs: [],
      estado: null,
    };

    const res = normalizeEurodesguacePart(raw, 'vendor_eurodesguace');
    expect(isOk(res)).toBe(true);

    if (isOk(res)) {
      const part = res.data;
      expect(part.price.amountInCents).toBe(85000);
      expect(part.images.length).toBe(0);
      expect(part.donorVehicle).toBeUndefined();
      expect(part.oemReferences.length).toBe(0);
    }
  });

  it('marks soft-deleted items (deleted_at informed) as OUT_OF_STOCK with zero quantity', () => {
    const raw: EurodesguaceRawPart = {
      refid: '91020',
      familia: 'FRENOS',
      articulo: 'PINZA FRENO TRASERA DERECHA',
      marca: 'SEAT',
      modelo: 'LEON',
      precio: '35,00',
      deleted_at: '2026-10-15T12:00:00Z',
    };

    const res = normalizeEurodesguacePart(raw, 'vendor_eurodesguace');
    expect(isOk(res)).toBe(true);

    if (isOk(res)) {
      expect(res.data.availability.status).toBe('OUT_OF_STOCK');
      expect(res.data.availability.stockQuantity).toBe(0);
      expect(res.data.availability.statusReason).toContain('Baja lógica');
    }
  });

  it('rejects parts with malformed prices and generates structured NormalizationError', () => {
    const raw: EurodesguaceRawPart = {
      refid: '99999',
      familia: 'GENERAL',
      articulo: 'PIEZA ROTA',
      marca: 'AUDI',
      modelo: 'A4',
      precio: 'PRECIO_INVALIDO',
    };

    const res = normalizeEurodesguacePart(raw, 'vendor_eurodesguace');
    expect(isOk(res)).toBe(false);
  });
});

describe('Eurodesguace Málaga — HTTP Client & Error Handling', () => {
  it('sends proper Bearer authorization header and parses /health response', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({
        data: {
          status: 'ok',
          site: 'eurodesguacemalaga.com',
          environment: 'production',
          time: '2026-10-19T20:00:00Z',
          key: {
            name: 'Cliente Test',
            scopes: ['parts:read', 'vehicles:read'],
          },
        },
      }),
    });

    const client = new EurodesguaceHttpClient({
      baseUrl: 'https://eurodesguacemalaga.com/api/v1',
      apiKey: 'test-secret-key-12345',
      fetchFn: mockFetch as any,
    });

    const health = await client.getHealth();
    expect(health.data.status).toBe('ok');
    expect(health.data.key?.name).toBe('Cliente Test');

    expect(mockFetch).toHaveBeenCalledWith(
      'https://eurodesguacemalaga.com/api/v1/health',
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({
          Authorization: 'Bearer test-secret-key-12345',
        }),
      })
    );
  });

  it('handles 429 rate limit with Retry-After header and exponential retry', async () => {
    let callCount = 0;
    const mockFetch = vi.fn().mockImplementation(async () => {
      callCount++;
      if (callCount === 1) {
        return {
          ok: false,
          status: 429,
          statusText: 'Too Many Requests',
          headers: new Headers({ 'retry-after': '0' }),
          json: async () => ({ error: { type: 'rate_limited', message: 'Quota exceeded' } }),
        };
      }
      return {
        ok: true,
        status: 200,
        headers: new Headers(),
        json: async () => ({
          data: [],
          meta: { count: 0, limit: 10, total: 0 },
        }),
      };
    });

    const client = new EurodesguaceHttpClient({
      baseUrl: 'https://eurodesguacemalaga.com/api/v1',
      apiKey: 'test-key',
      maxRetries: 2,
      fetchFn: mockFetch as any,
    });

    const result = await client.getParts({ limit: 10 });
    expect(result.data).toEqual([]);
    expect(callCount).toBe(2);
  });

  it('never leaks secret API keys in serialized EurodesguaceHttpError messages', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
      headers: new Headers(),
      json: async () => ({ error: { type: 'unauthorized', message: 'Invalid API key provided' } }),
    });

    const secretKey = 'super-secret-production-token-998877';
    const client = new EurodesguaceHttpClient({
      baseUrl: 'https://eurodesguacemalaga.com/api/v1',
      apiKey: secretKey,
      fetchFn: mockFetch as any,
    });

    try {
      await client.getParts();
      expect.fail('Should have thrown EurodesguaceHttpError');
    } catch (err) {
      expect(err).toBeInstanceOf(EurodesguaceHttpError);
      const httpErr = err as EurodesguaceHttpError;
      expect(httpErr.statusCode).toBe(401);
      expect(httpErr.message).not.toContain(secretKey);
    }
  });
});

describe('Eurodesguace Málaga — ScrapYardAdapter Implementation', () => {
  it('declares operational capabilities accurately matching vendor documentation', () => {
    const adapter = new EurodesguaceAdapter({
      baseUrl: 'https://eurodesguacemalaga.com/api/v1',
      apiKey: 'dummy-key',
    });

    expect(adapter.providerId).toBe(EURODESGUACE_PROVIDER_ID);
    expect(adapter.capabilities.hasRealtimeAvailability).toBe(false);
    expect(adapter.capabilities.hasIncrementalSync).toBe(true);
    expect(adapter.capabilities.hasOrderReservation).toBe(false);
    expect(adapter.capabilities.rateLimitPerMinute).toBe(120);
    expect(adapter.checkAvailability).toBeUndefined(); // Must not expose live availability check
  });

  it('paginates correctly using cursor returned in meta.next_cursor', async () => {
    const mockFetch = vi.fn().mockImplementation(async (url: string) => {
      const parsedUrl = new URL(url);
      const cursor = parsedUrl.searchParams.get('cursor');

      if (!cursor) {
        return {
          ok: true,
          status: 200,
          headers: new Headers(),
          json: async () => ({
            data: [
              { refid: '1', familia: 'A', articulo: 'Art 1', marca: 'M', modelo: 'Mod', precio: '10,00' },
            ],
            meta: { count: 1, limit: 1, next_cursor: 'cursor_page_2', total: 2 },
          }),
        };
      }

      return {
        ok: true,
        status: 200,
        headers: new Headers(),
        json: async () => ({
          data: [
            { refid: '2', familia: 'B', articulo: 'Art 2', marca: 'M', modelo: 'Mod', precio: '20,00' },
          ],
          meta: { count: 1, limit: 1, next_cursor: null, total: 2 },
        }),
      };
    });

    const adapter = new EurodesguaceAdapter({
      baseUrl: 'https://eurodesguacemalaga.com/api/v1',
      apiKey: 'test-key',
      fetchFn: mockFetch as any,
    });

    // Page 1
    const page1 = await adapter.fetchCatalog({ pageSize: 1 });
    expect(page1.items.length).toBe(1);
    expect(page1.hasMore).toBe(true);
    expect(page1.nextCursor).toBe('cursor_page_2');

    // Page 2
    const page2 = await adapter.fetchCatalog({ pageSize: 1, cursor: page1.nextCursor });
    expect(page2.items.length).toBe(1);
    expect(page2.hasMore).toBe(false);
    expect(page2.nextCursor).toBeUndefined();
  });
});
