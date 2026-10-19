import type { Result } from '../../domain/common/result.js';
import type { Part } from '../../domain/entities/part.js';
import type {
  CatalogPageResult,
  CatalogQueryOptions,
  ProviderCapabilities,
  ScrapYardAdapter,
} from '../../ports/scrapyard-adapter.port.js';
import type { NormalizationError } from '../../validation/errors.js';
import type { EurodesguaceClientConfig } from './eurodesguace-http-client.js';
import { EurodesguaceHttpClient } from './eurodesguace-http-client.js';
import {
  EURODESGUACE_PROVIDER_ID,
  normalizeEurodesguacePart,
} from './eurodesguace.normalizer.js';
import type { EurodesguaceRawPart } from './eurodesguace.types.js';

export interface EurodesguaceAdapterConfig extends EurodesguaceClientConfig {}

/**
 * Production Adapter for Eurodesguace Málaga API.
 * Implements canonical ScrapYardAdapter port.
 */
export class EurodesguaceAdapter implements ScrapYardAdapter<EurodesguaceRawPart> {
  readonly providerId = EURODESGUACE_PROVIDER_ID;

  /**
   * Honest capabilities declaration matching official vendor specification:
   * - Daily batch updates, NO live real-time stock verification endpoint.
   * - Read-only API, NO order/reservation mutations.
   * - Full incremental sync with updated_since and include_deleted=1.
   * - Max 120 requests/minute.
   */
  readonly capabilities: ProviderCapabilities = Object.freeze({
    hasRealtimeAvailability: false,
    hasIncrementalSync: true,
    hasOrderReservation: false,
    hasVehicleDonorDetails: true,
    supportsDirectImages: true,
    rateLimitPerMinute: 120,
  });

  private readonly client: EurodesguaceHttpClient;

  constructor(config: EurodesguaceAdapterConfig) {
    this.client = new EurodesguaceHttpClient(config);
  }

  /**
   * Paged catalog query with cursor pagination and incremental sync filters.
   */
  async fetchCatalog(options: CatalogQueryOptions = {}): Promise<CatalogPageResult<EurodesguaceRawPart>> {
    const response = await this.client.getParts({
      limit: options.pageSize ? Math.min(options.pageSize, 500) : 100,
      cursor: options.cursor,
      updatedSince: options.updatedAfter ? options.updatedAfter.toISOString() : undefined,
      includeDeleted: Boolean(options.updatedAfter),
      familia: options.categoryFilter,
    });

    const nextCursor = response.meta.next_cursor !== null && response.meta.next_cursor !== undefined
      ? String(response.meta.next_cursor)
      : undefined;

    return Object.freeze({
      items: Object.freeze(response.data),
      totalItems: response.meta.total,
      hasMore: Boolean(nextCursor),
      nextCursor,
    });
  }

  /**
   * Fetches full detail for a single part by refid.
   */
  async fetchPartDetails(externalId: string): Promise<EurodesguaceRawPart> {
    const response = await this.client.getPartByRefId(externalId);
    return response.data;
  }

  /**
   * Normalizes raw Eurodesguace Málaga part to canonical Part entity.
   */
  normalizePart(raw: EurodesguaceRawPart, vendorId: string): Result<Part, NormalizationError> {
    return normalizeEurodesguacePart(raw, vendorId);
  }

  /**
   * Direct health check access for infrastructure monitoring.
   */
  async checkHealth() {
    return this.client.getHealth();
  }
}
