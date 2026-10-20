import type { Availability } from './availability.js';
import type { InventorySource } from './inventory-source.js';
import type { Money } from './money.js';
import type { OEMReference } from './oem-reference.js';
import type { Vehicle } from './vehicle.js';

export type PartCondition = 'EXCELLENT' | 'GOOD' | 'FAIR' | 'FOR_REPAIR' | 'UNKNOWN';

export type TestedStatus = 'TESTED_WORKING' | 'NOT_TESTED' | 'TESTED_DEFECTIVE';

export interface PartImage {
  readonly id: string;
  readonly url: string;
  readonly sortOrder: number;
  readonly isPrimary: boolean;
  readonly description?: string;
}

/**
 * Part Entity (Unidad individual de recambio usado en inventario).
 * Represents a single, physical item held at a specific scrap yard.
 *
 * Crucial Domain Invariant:
 * Every Part is an individual physical unit. It is NEVER merged destructively
 * with other parts, even if they share the exact same OEM reference.
 */
export interface Part {
  readonly id: string;
  readonly vendorId: string;
  readonly source: InventorySource;
  readonly title: string;
  readonly description?: string;
  readonly categoryId: string;
  readonly price: Money;
  readonly condition: PartCondition;
  readonly testedStatus: TestedStatus;
  readonly availability: Availability;
  readonly donorVehicle?: Vehicle;
  readonly oemReferences: readonly OEMReference[];
  readonly images: readonly PartImage[];
  readonly warrantyMonths: number;
  readonly sourceUpdatedAt?: Date;
  readonly lastSyncedAt: Date;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

/**
 * Returns primary OEM reference if defined, or first available reference.
 * Prioritizes official OEM references over supplier visual labels.
 */
export function getPrimaryOEMReference(part: Part): OEMReference | undefined {
  const isVisual = (r: OEMReference) =>
    r.referenceType === 'REFERENCIA_VISUAL' || r.brandName === 'REFERENCIA_VISUAL';

  // 1. Primary official OEM reference
  const primaryOfficial = part.oemReferences.find((r) => r.isPrimary && !isVisual(r));
  if (primaryOfficial) return primaryOfficial;

  // 2. Any official OEM reference
  const anyOfficial = part.oemReferences.find((r) => !isVisual(r));
  if (anyOfficial) return anyOfficial;

  // 3. Fallback to primary visual / first available reference
  return part.oemReferences.find((r) => r.isPrimary) ?? part.oemReferences[0];
}

/**
 * Checks whether the part contains at least one verified official OEM reference.
 */
export function hasOfficialOEMReference(part: Part): boolean {
  return part.oemReferences.some(
    (r) => r.referenceType !== 'REFERENCIA_VISUAL' && r.brandName !== 'REFERENCIA_VISUAL'
  );
}

/**
 * Returns primary image for gallery and thumbnail display.
 */
export function getPrimaryImage(part: Part): PartImage | undefined {
  return part.images.find((img) => img.isPrimary) ?? part.images[0];
}
