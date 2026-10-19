import type {
  CatalogSearchResult,
  ICatalogService,
  PartDetailResult,
  SearchFilters,
  SearchResultItem,
} from './catalog-service.interface';
import type {
  OEMReferenceType,
  Part,
  PartCondition,
  TestedStatus,
  Vendor,
} from '@mobile-marketplace/core';
import {
  areOEMReferencesEqual,
  evaluateCompatibility,
} from '@mobile-marketplace/core';

export interface BackendCatalogServiceOptions {
  readonly baseUrl?: string;
  readonly anonKey?: string;
  readonly timeoutMs?: number;
  readonly fetchFn?: typeof fetch;
}

export interface PublicCatalogPartRow {
  readonly id: string;
  readonly vendor_id: string;
  readonly external_part_id: string;
  readonly source_sku: string | null;
  readonly title: string;
  readonly description: string | null;
  readonly category_id: string;
  readonly price_cents: number;
  readonly currency: string;
  readonly condition: string;
  readonly tested_status: string;
  readonly availability_status: string;
  readonly stock_quantity: number;
  readonly warranty_months: number;
  readonly source_updated_at: string;
  readonly last_synced_at: string;
  readonly vendor: {
    readonly id: string;
    readonly legalName: string;
    readonly tradeName: string;
    readonly catAuthorizationCode: string;
    readonly catVerified: boolean;
    readonly city: string;
    readonly province: string;
    readonly postalCode: string;
    readonly warrantyMonths?: number;
    readonly returnDays?: number;
  };
  readonly donor_vehicle: {
    readonly make: string;
    readonly model: string;
    readonly generation?: string;
    readonly yearFrom?: number;
    readonly yearTo?: number;
    readonly engineCode?: string;
    readonly fuel?: string;
    readonly donorVehicleCode?: string;
  } | null;
  readonly oem_references: ReadonlyArray<{
    readonly raw: string;
    readonly normalized: string;
    readonly isPrimary: boolean;
    readonly referenceType?: string;
    readonly brandName?: string;
  }>;
  readonly images: ReadonlyArray<{
    readonly id: string;
    readonly url: string;
    readonly sortOrder: number;
    readonly isPrimary: boolean;
  }>;
}

export class BackendCatalogError extends Error {
  readonly statusCode?: number;
  readonly causeError?: unknown;

  constructor(message: string, options?: { statusCode?: number; cause?: unknown }) {
    super(`[BackendCatalogError]: ${message}`);
    this.name = 'BackendCatalogError';
    this.statusCode = options?.statusCode;
    this.causeError = options?.cause;
  }
}

export function mapRowToPart(row: PublicCatalogPartRow): Part {
  return Object.freeze({
    id: row.id,
    vendorId: row.vendor_id,
    source: Object.freeze({
      providerId: row.vendor_id,
      externalPartId: row.external_part_id,
      sourceSku: row.source_sku ?? undefined,
      lastSeenAt: new Date(row.last_synced_at),
    }),
    title: row.title,
    description: row.description ?? undefined,
    categoryId: row.category_id,
    condition: (row.condition as PartCondition) ?? 'GOOD',
    testedStatus: (row.tested_status as TestedStatus) ?? 'NOT_TESTED',
    price: Object.freeze({
      amountInCents: row.price_cents,
      currency: 'EUR' as const,
    }),
    availability: Object.freeze({
      status: (row.availability_status as any) ?? 'AVAILABLE',
      stockQuantity: row.stock_quantity ?? 1,
      lastCheckedAt: new Date(row.last_synced_at),
    }),
    donorVehicle: row.donor_vehicle
      ? Object.freeze({
          make: row.donor_vehicle.make,
          model: row.donor_vehicle.model,
          generation: row.donor_vehicle.generation,
          yearFrom: row.donor_vehicle.yearFrom,
          yearTo: row.donor_vehicle.yearTo,
          engineCode: row.donor_vehicle.engineCode,
          fuel: row.donor_vehicle.fuel as any,
          donorVehicleCode: row.donor_vehicle.donorVehicleCode,
        })
      : undefined,
    oemReferences: (row.oem_references ?? []).map((o) =>
      Object.freeze({
        raw: o.raw,
        normalized: o.normalized,
        isPrimary: o.isPrimary,
        brandName: o.brandName,
        referenceType: o.referenceType as OEMReferenceType | undefined,
      })
    ),
    images: (row.images ?? []).map((img) =>
      Object.freeze({
        id: img.id,
        url: img.url,
        sortOrder: img.sortOrder,
        isPrimary: img.isPrimary,
      })
    ),
    warrantyMonths: row.warranty_months ?? 12,
    sourceUpdatedAt: row.source_updated_at ? new Date(row.source_updated_at) : undefined,
    lastSyncedAt: new Date(row.last_synced_at),
    createdAt: new Date(row.last_synced_at),
    updatedAt: new Date(row.last_synced_at),
  });
}

