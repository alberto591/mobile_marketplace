import type { ZodError } from 'zod';
import type { Result } from '../domain/common/result.js';
import { err, ok } from '../domain/common/result.js';
import { createAvailability } from '../domain/entities/availability.js';
import { createMoney } from '../domain/entities/money.js';
import { createOEMReference } from '../domain/entities/oem-reference.js';
import type { Part } from '../domain/entities/part.js';
import type { ValidationIssue } from './errors.js';
import { NormalizationError } from './errors.js';
import { PartSchema } from './schemas.js';

export function parseZodIssues(error: ZodError): ValidationIssue[] {
  return error.issues.map((issue) => ({
    path: issue.path.join('.'),
    message: issue.message,
    code: issue.code,
    received: (issue as { received?: unknown }).received,
  }));
}

/**
 * Validates a candidate Part object against the canonical Part schema.
 */
export function validateCanonicalPart(
  candidate: unknown,
  providerId: string,
  externalPartId: string
): Result<Part, NormalizationError> {
  const parseResult = PartSchema.safeParse(candidate);

  if (!parseResult.success) {
    const issues = parseZodIssues(parseResult.error);
    return err(
      new NormalizationError({
        providerId,
        externalPartId,
        message: `Fallo de validación canónica: ${issues.map((i) => `${i.path}: ${i.message}`).join(', ')}`,
        issues,
      })
    );
  }

  const valid = parseResult.data;

  // Build frozen immutable domain Part
  const part: Part = Object.freeze({
    id: valid.id,
    vendorId: valid.vendorId,
    source: Object.freeze({
      providerId: valid.source.providerId,
      externalPartId: valid.source.externalPartId,
      sourceSku: valid.source.sourceSku,
      sourceUrl: valid.source.sourceUrl,
      rawPayloadHash: valid.source.rawPayloadHash,
      lastSeenAt: valid.source.lastSeenAt,
    }),
    title: valid.title,
    description: valid.description,
    categoryId: valid.categoryId,
    price: createMoney(valid.price.amountInCents, valid.price.currency),
    condition: valid.condition,
    testedStatus: valid.testedStatus,
    availability: createAvailability({
      status: valid.availability.status,
      stockQuantity: valid.availability.stockQuantity,
      lastCheckedAt: valid.availability.lastCheckedAt,
      leadTimeDays: valid.availability.leadTimeDays,
      statusReason: valid.availability.statusReason,
    }),
    donorVehicle: valid.donorVehicle ? Object.freeze({ ...valid.donorVehicle }) : undefined,
    oemReferences: Object.freeze(
      valid.oemReferences.map((ref) =>
        createOEMReference({
          raw: ref.raw,
          isPrimary: ref.isPrimary,
          brandName: ref.brandName,
        })
      )
    ),
    images: Object.freeze(valid.images.map((img) => Object.freeze({ ...img }))),
    warrantyMonths: valid.warrantyMonths,
    sourceUpdatedAt: valid.sourceUpdatedAt,
    lastSyncedAt: valid.lastSyncedAt,
    createdAt: valid.createdAt,
    updatedAt: valid.updatedAt,
  });

  return ok(part);
}
