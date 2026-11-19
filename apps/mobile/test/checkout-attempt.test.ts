import { describe, expect, it } from 'vitest';
import {
  computeCheckoutFingerprint,
  createInitialAttemptState,
  planCheckoutAttempt,
  recordOrderCreated,
  resetAttempt,
  shouldResetAttempt,
} from '../services/checkout-attempt';
import { CheckoutError } from '../services/checkout.service';

const contact = { customerName: 'Ana Pérez', customerEmail: 'ana@example.com', customerPhone: '600000000' };
const address = {
  line1: 'Calle Larios 1',
  city: 'Málaga',
  province: 'Málaga',
  postalCode: '29005',
  country: 'ES' as const,
};
const partIds = ['22222222-2222-4000-a000-222222222222', '11111111-1111-4000-a000-111111111111'];
const TOKEN = 'a'.repeat(64);

function seeds(...values: string[]) {
  let i = 0;
  return () => values[i++] ?? `seed_${i}`;
}

describe('Checkout attempt idempotency', () => {
  it('reuses the same key when the buyer retries with the same data after cancelling the sheet', () => {
    const next = seeds('chk_1', 'chk_2');
    const fp = computeCheckoutFingerprint({ contact, address, partIds });

    const first = planCheckoutAttempt(createInitialAttemptState(next), fp, next);
    const afterOrder = recordOrderCreated(first.state, TOKEN);
    const retry = planCheckoutAttempt(afterOrder, fp, next);

    expect(first.idempotencyKey).toBe('chk_1');
    expect(first.previousOrderAccessToken).toBeUndefined();
    expect(retry.idempotencyKey).toBe('chk_1');
    expect(retry.previousOrderAccessToken).toBeUndefined();
  });

  it('fingerprint ignores part order', () => {
    expect(computeCheckoutFingerprint({ contact, address, partIds })).toBe(
      computeCheckoutFingerprint({ contact, address, partIds: [...partIds].reverse() })
    );
  });

  it('uses a new key and releases the previous order when the address changes', () => {
    const next = seeds('chk_1', 'chk_2');
    const first = planCheckoutAttempt(
      createInitialAttemptState(next),
      computeCheckoutFingerprint({ contact, address, partIds }),
      next
    );
    const afterOrder = recordOrderCreated(first.state, TOKEN);

    const edited = planCheckoutAttempt(
      afterOrder,
      computeCheckoutFingerprint({ contact, address: { ...address, line1: 'Calle Granada 7' }, partIds }),
      next
    );

    expect(edited.idempotencyKey).toBe('chk_2');
    expect(edited.previousOrderAccessToken).toBe(TOKEN);
  });

  it('keeps keys within the server limit of 120 characters for a 10-part cart', () => {
    const tenParts = Array.from({ length: 10 }, (_, i) => `${String(i).repeat(8)}-1111-4000-a000-111111111111`);
    const plan = planCheckoutAttempt(
      createInitialAttemptState(),
      computeCheckoutFingerprint({ contact, address, partIds: tenParts })
    );
    expect(plan.idempotencyKey.length).toBeGreaterThanOrEqual(10);
    expect(plan.idempotencyKey.length).toBeLessThanOrEqual(120);
  });

  it('starts over with a fresh key after the server rejects the attempt, still releasing the old order', () => {
    const next = seeds('chk_1', 'chk_2');
    const fp = computeCheckoutFingerprint({ contact, address, partIds });
    const first = planCheckoutAttempt(createInitialAttemptState(next), fp, next);
    const afterOrder = recordOrderCreated(first.state, TOKEN);

    const err = new CheckoutError('Pieza vendida', { statusCode: 409, details: { error: 'PART_NOT_AVAILABLE' } });
    expect(err.errorCode).toBe('PART_NOT_AVAILABLE');
    expect(shouldResetAttempt(err.errorCode)).toBe(true);

    const retry = planCheckoutAttempt(resetAttempt(afterOrder, next), fp, next);
    expect(retry.idempotencyKey).toBe('chk_2');
    expect(retry.previousOrderAccessToken).toBe(TOKEN);
  });

  it('keeps the key after network errors so the retry resumes the same order', () => {
    expect(shouldResetAttempt(undefined)).toBe(false);
    expect(shouldResetAttempt('STRIPE_NETWORK_ERROR')).toBe(false);
    expect(shouldResetAttempt('CHECKOUT_IN_PROGRESS')).toBe(false);
  });
});
