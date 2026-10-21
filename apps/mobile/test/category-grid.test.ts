import { describe, expect, it } from 'vitest';
import { MockCatalogService } from '../services/mock-catalog.service';
import { BackendCatalogService } from '../services/backend-catalog.service';
import { CANONICAL_CATEGORY_GROUPS } from '../services/category-groups.config';

describe('Feature 1: Visual Category Grid & Category Grouping', () => {
  it('defines the 5 standard automotive category groups with icons and category mappings', () => {
    expect(CANONICAL_CATEGORY_GROUPS.length).toBe(5);
    const ids = CANONICAL_CATEGORY_GROUPS.map((g) => g.id);
    expect(ids).toContain('frenos-suspension');
    expect(ids).toContain('mecanica-motor');
    expect(ids).toContain('electricidad-iluminacion');
    expect(ids).toContain('climatizacion-confort');
    expect(ids).toContain('carroceria-exteriores');
  });

  it('calculates group inventory counts dynamically from actual parts in MockCatalogService', async () => {
    const service = new MockCatalogService();
    const groups = await service.getCategoryGroups();

    expect(groups.length).toBeGreaterThan(0);
    for (const group of groups) {
      expect(group.count).toBeGreaterThan(0);
      expect(group.label).toBeTruthy();
      expect(group.categoryIds.length).toBeGreaterThan(0);
    }
  });

  it('filters search results strictly by categoryIds in MockCatalogService', async () => {
    const service = new MockCatalogService();
    const result = await service.search({
      categoryIds: ['SUSPENSIÓN / FRENOS'],
    });

    for (const item of result.items) {
      expect(item.part.categoryId).toBe('SUSPENSIÓN / FRENOS');
    }
  });

  it('combines category filter with text query cleanly without collision', async () => {
    const service = new MockCatalogService();
    const result = await service.search({
      categoryIds: ['MOTOR / ADMISIÓN / ESCAPE', 'CAMBIO / EMBRAGUE'],
      query: 'intercooler',
    });

    for (const item of result.items) {
      expect(['MOTOR / ADMISIÓN / ESCAPE', 'CAMBIO / EMBRAGUE']).toContain(item.part.categoryId);
      expect(item.part.title.toLowerCase()).toContain('intercooler');
    }
  });

  it('calculates counts from real catalog data in BackendCatalogService with mock fetchFn', async () => {
    const fakeRows = [
      { category_id: 'SUSPENSIÓN / FRENOS' },
      { category_id: 'SUSPENSIÓN / FRENOS' },
      { category_id: 'CLIMATIZACIÓN' },
    ];

    const mockFetch = async () =>
      new Response(JSON.stringify(fakeRows), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });

    const backendService = new BackendCatalogService({
      baseUrl: 'http://localhost:54321',
      anonKey: 'test-key',
      fetchFn: mockFetch as any,
    });

    const groups = await backendService.getCategoryGroups();

    // Only groups with count > 0 should be returned
    const frenosGroup = groups.find((g) => g.id === 'frenos-suspension');
    const climaGroup = groups.find((g) => g.id === 'climatizacion-confort');
    const motorGroup = groups.find((g) => g.id === 'mecanica-motor');

    expect(frenosGroup).toBeDefined();
    expect(frenosGroup?.count).toBe(2);

    expect(climaGroup).toBeDefined();
    expect(climaGroup?.count).toBe(1);

    // Motor had 0 matching items, so it should be suppressed
    expect(motorGroup).toBeUndefined();
  });
});
