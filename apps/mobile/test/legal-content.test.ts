import { describe, expect, it } from 'vitest';
import {
  LEGAL_DOCUMENTS,
  PENDING,
  PLATFORM_TERMS,
  buildLegalDocuments,
  findLegalDocument,
  hasPendingOperatorData,
} from '../content/legal';

const allText = (doc: (typeof LEGAL_DOCUMENTS)[number]) =>
  doc.sections
    .flatMap((s) => [s.heading, ...(s.paragraphs ?? []), ...(s.bullets ?? []), ...(s.after ?? [])])
    .join('\n');

describe('Legal texts', () => {
  it('publishes the four documents at stable addresses', () => {
    expect(LEGAL_DOCUMENTS.map((d) => d.slug)).toEqual(['aviso-legal', 'privacidad', 'condiciones', 'devoluciones']);
    expect(findLegalDocument('devoluciones')?.title).toBe('Política de devoluciones y garantía');
    expect(findLegalDocument('nope')).toBeUndefined();
    for (const doc of LEGAL_DOCUMENTS) {
      expect(doc.sections.length).toBeGreaterThan(3);
      for (const section of doc.sections) {
        expect((section.paragraphs?.length ?? 0) + (section.bullets?.length ?? 0)).toBeGreaterThan(0);
      }
    }
  });

  it('never goes below the legal minimums for consumers', () => {
    expect(PLATFORM_TERMS.withdrawalDays).toBeGreaterThanOrEqual(14);
    expect(PLATFORM_TERMS.refundDays).toBeLessThanOrEqual(14);
    expect(PLATFORM_TERMS.warrantyMonths).toBeGreaterThanOrEqual(12);
    const returns = allText(findLegalDocument('devoluciones')!);
    expect(returns).toContain('14 días naturales');
    expect(returns).toContain('12 meses');
    expect(returns).toContain('Anexo I-B TRLGDCU');
    expect(returns).toContain('última pieza');
    expect(returns).toContain('Durante el primer año desde la entrega');
  });

  it('includes mandatory EU/Spanish marketplace disclosures (DSA, Omnibus, RGPD)', () => {
    const notice = allText(findLegalDocument('aviso-legal')!);
    expect(notice).toContain('2022/2065');
    expect(notice).toContain('punto de contacto único');

    const privacy = allText(findLegalDocument('privacidad')!);
    expect(privacy).toContain('matrícula');
    expect(privacy).toContain('VIN');
    expect(privacy).toContain('art. 32 de la LOPDGDD');
    expect(privacy).toContain('WhatsApp');

    const terms = allText(findLegalDocument('condiciones')!);
    expect(terms).toContain('art. 97 bis TRLGDCU');
    expect(terms).toContain('Ley 7/2017');
    expect(terms).toContain('Para reparar / Despiece');
    expect(terms).toContain('con el IVA incluido');
  });

  it('marks missing operator details and fills them in when provided', () => {
    expect(hasPendingOperatorData()).toBe(true);
    expect(allText(findLegalDocument('aviso-legal')!)).toContain(PENDING);

    const operator = {
      brand: 'BuscaPiezas 24H',
      legalName: 'Ejemplo Recambios S.L.',
      taxId: 'B00000000',
      address: 'Calle Ejemplo 1, 29000 Málaga',
      email: 'hola@example.com',
      phone: '+34 600 000 000',
      registry: null,
    };
    expect(hasPendingOperatorData(operator)).toBe(false);
    const filled = buildLegalDocuments(operator).map(allText).join('\n');
    expect(filled).not.toContain(PENDING);
    expect(filled).toContain('Ejemplo Recambios S.L.');
    expect(filled).toContain('hola@example.com');
  });
});