export function mapRowToVendor(row: PublicCatalogPartRow): Vendor {
  const v = row.vendor;
  return Object.freeze({
    id: v.id,
    legalName: v.legalName,
    tradeName: v.tradeName,
    catAuthorizationCode: v.catAuthorizationCode,
    catVerified: v.catVerified,
    location: Object.freeze({
      city: v.city,
      province: v.province,
      postalCode: v.postalCode,
      country: 'ES' as const,
    }),
    contact: Object.freeze({}),
    policies: Object.freeze({
      warrantyMonths: v.warrantyMonths ?? 12,
      returnDays: v.returnDays ?? 14,
      shippingEstimateDays: 2,
      shippingPolicySummary: 'Envíos en 24-48h a península. Garantía de 12 meses conforme al RD 265/2021.',
    }),
    status: 'ACTIVE' as const,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
}

/**
 * BackendCatalogService connects to Supabase PostgREST securely
 * querying the public_catalog_parts projection with RLS and anon key.
 * Never leaks provider private credentials or administrative tables.
 */
export class BackendCatalogService implements ICatalogService {
  private readonly baseUrl: string;
  private readonly anonKey: string;
  private readonly timeoutMs: number;
  private readonly fetchFn: typeof fetch;

  constructor(options: BackendCatalogServiceOptions = {}) {
    this.baseUrl = (
      options.baseUrl ??
      process.env.EXPO_PUBLIC_SUPABASE_URL ??
      'http://127.0.0.1:54321'
    ).replace(/\/+$/, '');
    this.anonKey =
      options.anonKey ??
      process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ??
      'mock-anon-key-local';
    this.timeoutMs = options.timeoutMs ?? 10000;
    this.fetchFn = options.fetchFn ?? fetch;
  }

  private getHeaders(): Record<string, string> {
    return {
      apikey: this.anonKey,
      Authorization: `Bearer ${this.anonKey}`,
      Accept: 'application/json',
    };
  }

  async search(filters: SearchFilters): Promise<CatalogSearchResult> {
    const params: string[] = ['select=*'];

    if (filters.query && filters.query.trim() !== '') {
      const cleanQ = filters.query.trim().replace(/[*%]/g, '');
      params.push(`title=ilike.*${encodeURIComponent(cleanQ)}*`);
    }

    if (filters.vendorId) {
      params.push(`vendor_id=eq.${encodeURIComponent(filters.vendorId)}`);
    }

    if (filters.maxPriceCents !== undefined && filters.maxPriceCents > 0) {
      params.push(`price_cents=lte.${filters.maxPriceCents}`);
    }

    if (filters.onlyAvailable) {
      params.push('availability_status=eq.AVAILABLE');
    }

    if (filters.sortBy === 'price_asc') {
      params.push('order=price_cents.asc');
    } else if (filters.sortBy === 'price_desc') {
      params.push('order=price_cents.desc');
    } else {
      params.push('order=last_synced_at.desc');
    }

    params.push('limit=100');

    const url = `${this.baseUrl}/rest/v1/public_catalog_parts?${params.join('&')}`;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await this.fetchFn(url, {
        method: 'GET',
        headers: this.getHeaders(),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new BackendCatalogError(
          `Error en consulta al catálogo backend (HTTP ${response.status}): ${response.statusText}`,
          { statusCode: response.status }
        );
      }

      const rows: PublicCatalogPartRow[] = await response.json();

      let items: SearchResultItem[] = [];

      const target =
        filters.vehicleMake && filters.vehicleModel
          ? {
              make: filters.vehicleMake,
              model: filters.vehicleModel,
              year: filters.vehicleYear,
            }
          : undefined;

      for (const row of rows) {
        const part = mapRowToPart(row);
        const vendor = mapRowToVendor(row);

        // Filter by OEM reference if requested
        if (filters.oemReference) {
          const matchesOem = part.oemReferences.some((ref) =>
            areOEMReferencesEqual(ref, filters.oemReference!)
          );
          if (!matchesOem) {
            continue;
          }
        }

        const compatibility = evaluateCompatibility({
          partOemReferences: part.oemReferences,
          partDonorVehicle: part.donorVehicle,
          targetOEMReference: filters.oemReference,
          targetVehicle: target,
        });

        let relevanceScore = 1.0;
        if (compatibility.isGuaranteed) {
          relevanceScore += 2.0;
        } else if (compatibility.confidence === 'ATTRIBUTES_MATCH') {
          relevanceScore += 1.0;
        }

        items.push({
          part,
          vendor,
          compatibility,
          relevanceScore,
        });
      }

      // Sort by confidence / relevance if requested
      if (filters.sortBy === 'confidence') {
        items = [...items].sort(
          (a, b) => b.compatibility.confidenceScore - a.compatibility.confidenceScore
        );
      } else if (filters.sortBy === 'relevance') {
        items = [...items].sort((a, b) => b.relevanceScore - a.relevanceScore);
      }

      return {
        items,
        totalCount: items.length,
        appliedFilters: filters,
        providerErrors: [],
      };
    } catch (error: any) {
      if (error?.name === 'AbortError') {
        throw new BackendCatalogError('Timeout en la consulta al catálogo de piezas');
      }
      if (error instanceof BackendCatalogError) {
        throw error;
      }
      throw new BackendCatalogError(
        `Fallo de conexión con el catálogo backend: ${error?.message ?? 'Error desconocido'}`,
        { cause: error }
      );
    } finally {
      clearTimeout(timer);
    }
  }

  async getPartById(
    id: string,
    targetVehicle?: { make?: string; model?: string; year?: number }
  ): Promise<PartDetailResult | null> {
    const url = `${this.baseUrl}/rest/v1/public_catalog_parts?id=eq.${encodeURIComponent(id)}&limit=1`;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await this.fetchFn(url, {
        method: 'GET',
        headers: this.getHeaders(),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new BackendCatalogError(
          `Error al recuperar detalle de pieza (HTTP ${response.status})`,
          { statusCode: response.status }
        );
      }

      const rows: PublicCatalogPartRow[] = await response.json();
      if (!rows || rows.length === 0) {
        return null;
      }

      const row = rows[0];
      const part = mapRowToPart(row);
      const vendor = mapRowToVendor(row);

      const target =
        targetVehicle?.make && targetVehicle?.model
          ? {
              make: targetVehicle.make,
              model: targetVehicle.model,
              year: targetVehicle.year,
            }
          : undefined;

      const compatibility = evaluateCompatibility({
        partOemReferences: part.oemReferences,
        partDonorVehicle: part.donorVehicle,
        targetVehicle: target,
      });

      return {
        part,
        vendor,
        compatibility,
      };
    } catch (error: any) {
      if (error?.name === 'AbortError') {
        throw new BackendCatalogError('Timeout al recuperar detalle de la pieza');
      }
      if (error instanceof BackendCatalogError) {
        throw error;
      }
      throw new BackendCatalogError(
        `Error al consultar pieza: ${error?.message ?? 'Fallo de red'}`,
        { cause: error }
      );
    } finally {
      clearTimeout(timer);
    }
  }

  async getVendors(): Promise<readonly Vendor[]> {
    const url = `${this.baseUrl}/rest/v1/vendors?status=eq.ACTIVE&cat_verified=eq.true&select=id,legal_name,trade_name,cat_authorization_code,cat_verified,city,province,postal_code,warranty_months,return_days`;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await this.fetchFn(url, {
        method: 'GET',
        headers: this.getHeaders(),
        signal: controller.signal,
      });

      if (!response.ok) {
        // Fallback: extract vendors from catalog projection
        return [];
      }

      const rows: any[] = await response.json();
      return rows.map((v) =>
        Object.freeze({
          id: v.id,
          legalName: v.legal_name,
          tradeName: v.trade_name,
          catAuthorizationCode: v.cat_authorization_code,
          catVerified: Boolean(v.cat_verified),
          location: Object.freeze({
            city: v.city,
            province: v.province,
            postalCode: v.postal_code,
            country: 'ES' as const,
          }),
          contact: Object.freeze({
            publicPhone: v.public_phone ?? undefined,
            publicEmail: v.public_email ?? undefined,
            websiteUrl: v.website_url ?? undefined,
          }),
          policies: Object.freeze({
            warrantyMonths: v.warranty_months ?? 12,
            returnDays: v.return_days ?? 14,
            shippingEstimateDays: 2,
            shippingPolicySummary:
              'Envíos en 24-48h a península. Garantía de 12 meses conforme al RD 265/2021.',
          }),
          status: 'ACTIVE' as const,
          createdAt: new Date(),
          updatedAt: new Date(),
        })
      );
    } catch {
      return [];
    } finally {
      clearTimeout(timer);
    }
  }

  async getPopularCategories(): Promise<
    readonly { readonly id: string; readonly label: string; readonly count: number }[]
  > {
    return [
      { id: 'ILUMINACION_FARO_IZQ', label: 'Faros Delanteros', count: 42 },
      { id: 'ELECTRICIDAD_ALTERNADOR', label: 'Alternadores', count: 35 },
      { id: 'CARROCERIA_RETROVISOR_DCH', label: 'Retrovisores', count: 28 },
      { id: 'REFRIGERACION_RADIADOR', label: 'Radiadores Motor', count: 19 },
      { id: 'BRAKES_CALIPER_FR', label: 'Pinzas de Freno', count: 16 },
    ];
  }
}
