import { describe, expect, it } from 'vitest';
import { evaluateSellerTrust } from '../services/seller-trust.service';
import type { Vendor } from '@mobile-marketplace/core';

describe('Feature 7: Seller Trust, CAT Verification, Warranty, and Returns', () => {
  const baseVendor: Vendor = {
    id: 'vendor-eurodesguace',
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
    contact: {
      publicPhone: '+34 952 000 000',
    },
    policies: {
      warrantyMonths: 12,
      returnDays: 14,
    },
    status: 'ACTIVE',
    createdAt: new Date('2025-01-01'),
    updatedAt: new Date('2026-10-01'),
  };

  it('evaluates a verified CAT seller correctly with verified badge and legal data', () => {
    const trust = evaluateSellerTrust(baseVendor);

    expect(trust.isCatVerified).toBe(true);
    expect(trust.badgeLabel).toBe('Centro CAT verificado');
    expect(trust.badgeTone).toBe('verified');
    expect(trust.catAuthorizationCode).toBe('CAT/AND/MA/0412');
    expect(trust.legalSellerName).toBe('Eurodesguace Málaga S.L.');
    expect(trust.warrantyMonths).toBe(12);
    expect(trust.returnDays).toBe(14);
    expect(trust.requiresLegalReview).toBe(true);
  });

  it('evaluates an unverified seller honestly without fabricating certification', () => {
    const unverifiedVendor: Vendor = {
      ...baseVendor,
      catVerified: false,
    };

    const trust = evaluateSellerTrust(unverifiedVendor);

    expect(trust.isCatVerified).toBe(false);
    expect(trust.badgeLabel).toBe('Centro en proceso de verificación documental');
    expect(trust.badgeTone).toBe('unverified');
  });

  it('handles missing authorization code honestly without assuming certification', () => {
    const missingCodeVendor: Vendor = {
      ...baseVendor,
      catAuthorizationCode: '',
      catVerified: true, // Even if flag was true in DB, missing code must not pass as verified
    };

    const trust = evaluateSellerTrust(missingCodeVendor);

    expect(trust.isCatVerified).toBe(false);
    expect(trust.catAuthorizationCode).toBe('No acreditada');
    expect(trust.badgeTone).toBe('unverified');
  });

  it('includes official legal references to RD 265/2021 and RDLeg 1/2007', () => {
    const trust = evaluateSellerTrust(baseVendor);

    const hasRd265 = trust.officialReferences.some((r) => r.url.includes('rd/2021/04/13/265'));
    const hasConsumerLaw = trust.officialReferences.some((r) =>
      r.url.includes('BOE-A-2007-20555')
    );

    expect(hasRd265).toBe(true);
    expect(hasConsumerLaw).toBe(true);
    expect(trust.legalDisclaimer).toContain('BuscaPiezas 24H actúa como plataforma tecnológica');
  });
});
