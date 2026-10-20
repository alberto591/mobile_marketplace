import { describe, expect, it, vi } from 'vitest';
import type { PublicCatalogPartRow } from '../services/backend-catalog.service';
import {
  BackendCatalogError,
  BackendCatalogService,
} from '../services/backend-catalog.service';
import { createCatalogService } from '../services/catalog-service.factory';
import { MockCatalogService } from '../services/mock-catalog.service';

describe('BackendCatalogService', () => {
  const sampleRow1: PublicCatalogPartRow = {
    id: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
    vendor_id: 'vendor_eurodesguace',
    external_part_id: '123456',
    source_sku: 'SKU-123456',
    title: 'RETROVISOR DERECHO SEAT IBIZA',
    description: 'Espejo retrovisor derecho eléctrico con conector de 5 pines.',
    category_id: 'CARROCERIA_RETROVISOR_DCH',
    price_cents: 4500,
    currency: 'EUR',
    condition: 'GOOD',
    tested_status: 'TESTED_WORKING',
    availability_status: 'AVAILABLE',
    stock_quantity: 1,
    warranty_months: 12,
    source_updated_at: '2026-10-19T08:30:00Z',
    last_synced_at: '2026-10-19T09:00:00Z',
    vendor: {
      id: 'vendor_eurodesguace',
      legalName: 'Eurodesguace Málaga S.L.',
      tradeName: 'Eurodesguace Málaga',
      catAuthorizationCode: 'CAT/AND/MA/0412',
      catVerified: true,
      city: 'Málaga',
      province: 'Málaga',
      postalCode: '29004',
      warrantyMonths: 12,
      returnDays: 14,
    },
    donor_vehicle: {
      make: 'SEAT',
      model: 'IBIZA V (KJ1)',
      generation: 'KJ1',
      yearFrom: 2017,
      yearTo: 2021,
      engineCode: 'CHZB',
      fuel: 'GASOLINE',
      donorVehicleCode: 'VEH-2026-089',
    },
    oem_references: [
      {
        raw: '6F0857508B',
        normalized: '6F0857508B',
        isPrimary: true,
        referenceType: 'OEM_OFFICIAL',
      },
      {
        raw: 'VISUAL-SEAT-01',
        normalized: 'VISUALSEAT01',
        isPrimary: false,
        referenceType: 'REFERENCIA_VISUAL',
        brandName: 'REFERENCIA_VISUAL',
      },
    ],
    images: [
      {
        id: 'img-1',
        url: 'https://images.eurodesguacemalaga.com/parts/123456_1.jpg',
        sortOrder: 0,
        isPrimary: true,
      },
    ],
  };

  const sampleRow2: PublicCatalogPartRow = {
    id: 'a8b3c10b-58cc-4372-a567-0e02b2c3d999',
    vendor_id: 'vendor_eurodesguace',
    external_part_id: '654321',
    source_sku: 'SKU-654321',
    title: 'ALTERNADOR SEAT LEON',
    description: 'Alternador 140A comprobado en banco.',
    category_id: 'ELECTRICIDAD_ALTERNADOR',
    price_cents: 9500,
    currency: 'EUR',
    condition: 'EXCELLENT',
    tested_status: 'TESTED_WORKING',
    availability_status: 'AVAILABLE',
    stock_quantity: 1,
    warranty_months: 12,
    source_updated_at: '2026-10-19T08:30:00Z',
    last_synced_at: '2026-10-19T09:00:00Z',
    vendor: sampleRow1.vendor,
    donor_vehicle: {
      make: 'SEAT',
      model: 'LEON III (5F1)',
      yearFrom: 2012,
      yearTo: 2020,
      engineCode: 'CRKB',
      fuel: 'DIESEL',
      donorVehicleCode: 'VEH-2026-102',
    },
    oem_references: [
      {
        raw: '04L903023F',
        normalized: '04L903023F',
        isPrimary: true,
        referenceType: 'OEM_OFFICIAL',
      },
    ],
    images: [],
  };

  it('queries PostgREST projection with proper anon auth headers and maps domain entities', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => [sampleRow1],
    });

    const service = new BackendCatalogService({
      baseUrl: 'https://xyz.supabase.co',
      anonKey: 'public-anon-key-test',
      fetchFn: fetchMock as any,
    });

    const result = await service.search({ query: 'RETROVISOR' });

    expect(fetchMock).toHaveBeenCalledOnce();
    const [callUrl, callInit] = fetchMock.mock.calls[0];
    expect(callUrl).toContain('https://xyz.supabase.co/rest/v1/public_catalog_parts');
    expect(callUrl).toContain('title=ilike.*RETROVISOR*');
    expect(callInit.headers.apikey).toBe('public-anon-key-test');
    expect(callInit.headers.Authorization).toBe('Bearer public-anon-key-test');

    expect(result.items).toHaveLength(1);
    const item = result.items[0];
    expect(item.part.id).toBe(sampleRow1.id);
    expect(item.part.title).toBe(sampleRow1.title);
    expect(item.part.price.amountInCents).toBe(4500);
    expect(item.part.donorVehicle?.donorVehicleCode).toBe('VEH-2026-089');
    expect(item.vendor.tradeName).toBe('Eurodesguace Málaga');
  });

  it('applies query parameters for sorting, price and availability', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => [sampleRow1],
    });

    const service = new BackendCatalogService({
      baseUrl: 'https://test.supabase.co',
      anonKey: 'test-key',
      fetchFn: fetchMock as any,
    });

    await service.search({
      vendorId: 'vendor_eurodesguace',
      maxPriceCents: 5000,
      onlyAvailable: true,
      sortBy: 'price_asc',
    });

    const [callUrl] = fetchMock.mock.calls[0];
    expect(callUrl).toContain('vendor_id=eq.vendor_eurodesguace');
    expect(callUrl).toContain('price_cents=lte.5000');
    expect(callUrl).toContain('availability_status=eq.AVAILABLE');
    expect(callUrl).toContain('order=price_cents.asc');
  });

  it('filters by OEM reference and evaluates official OEM compatibility', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => [sampleRow1, sampleRow2],
    });

    const service = new BackendCatalogService({
      baseUrl: 'https://test.supabase.co',
      anonKey: 'test-key',
      fetchFn: fetchMock as any,
    });

    const result = await service.search({
      oemReference: '6F0-857-508-B',
    });

    expect(result.items).toHaveLength(1);
    expect(result.items[0].part.id).toBe(sampleRow1.id);
    expect(result.items[0].compatibility.isGuaranteed).toBe(true);
    expect(result.items[0].compatibility.confidence).toBe('EXACT_OEM_MATCH');
  });

  it('strictly treats visual references as non-guaranteed attributes match', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => [sampleRow1],
    });

    const service = new BackendCatalogService({
      baseUrl: 'https://test.supabase.co',
      anonKey: 'test-key',
      fetchFn: fetchMock as any,
    });

    const result = await service.search({
      oemReference: 'VISUAL-SEAT-01',
    });

    expect(result.items).toHaveLength(1);
    // CRITICAL GUARDRAIL: Visual reference must NEVER yield isGuaranteed=true
    expect(result.items[0].compatibility.isGuaranteed).toBe(false);
    expect(result.items[0].compatibility.confidence).toBe('ATTRIBUTES_MATCH');
    expect(result.items[0].compatibility.evidenceSummary).toContain('referencia visual');
  });

  it('retrieves part detail by ID and returns null when not found', async () => {
    const fetchMock = vi.fn().mockImplementation(async (url: string) => {
      if (url.includes(sampleRow1.id)) {
        return { ok: true, status: 200, json: async () => [sampleRow1] };
      }
      return { ok: true, status: 200, json: async () => [] };
    });

    const service = new BackendCatalogService({
      baseUrl: 'https://test.supabase.co',
      anonKey: 'test-key',
      fetchFn: fetchMock as any,
    });

    const found = await service.getPartById(sampleRow1.id);
    expect(found).not.toBeNull();
    expect(found?.part.id).toBe(sampleRow1.id);

    const missing = await service.getPartById('non-existent-uuid');
    expect(missing).toBeNull();
  });

  it('fails fast on network or HTTP errors without returning fake mock data', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
      statusText: 'Service Unavailable',
    });

    const service = new BackendCatalogService({
      baseUrl: 'https://test.supabase.co',
      anonKey: 'test-key',
      fetchFn: fetchMock as any,
    });

    await expect(service.search({ query: 'FILTRO' })).rejects.toThrow(
      BackendCatalogError
    );
  });

  it('creates MockCatalogService or BackendCatalogService cleanly via factory', () => {
    const mockService = createCatalogService({ dataSource: 'mock' });
    expect(mockService).toBeInstanceOf(MockCatalogService);

    const backendService = createCatalogService({
      dataSource: 'backend',
      backendBaseUrl: 'https://backend.test.supabase.co',
      backendAnonKey: 'anon-key-test',
    });
    expect(backendService).toBeInstanceOf(BackendCatalogService);
  });

  it('correctly maps REFERENCIA_VISUAL from PostgREST rows and preserves isGuaranteed=false', async () => {
    const visualRow: PublicCatalogPartRow = {
      ...sampleRow1,
      id: 'visual-test-part-123',
      oem_references: [
        {
          raw: '5073401000013',
          normalized: '5073401000013',
          isPrimary: true,
          referenceType: 'REFERENCIA_VISUAL',
        },
      ],
    };

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => [visualRow],
    });

    const service = new BackendCatalogService({
      baseUrl: 'https://test.supabase.co',
      anonKey: 'test-key',
      fetchFn: fetchMock as any,
    });

    const result = await service.search({
      query: 'MANDO',
      oemReference: '5073401000013',
    });

    expect(result.items).toHaveLength(1);
    const item = result.items[0];
    expect(item.part.oemReferences[0].referenceType).toBe('REFERENCIA_VISUAL');
    expect(item.compatibility.isGuaranteed).toBe(false);
    expect(item.compatibility.confidence).toBe('ATTRIBUTES_MATCH');
    expect(item.compatibility.evidenceSummary).toContain('referencia visual del desguace');
  });
});
