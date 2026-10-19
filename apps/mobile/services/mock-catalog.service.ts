import type {
  CatalogQueryOptions,
  Part,
  Vendor,
} from '@mobile-marketplace/core';
import {
  areOEMReferencesEqual,
  compareMoney,
  evaluateCompatibility,
  EURODESGUACE_REAL_SAMPLE_PARTS,
  isOk,
  MockScrapYardAAdapter,
  MockScrapYardBAdapter,
  normalizeEurodesguacePart,
  normalizeOEMReference,
} from '@mobile-marketplace/core';
import type {
  CatalogSearchResult,
  ICatalogService,
  PartDetailResult,
  SearchFilters,
  SearchResultItem,
} from './catalog-service.interface';

export class MockCatalogService implements ICatalogService {
  private readonly adapterA: MockScrapYardAAdapter;
  private readonly adapterB: MockScrapYardBAdapter;
  private readonly vendors: Map<string, Vendor>;

  constructor() {
    this.adapterA = new MockScrapYardAAdapter();
    this.adapterB = new MockScrapYardBAdapter();

    this.vendors = new Map<string, Vendor>([
      [
        'vendor_alpha',
        Object.freeze({
          id: 'vendor_alpha',
          legalName: 'Desguaces Madrid Norte S.L.',
          tradeName: 'Desguace Alpha Madrid',
          catAuthorizationCode: 'CAT/MD/1042',
          catVerified: true,
          location: {
            city: 'San Sebastián de los Reyes',
            province: 'Madrid',
            postalCode: '28703',
            country: 'ES' as const,
            addressLine: 'Polígono Industrial Norte, Parcela 14',
          },
          contact: {
            publicPhone: '+34 916 550 011',
            publicEmail: 'recambios@desguacesalphamadrid.test',
          },
          policies: {
            warrantyMonths: 12,
            returnDays: 14,
            shippingEstimateDays: 2,
            shippingPolicySummary: 'Envíos en 24-48h a península. Garantía de 1 año conforme a ley.',
          },
          status: 'ACTIVE',
          averageRating: 4.8,
          totalReviews: 240,
          createdAt: new Date('2025-01-10'),
          updatedAt: new Date('2026-10-01'),
        }),
      ],
      [
        'vendor_beta',
        Object.freeze({
          id: 'vendor_beta',
          legalName: 'Autodesguaces Levante S.A.',
          tradeName: 'Desguaces Beta Valencia',
          catAuthorizationCode: 'CAT/V/3091',
          catVerified: true,
          location: {
            city: 'Paterna',
            province: 'Valencia',
            postalCode: '46980',
            country: 'ES' as const,
            addressLine: 'Avenida de los Recambios, 28',
          },
          contact: {
            publicPhone: '+34 961 330 022',
            publicEmail: 'info@desguacesbetalevente.test',
          },
          policies: {
            warrantyMonths: 12,
            returnDays: 14,
            shippingEstimateDays: 3,
            shippingPolicySummary: 'Envíos rápidos a toda España peninsular e Islas Baleares.',
          },
          status: 'ACTIVE',
          averageRating: 4.6,
          totalReviews: 185,
          createdAt: new Date('2025-03-15'),
          updatedAt: new Date('2026-10-01'),
        }),
      ],
      [
        'vendor_eurodesguace',
        Object.freeze({
          id: 'vendor_eurodesguace',
          legalName: 'Eurodesguace Málaga S.L.',
          tradeName: 'Eurodesguace Málaga',
          catAuthorizationCode: 'CAT/AND/MA/0412',
          catVerified: true,
          location: {
            city: 'Málaga',
            province: 'Málaga',
            postalCode: '29004',
            country: 'ES' as const,
            addressLine: 'Polígono Industrial Guadalhorce, Calle Esteban Salazar Chapela',
          },
          contact: {
            publicPhone: '+34 952 000 000',
            publicEmail: 'info@eurodesguacemalaga.com',
            websiteUrl: 'https://eurodesguacemalaga.com',
          },
          policies: {
            warrantyMonths: 12,
            returnDays: 14,
            shippingEstimateDays: 2,
            shippingPolicySummary: 'Envíos en 24-48h a península. Garantía legal de 12 meses conforme al RD 265/2021. Catálogo actualizado diariamente.',
          },
          status: 'ACTIVE',
          averageRating: 4.7,
          totalReviews: 185,
          createdAt: new Date('2025-06-01'),
          updatedAt: new Date('2026-10-19'),
        }),
      ],
    ]);
  }

  async getVendors(): Promise<readonly Vendor[]> {
    return Array.from(this.vendors.values());
  }

