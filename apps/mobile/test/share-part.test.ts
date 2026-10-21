import { describe, expect, it, vi } from 'vitest';
import {
  buildSharePartMessage,
  sharePartNative,
} from '../services/share-part.service';

describe('Feature 3: Share Part with Mechanic or Customer', () => {
  it('generates honest share message with OEM reference, seller, and price', () => {
    const payload = buildSharePartMessage({
      partId: 'part-1234-uuid',
      externalPartId: 'EDM-7701',
      partTitle: 'Alternador 120A',
      priceFormatted: '85,00 €',
      vendorTradeName: 'Eurodesguace Málaga',
      primaryReference: {
        raw: '0281002500',
        isOem: true,
        referenceType: 'OEM_OFFICIAL',
      },
    });

    expect(payload.title).toBe('Recambio: Alternador 120A (85,00 €)');
    expect(payload.message).toContain('BuscaPiezas 24H');
    expect(payload.message).toContain('Alternador 120A');
    expect(payload.message).toContain('85,00 €');
    expect(payload.message).toContain('Eurodesguace Málaga');
    expect(payload.message).toContain('• Referencia OEM: 0281002500');
    expect(payload.message).toContain('Ref. localizador: EDM-7701');
    expect(payload.message).toContain('recambios://part/part-1234-uuid');
  });

  it('accurately identifies visual references without claiming they are OEM', () => {
    const payload = buildSharePartMessage({
      partId: 'part-5555',
      partTitle: 'Paragolpes Delantero',
      priceFormatted: '90,00 €',
      vendorTradeName: 'Desguaces Levante',
      primaryReference: {
        raw: 'VISUAL-BUMPER-01',
        isOem: false,
        referenceType: 'REFERENCIA_VISUAL',
      },
    });

    expect(payload.message).not.toContain('Referencia OEM:');
    expect(payload.message).toContain('• Código de inventario CAT: VISUAL-BUMPER-01 (lectura visual)');
  });

  it('incorporates verified webBaseUrl when available', () => {
    const payload = buildSharePartMessage({
      partId: 'part-999',
      partTitle: 'Caja Cambios',
      priceFormatted: '250,00 €',
      vendorTradeName: 'Eurodesguace',
      webBaseUrl: 'https://buscapiezas24h.es',
    });

    expect(payload.message).toContain('Enlace: https://buscapiezas24h.es/part/part-999');
    expect(payload.url).toBe('https://buscapiezas24h.es/part/part-999');
  });

  it('invokes native Share handler and returns shared on success', async () => {
    const mockHandler = {
      share: vi.fn().mockResolvedValue({ action: 'sharedAction' as const }),
    };

    const result = await sharePartNative(
      {
        partId: 'part-1',
        partTitle: 'Faro',
        priceFormatted: '40,00 €',
        vendorTradeName: 'Eurodesguace',
      },
      mockHandler
    );

    expect(result).toBe('shared');
    expect(mockHandler.share).toHaveBeenCalled();
  });

  it('handles user cancellation/dismissal gracefully without error', async () => {
    const mockHandler = {
      share: vi.fn().mockResolvedValue({ action: 'dismissedAction' as const }),
    };

    const result = await sharePartNative(
      {
        partId: 'part-1',
        partTitle: 'Faro',
        priceFormatted: '40,00 €',
        vendorTradeName: 'Eurodesguace',
      },
      mockHandler
    );

    expect(result).toBe('dismissed');
  });
});
