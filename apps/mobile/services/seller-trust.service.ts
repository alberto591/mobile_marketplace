import type { Vendor } from '@mobile-marketplace/core';

export interface SellerTrustEvaluation {
  readonly isCatVerified: boolean;
  readonly badgeLabel: string;
  readonly badgeTone: 'verified' | 'unverified';
  readonly legalSellerName: string;
  readonly tradeName: string;
  readonly catAuthorizationCode: string;
  readonly warrantyMonths: number;
  readonly returnDays: number;
  readonly requiresLegalReview: boolean;
  readonly legalDisclaimer: string;
  readonly officialReferences: readonly {
    readonly title: string;
    readonly url: string;
    readonly description: string;
  }[];
}

/**
 * Pure evaluation service for seller legal verification, warranty compliance,
 * and consumer protection disclosures according to Spanish legislation.
 */
export function evaluateSellerTrust(vendor: Vendor): SellerTrustEvaluation {
  const isCatVerified = Boolean(vendor.catVerified && vendor.catAuthorizationCode?.trim());

  const badgeLabel = isCatVerified
    ? 'Centro CAT verificado'
    : 'Centro en proceso de verificación documental';

  const badgeTone: 'verified' | 'unverified' = isCatVerified ? 'verified' : 'unverified';

  const catAuthorizationCode = vendor.catAuthorizationCode?.trim() || 'No acreditada';

  const legalDisclaimer =
    'Información precontractual: BuscaPiezas 24H actúa como plataforma tecnológica. El contrato de compraventa y la responsabilidad legal sobre el estado de la pieza y la garantía corresponden al desguace vendedor identificado. Las condiciones comerciales definitivas deben revisarse en el modelo de vendedor registrado del marketplace.';

  const officialReferences = Object.freeze([
    {
      title: 'Real Decreto 265/2021 (Gestión de VFU y Centros CAT)',
      url: 'https://www.boe.es/eli/es/rd/2021/04/13/265',
      description: 'Regula los Centros Autorizados de Tratamiento y la reutilización legal de recambios recuperados.',
    },
    {
      title: 'Texto Refundido Ley Consumidores y Usuarios (RDLeg 1/2007)',
      url: 'https://www.boe.es/buscar/act.php?id=BOE-A-2007-20555',
      description: 'Garantía legal mínima de 1 año pactada para bienes de segunda mano y 14 días naturales de desistimiento en compra a distancia.',
    },
    {
      title: 'Guía oficial de Garantías en compras de consumo',
      url: 'https://portal-cec.consumo.gob.es/es/informacion-general/compras-online/garantias',
      description: 'Información oficial del Centro Europeo del Consumidor sobre derechos de garantía y reparación.',
    },
    {
      title: 'Guía oficial sobre Devoluciones y Desistimiento',
      url: 'https://portal-cec.consumo.gob.es/es/informacion-general/compras-online/devoluciones',
      description: 'Condiciones de devolución y excepciones aplicables en compras telemáticas.',
    },
  ]);

  return Object.freeze({
    isCatVerified,
    badgeLabel,
    badgeTone,
    legalSellerName: vendor.legalName || 'Razón social no especificada',
    tradeName: vendor.tradeName || vendor.legalName,
    catAuthorizationCode,
    warrantyMonths: vendor.policies?.warrantyMonths ?? 12,
    returnDays: vendor.policies?.returnDays ?? 14,
    requiresLegalReview: true,
    legalDisclaimer,
    officialReferences,
  });
}