  async getPopularCategories(): Promise<readonly { readonly id: string; readonly label: string; readonly count: number }[]> {
    return [
      { id: 'ILUMINACION_FARO_IZQ', label: 'Faros Delanteros', count: 42 },
      { id: 'ELECTRICIDAD_ALTERNADOR', label: 'Alternadores', count: 35 },
      { id: 'CARROCERIA_RETROVISOR_DCH', label: 'Retrovisores', count: 28 },
      { id: 'REFRIGERACION_RADIADOR', label: 'Radiadores Motor', count: 19 },
      { id: 'BRAKES_CALIPER_FR', label: 'Pinzas de Freno', count: 16 },
    ];
  }

  private cachedParts: Part[] | null = null;
  private cachedErrors: { providerId: string; message: string }[] = [];

  /**
   * Internal ingestion helper: gathers all raw parts from both adapters,
   * normalizes them into canonical Part entities, and collects any provider errors.
   * Caches results in memory for stable IDs and query performance.
   */
  private async loadAllParts(): Promise<{
    parts: Part[];
    errors: { providerId: string; message: string }[];
  }> {
    if (this.cachedParts) {
      return { parts: this.cachedParts, errors: this.cachedErrors };
    }

    const parts: Part[] = [];
    const errors: { providerId: string; message: string }[] = [];

    // 1. Ingest Provider A (Desguace Alpha)
    try {
      const page1 = await this.adapterA.fetchCatalog({ page: 1 });
      const page2 = await this.adapterA.fetchCatalog({ page: 2 });
      const allRawA = [...page1.items, ...page2.items];

      for (const raw of allRawA) {
        const normResult = this.adapterA.normalizePart(raw, 'vendor_alpha');
        if (normResult.success) {
          parts.push(normResult.data);
        } else {
          errors.push({
            providerId: this.adapterA.providerId,
            message: normResult.error.message,
          });
        }
      }
    } catch (e) {
      errors.push({
        providerId: this.adapterA.providerId,
        message: e instanceof Error ? e.message : 'Error al consultar Desguace Alpha',
      });
    }

    // 2. Ingest Provider B (Desguace Beta)
    try {
      const pageB = await this.adapterB.fetchCatalog({});
      for (const raw of pageB.items) {
        const normResult = this.adapterB.normalizePart(raw, 'vendor_beta');
        if (normResult.success) {
          parts.push(normResult.data);
        } else {
          errors.push({
            providerId: this.adapterB.providerId,
            message: normResult.error.message,
          });
        }
      }
    } catch (e) {
      errors.push({
        providerId: this.adapterB.providerId,
        message: e instanceof Error ? e.message : 'Error al consultar Desguace Beta',
      });
    }

    // 3. Ingest Real Provider (Eurodesguace Málaga) from verified real catalog fixtures
    try {
      for (const raw of EURODESGUACE_REAL_SAMPLE_PARTS) {
        const normResult = normalizeEurodesguacePart(raw, 'vendor_eurodesguace');
        if (normResult.success) {
          parts.push(normResult.data);
        } else {
          errors.push({
            providerId: 'eurodesguace_malaga',
            message: normResult.error.message,
          });
        }
      }
    } catch (e) {
      errors.push({
        providerId: 'eurodesguace_malaga',
        message: e instanceof Error ? e.message : 'Error al procesar recambios de Eurodesguace Málaga',
      });
    }

    this.cachedParts = parts;
    this.cachedErrors = errors;
    return { parts, errors };
  }

