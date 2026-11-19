// Maps raw Eurodesguace Málaga PartDto rows to the payload of the ingest_catalog_batch
// database function. Dependency-free so it runs in Deno and in unit tests.
// Mirrors packages/core (normalizeOEMReference, parseEuroCommaToCents): keep them in step.

export interface IngestPart {
  externalPartId: string;
  sourceSku: string | null;
  title: string;
  categoryId: string;
  /** Integer cents. 0 means "no usable price": the part is listed for inquiry only. */
  priceCents: number;
  isDeleted: boolean;
  deletedAt: string | null;
  sourceUrl: string;
  make: string | null;
  model: string | null;
  donorVehicleCode: string | null;
  referenceRaw: string | null;
  referenceNormalized: string | null;
  referenceType: 'REFERENCIA_VISUAL';
  images: string[];
}

const text = (value: unknown): string | null => {
  if (value === null || value === undefined) return null;
  const s = String(value).trim();
  return s === '' ? null : s;
};

/**
 * Parses provider prices such as "42,95", "1.250,00", "120" or "35.5 €" to integer cents
 * without floating point. Returns 0 for anything that is not a non-negative amount.
 */
export function parsePriceToCents(raw: unknown): number {
  const cleaned = String(raw ?? '').replace(/[€\s]/g, '');
  if (cleaned === '') return 0;

  let normalized = cleaned;
  if (cleaned.includes(',')) {
    // Comma is the decimal separator; dots are thousands separators.
    normalized = cleaned.replace(/\./g, '').replace(',', '.');
  }
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(normalized);
  if (!match) return 0;

  const cents = Number(match[1]) * 100 + Number((match[2] ?? '').padEnd(2, '0') || '0');
  return Number.isSafeInteger(cents) && cents <= 2_000_000_000 ? cents : 0;
}

/** Uppercase without separators; null when too short to be meaningful (< 3 chars). */
export function normalizeReference(raw: unknown): string | null {
  const stripped = String(raw ?? '').trim().toUpperCase().replace(/[\s\-_./\\,]/g, '');
  return stripped.length >= 3 ? stripped : null;
}

const isHttpUrl = (value: unknown): value is string =>
  typeof value === 'string' && /^https?:\/\/\S+$/i.test(value.trim());

// deno-lint-ignore no-explicit-any
export function normalizeEurodesguacePart(raw: any): IngestPart | null {
  const externalPartId = text(raw?.refid);
  if (!externalPartId) return null;

  const make = text(raw.marca);
  const model = text(raw.modelo);
  const family = text(raw.familia);
  const title = text(raw.articulo) ?? [family ?? 'Recambio', make, model].filter(Boolean).join(' ');
  const referenceRaw = text(raw.refvisual);
  const deletedAt = text(raw.deleted_at);

  return {
    externalPartId,
    sourceSku: referenceRaw ?? externalPartId,
    title,
    categoryId: family ?? 'GENERAL',
    priceCents: parsePriceToCents(raw.precio),
    isDeleted: deletedAt !== null,
    deletedAt,
    sourceUrl: `https://eurodesguacemalaga.com/recambio/${encodeURIComponent(externalPartId)}`,
    make,
    model,
    donorVehicleCode: text(raw.codvehiculo),
    referenceRaw,
    referenceNormalized: referenceRaw ? normalizeReference(referenceRaw) : null,
    referenceType: 'REFERENCIA_VISUAL',
    images: Array.isArray(raw.imgs) ? raw.imgs.filter(isHttpUrl).map((u: string) => u.trim()) : [],
  };
}

// deno-lint-ignore no-explicit-any
export function normalizeEurodesguaceBatch(rawParts: any[]): IngestPart[] {
  const parts: IngestPart[] = [];
  for (const raw of Array.isArray(rawParts) ? rawParts : []) {
    const part = normalizeEurodesguacePart(raw);
    if (part) parts.push(part);
  }
  return parts;
}
