import { describe, expect, it } from 'vitest';
import {
  fxLookup,
  fyLabel,
  fyMonths,
  fyStartYearOf,
  monthlyAudCents,
  monthlyNativeAmount,
  summarizeFY,
  summarizeMonth,
  unratedCurrencies,
} from '../budgetCalc';
import type { BudgetFxRate, BudgetLine } from '../types';

const base = {
  owner_id: 'o',
  currency: 'AUD',
  start_month: null,
  end_month: null,
  notes: '',
  sort_order: 0,
  created_at: '2026-01-01',
  updated_at: '2026-01-01',
  deleted_at: null,
};

function line(
  kind: BudgetLine['kind'],
  category: string,
  amount: number,
  frequency: BudgetLine['frequency'],
  extra: Partial<BudgetLine> = {}
): BudgetLine {
  return { id: `${category}-${amount}-${frequency}`, kind, category, label: category, amount, frequency, active: true, ...base, ...extra };
}

function fx(currency: string, rate: number): BudgetFxRate {
  return { id: currency, owner_id: 'o', currency, rate_to_aud: rate, created_at: '2026-01-01', updated_at: '2026-01-01', deleted_at: null };
}

describe('Australian financial year', () => {
  it('assigns months to the right FY (Jul–Jun)', () => {
    expect(fyStartYearOf('2025-07')).toBe(2025);
    expect(fyStartYearOf('2025-12')).toBe(2025);
    expect(fyStartYearOf('2026-06')).toBe(2025); // still FY25-26
    expect(fyStartYearOf('2026-07')).toBe(2026); // new FY
  });
  it('lists the 12 FY months Jul→Jun and labels the year', () => {
    const months = fyMonths(2025);
    expect(months[0]).toBe('2025-07');
    expect(months[5]).toBe('2025-12');
    expect(months[6]).toBe('2026-01');
    expect(months[11]).toBe('2026-06');
    expect(months).toHaveLength(12);
    expect(fyLabel(2025)).toBe('FY 2025–26');
  });
});

describe('currency conversion', () => {
  const rates = fxLookup([fx('EUR', 1.6)]);
  it('converts a foreign-currency line to AUD', () => {
    // €5,000/mo salary at 1.6 = A$8,000/mo
    const l = line('income', 'salary', 5000, 'monthly', { currency: 'EUR' });
    expect(monthlyAudCents(l, '2025-08', rates)).toBe(800000);
  });
  it('leaves AUD lines unchanged', () => {
    const l = line('expense', 'rent', 2400, 'monthly'); // AUD
    expect(monthlyAudCents(l, '2025-08', rates)).toBe(240000);
  });
  it('flags currencies with no rate set', () => {
    const lines = [line('income', 'salary', 100, 'monthly', { currency: 'EUR' }), line('income', 'x', 1, 'monthly', { currency: 'USD' })];
    expect(unratedCurrencies(lines, fxLookup([fx('EUR', 1.6)]))).toEqual(['USD']);
  });
});

describe('per-month contribution: frequency, window, one-off', () => {
  const rates = fxLookup([]);
  it('amortises recurring frequencies to a monthly figure', () => {
    expect(monthlyNativeAmount(line('income', 'r', 500, 'weekly'), '2025-08')).toBeCloseTo(2166.67, 2);
    expect(monthlyNativeAmount(line('expense', 'q', 600, 'quarterly'), '2025-08')).toBe(200);
    expect(monthlyNativeAmount(line('expense', 'a', 1200, 'annual'), '2025-08')).toBe(100);
  });
  it('honours the month window', () => {
    const l = line('income', 'contract', 3000, 'monthly', { start_month: '2025-09', end_month: '2025-11' });
    expect(monthlyAudCents(l, '2025-08', rates)).toBe(0); // before window
    expect(monthlyAudCents(l, '2025-10', rates)).toBe(300000); // inside
    expect(monthlyAudCents(l, '2025-12', rates)).toBe(0); // after window
  });
  it('one-off lands the whole amount in its start month only', () => {
    const bonus = line('income', 'bonus', 20000, 'one_off', { start_month: '2025-12' });
    expect(monthlyAudCents(bonus, '2025-11', rates)).toBe(0);
    expect(monthlyAudCents(bonus, '2025-12', rates)).toBe(2000000);
    expect(monthlyAudCents(bonus, '2026-01', rates)).toBe(0);
  });
});

describe('summarizeMonth / summarizeFY', () => {
  const rates = fxLookup([fx('EUR', 1.6)]);
  const lines: BudgetLine[] = [
    line('income', 'salary', 5000, 'monthly', { currency: 'EUR' }), // A$8,000/mo
    line('income', 'rental_income', 600, 'weekly'), // A$2,600/mo
    line('expense', 'mortgage', 3200, 'monthly'),
    line('expense', 'insurance', 6000, 'annual'), // A$500/mo
    line('income', 'bonus', 15000, 'one_off', { start_month: '2025-12' }),
  ];

  it('nets a single month to free cash in AUD', () => {
    const aug = summarizeMonth(lines, rates, '2025-08');
    expect(aug.incomeAud).toBeCloseTo(10600, 2); // 8000 + 2600, no bonus
    expect(aug.expensesAud).toBeCloseTo(3700, 2); // 3200 + 500
    expect(aug.freeCashAud).toBeCloseTo(6900, 2);
  });

  it('reflects the one-off only in its month', () => {
    const dec = summarizeMonth(lines, rates, '2025-12');
    expect(dec.incomeAud).toBeCloseTo(25600, 2); // 10600 + 15000 bonus
  });

  it('builds the FY total from the 12 months', () => {
    const fy = summarizeFY(lines, rates, 2025);
    expect(fy.months).toHaveLength(12);
    // 12 × 10,600 recurring income + 15,000 one-off = 142,200
    expect(fy.totalIncomeAud).toBeCloseTo(142200, 0);
    // 12 × 3,700 = 44,400 expenses
    expect(fy.totalExpensesAud).toBeCloseTo(44400, 0);
    expect(fy.totalFreeCashAud).toBeCloseTo(97800, 0);
    expect(fy.savingsRate).toBeGreaterThan(0);
    // December carries the bonus
    const dec = fy.months.find((m) => m.month === '2025-12')!;
    expect(dec.incomeAud).toBeCloseTo(25600, 2);
  });

  it('ignores inactive and soft-deleted lines', () => {
    const noisy = [
      ...lines,
      line('expense', 'x', 9999, 'monthly', { active: false }),
      line('income', 'y', 9999, 'monthly', { deleted_at: '2026-02-01' }),
    ];
    const aug = summarizeMonth(noisy, rates, '2025-08');
    expect(aug.expensesAud).toBeCloseTo(3700, 2);
    expect(aug.incomeAud).toBeCloseTo(10600, 2);
  });
});
