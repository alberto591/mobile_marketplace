export type {
  CatalogSearchResult,
  ICatalogService,
  PartDetailResult,
  SearchFilters,
  SearchResultItem,
  SortOrderOption,
} from './catalog-service.interface';

export {
  BackendCatalogError,
  BackendCatalogService,
  mapRowToPart,
  mapRowToVendor,
} from './backend-catalog.service';
export type {
  BackendCatalogServiceOptions,
  PublicCatalogPartRow,
} from './backend-catalog.service';

export {
  MockCatalogService,
} from './mock-catalog.service';
export type {
  MockCatalogServiceOptions,
} from './mock-catalog.service';

export {
  catalogService,
  createCatalogService,
} from './catalog-service.factory';
export type {
  CatalogDataSource,
  CatalogServiceFactoryOptions,
} from './catalog-service.factory';
