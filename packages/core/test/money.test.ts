import { describe, expect, it } from 'vitest';
import {
  addMoney,
  compareMoney,
  createMoney,
  createMoneyFromDecimal,
  formatMoney,
  formatMoneyWithVat,
  grossCentsWithVat,
  InvalidMoneyError,
  moneyWithVat,
  subtractMoney,
} from '../src/domain/entities/money.js';

describe('Money Value Object', () => {
  it('creates money with integer cents', () => {
    const money = createMoney(1500, 'EUR');
    expect(money.amountInCents).toBe(1500);
    expect(money.currency).toBe('EUR');
    expect(Object.isFrozen(money)).toBe(true);
  });

  it('rejects negative amounts', () => {
    expect(() => createMoney(-10, 'EUR')).toThrow(InvalidMoneyError);
  });

  it('rejects non-integer cent amounts to prevent floating point inaccuracies', () => {
    expect(() => createMoney(15.5, 'EUR')).toThrow(InvalidMoneyError);
  });

  it('safely converts decimal numbers and strings to integer cents', () => {
    const m1 = createMoneyFromDecimal(19.99);
    expect(m1.amountInCents).toBe(1999);

    const m2 = createMoneyFromDecimal('120.50');
    expect(m2.amountInCents).toBe(12050);

    const m3 = createMoneyFromDecimal(0);
    expect(m3.amountInCents).toBe(0);
  });

  it('formats money for display in European Spanish format', () => {
    const money = createMoney(12050, 'EUR');
    expect(formatMoney(money)).toBe('120,50 EUR');

    const singleCent = createMoney(5, 'EUR');
    expect(formatMoney(singleCent)).toBe('0,05 EUR');
  });

  it('adds money of identical currency', () => {
    const a = createMoney(1000, 'EUR');
    const b = createMoney(2550, 'EUR');
    const sum = addMoney(a, b);
    expect(sum.amountInCents).toBe(3550);
  });

  it('subtracts money and protects against negative results', () => {
    const a = createMoney(3000, 'EUR');
    const b = createMoney(1000, 'EUR');
    expect(subtractMoney(a, b).amountInCents).toBe(2000);

    expect(() => subtractMoney(b, a)).toThrow(InvalidMoneyError);
  });

  it('compares money accurately', () => {
    const cheaper = createMoney(5000, 'EUR');
    const expensive = createMoney(8500, 'EUR');
    expect(compareMoney(cheaper, expensive)).toBeLessThan(0);
    expect(compareMoney(expensive, cheaper)).toBeGreaterThan(0);
    expect(compareMoney(cheaper, createMoney(5000, 'EUR'))).toBe(0);
  });

  it('computes and formats B2C gross prices with 21 % Spanish VAT', () => {
    expect(grossCentsWithVat(10000)).toBe(12100);
    expect(grossCentsWithVat(4500)).toBe(5445);
    expect(moneyWithVat(createMoney(10000, 'EUR')).amountInCents).toBe(12100);
    expect(formatMoneyWithVat(createMoney(10000, 'EUR'))).toBe('121,00 EUR');
    expect(formatMoneyWithVat(createMoney(4500, 'EUR'))).toBe('54,45 EUR');
  });
});
