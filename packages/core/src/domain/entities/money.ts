/**
 * Money Value Object.
 * Represents monetary values stored strictly as integer cents to eliminate floating-point precision drift.
 */
export type CurrencyCode = 'EUR';

export interface Money {
  readonly amountInCents: number;
  readonly currency: CurrencyCode;
}

export class InvalidMoneyError extends Error {
  constructor(message: string) {
    super(`[InvalidMoneyError]: ${message}`);
    this.name = 'InvalidMoneyError';
  }
}

/**
 * Creates an immutable Money value object from integer cents.
 */
export function createMoney(amountInCents: number, currency: CurrencyCode = 'EUR'): Money {
  if (!Number.isInteger(amountInCents)) {
    throw new InvalidMoneyError(`Amount must be an integer in cents, received: ${amountInCents}`);
  }
  if (amountInCents < 0) {
    throw new InvalidMoneyError(`Amount cannot be negative, received: ${amountInCents}`);
  }
  return Object.freeze({ amountInCents, currency });
}

/**
 * Creates a Money object from a decimal currency string or float, converting safely to integer cents.
 * E.g. "120.50" -> 12050 cents.
 */
export function createMoneyFromDecimal(decimalAmount: number | string, currency: CurrencyCode = 'EUR'): Money {
  const numeric = typeof decimalAmount === 'string' ? Number.parseFloat(decimalAmount) : decimalAmount;
  if (Number.isNaN(numeric) || !Number.isFinite(numeric)) {
    throw new InvalidMoneyError(`Invalid decimal amount: ${decimalAmount}`);
  }
  if (numeric < 0) {
    throw new InvalidMoneyError(`Amount cannot be negative: ${numeric}`);
  }
  const cents = Math.round(numeric * 100);
  return createMoney(cents, currency);
}

/**
 * Formats Money for human presentation according to standard European Spanish locale.
 * E.g. 12050 cents -> "120,50 EUR"
 */
export function formatMoney(money: Money): string {
  const units = (money.amountInCents / 100).toFixed(2).replace('.', ',');
  return `${units} ${money.currency}`;
}

/**
 * Adds two Money values of the same currency.
 */
export function addMoney(a: Money, b: Money): Money {
  if (a.currency !== b.currency) {
    throw new InvalidMoneyError(`Cannot add different currencies: ${a.currency} and ${b.currency}`);
  }
  return createMoney(a.amountInCents + b.amountInCents, a.currency);
}

/**
 * Subtracts Money b from Money a.
 */
export function subtractMoney(a: Money, b: Money): Money {
  if (a.currency !== b.currency) {
    throw new InvalidMoneyError(`Cannot subtract different currencies: ${a.currency} and ${b.currency}`);
  }
  if (a.amountInCents < b.amountInCents) {
    throw new InvalidMoneyError(`Resulting money cannot be negative: ${a.amountInCents} - ${b.amountInCents}`);
  }
  return createMoney(a.amountInCents - b.amountInCents, a.currency);
}

/**
 * Compares two Money instances.
 * Returns negative if a < b, positive if a > b, zero if equal.
 */
export function compareMoney(a: Money, b: Money): number {
  if (a.currency !== b.currency) {
    throw new InvalidMoneyError(`Cannot compare different currencies: ${a.currency} and ${b.currency}`);
  }
  return a.amountInCents - b.amountInCents;
}
