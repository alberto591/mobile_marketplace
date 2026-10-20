import fs from 'node:fs';
import path from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { formatMoney, getPrimaryOEMReference } from '@mobile-marketplace/core';
import { BackendCatalogError } from '../services/backend-catalog.service';
import { createCatalogService } from '../services/catalog-service.factory';

function loadLocalEnv() {
  const candidates = [
    path.resolve(process.cwd(), '.env.local'),
    path.resolve(process.cwd(), '../.env.local'),
    path.resolve(process.cwd(), '../../.env.local'),
  ];
  for (const envPath of candidates) {
    if (fs.existsSync(envPath)) {
      const content = fs.readFileSync(envPath, 'utf8');
      for (const line of content.split('\n')) {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
          const [k, ...v] = trimmed.split('=');
          if (!process.env[k.trim()]) {
            process.env[k.trim()] = v.join('=').trim().replace(/^["']|["']$/g, '');
          }
        }
      }
      break;
    }
  }
}

describe('Live Backend Catalog & 9 Application Flows (Staging Integration)', { timeout: 15000 }, () => {
  beforeAll(() => {
    loadLocalEnv();
  });

  const getService = () => {
    const baseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
    const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
    expect(baseUrl, 'EXPO_PUBLIC_SUPABASE_URL debe estar configurado').toBeDefined();
    expect(anonKey, 'EXPO_PUBLIC_SUPABASE_ANON_KEY debe estar configurado').toBeDefined();

    return createCatalogService({
      dataSource: 'backend',
      backendBaseUrl: baseUrl,
      backendAnonKey: anonKey,
    });
  };

  it('Flujo 1 & 2: Realiza búsqueda de "CALEFACCION" y devuelve los recambios reales en staging', async () => {
    const service = getService();
    const result = await service.search({ query: 'CALEFACCION' });

    expect(result.totalCount).toBeGreaterThanOrEqual(3);
    expect(result.items.length).toBeGreaterThanOrEqual(3);

    const titles = result.items.map((i) => i.part.title);
    expect(titles).toContain('MANDO CALEFACCION / AIRE ACONDICIONADO');
    expect(titles).toContain('RESISTENCIA CALEFACCION');
    expect(titles).toContain('CENTRALITA CALEFACCION');
  });

  it('Flujo 3: Verifica que los recambios proceden de Eurodesguace Málaga con donantes reales', async () => {
    const service = getService();
    const result = await service.search({ query: 'CALEFACCION' });

    for (const item of result.items) {
      expect(item.vendor.tradeName).toBe('Eurodesguace Málaga');
      expect(item.vendor.catVerified).toBe(true);
      expect(item.part.price.amountInCents).toBeGreaterThan(0);
      expect(item.part.availability.status).toBe('AVAILABLE');
      expect(Array.isArray(item.part.images)).toBe(true);
    }
  });

  it('Flujo 4 & 5: Detalle del mando de calefacción del Citroën Nemo (ref 91010)', async () => {
    const service = getService();
    const searchRes = await service.search({ query: 'CALEFACCION' });
    const nemoItem = searchRes.items.find(
      (i) => i.part.source.externalPartId === '91010'
    );

    expect(nemoItem).toBeDefined();
    const detail = await service.getPartById(nemoItem!.part.id);
    expect(detail).not.toBeNull();

    // Verificación de campos requeridos
    expect(detail!.part.title).toBe('MANDO CALEFACCION / AIRE ACONDICIONADO');
    expect(detail!.part.price.amountInCents).toBe(4295);
    expect(formatMoney(detail!.part.price)).toBe('42,95 EUR');
    expect(detail!.vendor.tradeName).toBe('Eurodesguace Málaga');
    expect(detail!.vendor.catAuthorizationCode).toBe('CAT/AND/MA/0412');
    expect(detail!.part.donorVehicle?.make).toBe('CITROEN');
    expect(detail!.part.donorVehicle?.model).toBe('NEMO');

    // Referencia visual tipada y NO garantizada
    const visualRef = detail!.part.oemReferences[0];
    expect(visualRef.raw).toBe('5073401000013');
    expect(visualRef.referenceType).toBe('REFERENCIA_VISUAL');
    expect(detail!.compatibility.isGuaranteed).toBe(false);

    // Fotografías reales
    expect(detail!.part.images.length).toBeGreaterThanOrEqual(2);
    expect(detail!.part.images[0].url).toContain('https://');
  });

  it('Flujo 6: Cambiar filtros y ordenar por precio ascendente', async () => {
    const service = getService();
    const result = await service.search({
      query: 'CALEFACCION',
      sortBy: 'price_asc',
    });

    expect(result.items.length).toBeGreaterThanOrEqual(3);
    // Orden ascendente: comprobar que el precio de cada item es menor o igual al siguiente
    for (let i = 0; i < result.items.length - 1; i++) {
      expect(result.items[i].part.price.amountInCents).toBeLessThanOrEqual(
        result.items[i + 1].part.price.amountInCents
      );
    }
  });

  it('Flujo 7: Consulta sin resultados devuelve totalCount=0 sin errores', async () => {
    const service = getService();
    const result = await service.search({ query: 'PIEZA_INEXISTENTE_XYZ_9999' });

    expect(result.totalCount).toBe(0);
    expect(result.items).toHaveLength(0);
    expect(result.providerErrors).toHaveLength(0);
  });

  it('Flujo 8 & 9: Fallo de backend produce excepción visible y NUNCA retorna fixtures mock', async () => {
    const failingService = createCatalogService({
      dataSource: 'backend',
      backendBaseUrl: 'https://non-existent-subdomain.supabase.co',
      backendAnonKey: 'mock-key',
    });

    await expect(
      failingService.search({ query: 'CALEFACCION' })
    ).rejects.toThrow(BackendCatalogError);

    await expect(
      failingService.getPartById('some-part-id')
    ).rejects.toThrow(BackendCatalogError);
  });

  it('Flujo 10: Recupera pieza recién sincronizada en el lote de 50 (MOTOR ELEVALUNAS ref 91032)', async () => {
    const service = getService();
    const searchRes = await service.search({ query: 'ELEVALUNAS' });

    expect(searchRes.items.length).toBeGreaterThanOrEqual(1);
    const elevalunasItem = searchRes.items.find(
      (i) => i.part.source.externalPartId === '91032'
    );
    expect(elevalunasItem).toBeDefined();

    const detail = await service.getPartById(elevalunasItem!.part.id);
    expect(detail).not.toBeNull();
    expect(detail!.part.title).toContain('MOTOR ELEVALUNAS');
    expect(detail!.part.price.amountInCents).toBe(2795);
    expect(formatMoney(detail!.part.price)).toBe('27,95 EUR');
    expect(detail!.vendor.tradeName).toBe('Eurodesguace Málaga');
    expect(detail!.part.images.length).toBe(4);
    expect(detail!.part.donorVehicle?.donorVehicleCode).toBeDefined();

    // Verificación de referencia visual no garantizada
    if (detail!.part.oemReferences.length > 0) {
      expect(detail!.part.oemReferences[0].referenceType).toBe('REFERENCIA_VISUAL');
      expect(detail!.compatibility.isGuaranteed).toBe(false);
    }
  });

  it('Flujo 11: Segundo proveedor simulado permanece aislado y etiquetado', async () => {
    const mockService = createCatalogService({ dataSource: 'mock' });
    const result = await mockService.search({ query: '' });

    expect(result.totalCount).toBeGreaterThan(0);
    // El modo mock agrega ambos proveedores simulados
    const vendors = Array.from(new Set(result.items.map((i) => i.vendor.tradeName)));
    expect(vendors).toContain('Eurodesguace Málaga');
    expect(vendors).toContain('Desguace Alpha Madrid');
  });
});
