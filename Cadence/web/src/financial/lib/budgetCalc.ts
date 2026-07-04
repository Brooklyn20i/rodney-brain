// ── Macro budget maths ──────────────────────────────────────────────────────
// A per-month budget over the Australian financial year (1 Jul → 30 Jun),
// rolled up to an annual view. Everything is derived here, never stored:
// per-month contributions, currency conversion to an AUD base, income/expense
// totals and free cash. Integer-cents discipline (as financeCalc.ts) so
// rounding is exact and the 12 months reconcile to the annual total.

import { toCents, centsToDollars } from './financeCalc';
import type { BudgetFrequency, BudgetFxRate, BudgetLine } from './types';

// Occurrences per year — the honest annualisation (weekly = 52). one_off is
// special (whole amount in one month), handled separately.
const PER_YEAR: Record<Exclude<BudgetFrequency, 'one_off'>, number> = {
  weekly: 52,
  fortnightly: 26,
  monthly: 12,
  quarterly: 4,
  annual: 1,
};

// ── Australian financial year ───────────────────────────────────────────────
// FY "2025" means 1 Jul 2025 → 30 Jun 2026. The month a date falls in decides
// its FY: Jan–Jun belong to the FY that started the previous July.

export function fyStartYearOf(month: string): number {
  const [y, m] = month.split('-').map(Number);
  return m >= 7 ? y : y - 1;
}

export function currentFyStartYear(todayMonth: string): number {
  return fyStartYearOf(todayMonth);
}

// The 12 months of an FY in order: ['2025-07', …, '2026-06'].
export function fyMonths(fyStartYear: number): string[] {
  const out: string[] = [];
  for (let i = 0; i < 12; i++) {
    const monthIndex = 6 + i; // 0-based July = 6
    const y = fyStartYear + Math.floor(monthIndex / 12);
    const m = (monthIndex % 12) + 1;
    out.push(`${y}-${String(m).padStart(2, '0')}`);
  }
  return out;
}

// 'FY 2025–26'
export function fyLabel(fyStartYear: number): string {
  return `FY ${fyStartYear}–${String((fyStartYear + 1) % 100).padStart(2, '0')}`;
}

// ── Currency ────────────────────────────────────────────────────────────────

export type RateLookup = Map<string, number>;

export function fxLookup(rates: BudgetFxRate[]): RateLookup {
  const m = new Map<string, number>();
  for (const r of rates) {
    if (!r.deleted_at) m.set(r.currency.toUpperCase(), Number(r.rate_to_aud));
  }
  m.set('AUD', 1); // base is always 1, regardless of any stored row
  return m;
}

// Rate to convert one unit of `currency` to AUD. AUD = 1. An unset foreign
// currency falls back to 1 (and the UI flags it) so totals never silently
// vanish — a visible-but-wrong number prompts the owner to set the rate.
export function rateToAud(currency: string, rates: RateLookup): number {
  const c = (currency || 'AUD').toUpperCase();
  return rates.get(c) ?? 1;
}

// Currencies used by lines that have no rate set (AUD excluded). The UI uses
// this to prompt "set your EUR→AUD rate".
export function unratedCurrencies(lines: BudgetLine[], rates: RateLookup): string[] {
  const missing = new Set<string>();
  for (const l of lines) {
    if (l.deleted_at) continue;
    const c = (l.currency || 'AUD').toUpperCase();
    if (c !== 'AUD' && !rates.has(c)) missing.add(c);
  }
  return [...missing].sort();
}

// ── Per-month contribution ──────────────────────────────────────────────────

function inWindow(line: BudgetLine, month: string): boolean {
  if (line.start_month && month < line.start_month) return false;
  if (line.end_month && month > line.end_month) return false;
  return true;
}

