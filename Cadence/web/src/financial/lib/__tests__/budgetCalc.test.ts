import { describe, expect, it } from 'vitest';
import { annualAmount, monthlyAmount, summarizeBudget } from '../budgetCalc';
import type { BudgetLine } from '../types';

const base = { owner_id: 'o', notes: '', sort_order: 0, created_at: '2026-01-01', updated_at: '2026-01-01', deleted_at: null };

function line(kind: BudgetLine['kind'], category: string, amount: number, frequency: BudgetLine['frequency'], extra: Partial<BudgetLine> = {}): BudgetLine {
  return { id: `${category}-${amount}`, kind, category, label: category, amount, frequency, active: true, ...base, ...extra };
}

describe('frequency normalisation', () => {
  it('annualises via occurrences per year, not 4-week months', () => {
    // $100/week = $5,200/yr = $433.33/mo (not $400)
    expect(annualAmount({ amount: 100, frequency: 'weekly' })).toBe(5200);
    expect(monthlyAmount({ amount: 100, frequency: 'weekly' })).toBeCloseTo(433.33, 2);
    // fortnightly $200 = $5,200/yr
    expect(annualAmount({ amount: 200, frequency: 'fortnightly' })).toBe(5200);
    // quarterly $300 = $1,200/yr = $100/mo
    expect(monthlyAmount({ amount: 300, frequency: 'quarterly' })).toBe(100);
    // annual $1,200 = $100/mo
    expect(monthlyAmount({ amount: 1200, frequency: 'annual' })).toBe(100);
    // monthly passes straight through
    expect(monthlyAmount({ amount: 2500, frequency: 'monthly' })).toBe(2500);
  });
});

describe('summarizeBudget', () => {
  const lines: BudgetLine[] = [
    line('income', 'salary', 9000, 'monthly'),
    line('income', 'rental_income', 500, 'weekly'), // 2166.67/mo
    line('income', 'interest', 1200, 'annual'), // 100/mo
    line('expense', 'mortgage', 3200, 'monthly'),
    line('expense', 'credit_card', 800, 'monthly'),
    line('expense', 'rent', 300, 'weekly'), // 1300/mo
    line('expense', 'utilities', 600, 'quarterly'), // 200/mo
  ];

  it('nets income against payments to free cash', () => {
    const s = summarizeBudget(lines);
    expect(s.monthlyIncome).toBeCloseTo(11266.67, 2);
    expect(s.monthlyExpenses).toBeCloseTo(5500, 2);
    expect(s.monthlyFreeCash).toBeCloseTo(5766.67, 2);
    expect(s.annualFreeCash).toBeCloseTo(69200.04, 1);
  });

  it('computes a savings rate and category breakdown, largest first', () => {
    const s = summarizeBudget(lines);
    expect(s.savingsRate).toBeCloseTo(5766.67 / 11266.67, 4);
    expect(s.expenseByCategory[0].category).toBe('mortgage');
    expect(s.expenseByCategory[0].monthly).toBe(3200);
    expect(s.incomeByCategory[0].category).toBe('salary');
  });

  it('ignores inactive and soft-deleted lines', () => {
    const withNoise = [
      ...lines,
      line('expense', 'subscriptions', 5000, 'monthly', { active: false }),
      line('income', 'business', 9999, 'monthly', { deleted_at: '2026-02-01' }),
    ];
    const s = summarizeBudget(withNoise);
    expect(s.monthlyExpenses).toBeCloseTo(5500, 2); // inactive sub excluded
    expect(s.monthlyIncome).toBeCloseTo(11266.67, 2); // deleted business excluded
  });

  it('handles no income without dividing by zero', () => {
    const s = summarizeBudget([line('expense', 'rent', 400, 'weekly')]);
    expect(s.savingsRate).toBe(0);
    expect(s.monthlyFreeCash).toBeCloseTo(-1733.33, 2);
  });
});
