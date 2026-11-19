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

declare const __DEV__: boolean | undefined;

/**
 * Decides the catalog data source.
 *
 * - Release builds always use the backend: fake catalog data must never reach users,
 *   whatever EXPO_PUBLIC_CATALOG_DATA_SOURCE says (or if it is missing from the build).
 * - Development builds use the backend only when EXPO_PUBLIC_CATALOG_DATA_SOURCE === 'backend',
 *   and the mock otherwise.
 */
export function resolveCatalogDataSource(envValue: string | undefined, isDevelopment: boolean): CatalogDataSource {
  if (!isDevelopment) return 'backend';
  return envValue === 'backend' ? 'backend' : 'mock';
}

/**
 * Creates an ICatalogService instance based on explicit environment configuration.
 * Never returns fake mock data to conceal live backend failures.
 */
export function createCatalogService(options: CatalogServiceFactoryOptions = {}): ICatalogService {
  const isDevelopment = typeof __DEV__ === 'undefined' ? true : Boolean(__DEV__);
  const dataSource =
    options.dataSource ??
    resolveCatalogDataSource(process.env.EXPO_PUBLIC_CATALOG_DATA_SOURCE, isDevelopment);

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
