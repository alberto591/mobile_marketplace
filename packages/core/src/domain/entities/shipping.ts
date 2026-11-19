/**
 * Shipping price by total order weight and destination zone.
 *
 * Source: Euro Desguace Málaga's "TABLA PORTES GENERAL" (6 Oct 2026), the same table their
 * own quoting system uses:
 *   - One bracket for the TOTAL weight of the order (sum of all parts).
 *   - Zone from the Spanish postal code: 07 Baleares, 35/38 Canarias, 51 Ceuta, 52 Melilla,
 *     01-50 Península.
 *   - Península and Baleares are priced. Canarias, Ceuta and Melilla are not shipped.
 *   - Over 250 kg, or any part without a known weight: no automatic price.
 *   - Amounts are NET: 21 % VAT is added on top (10 EUR -> 12,10 EUR).
 *
 * supabase/functions/_shared/shipping.ts is a copy of this file for the Edge Functions
 * (they cannot import this package). A test checks both give the same results.
 */

export type ShippingZone = 'PENINSULA' | 'BALEARES' | 'CANARIAS' | 'CEUTA' | 'MELILLA';

export type ShippingQuoteFailure =
  | 'INVALID_POSTAL_CODE'
  | 'ZONE_NOT_SERVED'
  | 'WEIGHT_UNKNOWN'
  | 'OVER_MAX_WEIGHT'
  | 'NO_ITEMS';

export type ShippingQuote =
  | {
      readonly ok: true;
      readonly zone: ShippingZone;
      readonly totalWeightGrams: number;
      /** Net amount in integer cents (before VAT). */
      readonly shippingCents: number;
    }
  | {
      readonly ok: false;
      readonly reason: ShippingQuoteFailure;
      readonly zone?: ShippingZone;
    };

/** Upper limit of each bracket, in grams (10, 40, 80, 100, 125, 150, 175, 200, 250 kg). */
export const SHIPPING_BRACKET_LIMITS_GRAMS: readonly number[] = [
  10_000, 40_000, 80_000, 100_000, 125_000, 150_000, 175_000, 200_000, 250_000,
];

/** Net price of each bracket in cents, per priced zone. */
export const SHIPPING_RATES_CENTS: Readonly<Partial<Record<ShippingZone, readonly number[]>>> = {
  PENINSULA: [1000, 2000, 3500, 4000, 5000, 5500, 6000, 7000, 8000],
  BALEARES: [2500, 4000, 6300, 7500, 8500, 9500, 11000, 13500, 17000],
};

export const SHIPPING_MAX_WEIGHT_GRAMS = 250_000;

/**
 * Catalog prices and shipping rates are net. As in the scrapyard's own quotes:
 *   total = (parts + shipping) x 1,21
 */
export const VAT_PERCENT = 21;

/** VAT on a net amount (parts + shipping), in integer cents (half up). */
export function vatCents(netCents: number): number {
  return Math.round((netCents * VAT_PERCENT) / 100);
}

/** Zone of a Spanish postal code (exactly five digits), or null when it is not one. */
export function resolveShippingZone(postalCode: string | null | undefined): ShippingZone | null {
  const cp = String(postalCode ?? '').trim();
  if (!/^\d{5}$/.test(cp)) return null;

  const province = Number(cp.slice(0, 2));
  if (province === 7) return 'BALEARES';
  if (province === 35 || province === 38) return 'CANARIAS';
  if (province === 51) return 'CEUTA';
  if (province === 52) return 'MELILLA';
  if (province >= 1 && province <= 50) return 'PENINSULA';
  return null;
}

/**
 * @param weightsGrams weight of each part in the order; null/undefined = unknown.
 */
export function quoteShipping(
  postalCode: string | null | undefined,
  weightsGrams: readonly (number | null | undefined)[]
): ShippingQuote {
  const zone = resolveShippingZone(postalCode);
  if (!zone) return { ok: false, reason: 'INVALID_POSTAL_CODE' };

  const rates = SHIPPING_RATES_CENTS[zone];
  if (!rates) return { ok: false, reason: 'ZONE_NOT_SERVED', zone };

  if (weightsGrams.length === 0) return { ok: false, reason: 'NO_ITEMS', zone };

  let totalWeightGrams = 0;
  for (const weight of weightsGrams) {
    if (typeof weight !== 'number' || !Number.isFinite(weight) || weight <= 0) {
      return { ok: false, reason: 'WEIGHT_UNKNOWN', zone };
    }
    totalWeightGrams += Math.round(weight);
  }

  if (totalWeightGrams > SHIPPING_MAX_WEIGHT_GRAMS) return { ok: false, reason: 'OVER_MAX_WEIGHT', zone };

  for (let i = 0; i < SHIPPING_BRACKET_LIMITS_GRAMS.length; i++) {
    const limit = SHIPPING_BRACKET_LIMITS_GRAMS[i];
    const shippingCents = rates[i];
    if (limit !== undefined && shippingCents !== undefined && totalWeightGrams <= limit) {
      return { ok: true, zone, totalWeightGrams, shippingCents };
    }
  }
  return { ok: false, reason: 'OVER_MAX_WEIGHT', zone };
}

/** Provider weight in kilograms ("5", 0.75, "1,2") to integer grams; null when unusable. */
export function parseWeightKgToGrams(raw: unknown): number | null {
  if (raw === null || raw === undefined) return null;
  const value = typeof raw === 'number' ? raw : Number(String(raw).trim().replace(',', '.'));
  if (!Number.isFinite(value) || value <= 0 || value > 2000) return null;
  const grams = Math.round(value * 1000);
  return grams > 0 ? grams : null;
}

const ZONE_LABEL: Record<ShippingZone, string> = {
  PENINSULA: 'Península',
  BALEARES: 'Baleares',
  CANARIAS: 'Canarias',
  CEUTA: 'Ceuta',
  MELILLA: 'Melilla',
};

export function shippingZoneLabel(zone: ShippingZone): string {
  return ZONE_LABEL[zone];
}

/** Message for the buyer when shipping cannot be priced automatically. */
export function shippingFailureMessage(quote: Extract<ShippingQuote, { ok: false }>): string {
  switch (quote.reason) {
    case 'INVALID_POSTAL_CODE':
      return 'El código postal no es válido. Debe ser un código postal español de 5 cifras.';
    case 'ZONE_NOT_SERVED':
      return `De momento no hacemos envíos a ${quote.zone ? ZONE_LABEL[quote.zone] : 'esa zona'}. Envía una consulta al desguace y te dirán si es posible.`;
    case 'WEIGHT_UNKNOWN':
      return 'No podemos calcular el envío de alguna pieza porque no tenemos su peso. Envía una consulta al desguace para que te confirme los portes.';
    case 'OVER_MAX_WEIGHT':
      return 'El pedido supera los 250 kg y el envío no se puede calcular automáticamente. Envía una consulta al desguace para que te confirme los portes.';
    default:
      return 'No hay piezas para calcular el envío.';
  }
}