  async search(filters: SearchFilters): Promise<CatalogSearchResult> {
    const { parts, errors } = await this.loadAllParts();

    const normalizedQuery = filters.query?.trim().toLowerCase();
    const targetOEM = filters.oemReference?.trim();
    const targetMake = filters.vehicleMake?.trim();
    const targetModel = filters.vehicleModel?.trim();
    const targetYear = filters.vehicleYear;

    const targetVehicle =
      targetMake && targetModel
        ? {
            make: targetMake,
            model: targetModel,
            year: targetYear,
          }
        : undefined;

    const matchedItems: SearchResultItem[] = [];

    for (const part of parts) {
      // 1. Vendor Filter
      if (filters.vendorId && part.vendorId !== filters.vendorId) {
        continue;
      }

      // 2. Availability Filter
      if (filters.onlyAvailable && part.availability.status !== 'AVAILABLE') {
        continue;
      }

      // 3. Price Filter
      if (filters.maxPriceCents !== undefined && part.price.amountInCents > filters.maxPriceCents) {
        continue;
      }

      // 4. Text Query Filter
      if (normalizedQuery) {
        const titleMatch = part.title.toLowerCase().includes(normalizedQuery);
        const descMatch = part.description?.toLowerCase().includes(normalizedQuery);
        const catMatch = part.categoryId.toLowerCase().includes(normalizedQuery);
        const oemMatch = part.oemReferences.some((r) =>
          r.raw.toLowerCase().includes(normalizedQuery) ||
          r.normalized.toLowerCase().includes(normalizedQuery)
        );
        const vehicleMatch = part.donorVehicle
          ? `${part.donorVehicle.make} ${part.donorVehicle.model}`.toLowerCase().includes(normalizedQuery)
          : false;

        if (!titleMatch && !descMatch && !catMatch && !oemMatch && !vehicleMatch) {
          continue;
        }
      }

      // 5. Explicit OEM Reference Filter
      if (targetOEM) {
        let hasMatchingOEM = false;
        try {
          hasMatchingOEM = part.oemReferences.some((r) => areOEMReferencesEqual(r, targetOEM));
        } catch {
          // If query string is too short to be normalized, check raw substring
          const clean = targetOEM.toUpperCase().replace(/[\s\-_.]/g, '');
          hasMatchingOEM = part.oemReferences.some((r) => r.normalized.includes(clean));
        }

        // If user specifically filtered by OEM and this part doesn't have it, discard
        if (!hasMatchingOEM) {
          continue;
        }
      }

      // 6. Explicit Vehicle Filter
      if (targetMake && part.donorVehicle) {
        if (part.donorVehicle.make.trim().toUpperCase() !== targetMake.trim().toUpperCase()) {
          // If user specified brand and donor vehicle doesn't match, discard unless exact OEM match was explicitly queried
          if (!targetOEM) {
            continue;
          }
        }
      }

      // 7. Evaluate honest compatibility
      const compatibility = evaluateCompatibility({
        partOemReferences: part.oemReferences,
        partDonorVehicle: part.donorVehicle,
        targetOEMReference: targetOEM,
        targetVehicle,
      });

      // Calculate relevance score
      let relevance = compatibility.confidenceScore * 100;
      if (normalizedQuery && part.title.toLowerCase().includes(normalizedQuery)) {
        relevance += 20;
      }
      if (part.availability.status === 'AVAILABLE') {
        relevance += 10;
      }

      const vendor = this.vendors.get(part.vendorId) ?? {
        id: part.vendorId,
        legalName: 'Desguace Colaborador',
        tradeName: 'Desguace Colaborador',
        catAuthorizationCode: 'CAT/ES/0000',
        catVerified: true,
        location: { city: 'España', province: 'España', postalCode: '28000', country: 'ES' as const },
        contact: {},
        policies: { warrantyMonths: 12, returnDays: 14 },
        status: 'ACTIVE' as const,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      matchedItems.push({
        part,
        vendor,
        compatibility,
        relevanceScore: Math.round(relevance),
      });
    }

    // Sort Results
    const sortBy = filters.sortBy ?? 'relevance';
    matchedItems.sort((a, b) => {
      if (sortBy === 'price_asc') {
        return compareMoney(a.part.price, b.part.price);
      }
      if (sortBy === 'price_desc') {
        return compareMoney(b.part.price, a.part.price);
      }
      if (sortBy === 'confidence') {
        return b.compatibility.confidenceScore - a.compatibility.confidenceScore;
      }
      // Default: relevance
      return b.relevanceScore - a.relevanceScore;
    });

    return {
      items: Object.freeze(matchedItems),
      totalCount: matchedItems.length,
      appliedFilters: filters,
      providerErrors: Object.freeze(errors),
    };
  }

  async getPartById(
    id: string,
    targetVehicle?: { make?: string; model?: string; year?: number }
  ): Promise<PartDetailResult | null> {
    const { parts } = await this.loadAllParts();
    const found = parts.find((p) => p.id === id || p.source.externalPartId === id);
    if (!found) {
      return null;
    }

    const vendor = this.vendors.get(found.vendorId) ?? {
      id: found.vendorId,
      legalName: 'Desguace Colaborador',
      tradeName: 'Desguace Colaborador',
      catAuthorizationCode: 'CAT/ES/0000',
      catVerified: true,
      location: { city: 'España', province: 'España', postalCode: '28000', country: 'ES' as const },
      contact: {},
      policies: { warrantyMonths: 12, returnDays: 14 },
      status: 'ACTIVE' as const,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const target =
      targetVehicle?.make && targetVehicle?.model
        ? {
            make: targetVehicle.make,
            model: targetVehicle.model,
            year: targetVehicle.year,
          }
        : undefined;

    const compatibility = evaluateCompatibility({
      partOemReferences: found.oemReferences,
      partDonorVehicle: found.donorVehicle,
      targetVehicle: target,
    });

    return {
      part: found,
      vendor,
      compatibility,
    };
  }
}

// Export singleton instance for app usage
export const catalogService: ICatalogService = new MockCatalogService();
