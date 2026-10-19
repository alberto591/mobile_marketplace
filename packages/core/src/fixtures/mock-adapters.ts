import { randomUUID } from 'node:crypto';
import type { Result } from '../domain/common/result.js';
import { err } from '../domain/common/result.js';
import { createAvailability } from '../domain/entities/availability.js';
import { createMoney, createMoneyFromDecimal } from '../domain/entities/money.js';
import { createOEMReference } from '../domain/entities/oem-reference.js';
import type { Part, PartCondition, PartImage } from '../domain/entities/part.js';
import type { Vehicle } from '../domain/entities/vehicle.js';
import type {
  CatalogPageResult,
  CatalogQueryOptions,
  ProviderCapabilities,
  ScrapYardAdapter,
} from '../ports/scrapyard-adapter.port.js';
import { NormalizationError, ProviderApiError } from '../validation/errors.js';
import { validateCanonicalPart } from '../validation/normalizers.js';
import type { RawProviderAPart } from './provider-a-fixture.js';
import {
  MOCK_PROVIDER_A_PAGE_1,
  MOCK_PROVIDER_A_PAGE_2,
} from './provider-a-fixture.js';
import type { RawProviderBPart } from './provider-b-fixture.js';
import { MOCK_PROVIDER_B_PAGE_1 } from './provider-b-fixture.js';

/**
 * Adapter implementation for Mock Provider A (Desguace Alpha).
 */
export class MockScrapYardAAdapter implements ScrapYardAdapter<RawProviderAPart> {
  readonly providerId = 'mock_provider_alpha';

  readonly capabilities: ProviderCapabilities = Object.freeze({
    hasRealtimeAvailability: false, // Does NOT support live availability
    hasIncrementalSync: true,
    hasOrderReservation: false,
    hasVehicleDonorDetails: true,
    supportsDirectImages: true,
    rateLimitPerMinute: 60,
  });

  async fetchCatalog(options: CatalogQueryOptions): Promise<CatalogPageResult<RawProviderAPart>> {
    const page = options.page ?? 1;
    if (page === 1) {
      return {
        items: MOCK_PROVIDER_A_PAGE_1,
        totalItems: MOCK_PROVIDER_A_PAGE_1.length + MOCK_PROVIDER_A_PAGE_2.length,
        hasMore: true,
        nextPage: 2,
        rateLimitRemaining: 59,
      };
    }
    if (page === 2) {
      return {
        items: MOCK_PROVIDER_A_PAGE_2,
        totalItems: MOCK_PROVIDER_A_PAGE_1.length + MOCK_PROVIDER_A_PAGE_2.length,
        hasMore: false,
        rateLimitRemaining: 58,
      };
    }
    return {
      items: [],
      hasMore: false,
      rateLimitRemaining: 57,
    };
  }

  async fetchPartDetails(externalId: string): Promise<RawProviderAPart> {
    const all = [...MOCK_PROVIDER_A_PAGE_1, ...MOCK_PROVIDER_A_PAGE_2];
    const found = all.find((p) => p.id_recambio === externalId);
    if (!found) {
      throw new ProviderApiError({
        providerId: this.providerId,
        message: `Part not found in provider catalog: ${externalId}`,
        statusCode: 404,
      });
    }
    return found;
  }

  normalizePart(raw: RawProviderAPart, vendorId: string): Result<Part, NormalizationError> {
    if (!raw.id_recambio || raw.id_recambio.trim().length === 0) {
      return err(
        new NormalizationError({
          providerId: this.providerId,
          externalPartId: 'UNKNOWN',
          message: 'Missing or empty id_recambio',
        })
      );
    }

    try {
      // Map Condition
      const conditionMap: Record<RawProviderAPart['estado_calidad'], PartCondition> = {
        EXCELENTE: 'EXCELLENT',
        BUENO: 'GOOD',
        REGULAR: 'FAIR',
        DESPIECE: 'FOR_REPAIR',
      };
      const condition = conditionMap[raw.estado_calidad] ?? 'UNKNOWN';

      // Map OEM references
      const oemReferences = [];
      if (raw.ref_oem_principal) {
        oemReferences.push(
          createOEMReference({
            raw: raw.ref_oem_principal,
            isPrimary: true,
          })
        );
      }
      if (raw.refs_equivalentes) {
        for (const eq of raw.refs_equivalentes) {
          if (eq !== raw.ref_oem_principal) {
            oemReferences.push(
              createOEMReference({
                raw: eq,
                isPrimary: false,
              })
            );
          }
        }
      }

      // Map Donor Vehicle
      let donorVehicle: Vehicle | undefined;
      if (raw.vehiculo_donante) {
        donorVehicle = {
          make: raw.vehiculo_donante.marca,
          model: raw.vehiculo_donante.modelo,
          generation: raw.vehiculo_donante.version,
          yearFrom: raw.vehiculo_donante.anio,
          yearTo: raw.vehiculo_donante.anio,
          engineCode: raw.vehiculo_donante.codigo_motor,
          fuel: raw.vehiculo_donante.combustible === 'DIESEL' ? 'DIESEL' : 'OTHER',
          donorVinMasked: raw.vehiculo_donante.bastidor_anonimizado,
        };
      }

      // Map Images
      const images: PartImage[] = (raw.fotos_urls ?? []).map((url, idx) => ({
        id: `img_${raw.id_recambio}_${idx}`,
        url,
        sortOrder: idx,
        isPrimary: idx === 0,
      }));

      // Candidate unvalidated object
      const candidate = {
        id: randomUUID(),
        vendorId,
        source: {
          providerId: this.providerId,
          externalPartId: raw.id_recambio,
          lastSeenAt: new Date(),
        },
        title: raw.denominacion,
        description: raw.descripcion_adicional,
        categoryId: raw.categoria_codigo,
        price: createMoneyFromDecimal(raw.precio_neto, 'EUR'),
        condition,
        testedStatus: raw.comprobado ? 'TESTED_WORKING' : 'NOT_TESTED',
        availability: createAvailability({
          status: raw.disponible ? 'AVAILABLE' : 'OUT_OF_STOCK',
          stockQuantity: raw.cantidad,
          lastCheckedAt: new Date(),
        }),
        donorVehicle,
        oemReferences,
        images,
        warrantyMonths: raw.meses_garantia ?? 12,
        sourceUpdatedAt: raw.fecha_modificacion ? new Date(raw.fecha_modificacion) : undefined,
        lastSyncedAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      return validateCanonicalPart(candidate, this.providerId, raw.id_recambio);
    } catch (e) {
      return err(
        new NormalizationError({
          providerId: this.providerId,
          externalPartId: raw.id_recambio,
          message: e instanceof Error ? e.message : 'Unknown normalization failure',
        })
      );
    }
  }
}

/**
 * Adapter implementation for Mock Provider B (Desguace Beta).
 */
export class MockScrapYardBAdapter implements ScrapYardAdapter<RawProviderBPart> {
  readonly providerId = 'mock_provider_beta';

