import { describe, expect, it } from 'vitest';
import { MockCatalogService } from '../services/mock-catalog.service';

describe('Mobile App - Catalog Service & Multi-Provider Ingestion', () => {
  const service = new MockCatalogService();

  it('combines catalog items from both scrapyard providers', async () => {
    const result = await service.search({});
    expect(result.items.length).toBeGreaterThanOrEqual(5);

    const vendorIds = new Set(result.items.map((i) => i.part.vendorId));
    expect(vendorIds.has('vendor_alpha')).toBe(true);
    expect(vendorIds.has('vendor_beta')).toBe(true);
  });

  it('preserves distinct offers from different scrapyards sharing the same OEM reference', async () => {
    const result = await service.search({
      oemReference: '1K0121205AD',
    });

    // Both Desguace Alpha and Desguace Beta offer this radiator
    expect(result.items.length).toBe(2);

    const alphaOffer = result.items.find((i) => i.part.vendorId === 'vendor_alpha');
    const betaOffer = result.items.find((i) => i.part.vendorId === 'vendor_beta');

    expect(alphaOffer).toBeDefined();
    expect(betaOffer).toBeDefined();

    // Prices and physical sources remain distinct
    expect(alphaOffer?.part.price.amountInCents).toBe(6500); // 65.00 EUR
    expect(betaOffer?.part.price.amountInCents).toBe(5500); // 55.00 EUR
    expect(alphaOffer?.vendor.location.city).toBe('San Sebastián de los Reyes');
    expect(betaOffer?.vendor.location.city).toBe('Paterna');
  });

  it('filters results by search query text', async () => {
    const result = await service.search({ query: 'faro' });
    expect(result.items.length).toBeGreaterThanOrEqual(1);
    for (const item of result.items) {
      const match =
        item.part.title.toLowerCase().includes('faro') ||
        item.part.categoryId.toLowerCase().includes('faro');
      expect(match).toBe(true);
    }
  });

  it('filters results by specific vendor', async () => {
    const alphaOnly = await service.search({ vendorId: 'vendor_alpha' });
    for (const item of alphaOnly.items) {
      expect(item.part.vendorId).toBe('vendor_alpha');
    }

    const betaOnly = await service.search({ vendorId: 'vendor_beta' });
    for (const item of betaOnly.items) {
      expect(item.part.vendorId).toBe('vendor_beta');
    }
  });

  it('filters by availability to exclude out-of-stock items', async () => {
    const all = await service.search({});
    const hasOutOfStock = all.items.some((i) => i.part.availability.status === 'OUT_OF_STOCK');
    expect(hasOutOfStock).toBe(true);

    const availableOnly = await service.search({ onlyAvailable: true });
    const containsOutOfStock = availableOnly.items.some(
      (i) => i.part.availability.status === 'OUT_OF_STOCK'
    );
    expect(containsOutOfStock).toBe(false);
  });

  it('sorts results deterministically by price ascending and descending', async () => {
    const asc = await service.search({ sortBy: 'price_asc' });
    for (let i = 0; i < asc.items.length - 1; i++) {
      expect(asc.items[i]!.part.price.amountInCents).toBeLessThanOrEqual(
        asc.items[i + 1]!.part.price.amountInCents
      );
    }

    const desc = await service.search({ sortBy: 'price_desc' });
    for (let i = 0; i < desc.items.length - 1; i++) {
      expect(desc.items[i]!.part.price.amountInCents).toBeGreaterThanOrEqual(
        desc.items[i + 1]!.part.price.amountInCents
      );
    }
  });

  it('retrieves individual part details by ID', async () => {
    const search = await service.search({});
    const firstItem = search.items[0]!;

    const detail = await service.getPartById(firstItem.part.id);
    expect(detail).not.toBeNull();
    expect(detail?.part.id).toBe(firstItem.part.id);
    expect(detail?.vendor.id).toBe(firstItem.part.vendorId);
    expect(detail?.compatibility).toBeDefined();
  });

  it('returns null when retrieving non-existent part ID', async () => {
    const detail = await service.getPartById('non-existent-uuid-1234');
    expect(detail).toBeNull();
  });

  it('handles parts with zero photos and missing donor vehicles without crashing', async () => {
    const result = await service.search({ query: 'Elevalunas' });
    expect(result.items.length).toBe(1);

    const noPhotoPart = result.items[0]!;
    expect(noPhotoPart.part.images.length).toBe(0);
    expect(noPhotoPart.part.source.externalPartId).toBe('ALPHA-PART-1005');
  });

  it('returns empty result when no parts match query criteria', async () => {
    const result = await service.search({ query: 'coche-volador-espacial-xyz' });
    expect(result.totalCount).toBe(0);
    expect(result.items.length).toBe(0);
  });

  it('retrieves Eurodesguace Málaga as an authorized CAT vendor and allows filtering by it', async () => {
    const vendors = await service.getVendors();
    const euroVendor = vendors.find((v) => v.id === 'vendor_eurodesguace');
    expect(euroVendor).toBeDefined();
    expect(euroVendor?.tradeName).toBe('Eurodesguace Málaga');
    expect(euroVendor?.catAuthorizationCode).toBe('CAT/AND/MA/0412');
    expect(euroVendor?.catVerified).toBe(true);

    const euroResults = await service.search({ vendorId: 'vendor_eurodesguace' });
    expect(euroResults.items.length).toBeGreaterThanOrEqual(5);
    for (const item of euroResults.items) {
      expect(item.part.vendorId).toBe('vendor_eurodesguace');
      expect(item.vendor.tradeName).toBe('Eurodesguace Málaga');
      expect(item.part.price.amountInCents).toBeGreaterThan(0);
      expect(item.part.price.currency).toBe('EUR');
    }
  });

  it('preserves visual references and donor vehicle from real Eurodesguace parts', async () => {
    const result = await service.search({ query: 'MANDO CALEFACCION' });
    const nemoPart = result.items.find(
      (i) => i.part.vendorId === 'vendor_eurodesguace' && i.part.source.externalPartId === '91010'
    );
    expect(nemoPart).toBeDefined();
    expect(nemoPart?.part.donorVehicle?.make).toBe('CITROEN');
    expect(nemoPart?.part.donorVehicle?.model).toBe('NEMO');
    expect(nemoPart?.part.oemReferences[0].normalized).toBe('5073401000013');
    expect(nemoPart?.part.oemReferences[0].brandName).toBe('REFERENCIA_VISUAL');
    expect(nemoPart?.part.oemReferences[0].referenceType).toBe('REFERENCIA_VISUAL');
    expect(nemoPart?.compatibility.isGuaranteed).toBe(false);
  });
});
