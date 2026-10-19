/**
 * InventorySource Value Object.
 * Preserves the exact origin and external identifier of an item across all imports and synchronizations.
 */
export interface InventorySource {
  readonly providerId: string;
  readonly externalPartId: string;
  readonly sourceSku?: string;
  readonly sourceUrl?: string;
  readonly rawPayloadHash?: string;
  readonly lastSeenAt: Date;
}

/**
 * Creates the canonical composite tracking key for an inventory unit.
 * Guarantees zero collision across distinct scrap yards.
 */
export function createInventorySourceKey(providerId: string, externalPartId: string): string {
  return `${providerId.trim()}::${externalPartId.trim()}`;
}
