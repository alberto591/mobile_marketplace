import { describe, expect, it } from 'vitest';
import * as core from '../src/domain/entities/shipping.js';
import * as edge from '../../../supabase/functions/_shared/shipping.js';
import { normalizeEurodesguacePart } from '../../../supabase/functions/_shared/eurodesguace-normalize.js';

const kg = (n: number) => Math.round(n * 1000);

describe('Shipping rates (Euro Desguace table)', () => {
  it('resolves the zone from the Spanish postal code', () => {
    expect(core.resolveShippingZone('29004')).toBe('PENINSULA');
    expect(core.resolveShippingZone('01001')).toBe('PENINSULA');
    expect(core.resolveShippingZone('50999')).toBe('PENINSULA');
    expect(core.resolveShippingZone('07001')).toBe('BALEARES');
    expect(core.resolveShippingZone('35001')).toBe('CANARIAS');
    expect(core.resolveShippingZone('38670')).toBe('CANARIAS');
    expect(core.resolveShippingZone('51001')).toBe('CEUTA');
    expect(core.resolveShippingZone('52001')).toBe('MELILLA');
    for (const bad of ['00123', '53000', '75011', '2900', '290044', '1000-001', '', null, undefined]) {
      expect(core.resolveShippingZone(bad)).toBeNull();
    }
  });

  it('prices each weight bracket for Península, limits included', () => {
    const cases: [number, number][] = [
      [0.3, 1000], [10, 1000], [10.01, 2000], [40, 2000], [40.01, 3500], [80, 3500],
      [80.01, 4000], [100, 4000], [100.01, 5000], [125, 5000], [125.01, 5500], [150, 5500],
      [150.01, 6000], [175, 6000], [175.01, 7000], [200, 7000], [200.01, 8000], [250, 8000],
    ];
    for (const [weightKg, cents] of cases) {
      expect(core.quoteShipping('29004', [kg(weightKg)])).toMatchObject({ ok: true, zone: 'PENINSULA', shippingCents: cents });
    }
  });

  it('prices Baleares with its own column', () => {
    const expected = [2500, 4000, 6300, 7500, 8500, 9500, 11000, 13500, 17000];
    [5, 30, 60, 90, 110, 140, 160, 190, 240].forEach((weightKg, i) => {
      expect(core.quoteShipping('07001', [kg(weightKg)])).toMatchObject({ ok: true, zone: 'BALEARES', shippingCents: expected[i] });
    });
  });

  it('uses one bracket for the total weight of the order', () => {
    // 5 kg + 8 kg = 13 kg -> second bracket (20 EUR), not 10 + 10.
    expect(core.quoteShipping('28001', [kg(5), kg(8)])).toEqual({
      ok: true,
      zone: 'PENINSULA',
      totalWeightGrams: 13_000,
      shippingCents: 2000,
    });
  });

  it('gives no automatic price outside the table', () => {
    expect(core.quoteShipping('35001', [kg(5)])).toEqual({ ok: false, reason: 'ZONE_NOT_SERVED', zone: 'CANARIAS' });
    expect(core.quoteShipping('51001', [kg(5)])).toMatchObject({ ok: false, reason: 'ZONE_NOT_SERVED' });
    expect(core.quoteShipping('52001', [kg(5)])).toMatchObject({ ok: false, reason: 'ZONE_NOT_SERVED' });
    expect(core.quoteShipping('75011', [kg(5)])).toEqual({ ok: false, reason: 'INVALID_POSTAL_CODE' });
    expect(core.quoteShipping('29004', [kg(5), null])).toMatchObject({ ok: false, reason: 'WEIGHT_UNKNOWN' });
    expect(core.quoteShipping('29004', [kg(5), undefined])).toMatchObject({ ok: false, reason: 'WEIGHT_UNKNOWN' });
    expect(core.quoteShipping('29004', [0])).toMatchObject({ ok: false, reason: 'WEIGHT_UNKNOWN' });
    expect(core.quoteShipping('29004', [kg(250.01)])).toMatchObject({ ok: false, reason: 'OVER_MAX_WEIGHT' });
    expect(core.quoteShipping('29004', [kg(160), kg(160)])).toMatchObject({ ok: false, reason: 'OVER_MAX_WEIGHT' });
    expect(core.quoteShipping('29004', [])).toMatchObject({ ok: false, reason: 'NO_ITEMS' });
  });

  it('explains every failure to the buyer in Spanish', () => {
    expect(core.shippingFailureMessage({ ok: false, reason: 'ZONE_NOT_SERVED', zone: 'CANARIAS' })).toContain('Canarias');
    expect(core.shippingFailureMessage({ ok: false, reason: 'WEIGHT_UNKNOWN' })).toContain('peso');
    expect(core.shippingFailureMessage({ ok: false, reason: 'OVER_MAX_WEIGHT' })).toContain('250 kg');
  });

  it('reads the provider weight in kilograms', () => {
    expect(core.parseWeightKgToGrams(5)).toBe(5000);
    expect(core.parseWeightKgToGrams(0.75)).toBe(750);
    expect(core.parseWeightKgToGrams('1,2')).toBe(1200);
    expect(core.parseWeightKgToGrams('160')).toBe(160_000);
    for (const bad of [0, -1, '', 'abc', null, undefined, 5000, Number.NaN]) {
      expect(core.parseWeightKgToGrams(bad)).toBeNull();
    }
  });

  it('keeps the weight when normalizing a provider part', () => {
    const base = { refid: 'R1', articulo: 'Alternador', precio: '42,95' };
    expect(normalizeEurodesguacePart({ ...base, peso: 7.5 })?.weightGrams).toBe(7500);
    expect(normalizeEurodesguacePart({ ...base, peso: '0' })?.weightGrams).toBeNull();
    expect(normalizeEurodesguacePart(base)?.weightGrams).toBeNull();
  });

  it('the Edge Function copy gives the same results as the app', () => {
    expect(edge.SHIPPING_BRACKET_LIMITS_GRAMS).toEqual(core.SHIPPING_BRACKET_LIMITS_GRAMS);
    expect(edge.SHIPPING_RATES_CENTS).toEqual(core.SHIPPING_RATES_CENTS);
    const postalCodes = ['29004', '07001', '35001', '51001', '52001', '00001', '99999', 'x', ''];
    const weightSets = [[], [1], [kg(10)], [kg(10) + 1], [kg(95)], [kg(250)], [kg(250) + 1], [kg(5), null], [kg(120), kg(120)]];
    for (const cp of postalCodes) {
      for (const weights of weightSets) {
        expect(edge.quoteShipping(cp, weights)).toEqual(core.quoteShipping(cp, weights));
      }
    }
  });
});

describe('VAT', () => {
  it('adds 21 % to parts plus shipping, as in the scrapyard quotes', () => {
    // Their reference case: 32,95 part + 10,00 shipping -> 9,02 VAT -> 51,97 total.
    expect(core.vatCents(3295 + 1000)).toBe(902);
    expect(3295 + 1000 + core.vatCents(3295 + 1000)).toBe(5197);
    expect(core.vatCents(0)).toBe(0);
    expect(edge.vatCents(4295)).toBe(core.vatCents(4295));
  });
});
