import { describe, expect, it } from 'vitest';
import { formatMoney, todayLocalISO } from '../util';

describe('formatMoney compact boundary', () => {
  it('promotes to millions where the k-figure would read "1000.0k"', () => {
    expect(formatMoney(999_949, true)).toBe('A$999.9k');
    expect(formatMoney(999_950, true)).toBe('A$1.00m');
    expect(formatMoney(1_000_000, true)).toBe('A$1.00m');
    expect(formatMoney(-999_990, true)).toBe('-A$1.00m');
  });
});

describe('todayLocalISO', () => {
  it('is the LOCAL calendar date, zero-padded', () => {
    const d = new Date();
    const expected = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    expect(todayLocalISO()).toBe(expected);
  });
});
