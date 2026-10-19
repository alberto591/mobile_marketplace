import { describe, expect, it } from 'vitest';
import { isOk } from '../src/domain/common/result.js';
import { createInventorySourceKey } from '../src/domain/entities/inventory-source.js';
import { aggregatePartsByOEMReference } from '../src/domain/entities/product-identity.js';
import { MockScrapYardAAdapter, MockScrapYardBAdapter } from '../src/fixtures/mock-adapters.js';
import { MOCK_PROVIDER_A_SHARED_OEM } from '../src/fixtures/provider-a-fixture.js';
import { MOCK_PROVIDER_B_SHARED_OEM } from '../src/fixtures/provider-b-fixture.js';

describe('Traceability, Deduplication and Multi-Vendor Offer Preservation', () => {
  const adapterA = new MockScrapYardAAdapter();
  const adapterB = new MockScrapYardBAdapter();

  it('guarantees unique inventory source keys per provider and external ID', () => {
    const key1 = createInventorySourceKey('provider_alpha', 'PART-001');
    const key2 = createInventorySourceKey('provider_alpha', 'PART-002');
    const key3 = createInventorySourceKey('provider_beta', 'PART-001');

    expect(key1).not.toBe(key2);
    expect(key1).not.toBe(key3); // Different provider with same external ID does not collide!
  });

  it('preserves distinct independent offers from different scrapyards sharing the same OEM reference', () => {
    const partAResult = adapterA.normalizePart(MOCK_PROVIDER_A_SHARED_OEM, 'vendor_alpha_cat');
    const partBResult = adapterB.normalizePart(MOCK_PROVIDER_B_SHARED_OEM, 'vendor_beta_cat');

    expect(isOk(partAResult)).toBe(true);
    expect(isOk(partBResult)).toBe(true);

    if (isOk(partAResult) && isOk(partBResult)) {
      const partA = partAResult.data;
      const partB = partBResult.data;

      // Both share normalized OEM reference 1K0121205AD
      expect(partA.oemReferences[0]?.normalized).toBe('1K0121205AD');
      expect(partB.oemReferences[0]?.normalized).toBe('1K0121205AD');

      // CRITICAL ARCHITECTURAL GUARANTEE: They remain distinct independent entities
      expect(partA.id).not.toBe(partB.id);
      expect(partA.vendorId).toBe('vendor_alpha_cat');
      expect(partB.vendorId).toBe('vendor_beta_cat');
      expect(partA.source.providerId).toBe('mock_provider_alpha');
      expect(partB.source.providerId).toBe('mock_provider_beta');
      expect(partA.source.externalPartId).toBe('ALPHA-PART-1003');
      expect(partB.source.externalPartId).toBe('BETA-ITEM-9001');

      // Prices and conditions reflect actual physical units
      expect(partA.price.amountInCents).toBe(6500); // 65.00 EUR
      expect(partB.price.amountInCents).toBe(5500); // 55.00 EUR

      // Aggregate projection groups them cleanly without mutating underlying inventory
      const groups = aggregatePartsByOEMReference([partA, partB]);
      expect(groups.length).toBe(1);

      const group = groups[0]!;
      expect(group.identity.canonicalOemReference).toBe('1K0121205AD');
      expect(group.identity.totalOffers).toBe(2);
      expect(group.identity.availableOffers).toBe(2);
      expect(group.identity.distinctVendorsCount).toBe(2);
      expect(group.identity.priceRange.minPrice.amountInCents).toBe(5500);
      expect(group.identity.priceRange.maxPrice.amountInCents).toBe(6500);

      // Both individual offers are present in the projection
      expect(group.offers.length).toBe(2);
    }
  });

  it('detects and flags duplicate items within the same provider origin', () => {
    const seenKeys = new Set<string>();

    const item1 = { providerId: 'provider_alpha', externalId: 'ALPHA-1001' };
    const item2 = { providerId: 'provider_alpha', externalId: 'ALPHA-1001' }; // Duplicate!

    const key1 = createInventorySourceKey(item1.providerId, item1.externalId);
    expect(seenKeys.has(key1)).toBe(false);
    seenKeys.add(key1);

    const key2 = createInventorySourceKey(item2.providerId, item2.externalId);
    expect(seenKeys.has(key2)).toBe(true); // Successfully detected duplicate
  });
});
