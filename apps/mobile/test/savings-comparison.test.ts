import { describe, expect, it } from 'vitest';
import {
  calculateSavingsAndImpact,
  estimateAdemeEnvironmentalImpact,
  findCuratedComparableNewPrice,
  SECTOR_SAVINGS_BENCHMARK,
  type ComparableNewPriceSource,
  type EnvironmentalImpactEstimate,
} from '../services/savings-comparison.service';

describe('Feature 6: Transparent Savings and Circular Economy Information', () => {
  const verifiedPvp: ComparableNewPriceSource = {
    priceCents: 12000, // 120.00 EUR
    currency: 'EUR',
    sourceName: 'PVP Tarifa Oficial Recambios Originales',
    sourceDate: '2026-09-15',
    isVerified: true,
  };

  it('calculates correct absolute and percentage savings when verified comparable price is greater', () => {
    const usedPriceCents = 4500; // 45.00 EUR (Ahorro: 75.00 EUR -> 62.5% -> round 63%)
    const result = calculateSavingsAndImpact(usedPriceCents, verifiedPvp);

    expect(result.hasValidComparison).toBe(true);
    expect(result.comparableNewPriceCents).toBe(12000);
    expect(result.absoluteSavingsCents).toBe(7500);
    expect(result.percentageSavings).toBe(63);
    expect(result.explanation).toContain('Ahorro del 63%');
  });

  it('suppresses savings comparison when comparable new price is missing', () => {
    const result = calculateSavingsAndImpact(4500, undefined);

    expect(result.hasValidComparison).toBe(false);
    expect(result.absoluteSavingsCents).toBeUndefined();
    expect(result.percentageSavings).toBeUndefined();
    expect(result.explanation).toContain('No se dispone de un PVP verificado');
    expect(result.sectorBenchmark.rangeText).toBe('50% - 70%');
  });

  it('suppresses savings comparison when comparable new price is unverified', () => {
    const unverifiedPvp: ComparableNewPriceSource = {
      ...verifiedPvp,
      isVerified: false,
    };

    const result = calculateSavingsAndImpact(4500, unverifiedPvp);
    expect(result.hasValidComparison).toBe(false);
  });

  it('suppresses savings comparison when used price is equal or higher than comparable price (zero or negative savings)', () => {
    // Equal price
    const equalRes = calculateSavingsAndImpact(12000, verifiedPvp);
    expect(equalRes.hasValidComparison).toBe(false);

    // Used price higher than comparable
    const higherRes = calculateSavingsAndImpact(15000, verifiedPvp);
    expect(higherRes.hasValidComparison).toBe(false);
  });

  it('suppresses numerical CO2 figures when environmental data is missing or unverified', () => {
    // Missing environmental estimate
    const resNoEnv = calculateSavingsAndImpact(5000, verifiedPvp, undefined);
    expect(resNoEnv.environmental.hasNumericCo2).toBe(false);
    expect(resNoEnv.environmental.numericCo2Text).toBeUndefined();
    expect(resNoEnv.environmental.circularMessage).toContain('RD 265/2021');
    expect(resNoEnv.environmental.transparencyNote).toContain('no publicamos cifras genéricas de CO₂');

    // Unverified estimate
    const unverifiedEnv: EnvironmentalImpactEstimate = {
      co2AvoidedKg: 14.5,
      methodologySource: 'Estimación no verificada',
      isVerified: false,
    };
    const resUnverified = calculateSavingsAndImpact(5000, verifiedPvp, unverifiedEnv);
    expect(resUnverified.environmental.hasNumericCo2).toBe(false);
    expect(resUnverified.environmental.numericCo2Text).toBeUndefined();
  });

  it('displays numerical CO2 figures when backed by verified methodology', () => {
    const verifiedEnv: EnvironmentalImpactEstimate = {
      co2AvoidedKg: 8.2,
      methodologySource: 'Análisis de ciclo de vida ACV-2026',
      isVerified: true,
    };

    const result = calculateSavingsAndImpact(5000, verifiedPvp, verifiedEnv);
    expect(result.environmental.hasNumericCo2).toBe(true);
    expect(result.environmental.numericCo2Text).toBe('8.2 kg CO₂ evitados (Análisis de ciclo de vida ACV-2026)');
    expect(result.environmental.transparencyNote).toContain('ciclo de vida certificado');
  });

  it('estimates environmental impact using ADEME open methodology by part category', () => {
    // Climatización
    const clima = estimateAdemeEnvironmentalImpact('CLIMATIZACIÓN', 'MANDO CALEFACCION');
    expect(clima.isVerified).toBe(true);
    expect(clima.co2AvoidedKg).toBe(11.5);
    expect(clima.methodologySource).toContain('ADEME');

    // Alumbrado
    const faro = estimateAdemeEnvironmentalImpact('ALUMBRADO', 'FARO DELANTERO DERECHO');
    expect(faro.co2AvoidedKg).toBe(8.0);

    // Default / desconocido
    const unknown = estimateAdemeEnvironmentalImpact('ACCESORIOS_VARIOS', 'TORNILLO');
    expect(unknown.co2AvoidedKg).toBe(7.5);

    // Passed into calculateSavingsAndImpact
    const res = calculateSavingsAndImpact(3000, verifiedPvp, clima);
    expect(res.environmental.hasNumericCo2).toBe(true);
    expect(res.environmental.numericCo2Text).toContain('11.5 kg CO₂ eq evitados');
    expect(res.environmental.transparencyNote).toContain('ADEME');
  });

  it('finds curated verified dealer prices for catalogued parts and returns undefined for unknown', () => {
    // Known part in Staging catalogue (Mando calefacción 91010)
    const pvp91010 = findCuratedComparableNewPrice({ partId: '91010', title: 'CALEFACCION' });
    expect(pvp91010).toBeDefined();
    expect(pvp91010?.priceCents).toBe(24500);
    expect(pvp91010?.sourceName).toContain('Stellantis');

    // Unknown part
    const unknown = findCuratedComparableNewPrice({ partId: 'nonexistent-id-9999' });
    expect(unknown).toBeUndefined();
  });
});
