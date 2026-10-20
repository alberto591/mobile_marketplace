import type { Part } from '../../domain/entities/part.js';
import type { ScrapYardAdapter } from '../../ports/scrapyard-adapter.port.js';
import type { EurodesguaceRawPart } from './eurodesguace.types.js';

export interface SyncBatchOptions {
  readonly cursor?: string;
  readonly limit?: number;
  readonly updatedAfter?: Date;
  readonly vendorId?: string;
}

export interface SyncBatchResult {
  readonly batchId: string;
  readonly startedAt: Date;
  readonly completedAt: Date;
  readonly totalProcessed: number;
  readonly validCount: number;
  readonly deactivatedCount: number;
  readonly failedCount: number;
  readonly nextCursor?: string;
  readonly hasMore: boolean;
  readonly errors: readonly { readonly externalId: string; readonly message: string }[];
  readonly parts: readonly Part[];
}

export interface CatalogPersistenceSink {
  upsertParts(parts: readonly Part[]): Promise<{ created: number; updated: number }>;
  recordSyncLog(metrics: {
    batchId: string;
    startedAt: Date;
    completedAt: Date;
    totalProcessed: number;
    createdCount: number;
    updatedCount: number;
    deactivatedCount: number;
    failedCount: number;
    nextCursor?: string;
    errorSummary: readonly unknown[];
  }): Promise<void>;
}

/**
 * Resilient Ingestion Engine for Eurodesguace Málaga API.
 * Orchestrates batch retrieval, Zod validation, canonical normalization,
 * soft-deletion handling, checkpointing, and idempotent persistence.
 */
export class EurodesguaceSyncEngine {
  constructor(
    private readonly adapter: ScrapYardAdapter<EurodesguaceRawPart>,
    private readonly vendorId: string = 'vendor_eurodesguace'
  ) {}

  /**
   * Processes a single controlled batch of catalog parts.
   * Guarantees that partial failures do not corrupt state and that
   * soft-deleted items (deleted_at != null) are transitioned to OUT_OF_STOCK
   * without destructive physical DELETES.
   */
  async processBatch(
    options: SyncBatchOptions = {},
    persistenceSink?: CatalogPersistenceSink
  ): Promise<SyncBatchResult> {
    const startedAt = new Date();
    const batchId = `sync_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    const MAX_BATCH_LIMIT = 50;
    const requestedLimit = options.limit !== undefined ? options.limit : 50;
    const effectiveLimit = Math.min(Math.max(1, requestedLimit), MAX_BATCH_LIMIT);

    const pageResult = await this.adapter.fetchCatalog({
      cursor: options.cursor,
      pageSize: effectiveLimit,
      updatedAfter: options.updatedAfter,
    });

    const validParts: Part[] = [];
    const errors: { externalId: string; message: string }[] = [];
    let deactivatedCount = 0;

    for (const raw of pageResult.items) {
      const externalId = String(raw.refid);
      const normResult = this.adapter.normalizePart(raw, this.vendorId);

      if (normResult.success) {
        const part = normResult.data;
        validParts.push(part);
        if (part.availability.status === 'OUT_OF_STOCK' && raw.deleted_at) {
          deactivatedCount++;
        }
      } else {
        errors.push({
          externalId,
          message: normResult.error.message,
        });
      }
    }

    // Persist batch idempotently if a persistence sink is provided
    let createdCount = 0;
    let updatedCount = 0;
    if (persistenceSink && validParts.length > 0) {
      const persistRes = await persistenceSink.upsertParts(validParts);
      createdCount = persistRes.created;
      updatedCount = persistRes.updated;
    }

    const completedAt = new Date();

    if (persistenceSink) {
      await persistenceSink.recordSyncLog({
        batchId,
        startedAt,
        completedAt,
        totalProcessed: pageResult.items.length,
        createdCount,
        updatedCount,
        deactivatedCount,
        failedCount: errors.length,
        nextCursor: pageResult.nextCursor,
        errorSummary: errors,
      });
    }

    return Object.freeze({
      batchId,
      startedAt,
      completedAt,
      totalProcessed: pageResult.items.length,
      validCount: validParts.length,
      deactivatedCount,
      failedCount: errors.length,
      nextCursor: pageResult.nextCursor,
      hasMore: pageResult.hasMore,
      errors: Object.freeze(errors),
      parts: Object.freeze(validParts),
    });
  }
}