  readonly capabilities: ProviderCapabilities = Object.freeze({
    hasRealtimeAvailability: true, // DOES support live availability check!
    hasIncrementalSync: false,
    hasOrderReservation: false,
    hasVehicleDonorDetails: true,
    supportsDirectImages: true,
  });

  async fetchCatalog(_options: CatalogQueryOptions): Promise<CatalogPageResult<RawProviderBPart>> {
    return {
      items: MOCK_PROVIDER_B_PAGE_1,
      totalItems: MOCK_PROVIDER_B_PAGE_1.length,
      hasMore: false,
    };
  }

  async fetchPartDetails(externalId: string): Promise<RawProviderBPart> {
    const found = MOCK_PROVIDER_B_PAGE_1.find((p) => p.item_code === externalId);
    if (!found) {
      throw new ProviderApiError({
        providerId: this.providerId,
        message: `Item not found: ${externalId}`,
        statusCode: 404,
      });
    }
    return found;
  }

  async checkAvailability(externalId: string) {
    const item = await this.fetchPartDetails(externalId);
    return createAvailability({
      status: item.stock_level > 0 ? 'AVAILABLE' : 'OUT_OF_STOCK',
      stockQuantity: item.stock_level,
      lastCheckedAt: new Date(),
    });
  }

  normalizePart(raw: RawProviderBPart, vendorId: string): Result<Part, NormalizationError> {
    if (!raw.item_code || raw.item_code.trim().length === 0) {
      return err(
        new NormalizationError({
          providerId: this.providerId,
          externalPartId: 'UNKNOWN',
          message: 'Missing item_code',
        })
      );
    }

    try {
      const conditionMap: Record<RawProviderBPart['grade'], PartCondition> = {
        A: 'EXCELLENT',
        B: 'GOOD',
        C: 'FAIR',
        REBUILD: 'FOR_REPAIR',
      };
      const condition = conditionMap[raw.grade] ?? 'UNKNOWN';

      const oemReferences = [];
      if (raw.oe_code) {
        oemReferences.push(
          createOEMReference({
            raw: raw.oe_code,
            isPrimary: true,
          })
        );
      }
      if (raw.extra_oe) {
        for (const extra of raw.extra_oe) {
          if (extra !== raw.oe_code) {
            oemReferences.push(
              createOEMReference({
                raw: extra,
                isPrimary: false,
              })
            );
          }
        }
      }

      let donorVehicle: Vehicle | undefined;
      if (raw.donor_vehicle) {
        donorVehicle = {
          make: raw.donor_vehicle.make,
          model: raw.donor_vehicle.model,
          yearFrom: raw.donor_vehicle.year,
          yearTo: raw.donor_vehicle.year,
          engineCode: raw.donor_vehicle.motor_code,
          fuel: raw.donor_vehicle.fuel_type === 'DIESEL' ? 'DIESEL' : 'OTHER',
        };
      }

      const images: PartImage[] = (raw.images ?? []).map((url, idx) => ({
        id: `img_${raw.item_code}_${idx}`,
        url,
        sortOrder: idx,
        isPrimary: idx === 0,
      }));

      const candidate = {
        id: randomUUID(),
        vendorId,
        source: {
          providerId: this.providerId,
          externalPartId: raw.item_code,
          lastSeenAt: new Date(),
        },
        title: raw.title,
        categoryId: raw.part_type,
        price: createMoney(raw.amount_cents, 'EUR'),
        condition,
        testedStatus: raw.is_tested ? 'TESTED_WORKING' : 'NOT_TESTED',
        availability: createAvailability({
          status: raw.stock_level > 0 ? 'AVAILABLE' : 'OUT_OF_STOCK',
          stockQuantity: raw.stock_level,
          lastCheckedAt: new Date(),
        }),
        donorVehicle,
        oemReferences,
        images,
        warrantyMonths: Math.floor((raw.warranty_days ?? 365) / 30),
        sourceUpdatedAt: raw.updated_timestamp ? new Date(raw.updated_timestamp) : undefined,
        lastSyncedAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      return validateCanonicalPart(candidate, this.providerId, raw.item_code);
    } catch (e) {
      return err(
        new NormalizationError({
          providerId: this.providerId,
          externalPartId: raw.item_code,
          message: e instanceof Error ? e.message : 'Unknown normalization failure',
        })
      );
    }
  }
}
