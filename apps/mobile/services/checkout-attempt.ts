/**
 * Checkout attempt bookkeeping (pure, no React).
 *
 * The server keys an order on the idempotency key and holds the parts reserved for it.
 * - Same checkout data as the last attempt (e.g. the buyer cancelled the PaymentSheet and
 *   taps Pay again): reuse the key, so the server resumes the same order and returns the
 *   real client secret of the same PaymentIntent.
 * - Different data (address, contact or parts changed): new key, and send the previous
 *   order's access token so the server cancels that order and releases its parts.
 * - The server says the attempt is no longer usable: start over with a fresh key.
 */

import type { CheckoutAddress, CheckoutContact } from './checkout.service';

export interface CheckoutAttemptState {
  readonly seed: string;
  /** Fingerprint of the data sent with `seed`; null if `seed` was never sent. */
  readonly fingerprint: string | null;
  /** Access token of the last order the server created for this checkout. */
  readonly lastOrderAccessToken: string | null;
}

export interface CheckoutAttemptPlan {
  readonly state: CheckoutAttemptState;
  readonly idempotencyKey: string;
  readonly previousOrderAccessToken?: string;
}

/** Server error codes after which the current idempotency key must not be reused. */
const RESET_ERROR_CODES = new Set([
  'ORDER_NOT_PAYABLE',
  'IDEMPOTENCY_CONFLICT',
  'PART_NOT_AVAILABLE',
  'PREVIOUS_ORDER_ALREADY_PAID',
  'STRIPE_CHARGE_FAILED',
  'STRIPE_CALL_ERROR',
  'RESERVATION_ERROR',
  'DB_ERROR',
]);

export function createCheckoutSeed(random: () => number = Math.random, now: () => number = Date.now): string {
  return `chk_${now()}_${random().toString(36).slice(2, 11)}`;
}

export function createInitialAttemptState(newSeed: () => string = createCheckoutSeed): CheckoutAttemptState {
  return { seed: newSeed(), fingerprint: null, lastOrderAccessToken: null };
}

export function computeCheckoutFingerprint(input: {
  readonly contact: CheckoutContact;
  readonly address: CheckoutAddress;
  readonly partIds: readonly string[];
}): string {
  return JSON.stringify([
    input.contact.customerName,
    input.contact.customerEmail,
    input.contact.customerPhone,
    input.address.line1,
    input.address.line2 ?? '',
    input.address.city,
    input.address.province,
    input.address.postalCode,
    input.address.country,
    [...input.partIds].sort(),
  ]);
}

export function planCheckoutAttempt(
  state: CheckoutAttemptState,
  fingerprint: string,
  newSeed: () => string = createCheckoutSeed
): CheckoutAttemptPlan {
  if (state.fingerprint === fingerprint) {
    return { state, idempotencyKey: state.seed };
  }

  if (state.fingerprint === null) {
    // Fresh key (first attempt or after a reset). If an earlier order of this checkout is
    // still unpaid, the server cancels it; it ignores the token otherwise.
    return {
      state: { ...state, fingerprint },
      idempotencyKey: state.seed,
      previousOrderAccessToken: state.lastOrderAccessToken ?? undefined,
    };
  }

  const seed = newSeed();
  return {
    state: { ...state, seed, fingerprint },
    idempotencyKey: seed,
    previousOrderAccessToken: state.lastOrderAccessToken ?? undefined,
  };
}

export function recordOrderCreated(state: CheckoutAttemptState, accessToken: string): CheckoutAttemptState {
  return { ...state, lastOrderAccessToken: accessToken };
}

export function shouldResetAttempt(errorCode: string | undefined): boolean {
  return errorCode !== undefined && RESET_ERROR_CODES.has(errorCode);
}

export function resetAttempt(
  state: CheckoutAttemptState,
  newSeed: () => string = createCheckoutSeed
): CheckoutAttemptState {
  return { ...state, seed: newSeed(), fingerprint: null };
}
