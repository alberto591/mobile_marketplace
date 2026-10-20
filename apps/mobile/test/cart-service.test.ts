import { describe, expect, it } from 'vitest';
import type { Part, Vendor } from '@mobile-marketplace/core';
import { createAvailability, createMoney, formatMoney } from '@mobile-marketplace/core';
import {
  addItemToCart,
  calculateCartSubtotal,
  canAddToCart,
  groupCartItemsByVendor,
  removeItemFromCart,
} from '../services/cart.service';
import { MemoryCartStorage } from '../services/cart-storage';

function createMockVendor(id: string, tradeName: string): Vendor {
  return Object.freeze({
    id,
    legalName: `${tradeName} S.L.`,
    tradeName,
    catAuthorizationCode: `CAT/${id.toUpperCase()}/001`,
    catVerified: true,
    location: {
      city: 'Málaga',
      province: 'Málaga',
      postalCode: '29004',
      country: 'ES' as const,
    },
    contact: {
      publicPhone: '+34 952 000 000',
      publicEmail: 'info@cat.test',
    },
    policies: {
      warrantyMonths: 12,
      returnDays: 14,
    },
    status: 'ACTIVE' as const,
    createdAt: new Date('2025-01-01'),
    updatedAt: new Date('2025-01-01'),
  });
}

function createMockPart(params: {
  id: string;
  vendorId: string;
  title: string;
  cents: number;
  status?: 'AVAILABLE' | 'PENDING_CONFIRMATION' | 'OUT_OF_STOCK' | 'WITHDRAWN';
  stockQuantity?: number;
  oem?: string;
}): Part {
  const status = params.status ?? 'AVAILABLE';
  const stockQuantity = params.stockQuantity ?? (status === 'AVAILABLE' ? 1 : 0);

  return Object.freeze({
    id: params.id,
    vendorId: params.vendorId,
    source: {
      providerId: 'eurodesguace',
      externalPartId: `ext-${params.id}`,
      rawPayloadHash: 'hash-123',
      sourceType: 'API_SCRAPYARD',
    },
    title: params.title,
    categoryId: 'MOTOR_CALEFACCION',
    price: createMoney(params.cents, 'EUR'),
    condition: 'GOOD' as const,
    testedStatus: 'TESTED_WORKING' as const,
    availability: createAvailability({
      status,
      stockQuantity,
    }),
    oemReferences: params.oem
      ? [
          {
            raw: params.oem,
            normalized: params.oem.replace(/[^A-Z0-9]/gi, ''),
            isPrimary: true,
            referenceType: 'OEM_OFFICIAL' as const,
          },
        ]
      : [],
    images: [],
    warrantyMonths: 12,
    lastSyncedAt: new Date('2026-10-20'),
    createdAt: new Date('2026-10-20'),
    updatedAt: new Date('2026-10-20'),
  });
}

