import type {
  CompatibilitySignal,
  Part,
  Vendor,
} from '@mobile-marketplace/core';

export type SortOrderOption = 'relevance' | 'price_asc' | 'price_desc' | 'confidence';

export interface SearchFilters {
  readonly query?: string;
  readonly oemReference?: string;
  readonly vehicleMake?: string;
  readonly vehicleModel?: string;
  readonly vehicleYear?: number;
  readonly vendorId?: string;
  readonly maxPriceCents?: number;
  readonly onlyAvailable?: boolean;
  readonly sortBy?: SortOrderOption;
}

export interface SearchResultItem {
  readonly part: Part;
  readonly vendor: Vendor;
  readonly compatibility: CompatibilitySignal;
  readonly relevanceScore: number;
}

export interface CatalogSearchResult {
  readonly items: readonly SearchResultItem[];
  readonly totalCount: number;
  readonly appliedFilters: SearchFilters;
  readonly providerErrors: readonly { readonly providerId: string; readonly message: string }[];
}

export interface PartDetailResult {
  readonly part: Part;
  readonly vendor: Vendor;
  readonly compatibility: CompatibilitySignal;
}

export interface ICatalogService {
  search(filters: SearchFilters): Promise<CatalogSearchResult>;
  getPartById(id: string, targetVehicle?: { make?: string; model?: string; year?: number }): Promise<PartDetailResult | null>;
  getVendors(): Promise<readonly Vendor[]>;
  getPopularCategories(): Promise<readonly { readonly id: string; readonly label: string; readonly count: number }[]>;
}
