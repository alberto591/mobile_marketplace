import type { ICatalogService } from './catalog-service.interface';
import { MockCatalogService } from './mock-catalog.service';
import { BackendCatalogService } from './backend-catalog.service';

export type CatalogDataSource = 'mock' | 'backend';

export interface CatalogServiceFactoryOptions {
  readonly dataSource?: CatalogDataSource;
  readonly backendBaseUrl?: string;
  readonly backendAnonKey?: string;
  readonly backendTimeoutMs?: number;
  readonly includeMockEurodesguace?: boolean;
}

/**
 * Creates an ICatalogService instance based on explicit environment configuration.
 *
 * Rules:
 * - In local dev/testing without remote backend: defaults to MockCatalogService.
 * - When EXPO_PUBLIC_CATALOG_DATA_SOURCE === 'backend' and backend URL is provided: uses BackendCatalogService.
 * - Never returns fake mock data to conceal live backend failures.
 */
export function createCatalogService(options: CatalogServiceFactoryOptions = {}): ICatalogService {
  const dataSource =
    options.dataSource ??
    (process.env.EXPO_PUBLIC_CATALOG_DATA_SOURCE === 'backend' ? 'backend' : 'mock');

  if (dataSource === 'backend') {
    return new BackendCatalogService({
      baseUrl: options.backendBaseUrl ?? process.env.EXPO_PUBLIC_SUPABASE_URL,
      anonKey: options.backendAnonKey ?? process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
      timeoutMs: options.backendTimeoutMs,
    });
  }

  return new MockCatalogService({
    includeEurodesguaceSample: options.includeMockEurodesguace ?? true,
  });
}

// Global application singleton initialized according to current environment
export const catalogService: ICatalogService = createCatalogService();
