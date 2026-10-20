import { describe, expect, it } from 'vitest';
import { evaluateCompatibility } from '../src/domain/entities/compatibility.js';
import { createOEMReference } from '../src/domain/entities/oem-reference.js';
import type { Vehicle } from '../src/domain/entities/vehicle.js';

describe('Compatibility Evaluation Engine', () => {
  const sampleOemRefs = [
    createOEMReference({ raw: '1K0-121-205 AD', isPrimary: true }),
    createOEMReference({ raw: '1K0121205AD', isPrimary: false }),
  ];

  const sampleDonorVehicle: Vehicle = {
    make: 'VOLKSWAGEN',
    model: 'GOLF V (1K1)',
    generation: '1K1',
    yearFrom: 2004,
    yearTo: 2008,
    engineCode: 'BKC',
    fuel: 'DIESEL',
  };

  it('yields EXACT_OEM_MATCH and isGuaranteed=true when OEM references match', () => {
    const signal = evaluateCompatibility({
      partOemReferences: sampleOemRefs,
      partDonorVehicle: sampleDonorVehicle,
      targetOEMReference: '1K0.121.205.AD', // Different format, same normalized OEM
      targetVehicle: {
        make: 'VOLKSWAGEN',
        model: 'GOLF V',
      },
    });

    expect(signal.confidence).toBe('EXACT_OEM_MATCH');
    expect(signal.evidenceSource).toBe('OEM_EXACT_REFERENCE');
    expect(signal.isGuaranteed).toBe(true);
    expect(signal.confidenceScore).toBe(1.0);
    expect(signal.matchedOEM).toBe('1K0121205AD');
  });

  it('yields EXACT_OEM_MATCH with isGuaranteed=FALSE when OEM matches but target vehicle conflicts with donor', () => {
    const signal = evaluateCompatibility({
      partOemReferences: sampleOemRefs,
      partDonorVehicle: sampleDonorVehicle, // Volkswagen Golf V
      targetOEMReference: '1K0121205AD',
      targetVehicle: {
        make: 'FORD', // Conflicting vehicle!
        model: 'FOCUS',
      },
    });

    expect(signal.confidence).toBe('EXACT_OEM_MATCH');
    expect(signal.isGuaranteed).toBe(false); // Flagged because vehicle differs
    expect(signal.confidenceScore).toBeLessThan(1.0);
    expect(signal.evidenceSummary).toContain('difiere de tu vehículo');
  });

  it('yields ATTRIBUTES_MATCH with isGuaranteed=FALSE when only vehicle make and model match without OEM', () => {
    const signal = evaluateCompatibility({
      partOemReferences: [], // No OEM reference known
      partDonorVehicle: sampleDonorVehicle,
      targetOEMReference: undefined,
      targetVehicle: {
        make: 'volkswagen', // Case-insensitive test
        model: 'GOLF V (1K1)',
        year: 2006,
        engineCode: 'BKC',
      },
    });

    expect(signal.confidence).toBe('ATTRIBUTES_MATCH');
    expect(signal.evidenceSource).toBe('DONOR_ATTRIBUTES_ONLY');
    // CRITICAL DOMAIN GUARDRAIL: Never guarantee compatibility based purely on vehicle make/model!
    expect(signal.isGuaranteed).toBe(false);
    expect(signal.confidenceScore).toBeGreaterThan(0.5);
    expect(signal.confidenceScore).toBeLessThan(1.0);
    expect(signal.userAdvice).toContain('la compatibilidad no está garantizada');
  });

  it('degrades to UNKNOWN_PENDING_CONFIRMATION if the target vehicle year is outside donor range', () => {
    const signal = evaluateCompatibility({
      partOemReferences: [],
      partDonorVehicle: sampleDonorVehicle, // 2004 to 2008
      targetVehicle: {
        make: 'VOLKSWAGEN',
        model: 'GOLF V (1K1)',
        year: 2012, // Out of range!
      },
    });

    expect(signal.confidence).toBe('UNKNOWN_PENDING_CONFIRMATION');
    expect(signal.isGuaranteed).toBe(false);
    expect(signal.confidenceScore).toBeLessThanOrEqual(0.2);
    expect(signal.evidenceSummary).toContain('fuera del rango');
  });

  it('returns UNKNOWN_PENDING_CONFIRMATION when no matching signals exist', () => {
    const signal = evaluateCompatibility({
      partOemReferences: sampleOemRefs,
      partDonorVehicle: sampleDonorVehicle,
      targetOEMReference: '999999999', // Completely different OEM
      targetVehicle: {
        make: 'RENAULT',
        model: 'CLIO',
      },
    });

    expect(signal.confidence).toBe('UNKNOWN_PENDING_CONFIRMATION');
    expect(signal.evidenceSource).toBe('UNVERIFIED');
    expect(signal.isGuaranteed).toBe(false);
    expect(signal.confidenceScore).toBe(0.0);
  });

  it('strictly downgrades REFERENCIA_VISUAL match to ATTRIBUTES_MATCH with isGuaranteed=FALSE', () => {
    const visualRef = createOEMReference({
      raw: '5073401000013',
      isPrimary: true,
      referenceType: 'REFERENCIA_VISUAL',
      brandName: 'REFERENCIA_VISUAL',
    });

    const signal = evaluateCompatibility({
      partOemReferences: [visualRef],
      partDonorVehicle: {
        make: 'CITROEN',
        model: 'NEMO',
      },
      targetOEMReference: '5073401000013',
      targetVehicle: {
        make: 'CITROEN',
        model: 'NEMO',
      },
    });

    expect(signal.confidence).toBe('ATTRIBUTES_MATCH');
    expect(signal.isGuaranteed).toBe(false); // CRITICAL: visual ref NEVER guarantees official compatibility
    expect(signal.confidenceScore).toBe(0.5);
    expect(signal.evidenceSummary).toContain('referencia visual del desguace');
    expect(signal.evidenceSummary).toContain('no garantizada como OEM oficial');
    expect(signal.userAdvice).toContain('etiqueta del CAT');
  });
});
