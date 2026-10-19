import type { Result } from '../../domain/common/result.js';
import { err } from '../../domain/common/result.js';
import { createAvailability } from '../../domain/entities/availability.js';
import { parseEuroCommaToCents } from '../../domain/entities/money.js';
import { createOEMReference } from '../../domain/entities/oem-reference.js';
import type { Part, PartCondition, PartImage } from '../../domain/entities/part.js';
import type { Vehicle } from '../../domain/entities/vehicle.js';
import { NormalizationError } from '../../validation/errors.js';
import { validateCanonicalPart } from '../../validation/normalizers.js';
import type { EurodesguaceRawPart } from './eurodesguace.types.js';

export const EURODESGUACE_PROVIDER_ID = 'eurodesguace_malaga';

/**
 * Maps raw provider condition string into canonical PartCondition.
 */
function mapPartCondition(rawEstado?: string | null): PartCondition {
  if (!rawEstado) return 'GOOD';
  const upper = rawEstado.toUpperCase();
  if (upper.includes('NUEVO') || upper.includes('EXCELENTE')) return 'EXCELLENT';
  if (upper.includes('BUENO')) return 'GOOD';
  if (upper.includes('REGULAR') || upper.includes('DESGASTE')) return 'FAIR';
  if (upper.includes('DESPIECE') || upper.includes('REPARAR')) return 'FOR_REPAIR';
  return 'GOOD';
}

export function generateDeterministicUUID(input: string): string {
  let hash1 = 0x811c9dc5;
  let hash2 = 0x5a7d2f9b;
  for (let i = 0; i < input.length; i++) {
    const charCode = input.charCodeAt(i);
    hash1 = (hash1 ^ charCode) * 0x01000193;
    hash2 = (hash2 ^ (charCode * (i + 1))) * 0x01000193;
  }
  const h1 = (hash1 >>> 0).toString(16).padStart(8, '0');
  const h2 = (hash2 >>> 0).toString(16).padStart(8, '0');
  const h3 = ((hash1 ^ hash2) >>> 0).toString(16).padStart(8, '0');
  const h4 = ((hash1 + hash2) >>> 0).toString(16).padStart(8, '0');
  const hex = (h1 + h2 + h3 + h4).slice(0, 32);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

/**
 * Normalizes a raw Eurodesguace Málaga part payload into the canonical Part aggregate.
 * Strictly guarantees integer money in cents, handles comma-formatted decimals,
 * preserves visual reference distinction, and maps soft-deletion status.
 */
export function normalizeEurodesguacePart(
  raw: EurodesguaceRawPart,
  vendorId: string
): Result<Part, NormalizationError> {
  const externalPartId = String(raw.refid).trim();
  const canonicalId = generateDeterministicUUID(`${vendorId}:${externalPartId}`);

  // 1. Safe money conversion from comma decimal
  let priceCents: number;
  try {
    priceCents = parseEuroCommaToCents(raw.precio);
  } catch (error) {
    return err(
      new NormalizationError({
        providerId: EURODESGUACE_PROVIDER_ID,
        externalPartId,
        message: `Error al parsear el precio con coma decimal '${raw.precio}': ${(error as Error).message}`,
        issues: [
          {
            path: 'precio',
            message: (error as Error).message,
            code: 'invalid_price_format',
            received: raw.precio,
          },
        ],
      })
    );
  }

  // 2. Safe OEM / Visual Reference normalization
  const oemReferences: ReturnType<typeof createOEMReference>[] = [];
  if (raw.refvisual && raw.refvisual.trim().length >= 3) {
    try {
      oemReferences.push(
        createOEMReference({
          raw: raw.refvisual.trim(),
          isPrimary: true,
          brandName: 'REFERENCIA_VISUAL',
        })
      );
    } catch {
      // If reference fails strict OEM syntax (e.g. invalid symbols), do not crash the part
    }
  }

  if (raw.refcatalogo && raw.refcatalogo.trim().length >= 3) {
    try {
      oemReferences.push(
        createOEMReference({
          raw: raw.refcatalogo.trim(),
          isPrimary: oemReferences.length === 0,
          brandName: 'CATALOGO_PROVEEDOR',
        })
      );
    } catch {
      // Ignore invalid catalog reference
    }
  }

  // 3. Donor Vehicle representation
  const donorVehicle: Vehicle | undefined =
    (raw.marca && raw.marca.trim() !== '') || (raw.modelo && raw.modelo.trim() !== '')
      ? Object.freeze({
          make: raw.marca.trim() || 'DESCONOCIDA',
          model: raw.modelo.trim() || 'DESCONOCIDO',
          yearFrom: raw.anopieza ?? undefined,
          yearTo: raw.anopieza ?? undefined,
          engineCode: raw.motorversion ?? undefined,
        })
      : undefined;

  // 4. Photographic gallery
  const images: PartImage[] = (raw.imgs || [])
    .filter((url) => typeof url === 'string' && url.startsWith('http'))
    .map((url, idx) => ({
      id: `${externalPartId}_img_${idx}`,
      url,
      sortOrder: idx,
      isPrimary: idx === 0,
    }));

  // 5. Availability & Soft Deletion status
  const isDeleted = Boolean(raw.deleted_at);
  const availability = isDeleted
    ? createAvailability({
        status: 'OUT_OF_STOCK',
        stockQuantity: 0,
        lastCheckedAt: raw.deleted_at ? new Date(raw.deleted_at) : new Date(),
        statusReason: 'Baja lógica en catálogo de Eurodesguace',
      })
    : createAvailability({
        status: 'AVAILABLE',
        stockQuantity: 1,
        lastCheckedAt: raw.updated_at ? new Date(raw.updated_at) : new Date(),
      });

  // 6. Title and taxonomy
  const title = raw.articulo.trim() !== ''
    ? raw.articulo.trim()
    : `${raw.familia} ${raw.marca} ${raw.modelo}`.trim() || 'Recambio de Desguace';

  const description = [
    raw.familia ? `Familia: ${raw.familia}` : '',
    raw.marca && raw.modelo ? `Vehículo donante: ${raw.marca} ${raw.modelo}` : '',
    raw.notapublica ? `Observaciones: ${raw.notapublica}` : '',
  ]
    .filter(Boolean)
    .join('. ');

  const canonicalCandidate = {
    id: canonicalId,
    vendorId,
    source: {
      providerId: EURODESGUACE_PROVIDER_ID,
      externalPartId,
      sourceSku: raw.refvisual || externalPartId,
      lastSeenAt: new Date(),
    },
    title,
    description: description || undefined,
    categoryId: raw.familia || 'GENERAL',
    price: {
      amountInCents: priceCents,
      currency: 'EUR' as const,
    },
    condition: mapPartCondition(raw.estado),
    testedStatus: 'NOT_TESTED' as const, // Honest default, not certified live
    availability,
    donorVehicle,
    oemReferences,
    images,
    warrantyMonths: 12, // Legal minimum guarantee for CAT in Spain
    sourceUpdatedAt: raw.updated_at ? new Date(raw.updated_at) : undefined,
    lastSyncedAt: new Date(),
    createdAt: raw.created_at ? new Date(raw.created_at) : new Date(),
    updatedAt: new Date(),
  };

  return validateCanonicalPart(canonicalCandidate, EURODESGUACE_PROVIDER_ID, externalPartId);
}
