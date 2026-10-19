/**
 * OEM Reference Entity and Normalization Engine.
 * OEM (Original Equipment Manufacturer) references are the single most reliable signal
 * for parts interchangeability. Normalization eliminates formatting differences without losing identity.
 */
export interface OEMReference {
  readonly raw: string;
  readonly normalized: string;
  readonly isPrimary: boolean;
  readonly brandName?: string;
}

export class InvalidOEMReferenceError extends Error {
  constructor(message: string) {
    super(`[InvalidOEMReferenceError]: ${message}`);
    this.name = 'InvalidOEMReferenceError';
  }
}

/**
 * Normalizes an OEM reference string by:
 * 1. Trimming leading/trailing whitespace.
 * 2. Converting to uppercase ASCII.
 * 3. Stripping non-alphanumeric punctuation (hyphens, dots, forward/backward slashes, spaces).
 *
 * Example: " 1K0-121-205.AD / 01 " -> "1K0121205AD01"
 */
export function normalizeOEMReference(raw: string): string {
  if (!raw || typeof raw !== 'string') {
    throw new InvalidOEMReferenceError('OEM reference must be a non-empty string');
  }
  const stripped = raw.trim().toUpperCase().replace(/[\s\-_./\\,]/g, '');
  if (stripped.length < 3) {
    throw new InvalidOEMReferenceError(
      `Normalized OEM reference too short to be meaningful (min 3 chars): "${raw}" -> "${stripped}"`
    );
  }
  return stripped;
}

/**
 * Creates an immutable OEMReference entity.
 */
export function createOEMReference(params: {
  raw: string;
  isPrimary?: boolean;
  brandName?: string;
}): OEMReference {
  const normalized = normalizeOEMReference(params.raw);
  return Object.freeze({
    raw: params.raw.trim(),
    normalized,
    isPrimary: params.isPrimary ?? true,
    brandName: params.brandName?.trim(),
  });
}

/**
 * Checks if two OEM references are equivalent based on their normalized representation.
 */
export function areOEMReferencesEqual(a: string | OEMReference, b: string | OEMReference): boolean {
  const normA = typeof a === 'string' ? normalizeOEMReference(a) : a.normalized;
  const normB = typeof b === 'string' ? normalizeOEMReference(b) : b.normalized;
  return normA === normB;
}
