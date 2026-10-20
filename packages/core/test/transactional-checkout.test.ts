import { describe, expect, it } from 'vitest';
import {
  calculateTrustedCheckoutPricing,
  CheckoutPricingError,
  MultiVendorCheckoutNotSupportedError,
} from '../src/domain/entities/order';
import {
  CheckoutInitSchema,
  DeliveryAddressSchema,
  SpanishPostalCodeRegex,
} from '../src/validation/order-schemas';

describe('Transactional Checkout — Pricing, Taxes & Safety Gates', () => {
  const sampleVendorId = '00000000-0000-4000-a000-000000000101';
  const competitorVendorId = '00000000-0000-4000-a000-000000000102';

  it('calculates trusted pricing with 950 cents shipping and 10% platform fee on parts subtotal only', () => {
    const parts = [
      {
        id: '11111111-1111-4000-a000-111111111111',
        vendorId: sampleVendorId,
        externalPartId: 'PART-001',
        title: 'Faro Delantero Izquierdo',
        priceCents: 4500, // 45.00 EUR
        availabilityStatus: 'AVAILABLE',
      },
      {
        id: '22222222-2222-4000-a000-222222222222',
        vendorId: sampleVendorId,
        externalPartId: 'PART-002',
        title: 'Piloto Trasero Derecho',
        priceCents: 3500, // 35.00 EUR
        availabilityStatus: 'AVAILABLE',
      },
    ];

    const result = calculateTrustedCheckoutPricing(parts, {
      isStagingTestMode: true,
      fixedShippingCents: 950,
      commissionBasisPoints: 1000, // 10%
    });

    expect(result.subtotalCents).toBe(8000); // 80.00 EUR
    expect(result.shippingCents).toBe(950); // 9.50 EUR
    expect(result.taxCents).toBe(0); // 0.00 EUR (UNCONFIGURED)
    expect(result.totalCents).toBe(8950); // 89.50 EUR

    // 10% fee strictly on 8000 cents = 800 cents. Shipping (950) is excluded from commission!
    expect(result.platformFeeCents).toBe(800);
    expect(result.sellerNetCents).toBe(8150); // 8950 - 800 = 8150 cents
    expect(result.isTestOrder).toBe(true);
    expect(result.taxStatus).toBe('UNCONFIGURED');
    expect(result.items).toHaveLength(2);
    expect(result.items[0]?.quantity).toBe(1);
  });

  it('correctly rounds fractional cents on 10% commission calculation', () => {
    const parts = [
      {
        id: '11111111-1111-4000-a000-111111111111',
        vendorId: sampleVendorId,
        externalPartId: 'PART-003',
        title: 'Mando Climatizador',
        priceCents: 3795, // 37.95 EUR -> 10% is 379.5 cents -> rounded to 380 cents
        availabilityStatus: 'AVAILABLE',
      },
    ];

    const result = calculateTrustedCheckoutPricing(parts, {
      isStagingTestMode: true,
      fixedShippingCents: 950,
      commissionBasisPoints: 1000,
    });

    expect(result.subtotalCents).toBe(3795);
    expect(result.shippingCents).toBe(950);
    expect(result.totalCents).toBe(4745);
    expect(result.platformFeeCents).toBe(380); // Math.round(379.5) = 380
    expect(result.sellerNetCents).toBe(4365); // 4745 - 380 = 4365
  });

  it('rejects multi-vendor cart with MultiVendorCheckoutNotSupportedError in Release 1', () => {
    const parts = [
      {
        id: '11111111-1111-4000-a000-111111111111',
        vendorId: sampleVendorId,
        externalPartId: 'PART-001',
        title: 'Pieza de Eurodesguace',
        priceCents: 5000,
        availabilityStatus: 'AVAILABLE',
      },
      {
        id: '22222222-2222-4000-a000-222222222222',
        vendorId: competitorVendorId,
        externalPartId: 'PART-002',
        title: 'Pieza de Segundo Desguace',
        priceCents: 6000,
        availabilityStatus: 'AVAILABLE',
      },
    ];

    expect(() =>
      calculateTrustedCheckoutPricing(parts, {
        isStagingTestMode: true,
      })
    ).toThrow(MultiVendorCheckoutNotSupportedError);
  });

  it('fails closed when live mode is attempted with unconfigured commercial shipping', () => {
    const parts = [
      {
        id: '11111111-1111-4000-a000-111111111111',
        vendorId: sampleVendorId,
        externalPartId: 'PART-001',
        title: 'Alternador',
        priceCents: 9000,
        availabilityStatus: 'AVAILABLE',
      },
    ];

    // isStagingTestMode = false (Production attempt)
    expect(() =>
      calculateTrustedCheckoutPricing(parts, {
        isStagingTestMode: false,
      })
    ).toThrow(CheckoutPricingError);
  });

  it('rejects unavailable or withdrawn pieces', () => {
    const parts = [
      {
        id: '11111111-1111-4000-a000-111111111111',
        vendorId: sampleVendorId,
        externalPartId: 'PART-001',
        title: 'Motor Arranque',
        priceCents: 4500,
        availabilityStatus: 'OUT_OF_STOCK',
      },
    ];

    expect(() =>
      calculateTrustedCheckoutPricing(parts, {
        isStagingTestMode: true,
      })
    ).toThrow('no está disponible en inventario');
  });

  it('rejects empty cart', () => {
    expect(() =>
      calculateTrustedCheckoutPricing([], {
        isStagingTestMode: true,
      })
    ).toThrow('El carrito no contiene piezas');
  });
});

