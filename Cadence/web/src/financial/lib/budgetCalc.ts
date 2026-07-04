// ── Macro budget maths ──────────────────────────────────────────────────────
// Everything a budget line implies is derived here, never stored: monthly and
// annual equivalents, income/expense totals, free cash, savings rate and the
// per-category breakdown. Same integer-cents discipline as financeCalc.ts so
// rounding is exact and totals reconcile.

import { toCents, centsToDollars } from './financeCalc';
import type { BudgetFrequency, BudgetLine } from './types';

// How many times a frequency occurs per year — the honest annualisation
// (weekly = 52, fortnightly = 26), then divided by 12 for the monthly view.
const PER_YEAR: Record<BudgetFrequency, number> = {
  weekly: 52,
  fortnightly: 26,
  monthly: 12,
  quarterly: 4,
  annual: 1,
};

// Monthly-equivalent of one line, in cents. Weekly/fortnightly convert via the
// annual count (a "monthly" bill is not 4 weeks), so a $100/week line is
// $433.33/mo, not $400.
export function monthlyCents(line: Pick<BudgetLine, 'amount' | 'frequency'>): number {
  const annualC = toCents(line.amount) * PER_YEAR[line.frequency];
  // round half away from zero to the nearest cent
  return Math.sign(annualC) * Math.round(Math.abs(annualC) / 12);
}

export function monthlyAmount(line: Pick<BudgetLine, 'amount' | 'frequency'>): number {
  return centsToDollars(monthlyCents(line));
}

export function annualAmount(line: Pick<BudgetLine, 'amount' | 'frequency'>): number {
  return centsToDollars(toCents(line.amount) * PER_YEAR[line.frequency]);
}

export interface CategoryTotal {
  category: string;
  monthly: number;
  annual: number;
  lineCount: number;
}

export interface BudgetSummary {
  monthlyIncome: number;
  monthlyExpenses: number;
  monthlyFreeCash: number; // income − expenses
  annualIncome: number;
  annualExpenses: number;
  annualFreeCash: number;
  // free cash ÷ income, 0 when there's no income (avoids divide-by-zero).
  savingsRate: number;
  incomeByCategory: CategoryTotal[]; // largest first
  expenseByCategory: CategoryTotal[]; // largest first
}

// Only active, non-deleted lines count toward the plan.
function activeLines(lines: BudgetLine[]): BudgetLine[] {
  return lines.filter((l) => l.active && !l.deleted_at);
}

function categoryTotals(lines: BudgetLine[]): CategoryTotal[] {
  const byCat = new Map<string, { monthlyC: number; count: number }>();
  for (const l of lines) {
    const cur = byCat.get(l.category) ?? { monthlyC: 0, count: 0 };
    cur.monthlyC += monthlyCents(l);
    cur.count += 1;
    byCat.set(l.category, cur);
  }
  return [...byCat.entries()]
    .map(([category, v]) => ({
      category,
      monthly: centsToDollars(v.monthlyC),
      annual: centsToDollars(v.monthlyC * 12),
      lineCount: v.count,
    }))
    .sort((a, b) => b.monthly - a.monthly);
}

export function summarizeBudget(lines: BudgetLine[]): BudgetSummary {
  const active = activeLines(lines);
  const income = active.filter((l) => l.kind === 'income');
  const expenses = active.filter((l) => l.kind === 'expense');

  const incomeMonthlyC = income.reduce((s, l) => s + monthlyCents(l), 0);
  const expenseMonthlyC = expenses.reduce((s, l) => s + monthlyCents(l), 0);
  const freeMonthlyC = incomeMonthlyC - expenseMonthlyC;

  return {
    monthlyIncome: centsToDollars(incomeMonthlyC),
    monthlyExpenses: centsToDollars(expenseMonthlyC),
    monthlyFreeCash: centsToDollars(freeMonthlyC),
    annualIncome: centsToDollars(incomeMonthlyC * 12),
    annualExpenses: centsToDollars(expenseMonthlyC * 12),
    annualFreeCash: centsToDollars(freeMonthlyC * 12),
    savingsRate: incomeMonthlyC > 0 ? freeMonthlyC / incomeMonthlyC : 0,
    incomeByCategory: categoryTotals(income),
    expenseByCategory: categoryTotals(expenses),
  };
}
