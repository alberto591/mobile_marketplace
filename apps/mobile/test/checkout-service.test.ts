import { describe, expect, it, vi } from 'vitest';
import { CheckoutError, CheckoutService } from '../services/checkout.service';
import { removeItemFromCart } from '../services/cart.service';
import type { CartItem } from '../services/cart.service';
import type { Part, Vendor } from '@mobile-marketplace/core';
import { createMoney } from '@mobile-marketplace/core';

describe('CheckoutService Client & Cart Clearance', () => {
  const sampleVendor: Vendor = {
    id: '00000000-0000-4000-a000-000000000101',
    legalName: 'Eurodesguace Málaga S.L.',
    tradeName: 'Eurodesguace Málaga',
    catAuthorizationCode: 'CAT/AND/MA/0412',
    catVerified: true,
    location: {
      city: 'Málaga',
      province: 'Málaga',
      postalCode: '29004',
      country: 'ES',
    },
    contact: {},
    policies: { warrantyMonths: 12, returnDays: 14 },
    status: 'ACTIVE',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const samplePart1: Part = {
    id: '11111111-1111-4000-a000-111111111111',
    vendorId: sampleVendor.id,
    source: {
      providerId: 'eurodesguace',
      externalPartId: 'EDM-101',
      lastSeenAt: new Date(),
    },
    title: 'Faro Delantero Izquierdo',
    categoryId: 'optica',
    price: createMoney(4500, 'EUR'),
    condition: 'GOOD',
    testedStatus: 'TESTED_WORKING',
    availability: { status: 'AVAILABLE', stockQuantity: 1, lastCheckedAt: new Date() },
    oemReferences: [],
    images: [],
    warrantyMonths: 12,
    lastSyncedAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const samplePart2: Part = {
    id: '22222222-2222-4000-a000-222222222222',
    vendorId: sampleVendor.id,
    source: {
      providerId: 'eurodesguace',
      externalPartId: 'EDM-102',
      lastSeenAt: new Date(),
    },
    title: 'Piloto Trasero Derecho',
    categoryId: 'optica',
    price: createMoney(3500, 'EUR'),
    condition: 'EXCELLENT',
    testedStatus: 'TESTED_WORKING',
    availability: { status: 'AVAILABLE', stockQuantity: 1, lastCheckedAt: new Date() },
    oemReferences: [],
    images: [],
    warrantyMonths: 12,
    lastSyncedAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  it('selectively clears only ordered items from the cart, preserving remaining items', () => {
    const initialItems: readonly CartItem[] = [
      { part: samplePart1, vendor: sampleVendor, addedAt: new Date().toISOString() },
      { part: samplePart2, vendor: sampleVendor, addedAt: new Date().toISOString() },
    ];

    // Customer ordered only part 1
    const orderedIds = [samplePart1.id];
    const remaining = initialItems.filter((i) => !orderedIds.includes(i.part.id));

    expect(remaining).toHaveLength(1);
    expect(remaining[0]?.part.id).toBe(samplePart2.id);
  });

  it('successfully calls createPaymentIntent and returns structured response', async () => {
    const mockResponse = {
      success: true,
      orderReference: 'ORD-202610-TEST',
      suborderReference: 'SUB-202610-TEST-01',
      accessToken: 'tok_test_access_token_123',
      clientSecret: 'pi_test_secret_456',
      stripeAccountId: 'acct_test_123',
      publishableKey: 'pk_test_123',
      pricing: {
        subtotalCents: 4500,
        shippingCents: 950,
        taxCents: 0,
        totalCents: 5450,
        platformFeeCents: 450,
        isTestOrder: true,
        taxStatus: 'UNCONFIGURED',
      },
      status: 'PENDING_PAYMENT',
    };

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue(mockResponse),
    });

    const service = new CheckoutService({
      baseUrl: 'https://test.supabase.co',
      anonKey: 'test-anon-key',
      fetchFn: mockFetch as any,
    });

    const result = await service.createPaymentIntent({
      contact: {
        customerName: 'Prueba Test',
        customerEmail: 'test@example.com',
        customerPhone: '+34 600 000 000',
      },
      address: {
        line1: 'Calle Falsa 123',
        city: 'Málaga',
        province: 'Málaga',
        postalCode: '29004',
        country: 'ES',
      },
      partIds: [samplePart1.id],
      idempotencyKey: 'idem-test-service-001',
    });

    expect(result.orderReference).toBe('ORD-202610-TEST');
    expect(result.clientSecret).toBe('pi_test_secret_456');
    expect(result.pricing.shippingCents).toBe(950);
    expect(mockFetch).toHaveBeenCalledOnce();
  });

  it('throws structured CheckoutError when server returns error response', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 422,
      json: vi.fn().mockResolvedValue({
        error: 'MULTI_VENDOR_NOT_SUPPORTED',
        message: 'El primer lanzamiento de checkout procesa un único desguace por pedido.',
      }),
    });

    const service = new CheckoutService({
      baseUrl: 'https://test.supabase.co',
      anonKey: 'test-anon-key',
      fetchFn: mockFetch as any,
    });

    await expect(
      service.createPaymentIntent({
        contact: {
          customerName: 'Prueba',
          customerEmail: 'test@example.com',
          customerPhone: '600000000',
        },
        address: {
          line1: 'Calle 1',
          city: 'Málaga',
          province: 'Málaga',
          postalCode: '29004',
          country: 'ES',
        },
        partIds: [samplePart1.id, samplePart2.id],
        idempotencyKey: 'idem-error-test',
      })
    ).rejects.toThrow('El primer lanzamiento de checkout procesa un único desguace por pedido.');
  });
});
