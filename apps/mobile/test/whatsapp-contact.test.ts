import { describe, expect, it, vi } from 'vitest';
import {
  buildWhatsAppInquiryMessage,
  buildWhatsAppUrl,
  normalizePhoneNumberForWhatsApp,
  openWhatsAppContact,
} from '../services/whatsapp-contact.service';

describe('Feature 2: Scrapyard WhatsApp Contact Action', () => {
  describe('normalizePhoneNumberForWhatsApp', () => {
    it('normalizes formatted Spanish numbers with country code', () => {
      expect(normalizePhoneNumberForWhatsApp('+34 952 000 000')).toBe('34952000000');
      expect(normalizePhoneNumberForWhatsApp('+34 (952) 00-00-00')).toBe('34952000000');
    });

    it('adds Spanish 34 prefix to standard 9-digit landlines and mobiles', () => {
      expect(normalizePhoneNumberForWhatsApp('952000000')).toBe('34952000000');
      expect(normalizePhoneNumberForWhatsApp('612345678')).toBe('34612345678');
      expect(normalizePhoneNumberForWhatsApp('712345678')).toBe('34712345678');
    });

    it('rejects invalid or too short telephone strings safely', () => {
      expect(normalizePhoneNumberForWhatsApp('')).toBeNull();
      expect(normalizePhoneNumberForWhatsApp('abc')).toBeNull();
      expect(normalizePhoneNumberForWhatsApp('12345')).toBeNull();
      expect(normalizePhoneNumberForWhatsApp(null)).toBeNull();
    });
  });

  describe('buildWhatsAppInquiryMessage', () => {
    it('generates honest message labelling official OEM references accurately', () => {
      const msg = buildWhatsAppInquiryMessage({
        partTitle: 'Faro Principal Izquierdo',
        priceFormatted: '45,00 €',
        listingId: 'EDM-91010',
        vendorTradeName: 'Eurodesguace Málaga',
        primaryReference: {
          raw: '1K0121205AD',
          isOem: true,
          referenceType: 'OEM_OFFICIAL',
        },
        destinationProvince: 'Madrid',
      });

      expect(msg).toContain('Hola Eurodesguace Málaga');
      expect(msg).toContain('Faro Principal Izquierdo');
      expect(msg).toContain('ref. OEM 1K0121205AD');
      expect(msg).toContain('código EDM-91010');
      expect(msg).toContain('45,00 €');
      expect(msg).toContain('si realizáis envíos a Madrid');
    });

    it('strictly avoids labelling visual references as OEM', () => {
      const msg = buildWhatsAppInquiryMessage({
        partTitle: 'Mando Calefaccion',
        priceFormatted: '35,00 €',
        listingId: 'EDM-5521',
        primaryReference: {
          raw: '91010-VISUAL',
          isOem: false,
          referenceType: 'REFERENCIA_VISUAL',
        },
      });

      // Must never claim it is an official OEM reference
      expect(msg).not.toContain('ref. OEM');
      expect(msg).toContain('código de inventario 91010-VISUAL');
      expect(msg).toContain('¿Podéis confirmar si sigue disponible en estantería?');
    });
  });

  describe('buildWhatsAppUrl', () => {
    it('generates properly encoded wa.me URLs', () => {
      const url = buildWhatsAppUrl('+34 952 000 000', 'Hola Eurodesguace');
      expect(url).toBe('https://wa.me/34952000000?text=Hola%20Eurodesguace');
    });

    it('returns null when phone cannot be normalized', () => {
      const url = buildWhatsAppUrl('invalid-phone', 'Hola');
      expect(url).toBeNull();
    });
  });

  describe('openWhatsAppContact', () => {
    it('invokes mock urlOpener with the encoded WhatsApp URL (native scheme and web fallback)', async () => {
      // 1. Native scheme supported
      const mockOpenerNative = {
        canOpenURL: vi.fn().mockResolvedValue(true),
        openURL: vi.fn().mockResolvedValue(true),
      };

      const successNative = await openWhatsAppContact({
        publicPhone: '+34 952 000 000',
        partTitle: 'Compresor Aire',
        priceFormatted: '60,00 €',
        listingId: 'EDM-101',
        urlOpener: mockOpenerNative,
      });

      expect(successNative).toBe(true);
      expect(mockOpenerNative.openURL).toHaveBeenCalled();
      const calledNativeUrl = mockOpenerNative.openURL.mock.calls[0][0];
      expect(calledNativeUrl).toContain('whatsapp://send?phone=34952000000');

      // 2. Fallback to https://wa.me/ when native scheme is not directly openable
      const mockOpenerWeb = {
        canOpenURL: vi.fn().mockResolvedValue(false),
        openURL: vi.fn().mockResolvedValue(true),
      };

      const successWeb = await openWhatsAppContact({
        publicPhone: '+34 952 000 000',
        partTitle: 'Compresor Aire',
        priceFormatted: '60,00 €',
        listingId: 'EDM-101',
        urlOpener: mockOpenerWeb,
      });

      expect(successWeb).toBe(true);
      expect(mockOpenerWeb.openURL).toHaveBeenCalled();
      const calledWebUrl = mockOpenerWeb.openURL.mock.calls[0][0];
      expect(calledWebUrl).toContain('https://wa.me/34952000000');
    });

    it('triggers onUnavailable fallback when phone is invalid', async () => {
      const onUnavailable = vi.fn();
      const success = await openWhatsAppContact({
        publicPhone: 'invalid-number',
        partTitle: 'Compresor Aire',
        priceFormatted: '60,00 €',
        listingId: 'EDM-101',
        onUnavailable,
      });

      expect(success).toBe(false);
      expect(onUnavailable).toHaveBeenCalledWith('invalid-number');
    });
  });
});
