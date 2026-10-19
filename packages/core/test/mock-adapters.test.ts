import { describe, expect, it } from 'vitest';
import { isErr, isOk } from '../src/domain/common/result.js';
import { isPartBuyable } from '../src/domain/entities/availability.js';
import { MockScrapYardAAdapter, MockScrapYardBAdapter } from '../src/fixtures/mock-adapters.js';
import {
  MOCK_PROVIDER_A_COMPLETE,
  MOCK_PROVIDER_A_INVALID,
  MOCK_PROVIDER_A_MINIMAL,
  MOCK_PROVIDER_A_NO_IMAGES,
  MOCK_PROVIDER_A_OUT_OF_STOCK,
} from '../src/fixtures/provider-a-fixture.js';
import { MOCK_PROVIDER_B_COMPLETE } from '../src/fixtures/provider-b-fixture.js';
import { ProviderApiError } from '../src/validation/errors.js';

describe('ScrapYard Adapters (Mock Provider Implementations)', () => {
  const adapterA = new MockScrapYardAAdapter();
  const adapterB = new MockScrapYardBAdapter();

  describe('MockScrapYardAAdapter', () => {
    it('declares capabilities honestly without assuming real-time availability', () => {
      expect(adapterA.capabilities.hasRealtimeAvailability).toBe(false);
      expect(adapterA.capabilities.hasIncrementalSync).toBe(true);
      expect(adapterA.capabilities.rateLimitPerMinute).toBe(60);
    });

    it('handles paginated catalog fetching', async () => {
      const page1 = await adapterA.fetchCatalog({ page: 1 });
      expect(page1.items.length).toBeGreaterThan(0);
      expect(page1.hasMore).toBe(true);
      expect(page1.nextPage).toBe(2);

      const page2 = await adapterA.fetchCatalog({ page: 2 });
      expect(page2.items.length).toBeGreaterThan(0);
      expect(page2.hasMore).toBe(false);
    });

    it('fetches specific part details and throws 404 ProviderApiError if missing', async () => {
      const part = await adapterA.fetchPartDetails('ALPHA-PART-1001');
      expect(part.id_recambio).toBe('ALPHA-PART-1001');

      await expect(adapterA.fetchPartDetails('UNKNOWN-999')).rejects.toThrow(ProviderApiError);
    });

    it('normalizes complete part payload correctly', () => {
      const result = adapterA.normalizePart(MOCK_PROVIDER_A_COMPLETE, 'vendor_alpha');
      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        const part = result.data;
        expect(part.source.externalPartId).toBe('ALPHA-PART-1001');
        expect(part.title).toBe('Faro Principal Izquierdo Halógeno');
        expect(part.price.amountInCents).toBe(8500); // 85.00 EUR -> 8500 cents
        expect(part.images.length).toBe(3);
        expect(part.donorVehicle?.make).toBe('VOLKSWAGEN');
        expect(part.donorVehicle?.engineCode).toBe('BKC');
        expect(part.oemReferences[0]?.normalized).toBe('1K0941005Q');
        expect(part.condition).toBe('GOOD');
        expect(part.testedStatus).toBe('TESTED_WORKING');
      }
    });

    it('normalizes minimal part with missing optional fields without error', () => {
      const result = adapterA.normalizePart(MOCK_PROVIDER_A_MINIMAL, 'vendor_alpha');
      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        const part = result.data;
        expect(part.donorVehicle).toBeUndefined();
        expect(part.description).toBeUndefined();
        expect(part.images.length).toBe(1);
        expect(part.testedStatus).toBe('NOT_TESTED');
      }
    });

    it('normalizes part with zero images cleanly', () => {
      const result = adapterA.normalizePart(MOCK_PROVIDER_A_NO_IMAGES, 'vendor_alpha');
      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.data.images.length).toBe(0);
      }
    });

    it('normalizes out-of-stock part and reflects unbuyable state', () => {
      const result = adapterA.normalizePart(MOCK_PROVIDER_A_OUT_OF_STOCK, 'vendor_alpha');
      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.data.availability.status).toBe('OUT_OF_STOCK');
        expect(result.data.availability.stockQuantity).toBe(0);
        expect(isPartBuyable(result.data.availability)).toBe(false);
      }
    });

    it('returns structured NormalizationError when given invalid payload', () => {
      const result = adapterA.normalizePart(MOCK_PROVIDER_A_INVALID as any, 'vendor_alpha');
      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error.providerId).toBe('mock_provider_alpha');
      }
    });
  });

  describe('MockScrapYardBAdapter', () => {
    it('supports real-time availability check when declared in capabilities', async () => {
      expect(adapterB.capabilities.hasRealtimeAvailability).toBe(true);

      const availability = await adapterB.checkAvailability('BETA-ITEM-9001');
      expect(availability.status).toBe('AVAILABLE');
      expect(availability.stockQuantity).toBe(1);
    });

    it('normalizes Provider B fixture correctly', () => {
      const result = adapterB.normalizePart(MOCK_PROVIDER_B_COMPLETE, 'vendor_beta');
      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        const part = result.data;
        expect(part.source.externalPartId).toBe('BETA-ITEM-9002');
        expect(part.price.amountInCents).toBe(4500); // 45.00 EUR
        expect(part.condition).toBe('GOOD'); // Grade 'B' -> 'GOOD'
        expect(part.oemReferences[0]?.normalized).toBe('1K0615124E');
      }
    });
  });
});
