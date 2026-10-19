/**
 * Availability Entity and State Model.
 * Distinguishes verified real-time stock from unconfirmed, reserved, or withdrawn inventory.
 */
export type AvailabilityStatus =
  | 'AVAILABLE'
  | 'OUT_OF_STOCK'
  | 'RESERVED'
  | 'PENDING_CONFIRMATION'
  | 'WITHDRAWN';

export interface Availability {
  readonly status: AvailabilityStatus;
  readonly stockQuantity: number;
  readonly lastCheckedAt: Date;
  readonly leadTimeDays?: number;
  readonly statusReason?: string;
}

/**
 * Evaluates whether an inventory item can be immediately added to cart or purchased directly.
 */
export function isPartBuyable(availability: Availability): boolean {
  return availability.status === 'AVAILABLE' && availability.stockQuantity > 0;
}

/**
 * Evaluates whether an inventory item requires a prior availability inquiry (lead)
 * before taking payment, to avoid selling unavailable single-unit parts.
 */
export function requiresAvailabilityInquiry(availability: Availability): boolean {
  return (
    availability.status === 'PENDING_CONFIRMATION' ||
    (availability.status === 'AVAILABLE' && availability.stockQuantity <= 0)
  );
}

/**
 * Creates an Availability value object with sensible defaults and integrity validations.
 */
export function createAvailability(params: {
  status: AvailabilityStatus;
  stockQuantity?: number;
  lastCheckedAt?: Date;
  leadTimeDays?: number;
  statusReason?: string;
}): Availability {
  const stockQuantity = params.stockQuantity ?? (params.status === 'AVAILABLE' ? 1 : 0);
  if (stockQuantity < 0) {
    throw new Error(`[AvailabilityError]: stockQuantity cannot be negative: ${stockQuantity}`);
  }
  return Object.freeze({
    status: params.status,
    stockQuantity,
    lastCheckedAt: params.lastCheckedAt ?? new Date(),
    leadTimeDays: params.leadTimeDays,
    statusReason: params.statusReason,
  });
}
