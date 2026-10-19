import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { isErr, isOk } from '../src/domain/common/result.js';
import {
  AvailabilitySchema,
  PartSchema,
  VendorPoliciesSchema,
  VendorSchema,
} from '../src/validation/schemas.js';
import { validateCanonicalPart } from '../src/validation/normalizers.js';

describe('Validation and Error Reporting', () => {
  it('validates a valid canonical part candidate successfully', () => {
    const validCandidate = {
      id: randomUUID(),
      vendorId: 'vendor_cat_123',
      source: {
        providerId: 'provider_alpha',
        externalPartId: 'EXT-101',
        lastSeenAt: new Date(),
      },
      title: 'Alternador 140A Bosch',
      categoryId: 'ELECTRICIDAD_ALTERNADOR',
      price: { amountInCents: 12000, currency: 'EUR' },
      condition: 'GOOD',
      testedStatus: 'TESTED_WORKING',
      availability: {
        status: 'AVAILABLE',
        stockQuantity: 1,
        lastCheckedAt: new Date(),
      },
      donorVehicle: {
        make: 'SEAT',
        model: 'IBIZA',
        yearFrom: 2010,
        yearTo: 2015,
      },
      oemReferences: [{ raw: '0281002500', isPrimary: true }],
      images: [
        {
          id: 'img_1',
          url: 'https://example.test/img1.webp',
          sortOrder: 0,
          isPrimary: true,
        },
      ],
      warrantyMonths: 12,
      lastSyncedAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const result = validateCanonicalPart(validCandidate, 'provider_alpha', 'EXT-101');
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result.data.title).toBe('Alternador 140A Bosch');
      expect(result.data.price.amountInCents).toBe(12000);
      expect(result.data.oemReferences[0]?.normalized).toBe('0281002500');
    }
  });

  it('returns structured NormalizationError when required fields are missing or invalid', () => {
    const invalidCandidate = {
      id: 'not-a-uuid',
      vendorId: '',
      source: {
        providerId: '',
        externalPartId: '',
      },
      title: 'A', // Too short
      categoryId: '',
      price: { amountInCents: -500, currency: 'EUR' }, // Negative price!
      condition: 'INVALID_CONDITION',
      testedStatus: 'TESTED_WORKING',
      availability: {
        status: 'INVALID_STATUS',
        stockQuantity: -1,
      },
      oemReferences: [],
      images: [{ id: '1', url: 'invalid-url', isPrimary: true, sortOrder: 0 }],
      warrantyMonths: -1,
    };

    const result = validateCanonicalPart(invalidCandidate, 'provider_alpha', 'INVALID-EXT');
    expect(isErr(result)).toBe(true);
    if (isErr(result)) {
      expect(result.error.providerId).toBe('provider_alpha');
      expect(result.error.externalPartId).toBe('INVALID-EXT');
      expect(result.error.issues.length).toBeGreaterThan(0);

      const paths = result.error.issues.map((i) => i.path);
      expect(paths).toContain('id');
      expect(paths).toContain('title');
      expect(paths).toContain('price.amountInCents');
      expect(paths).toContain('images.0.url');
    }
  });

  it('enforces Spanish regulatory constraints on Vendor entities (RD 265/2021 & Consumer Law)', () => {
    // Fails because warranty is under 12 months (statutory minimum for second-hand commercial sales)
    expect(() =>
      VendorPoliciesSchema.parse({
        warrantyMonths: 6, // Under legal 12 months minimum
        returnDays: 14,
      })
    ).toThrow();

    // Valid vendor policy
    const validPolicy = VendorPoliciesSchema.parse({
      warrantyMonths: 12,
      returnDays: 14,
    });
    expect(validPolicy.warrantyMonths).toBe(12);

    // Postal code must be exactly 5 digits for Spanish addresses
    expect(() =>
      VendorSchema.parse({
        id: 'v_1',
        legalName: 'Desguaces Madrid SL',
        tradeName: 'Desguaces Madrid',
        catAuthorizationCode: 'CAT/MD/999',
        location: {
          city: 'Madrid',
          province: 'Madrid',
          postalCode: '2800', // Invalid: only 4 digits
          country: 'ES',
        },
        contact: {},
        policies: validPolicy,
      })
    ).toThrow();
  });
});
