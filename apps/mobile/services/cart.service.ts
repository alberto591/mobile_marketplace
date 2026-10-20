import type { Money, Part, Vendor } from '@mobile-marketplace/core';
import { addMoney, createMoney } from '@mobile-marketplace/core';

export interface CartItem {
  readonly part: Part;
  readonly vendor: Vendor;
  readonly addedAt: string;
}

export interface VendorCartGroup {
  readonly vendorId: string;
  readonly vendor: Vendor;
  readonly items: readonly CartItem[];
  readonly subtotal: Money;
}

export interface AddToCartResult {
  readonly items: readonly CartItem[];
  readonly added: boolean;
  readonly reason?: string;
}

/**
 * Validates whether a part is physically eligible to be added to the cart.
 *
 * Invariants:
 * - Only AVAILABLE pieces with stockQuantity > 0 can be added directly.
 * - PENDING_CONFIRMATION requires prior inquiry.
 * - OUT_OF_STOCK and WITHDRAWN cannot be added.
 */
export function canAddToCart(part: Part): { allowed: boolean; reason?: string } {
  const status = part.availability.status;
  const quantity = part.availability.stockQuantity;

  if (status === 'AVAILABLE' && quantity > 0) {
    return { allowed: true };
  }

  if (status === 'PENDING_CONFIRMATION' || (status === 'AVAILABLE' && quantity <= 0)) {
    return {
      allowed: false,
      reason: 'Esta pieza requiere confirmación previa de disponibilidad con el desguace.',
    };
  }

  if (status === 'OUT_OF_STOCK') {
    return {
      allowed: false,
      reason: 'Esta pieza no se encuentra disponible en stock.',
    };
  }

  if (status === 'WITHDRAWN') {
    return {
      allowed: false,
      reason: 'Esta pieza ha sido retirada del inventario.',
    };
  }

  return {
    allowed: false,
    reason: 'Estado de disponibilidad no apto para añadir al carrito.',
  };
}

/**
 * Calculates the total provisional subtotal of cart items in integer cents.
 */
export function calculateCartSubtotal(items: readonly CartItem[]): Money {
  if (items.length === 0) {
    return createMoney(0, 'EUR');
  }

  return items.reduce((acc, item) => addMoney(acc, item.part.price), createMoney(0, 'EUR'));
}

/**
 * Groups cart items by vendor, maintaining the exact physical identity of each piece.
 * Calculates per-vendor subtotals to support future per-CAT logistics.
 */
export function groupCartItemsByVendor(items: readonly CartItem[]): readonly VendorCartGroup[] {
  const map = new Map<string, { vendor: Vendor; items: CartItem[] }>();

  for (const item of items) {
    const existing = map.get(item.vendor.id);
    if (existing) {
      existing.items.push(item);
    } else {
      map.set(item.vendor.id, {
        vendor: item.vendor,
        items: [item],
      });
    }
  }

  return Array.from(map.entries()).map(([vendorId, group]) => ({
    vendorId,
    vendor: group.vendor,
    items: Object.freeze(group.items),
    subtotal: calculateCartSubtotal(group.items),
  }));
}

/**
 * Adds a physical unit to the cart while enforcing scrap yard marketplace rules:
 * 1. No duplicate entries for the same physical piece (part.id).
 * 2. No quantities > 1 for single-unit scrap yard inventory.
 * 3. Only AVAILABLE parts allowed.
 */
export function addItemToCart(
  currentItems: readonly CartItem[],
  part: Part,
  vendor: Vendor
): AddToCartResult {
  // 1. Check duplicate
  const alreadyInCart = currentItems.some((item) => item.part.id === part.id);
  if (alreadyInCart) {
    return {
      items: currentItems,
      added: false,
      reason: 'Esta unidad física ya está incluida en tu carrito.',
    };
  }

  // 2. Validate availability
  const check = canAddToCart(part);
  if (!check.allowed) {
    return {
      items: currentItems,
      added: false,
      reason: check.reason,
    };
  }

  // 3. Add single physical unit
  const newItem: CartItem = Object.freeze({
    part,
    vendor,
    addedAt: new Date().toISOString(),
  });

  return {
    items: Object.freeze([...currentItems, newItem]),
    added: true,
  };
}

/**
 * Removes a part by its unique ID.
 */
export function removeItemFromCart(
  currentItems: readonly CartItem[],
  partId: string
): readonly CartItem[] {
  return Object.freeze(currentItems.filter((item) => item.part.id !== partId));
}
