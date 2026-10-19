import { describe, expect, it } from 'vitest';
import {
  areOEMReferencesEqual,
  createOEMReference,
  InvalidOEMReferenceError,
  normalizeOEMReference,
} from '../src/domain/entities/oem-reference.js';

describe('OEM Reference Normalization', () => {
  it('strips spaces, dashes, dots, underscores, and slashes', () => {
    expect(normalizeOEMReference(' 1K0-121-205.AD ')).toBe('1K0121205AD');
    expect(normalizeOEMReference('1K0 121 205 AD')).toBe('1K0121205AD');
    expect(normalizeOEMReference('1K0/121/205_AD')).toBe('1K0121205AD');
    expect(normalizeOEMReference('028-100-2500')).toBe('0281002500');
  });

  it('converts lowercase characters to uppercase', () => {
    expect(normalizeOEMReference('8e1858532ad')).toBe('8E1858532AD');
  });

  it('rejects empty, non-string, or overly short inputs', () => {
    expect(() => normalizeOEMReference('')).toThrow(InvalidOEMReferenceError);
    expect(() => normalizeOEMReference('  - . ')).toThrow(InvalidOEMReferenceError);
    expect(() => normalizeOEMReference('A1')).toThrow(InvalidOEMReferenceError);
  });

  it('creates an OEMReference entity with both raw and normalized values', () => {
    const ref = createOEMReference({
      raw: ' 1K0-941-005.Q ',
      isPrimary: true,
      brandName: 'VAG',
    });
    expect(ref.raw).toBe('1K0-941-005.Q');
    expect(ref.normalized).toBe('1K0941005Q');
    expect(ref.isPrimary).toBe(true);
    expect(ref.brandName).toBe('VAG');
    expect(Object.isFrozen(ref)).toBe(true);
  });

  it('evaluates equality across distinct formatting styles', () => {
    expect(areOEMReferencesEqual('1K0-121-205 AD', '1K0.121.205.AD')).toBe(true);
    expect(areOEMReferencesEqual('1K0121205AD', '1k0 121 205 ad')).toBe(true);
    expect(areOEMReferencesEqual('1K0121205AD', '1K0121205AE')).toBe(false);
  });
});