describe('Transactional Checkout — Validation Schemas', () => {
  it('validates Spanish postal codes strictly (01000 - 52999)', () => {
    expect(SpanishPostalCodeRegex.test('29004')).toBe(true); // Málaga
    expect(SpanishPostalCodeRegex.test('28013')).toBe(true); // Madrid
    expect(SpanishPostalCodeRegex.test('08001')).toBe(true); // Barcelona
    expect(SpanishPostalCodeRegex.test('52001')).toBe(true); // Melilla

    expect(SpanishPostalCodeRegex.test('00123')).toBe(false); // Invalid province 00
    expect(SpanishPostalCodeRegex.test('53001')).toBe(false); // Invalid province 53
    expect(SpanishPostalCodeRegex.test('99999')).toBe(false); // Invalid province 99
    expect(SpanishPostalCodeRegex.test('2801')).toBe(false); // 4 digits
    expect(SpanishPostalCodeRegex.test('280134')).toBe(false); // 6 digits
    expect(SpanishPostalCodeRegex.test('ABCDE')).toBe(false);
  });

  it('validates valid delivery address and customer contact', () => {
    const validPayload = {
      contact: {
        customerName: 'Alberto Ruiz',
        customerEmail: 'alberto@example.com',
        customerPhone: '+34 611 222 333',
      },
      address: {
        line1: 'Calle Larios 15, 2º B',
        line2: 'Edificio Central',
        city: 'Málaga',
        province: 'Málaga',
        postalCode: '29005',
        country: 'ES' as const,
      },
      partIds: ['00000000-0000-4000-a000-000000000001'],
      idempotencyKey: 'idem-checkout-test-20261021-001',
    };

    const parsed = CheckoutInitSchema.safeParse(validPayload);
    expect(parsed.success).toBe(true);
  });

  it('rejects short customer name or invalid email', () => {
    const invalidContact = {
      line1: 'Calle Real 1',
      city: 'Málaga',
      province: 'Málaga',
      postalCode: '29001',
      country: 'ES' as const,
    };

    const parsedAddress = DeliveryAddressSchema.safeParse(invalidContact);
    expect(parsedAddress.success).toBe(true);

    const invalidInit = {
      contact: {
        customerName: 'A', // too short (< 2)
        customerEmail: 'not-an-email',
        customerPhone: '123',
      },
      address: invalidContact,
      partIds: ['00000000-0000-4000-a000-000000000001'],
      idempotencyKey: 'valid-idempotency-key-12345',
    };

    const parsed = CheckoutInitSchema.safeParse(invalidInit);
    expect(parsed.success).toBe(false);
  });

  it('rejects empty parts array or exceeding 10 parts', () => {
    const base = {
      contact: {
        customerName: 'Carlos Gómez',
        customerEmail: 'carlos@example.com',
        customerPhone: '+34 600 111 222',
      },
      address: {
        line1: 'Avenida de la Aurora 40',
        city: 'Málaga',
        province: 'Málaga',
        postalCode: '29002',
        country: 'ES' as const,
      },
      idempotencyKey: 'idem-test-limits-12345',
    };

    const emptyParts = CheckoutInitSchema.safeParse({ ...base, partIds: [] });
    expect(emptyParts.success).toBe(false);

    const elevenParts = Array.from({ length: 11 }, (_, i) => `00000000-0000-4000-a000-0000000000${i > 9 ? i : '0' + i}`);
    const tooManyParts = CheckoutInitSchema.safeParse({ ...base, partIds: elevenParts });
    expect(tooManyParts.success).toBe(false);
  });
});
