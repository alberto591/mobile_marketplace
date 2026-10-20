import type { Money } from './money';
import { createMoney } from './money';

export type ParentOrderStatus =
  | 'PENDING_PAYMENT'
  | 'PAYMENT_PROCESSING'
  | 'PAID'
  | 'PARTIALLY_PAID'
  | 'PROCESSING'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'REFUNDED'
  | 'PAYMENT_FAILED';

export type SuborderPaymentStatus =
  | 'PENDING'
  | 'PROCESSING'
  | 'SUCCEEDED'
  | 'FAILED'
  | 'CANCELLED'
  | 'REFUNDED'
  | 'PARTIALLY_REFUNDED';

export type SuborderFulfillmentStatus =
  | 'AWAITING_PAYMENT'
  | 'AWAITING_SELLER_FULFILLMENT'
  | 'PROCESSING'
  | 'SHIPPED'
  | 'DELIVERED'
  | 'CANCELLED';

export type TaxTreatmentStatus =
  | 'UNCONFIGURED'
  | 'GENERAL_21'
  | 'REBU_EXEMPT'
  | 'NOT_APPLICABLE';

export interface CustomerContactInfo {
  readonly customerName: string;
  readonly customerEmail: string;
  readonly customerPhone: string;
}

export interface DeliveryAddress {
  readonly line1: string;
  readonly line2?: string;
  readonly city: string;
  readonly province: string;
  readonly postalCode: string;
  readonly country: 'ES';
}

export interface OrderItemSnapshot {
  readonly partId: string;
  readonly vendorId: string;
  readonly externalPartId: string;
  readonly title: string;
  readonly oemReference?: string;
  readonly unitPrice: Money;
  readonly quantity: 1;
}

export interface OrderSuborder {
  readonly id: string;
  readonly orderId: string;
  readonly suborderReference: string;
  readonly vendorId: string;
  readonly stripeAccountId: string;
  readonly stripePaymentIntentId?: string;
  readonly items: readonly OrderItemSnapshot[];
  readonly subtotal: Money;
  readonly shipping: Money;
  readonly tax: Money;
  readonly total: Money;
  readonly platformFee: Money;
  readonly sellerNet: Money;
  readonly paymentStatus: SuborderPaymentStatus;
  readonly fulfillmentStatus: SuborderFulfillmentStatus;
  readonly shippingCarrier?: string;
  readonly trackingNumber?: string;
  readonly trackingUrl?: string;
  readonly shippedAt?: Date;
  readonly deliveredAt?: Date;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface Order {
  readonly id: string;
  readonly orderReference: string;
  readonly contact: CustomerContactInfo;
  readonly address: DeliveryAddress;
  readonly suborders: readonly OrderSuborder[];
  readonly totalProducts: Money;
  readonly totalShipping: Money;
  readonly totalTax: Money;
  readonly totalOrder: Money;
  readonly taxStatus: TaxTreatmentStatus;
  readonly isTestOrder: boolean;
  readonly idempotencyKey: string;
  readonly accessToken: string;
  readonly status: ParentOrderStatus;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export class CheckoutPricingError extends Error {
  constructor(message: string) {
    super(`[CheckoutPricingError]: ${message}`);
    this.name = 'CheckoutPricingError';
  }
}

export class MultiVendorCheckoutNotSupportedError extends Error {
  constructor(message: string = 'El primer lanzamiento de checkout procesa un único desguace por pedido.') {
    super(`[MultiVendorCheckoutNotSupportedError]: ${message}`);
    this.name = 'MultiVendorCheckoutNotSupportedError';
  }
}

export interface PricingCalculationInputPart {
  readonly id: string;
  readonly vendorId: string;
  readonly externalPartId: string;
  readonly title: string;
  readonly priceCents: number;
  readonly availabilityStatus: string;
  readonly oemReference?: string;
}

export interface PricingCalculationOptions {
  readonly isStagingTestMode: boolean;
  readonly fixedShippingCents?: number;
  readonly commissionBasisPoints?: number; // e.g. 1000 = 10%
}

export interface CalculatedPricingBreakdown {
  readonly vendorId: string;
  readonly subtotalCents: number;
  readonly shippingCents: number;
  readonly taxCents: number;
  readonly totalCents: number;
  readonly platformFeeCents: number;
  readonly sellerNetCents: number;
  readonly isTestOrder: boolean;
  readonly taxStatus: TaxTreatmentStatus;
  readonly items: readonly OrderItemSnapshot[];
}

/**
 * Calculates server-authoritative pricing for checkout.
 * Enforces single-vendor invariant for Release 1, 950 cents staging shipping fixture,
 * and 10% platform fee on parts subtotal only (excluding shipping and taxes).
 */
export function calculateTrustedCheckoutPricing(
  parts: readonly PricingCalculationInputPart[],
  options: PricingCalculationOptions
): CalculatedPricingBreakdown {
  if (parts.length === 0) {
    throw new CheckoutPricingError('El carrito no contiene piezas para calcular el pedido.');
  }

  // 1. Single-vendor validation
  const vendorIds = new Set(parts.map((p) => p.vendorId));
  if (vendorIds.size > 1) {
    throw new MultiVendorCheckoutNotSupportedError();
  }
  const vendorId = parts[0]!.vendorId;

  // 2. Validate availability and build items
  const items: OrderItemSnapshot[] = [];
  let subtotalCents = 0;

  for (const p of parts) {
    if (p.availabilityStatus !== 'AVAILABLE') {
      throw new CheckoutPricingError(`La pieza "${p.title}" (${p.externalPartId}) no está disponible en inventario.`);
    }
    if (!Number.isInteger(p.priceCents) || p.priceCents < 0) {
      throw new CheckoutPricingError(`Precio inválido para la pieza "${p.title}": ${p.priceCents}`);
    }

    subtotalCents += p.priceCents;
    items.push(
      Object.freeze({
        partId: p.id,
        vendorId: p.vendorId,
        externalPartId: p.externalPartId,
        title: p.title,
        oemReference: p.oemReference,
        unitPrice: createMoney(p.priceCents, 'EUR'),
        quantity: 1,
      })
    );
  }

  // 3. Shipping calculation (Staging fixture: 950 cents)
  let shippingCents = 0;
  if (options.isStagingTestMode) {
    shippingCents = options.fixedShippingCents ?? 950;
  } else {
    throw new CheckoutPricingError('Tarifas de envío comerciales no configuradas en modo producción.');
  }

  // 4. Tax treatment: Explicitly UNCONFIGURED in Staging
  const taxCents = 0;
  const taxStatus: TaxTreatmentStatus = 'UNCONFIGURED';

  // 5. Total
  const totalCents = subtotalCents + shippingCents + taxCents;

  // 6. Platform fee: 10% on parts subtotal only (excluding shipping and taxes)
  const basisPoints = options.commissionBasisPoints ?? 1000; // 1000 bp = 10.00%
  const platformFeeCents = Math.round((subtotalCents * basisPoints) / 10000);

  // 7. Seller net (before Stripe processing fees)
  const sellerNetCents = totalCents - platformFeeCents;

  return Object.freeze({
    vendorId,
    subtotalCents,
    shippingCents,
    taxCents,
    totalCents,
    platformFeeCents,
    sellerNetCents,
    isTestOrder: options.isStagingTestMode,
    taxStatus,
    items: Object.freeze(items),
  });
}
