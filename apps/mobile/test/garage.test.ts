import { describe, expect, it } from 'vitest';
import {
  deserializeSavedVehicle,
  GarageStorageService,
  serializeSavedVehicle,
  type SavedVehicle,
} from '../services/garage.service';
import { MemoryCartStorage } from '../services/cart-storage';
import { evaluateCompatibility, type OEMReference, type Vehicle } from '@mobile-marketplace/core';

describe('Feature 5: Mi Garaje - Persistent Vehicle Selection and Compatibility', () => {
  it('deserializes null, empty, or malformed strings safely without throwing', () => {
    expect(deserializeSavedVehicle(null)).toBeNull();
    expect(deserializeSavedVehicle('')).toBeNull();
    expect(deserializeSavedVehicle('   ')).toBeNull();
    expect(deserializeSavedVehicle('{ invalid json')).toBeNull();
    expect(deserializeSavedVehicle(JSON.stringify({}))).toBeNull();
    expect(deserializeSavedVehicle(JSON.stringify({ make: 'SEAT' }))).toBeNull(); // Missing model
  });

  it('deserializes a complete, valid saved vehicle with type safety', () => {
    const raw = JSON.stringify({
      make: ' VOLKSWAGEN ',
      model: ' Golf V ',
      year: 2007,
      engineCode: ' BKD ',
      fuel: ' DIESEL ',
    });

    const parsed = deserializeSavedVehicle(raw);
    expect(parsed).toEqual({
      make: 'VOLKSWAGEN',
      model: 'Golf V',
      year: 2007,
      engineCode: 'BKD',
      fuel: 'DIESEL',
    });
  });

  it('serializes saved vehicles and handles null deletion', () => {
    const vehicle: SavedVehicle = {
      make: 'SEAT',
      model: 'Leon',
      year: 2012,
    };

    const serialized = serializeSavedVehicle(vehicle);
    expect(JSON.parse(serialized)).toEqual({
      make: 'SEAT',
      model: 'Leon',
      year: 2012,
    });

    expect(serializeSavedVehicle(null)).toBe('');
  });

  it('persists, updates, and clears vehicle in storage safely', async () => {
    const memory = new MemoryCartStorage();
    const service = new GarageStorageService(memory);

    // Initial state is null
    const initial = await service.loadVehicle();
    expect(initial).toBeNull();

    // Save vehicle
    const vehicle: SavedVehicle = { make: 'CITROEN', model: 'C3', year: 2005 };
    await service.saveVehicle(vehicle);

    const loaded = await service.loadVehicle();
    expect(loaded).toEqual(vehicle);

    // Clear vehicle
    await service.saveVehicle(null);
    const cleared = await service.loadVehicle();
    expect(cleared).toBeNull();
  });

  it('handles faulty storage operations gracefully without crashing', async () => {
    const faultyStorage = {
      getItem: async () => {
        throw new Error('Disk read failure');
      },
      setItem: async () => {
        throw new Error('Disk write failure');
      },
      removeItem: async () => {
        throw new Error('Disk delete failure');
      },
    };

    const service = new GarageStorageService(faultyStorage);
    const loaded = await service.loadVehicle();
    expect(loaded).toBeNull();

    await expect(service.saveVehicle({ make: 'AUDI', model: 'A3' })).resolves.not.toThrow();
  });

  describe('Compatibility evaluation guardrails with saved vehicle', () => {
    const donorVehicle: Vehicle = {
      make: 'VOLKSWAGEN',
      model: 'Golf V (1K1)',
      yearFrom: 2003,
      yearTo: 2009,
      engineCode: 'BKD',
    };

    const officialOem: OEMReference = {
      raw: '1K0121205AD',
      normalized: '1K0121205AD',
      isPrimary: true,
      referenceType: 'OEM_OFFICIAL',
    };

    it('identifies exact OEM match as guaranteed when target OEM matches official OEM', () => {
      const signal = evaluateCompatibility({
        partOemReferences: [officialOem],
        partDonorVehicle: donorVehicle,
        targetOEMReference: '1K0121205AD',
        targetVehicle: { make: 'VOLKSWAGEN', model: 'Golf', year: 2007 },
      });

      expect(signal.confidence).toBe('EXACT_OEM_MATCH');
      expect(signal.isGuaranteed).toBe(true);
      expect(signal.confidenceScore).toBe(1.0);
    });

    it('marks donor vehicle attribute matches as NOT guaranteed when OEM is missing', () => {
      const signal = evaluateCompatibility({
        partOemReferences: [], // No OEM provided by buyer
        partDonorVehicle: donorVehicle,
        targetVehicle: { make: 'VOLKSWAGEN', model: 'Golf', year: 2007 },
      });

      // NON-NEGOTIABLE: matching donor vehicle never implies guaranteed fitment
      expect(signal.confidence).toBe('ATTRIBUTES_MATCH');
      expect(signal.isGuaranteed).toBe(false);
      expect(signal.confidenceScore).toBeLessThan(1.0);
      expect(signal.userAdvice).toContain('la compatibilidad no está garantizada');
    });

    it('falls back to unverified pending state when catalogue lacks fitment evidence', () => {
      const signal = evaluateCompatibility({
        partOemReferences: [],
        partDonorVehicle: undefined, // Missing donor details
        targetVehicle: { make: 'VOLKSWAGEN', model: 'Golf' },
      });

      expect(signal.confidence).toBe('UNKNOWN_PENDING_CONFIRMATION');
      expect(signal.isGuaranteed).toBe(false);
      expect(signal.confidenceScore).toBe(0.0);
      expect(signal.userAdvice).toContain('Compatibilidad no confirmada');
    });
  });
});
