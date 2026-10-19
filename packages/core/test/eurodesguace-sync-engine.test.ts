import { describe, expect, it, vi } from 'vitest';
import type { CatalogPersistenceSink } from '../src/adapters/eurodesguace/eurodesguace-sync-engine.js';
import { EurodesguaceSyncEngine } from '../src/adapters/eurodesguace/eurodesguace-sync-engine.js';
import type { EurodesguaceRawPart } from '../src/adapters/eurodesguace/eurodesguace.types.js';
import type { Part } from '../src/domain/entities/part.js';
import type { CatalogPage, ScrapYardAdapter } from '../src/ports/scrapyard-adapter.port.js';
import { ok } from '../src/domain/common/result.js';

function createMockAdapter(pages: Map<string | undefined, CatalogPage<EurodesguaceRawPart>>): ScrapYardAdapter<EurodesguaceRawPart> {
  return {
    providerId: 'eurodesguace_malaga',
    async fetchCatalog(options): Promise<CatalogPage<EurodesguaceRawPart>> {
      const page = pages.get(options.cursor);
      if (!page) {
        throw new Error(`Página no encontrada para cursor: ${options.cursor}`);
      }
      return page;
    },
    async fetchPartDetail(externalPartId): Promise<EurodesguaceRawPart | null> {
      for (const p of pages.values()) {
        const found = p.items.find((i) => String(i.refid) === externalPartId);
        if (found) return found;
      }
      return null;
    },
    normalizePart(raw, vendorId) {
      const isDeleted = Boolean(raw.deleted_at);
      const part: Part = {
        id: `uuid_${raw.refid}`,
        vendorId,
        source: {
          providerId: 'eurodesguace_malaga',
          externalPartId: String(raw.refid),
          lastSeenAt: new Date(),
        },
        title: `${raw.familia} ${raw.articulo}`.trim(),
        categoryId: 'CARROCERIA_RETROVISOR_DCH',
        condition: 'GOOD',
        testedStatus: 'NOT_TESTED',
        price: {
          amountInCents: 4500,
          currency: 'EUR',
        },
        availability: {
          status: isDeleted ? 'OUT_OF_STOCK' : 'AVAILABLE',
          stockQuantity: isDeleted ? 0 : 1,
          lastCheckedAt: new Date(),
        },
        oemReferences: raw.refvisual
          ? [
              {
                raw: raw.refvisual,
                normalized: raw.refvisual.replace(/[^A-Z0-9]/gi, '').toUpperCase(),
                isPrimary: false,
                referenceType: 'REFERENCIA_VISUAL',
              },
            ]
          : [],
        images: [],
        warrantyMonths: 12,
        lastSyncedAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      return ok(part);
    },
  };
}

describe('EurodesguaceSyncEngine', () => {
  const samplePart1: EurodesguaceRawPart = {
    refid: '1001',
    familia: 'RETROVISOR',
    articulo: 'RETROVISOR DERECHO',
    marca: 'SEAT',
    modelo: 'IBIZA',
    precio: '45,00',
    refvisual: '6J0857508',
    refcatalogo: null,
    imgs: [],
  };

  const samplePart2: EurodesguaceRawPart = {
    refid: '1002',
    familia: 'FARO',
    articulo: 'FARO PRINCIPAL IZQUIERDO',
    marca: 'SEAT',
    modelo: 'LEON',
    precio: '75,50',
    refvisual: '5F1941005',
    refcatalogo: null,
    imgs: [],
  };

  it('processes a single batch and persists parts idempotently', async () => {
    const pages = new Map<string | undefined, CatalogPage<EurodesguaceRawPart>>([
      [
        undefined,
        {
          items: [samplePart1, samplePart2],
          totalItems: 2,
          hasMore: false,
        },
      ],
    ]);

    const adapter = createMockAdapter(pages);
    const engine = new EurodesguaceSyncEngine(adapter, 'vendor_eurodesguace');

    const persistedMap = new Map<string, Part>();
    const sink: CatalogPersistenceSink = {
      async upsertParts(parts) {
        let created = 0;
        let updated = 0;
        for (const p of parts) {
          if (persistedMap.has(p.id)) {
            updated++;
          } else {
            created++;
          }
          persistedMap.set(p.id, p);
        }
        return { created, updated };
      },
      async recordSyncLog() {},
    };

    // First execution: creates 2 records
    const res1 = await engine.processBatch({}, sink);
    expect(res1.validCount).toBe(2);
    expect(res1.totalProcessed).toBe(2);
    expect(res1.failedCount).toBe(0);
    expect(persistedMap.size).toBe(2);

    // Second execution with same batch: updates 2 records without creating duplicates (idempotency)
    const res2 = await engine.processBatch({}, sink);
    expect(res2.validCount).toBe(2);
    expect(persistedMap.size).toBe(2); // Invariant: no duplicate rows in persistence
  });

  it('processes multiple pages using cursor without skipping items', async () => {
    const pages = new Map<string | undefined, CatalogPage<EurodesguaceRawPart>>([
      [
        undefined,
        {
          items: [samplePart1],
          nextCursor: 'sig_1001',
          hasMore: true,
        },
      ],
      [
        'sig_1001',
        {
          items: [samplePart2],
          nextCursor: undefined,
          hasMore: false,
        },
      ],
    ]);

    const adapter = createMockAdapter(pages);
    const engine = new EurodesguaceSyncEngine(adapter, 'vendor_eurodesguace');

    // Page 1
    const batch1 = await engine.processBatch({ limit: 1 });
    expect(batch1.validCount).toBe(1);
    expect(batch1.hasMore).toBe(true);
    expect(batch1.nextCursor).toBe('sig_1001');

    // Page 2
    const batch2 = await engine.processBatch({ cursor: batch1.nextCursor, limit: 1 });
    expect(batch2.validCount).toBe(1);
    expect(batch2.hasMore).toBe(false);
    expect(batch2.nextCursor).toBeUndefined();
  });

  it('handles logical soft-deletions without physically destroying records', async () => {
    const deletedPart: EurodesguaceRawPart = {
      ...samplePart1,
      deleted_at: '2026-10-19T10:00:00Z',
    };

    const pages = new Map<string | undefined, CatalogPage<EurodesguaceRawPart>>([
      [
        undefined,
        {
          items: [deletedPart],
          hasMore: false,
        },
      ],
    ]);

    const adapter = createMockAdapter(pages);
    const engine = new EurodesguaceSyncEngine(adapter, 'vendor_eurodesguace');

    const result = await engine.processBatch({});
    expect(result.validCount).toBe(1);
    expect(result.deactivatedCount).toBe(1);
    expect(result.parts[0].availability.status).toBe('OUT_OF_STOCK');
    expect(result.parts[0].availability.stockQuantity).toBe(0);
  });

  it('does not advance cursor or corrupt state when an intermediate page request fails', async () => {
    const errorAdapter: ScrapYardAdapter<EurodesguaceRawPart> = {
      providerId: 'eurodesguace_malaga',
      async fetchCatalog(options) {
        if (options.cursor === 'corrupted_page') {
          throw new Error('HTTP 502 Bad Gateway: Servidor del desguace no responde');
        }
        return {
          items: [samplePart1],
          nextCursor: 'corrupted_page',
          hasMore: true,
        };
      },
      async fetchPartDetail() {
        return null;
      },
      normalizePart() {
        throw new Error('Not needed');
      },
    };

    const engine = new EurodesguaceSyncEngine(errorAdapter);

    await expect(engine.processBatch({ cursor: 'corrupted_page' })).rejects.toThrow(
      'HTTP 502 Bad Gateway'
    );
  });

  it('records structured metrics in persistence sink', async () => {
    const pages = new Map<string | undefined, CatalogPage<EurodesguaceRawPart>>([
      [
        undefined,
        {
          items: [samplePart1],
          hasMore: false,
        },
      ],
    ]);

    const adapter = createMockAdapter(pages);
    const engine = new EurodesguaceSyncEngine(adapter, 'vendor_eurodesguace');

    const recordLogSpy = vi.fn();
    const sink: CatalogPersistenceSink = {
      async upsertParts() {
        return { created: 1, updated: 0 };
      },
      recordSyncLog: recordLogSpy,
    };

    await engine.processBatch({}, sink);

    expect(recordLogSpy).toHaveBeenCalledOnce();
    const logged = recordLogSpy.mock.calls[0][0];
    expect(logged.totalProcessed).toBe(1);
    expect(logged.createdCount).toBe(1);
    expect(logged.failedCount).toBe(0);
    expect(logged.batchId).toMatch(/^sync_/);
  });
});
