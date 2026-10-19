import type { Part } from '../domain/entities/part.js';
import type { NormalizationError } from '../validation/errors.js';

export type SyncPartOutcomeStatus =
  | 'CREATED'
  | 'UPDATED'
  | 'UNCHANGED'
  | 'DEACTIVATED'
  | 'FAILED';

export interface SyncPartOutcome {
  readonly externalPartId: string;
  readonly status: SyncPartOutcomeStatus;
  readonly part?: Part;
  readonly error?: NormalizationError | Error;
}

export interface SyncBatchSummary {
  readonly providerId: string;
  readonly vendorId: string;
  readonly startedAt: Date;
  readonly completedAt: Date;
  readonly totalProcessed: number;
  readonly createdCount: number;
  readonly updatedCount: number;
  readonly unchangedCount: number;
  readonly deactivatedCount: number;
  readonly failedCount: number;
  readonly errors: readonly { readonly externalId: string; readonly message: string }[];
  readonly isCompleteRun: boolean;
}

export interface CatalogSyncEnginePort {
  runSync(options: {
    providerId: string;
    vendorId: string;
    fullSync?: boolean;
    batchSize?: number;
  }): Promise<SyncBatchSummary>;
}
