import type { Result } from '../domain/common/result.js';
import type { Availability } from '../domain/entities/availability.js';
import type { Part } from '../domain/entities/part.js';
import type { NormalizationError } from '../validation/errors.js';

/**
 * Declared capabilities of a scrapyard provider API.
 * Never assumed; must be explicitly declared according to verified vendor documentation.
 */
export interface ProviderCapabilities {
  /**
   * If true, the provider API offers an endpoint to query live availability
   * of a specific part immediately before order confirmation.
   */
  readonly hasRealtimeAvailability: boolean;

  /**
   * If true, the provider allows querying only changes since a timestamp (incremental sync).
   */
  readonly hasIncrementalSync: boolean;

  /**
   * If true, the provider supports an atomic hold/reservation endpoint for a part.
   */
  readonly hasOrderReservation: boolean;

  /**
   * If true, the provider catalog includes donor vehicle details (engine, year, displacement).
   */
  readonly hasVehicleDonorDetails: boolean;

  /**
   * If true, photos can be hotlinked directly with high reliability and CORS support.
   */
  readonly supportsDirectImages: boolean;

  /**
   * Maximum allowed HTTP requests per minute.
   */
  readonly rateLimitPerMinute?: number;
}

/**
 * Query options for fetching a catalog page from a provider.
 */
export interface CatalogQueryOptions {
  readonly page?: number;
  readonly pageSize?: number;
  readonly cursor?: string;
  readonly updatedAfter?: Date;
  readonly categoryFilter?: string;
}

/**
 * Paged catalog response holding raw vendor-specific items.
 */
export interface CatalogPageResult<TRawItem = unknown> {
  readonly items: readonly TRawItem[];
  readonly totalItems?: number;
  readonly hasMore: boolean;
  readonly nextCursor?: string;
  readonly nextPage?: number;
  readonly rateLimitRemaining?: number;
}

/**
 * Canonical Port (Hexagonal Architecture) for scrap yard provider integration.
 * Concrete adapters for Provider A, Provider B, etc. implement this contract.
 */
export interface ScrapYardAdapter<TRawPart = unknown> {
  /** Unique system identifier for this provider (e.g. 'desguace-la-torre', 'desguaces-malvarrosa') */
  readonly providerId: string;

  /** Stated operational capabilities of this integration */
  readonly capabilities: ProviderCapabilities;

  /**
   * Fetches a raw paginated batch of catalog items from the vendor's API.
   */
  fetchCatalog(options: CatalogQueryOptions): Promise<CatalogPageResult<TRawPart>>;

  /**
   * Fetches raw detailed data for a specific part from the vendor's API.
   */
  fetchPartDetails(externalId: string): Promise<TRawPart>;

  /**
   * Checks real-time stock availability. Optional method only available
   * if capabilities.hasRealtimeAvailability === true.
   */
  checkAvailability?(externalId: string): Promise<Availability>;

  /**
   * Validates and transforms a vendor-specific raw payload into the canonical Part entity.
   * Guarantees that invalid or malformed data produces structured errors rather than corrupting state.
   */
  normalizePart(raw: TRawPart, vendorId: string): Result<Part, NormalizationError>;
}