// This line's contribution to `month`, in AUD cents. 0 if inactive, deleted,
// or outside its window. Recurring frequencies are amortised to a monthly
// figure; one_off puts the whole amount in start_month only.
export function monthlyAudCents(line: BudgetLine, month: string, rates: RateLookup): number {
  if (!line.active || line.deleted_at) return 0;
  if (!inWindow(line, month)) return 0;

  const nativeC = toCents(Number(line.amount));
  let perMonthNativeC: number;
  if (line.frequency === 'one_off') {
    // Whole amount in the anchor month. If no start_month, treat the line as
    // not yet placed (contributes nothing) rather than guessing a month.
    perMonthNativeC = line.start_month === month ? nativeC : 0;
  } else {
    const annualC = nativeC * PER_YEAR[line.frequency];
    perMonthNativeC = Math.sign(annualC) * Math.round(Math.abs(annualC) / 12);
  }
  if (perMonthNativeC === 0) return 0;

  const rate = rateToAud(line.currency, rates);
  return Math.sign(perMonthNativeC) * Math.round(Math.abs(perMonthNativeC) * rate);
}

// Native monthly amount (before FX) — for showing the line's own figure.
export function monthlyNativeAmount(line: BudgetLine, month: string): number {
  if (line.frequency === 'one_off') {
    return line.start_month === month ? Number(line.amount) : 0;
  }
  if (line.start_month && month < line.start_month) return 0;
  if (line.end_month && month > line.end_month) return 0;
  const annualC = toCents(Number(line.amount)) * PER_YEAR[line.frequency];
  return centsToDollars(Math.sign(annualC) * Math.round(Math.abs(annualC) / 12));
}

// ── Month + year summaries ──────────────────────────────────────────────────

export interface CategoryTotal {
  category: string;
  aud: number;
  lineCount: number;
}

export interface MonthSummary {
  month: string;
  incomeAud: number;
  expensesAud: number;
  freeCashAud: number;
  incomeByCategory: CategoryTotal[];
  expenseByCategory: CategoryTotal[];
}

export function summarizeMonth(lines: BudgetLine[], rates: RateLookup, month: string): MonthSummary {
  let incomeC = 0;
  let expenseC = 0;
  const incCat = new Map<string, { c: number; n: number }>();
  const expCat = new Map<string, { c: number; n: number }>();
  for (const l of lines) {
    const c = monthlyAudCents(l, month, rates);
    if (c === 0) continue;
    if (l.kind === 'income') {
      incomeC += c;
      const cur = incCat.get(l.category) ?? { c: 0, n: 0 };
      incCat.set(l.category, { c: cur.c + c, n: cur.n + 1 });
    } else {
      expenseC += c;
      const cur = expCat.get(l.category) ?? { c: 0, n: 0 };
      expCat.set(l.category, { c: cur.c + c, n: cur.n + 1 });
    }
  }
  const toTotals = (m: Map<string, { c: number; n: number }>): CategoryTotal[] =>
    [...m.entries()]
      .map(([category, v]) => ({ category, aud: centsToDollars(v.c), lineCount: v.n }))
      .sort((a, b) => b.aud - a.aud);

  return {
    month,
    incomeAud: centsToDollars(incomeC),
    expensesAud: centsToDollars(expenseC),
    freeCashAud: centsToDollars(incomeC - expenseC),
    incomeByCategory: toTotals(incCat),
    expenseByCategory: toTotals(expCat),
  };
}

export interface FyMonthRow {
  month: string;
  incomeAud: number;
  expensesAud: number;
  freeCashAud: number;
}

export interface FySummary {
  fyStartYear: number;
  months: FyMonthRow[];
  totalIncomeAud: number;
  totalExpensesAud: number;
  totalFreeCashAud: number;
  savingsRate: number; // free cash ÷ income, 0 when no income
}

// The whole financial year, month by month, built up to the annual total.
export function summarizeFY(lines: BudgetLine[], rates: RateLookup, fyStartYear: number): FySummary {
  const months = fyMonths(fyStartYear).map((month) => {
    const s = summarizeMonth(lines, rates, month);
    return { month, incomeAud: s.incomeAud, expensesAud: s.expensesAud, freeCashAud: s.freeCashAud };
  });
  const totalIncomeC = months.reduce((s, m) => s + toCents(m.incomeAud), 0);
  const totalExpenseC = months.reduce((s, m) => s + toCents(m.expensesAud), 0);
  const freeC = totalIncomeC - totalExpenseC;
  return {
    fyStartYear,
    months,
    totalIncomeAud: centsToDollars(totalIncomeC),
    totalExpensesAud: centsToDollars(totalExpenseC),
    totalFreeCashAud: centsToDollars(freeC),
    savingsRate: totalIncomeC > 0 ? freeC / totalIncomeC : 0,
  };
}
