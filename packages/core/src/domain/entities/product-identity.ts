import type { Money } from './money.js';
import { createMoney } from './money.js';
import type { Part } from './part.js';

/**
 * ProductIdentity (Proyección agregada de catálogo).
 *
 * Architectural Decision (ADR 002):
 * In a used auto parts marketplace, every part in stock is a unique physical unit
 * with specific wear, exact photos, specific donor mileage, and distinct seller guarantees.
 *
 * Therefore:
 * 1. ProductIdentity is NOT a replacement for Part.
 * 2. It is a read-model projection used for grouped search results, comparison pages,
 *    and category navigation.
 * 3. Individual offers MUST NEVER be collapsed or merged into a single inventory record.
 */
export interface ProductIdentity {
  readonly canonicalOemReference: string;
  readonly categoryId: string;
  readonly title: string;
  readonly vehicleSummary?: string;
  readonly totalOffers: number;
  readonly availableOffers: number;
  readonly priceRange: {
    readonly minPrice: Money;
    readonly maxPrice: Money;
  };
  readonly distinctVendorsCount: number;
}

export interface ProductIdentityGroup {
  readonly identity: ProductIdentity;
  readonly offers: readonly Part[];
}

/**
 * Aggregates a collection of independent Part offers into a grouped ProductIdentity projection.
 * Does not mutate the parts; preserves every part's vendor, price, and traceability.
 */
export function aggregatePartsByOEMReference(parts: readonly Part[]): readonly ProductIdentityGroup[] {
  const groupsByOEM = new Map<string, Part[]>();

  for (const part of parts) {
    for (const oem of part.oemReferences) {
      const key = oem.normalized;
      const existing = groupsByOEM.get(key);
      if (existing) {
        // Prevent adding the same part twice if it has multiple aliases
        if (!existing.some((p) => p.id === part.id)) {
          existing.push(part);
        }
      } else {
        groupsByOEM.set(key, [part]);
      }
    }
  }

  const results: ProductIdentityGroup[] = [];

  for (const [canonicalOem, groupParts] of groupsByOEM.entries()) {
    if (groupParts.length === 0) continue;

    const firstPart = groupParts[0]!;
    let minCents = firstPart.price.amountInCents;
    let maxCents = firstPart.price.amountInCents;
    let availableCount = 0;
    const vendorIds = new Set<string>();

    for (const part of groupParts) {
      vendorIds.add(part.vendorId);
      if (part.availability.status === 'AVAILABLE') {
        availableCount += 1;
      }
      if (part.price.amountInCents < minCents) {
        minCents = part.price.amountInCents;
      }
      if (part.price.amountInCents > maxCents) {
        maxCents = part.price.amountInCents;
      }
    }

    const donor = firstPart.donorVehicle;
    const vehicleSummary = donor ? `${donor.make} ${donor.model}` : undefined;

    const identity: ProductIdentity = Object.freeze({
      canonicalOemReference: canonicalOem,
      categoryId: firstPart.categoryId,
      title: firstPart.title,
      vehicleSummary,
      totalOffers: groupParts.length,
      availableOffers: availableCount,
      priceRange: {
        minPrice: createMoney(minCents, firstPart.price.currency),
        maxPrice: createMoney(maxCents, firstPart.price.currency),
      },
      distinctVendorsCount: vendorIds.size,
    });

    results.push(
      Object.freeze({
        identity,
        offers: Object.freeze([...groupParts]),
      })
    );
  }

  return Object.freeze(results);
}