describe('Cart Domain & CartService (SOLID Unit & Invariant Testing)', () => {
  const vendor1 = createMockVendor('vendor_eurodesguace', 'Eurodesguace Málaga');
  const vendor2 = createMockVendor('vendor_madrid', 'Desguace Madrid Norte');

  it('1. Evalúa correctamente los estados de disponibilidad (canAddToCart)', () => {
    const availablePart = createMockPart({
      id: 'p1',
      vendorId: vendor1.id,
      title: 'MOTOR CALEFACCION CITROEN',
      cents: 3795,
      status: 'AVAILABLE',
      stockQuantity: 1,
    });
    expect(canAddToCart(availablePart).allowed).toBe(true);

    const pendingPart = createMockPart({
      id: 'p2',
      vendorId: vendor1.id,
      title: 'CENTRALITA MOTOR',
      cents: 12000,
      status: 'PENDING_CONFIRMATION',
    });
    const pendingCheck = canAddToCart(pendingPart);
    expect(pendingCheck.allowed).toBe(false);
    expect(pendingCheck.reason).toContain('confirmación previa');

    const outOfStockPart = createMockPart({
      id: 'p3',
      vendorId: vendor1.id,
      title: 'ALTERNASDOR',
      cents: 6500,
      status: 'OUT_OF_STOCK',
      stockQuantity: 0,
    });
    const outCheck = canAddToCart(outOfStockPart);
    expect(outCheck.allowed).toBe(false);
    expect(outCheck.reason).toContain('no se encuentra disponible');

    const withdrawnPart = createMockPart({
      id: 'p4',
      vendorId: vendor1.id,
      title: 'PIEZA RETIRADA',
      cents: 5000,
      status: 'WITHDRAWN',
    });
    const withdrawnCheck = canAddToCart(withdrawnPart);
    expect(withdrawnCheck.allowed).toBe(false);
    expect(withdrawnCheck.reason).toContain('retirada del inventario');

    const zeroStockAvailable = createMockPart({
      id: 'p5',
      vendorId: vendor1.id,
      title: 'PIEZA SIN STOCK',
      cents: 4000,
      status: 'AVAILABLE',
      stockQuantity: 0,
    });
    expect(canAddToCart(zeroStockAvailable).allowed).toBe(false);
  });

  it('2. Añade una pieza disponible al carrito con cantidad unitaria 1', () => {
    const part = createMockPart({
      id: 'part_01',
      vendorId: vendor1.id,
      title: 'MANDO CALEFACCION NEMO',
      cents: 4295,
    });

    const result = addItemToCart([], part, vendor1);
    expect(result.added).toBe(true);
    expect(result.items).toHaveLength(1);
    expect(result.items[0].part.id).toBe('part_01');
    expect(result.items[0].vendor.tradeName).toBe('Eurodesguace Málaga');
  });

  it('3. Impide duplicados y rechaza cantidades superiores a una unidad para una misma oferta física', () => {
    const part = createMockPart({
      id: 'part_unique_01',
      vendorId: vendor1.id,
      title: 'FARO DELANTERO GOLF',
      cents: 8500,
    });

    const step1 = addItemToCart([], part, vendor1);
    expect(step1.added).toBe(true);
    expect(step1.items).toHaveLength(1);

    // Intentar añadir la misma unidad física por segunda vez
    const step2 = addItemToCart(step1.items, part, vendor1);
    expect(step2.added).toBe(false);
    expect(step2.reason).toContain('ya está incluida en tu carrito');
    expect(step2.items).toHaveLength(1); // Longitud se mantiene en 1 (no hay cantidad > 1)
  });

  it('4. Conserva la identidad física de ofertas distintas aunque compartan referencia OEM', () => {
    const sameOem = '1K0-941-005.Q';
    const unitFromDonorA = createMockPart({
      id: 'faro_coche_A',
      vendorId: vendor1.id,
      title: 'FARO IZQUIERDO GOLF - DONANTE A',
      cents: 8500,
      oem: sameOem,
    });
    const unitFromDonorB = createMockPart({
      id: 'faro_coche_B',
      vendorId: vendor1.id,
      title: 'FARO IZQUIERDO GOLF - DONANTE B',
      cents: 9000,
      oem: sameOem,
    });

    const step1 = addItemToCart([], unitFromDonorA, vendor1);
    const step2 = addItemToCart(step1.items, unitFromDonorB, vendor1);

    expect(step2.added).toBe(true);
    expect(step2.items).toHaveLength(2);
    expect(step2.items[0].part.id).toBe('faro_coche_A');
    expect(step2.items[1].part.id).toBe('faro_coche_B');
    // Nunca se fusionan en una sola línea con cantidad 2
  });

  it('5. Elimina artículos correctamente conservando los restantes', () => {
    const part1 = createMockPart({ id: 'p1', vendorId: vendor1.id, title: 'PIEZA 1', cents: 1000 });
    const part2 = createMockPart({ id: 'p2', vendorId: vendor1.id, title: 'PIEZA 2', cents: 2000 });

    const step1 = addItemToCart([], part1, vendor1);
    const step2 = addItemToCart(step1.items, part2, vendor1);
    expect(step2.items).toHaveLength(2);

    const updated = removeItemFromCart(step2.items, 'p1');
    expect(updated).toHaveLength(1);
    expect(updated[0].part.id).toBe('p2');
  });

  it('6. Calcula subtotales estrictamente en céntimos enteros (elimina drift flotante)', () => {
    expect(calculateCartSubtotal([]).amountInCents).toBe(0);

    const partA = createMockPart({ id: 'pA', vendorId: vendor1.id, title: 'P1', cents: 4295 }); // 42,95
    const partB = createMockPart({ id: 'pB', vendorId: vendor1.id, title: 'P2', cents: 3795 }); // 37,95
    const partC = createMockPart({ id: 'pC', vendorId: vendor1.id, title: 'P3', cents: 2795 }); // 27,95

    const items = [
      { part: partA, vendor: vendor1, addedAt: new Date().toISOString() },
      { part: partB, vendor: vendor1, addedAt: new Date().toISOString() },
      { part: partC, vendor: vendor1, addedAt: new Date().toISOString() },
    ];

    const subtotal = calculateCartSubtotal(items);
    // 4295 + 3795 + 2795 = 10885 céntimos = 108,85 EUR
    expect(subtotal.amountInCents).toBe(10885);
    expect(formatMoney(subtotal)).toBe('108,85 EUR');
  });

  it('7. Agrupa visualmente las piezas por vendedor y calcula subtotales por desguace', () => {
    const partEuro1 = createMockPart({ id: 'e1', vendorId: vendor1.id, title: 'ABS', cents: 5000 });
    const partEuro2 = createMockPart({ id: 'e2', vendorId: vendor1.id, title: 'BOMBA', cents: 3000 });
    const partMadrid = createMockPart({ id: 'm1', vendorId: vendor2.id, title: 'PUERTA', cents: 12000 });

    const items = [
      { part: partEuro1, vendor: vendor1, addedAt: new Date().toISOString() },
      { part: partMadrid, vendor: vendor2, addedAt: new Date().toISOString() },
      { part: partEuro2, vendor: vendor1, addedAt: new Date().toISOString() },
    ];

    const groups = groupCartItemsByVendor(items);
    expect(groups).toHaveLength(2);

    const euroGroup = groups.find((g) => g.vendorId === vendor1.id);
    expect(euroGroup).toBeDefined();
    expect(euroGroup?.items).toHaveLength(2);
    expect(euroGroup?.subtotal.amountInCents).toBe(8000); // 5000 + 3000 = 80,00 EUR

    const madridGroup = groups.find((g) => g.vendorId === vendor2.id);
    expect(madridGroup).toBeDefined();
    expect(madridGroup?.items).toHaveLength(1);
    expect(madridGroup?.subtotal.amountInCents).toBe(12000); // 120,00 EUR
  });

  it('8. Soporta persistencia local segura a través de la interfaz ICartStorage', async () => {
    const storage = new MemoryCartStorage();
    const storageKey = '@mobile_marketplace:cart_v1';

    expect(await storage.getItem(storageKey)).toBeNull();

    const part = createMockPart({ id: 'p_persisted', vendorId: vendor1.id, title: 'ESPEJO', cents: 4500 });
    const items = [{ part, vendor: vendor1, addedAt: '2026-10-20T08:00:00Z' }];

    await storage.setItem(storageKey, JSON.stringify(items));

    const retrieved = await storage.getItem(storageKey);
    expect(retrieved).not.toBeNull();

    const parsed = JSON.parse(retrieved as string);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].part.id).toBe('p_persisted');

    await storage.removeItem(storageKey);
    expect(await storage.getItem(storageKey)).toBeNull();
  });

  it('9. Garantiza la invariante: Añadir una pieza al carrito NUNCA modifica la disponibilidad en el catálogo', () => {
    const originalPart = createMockPart({
      id: 'p_immutable',
      vendorId: vendor1.id,
      title: 'ALTERNADOR ORIGINAL',
      cents: 7500,
      status: 'AVAILABLE',
      stockQuantity: 1,
    });

    const result = addItemToCart([], originalPart, vendor1);
    expect(result.added).toBe(true);

    // El objeto original permanece congelado e inalterado
    expect(originalPart.availability.status).toBe('AVAILABLE');
    expect(originalPart.availability.stockQuantity).toBe(1);
  });
});
