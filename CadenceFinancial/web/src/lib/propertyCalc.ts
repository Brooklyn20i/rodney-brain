// Property portfolio P&L engine.
//
// Turns the property_ledger (one row per rent-statement / cost line) into
// per-property and portfolio-level profit & loss. Net cashflow here is an
// interest-only P&L figure: rent + other income, less operating costs and
// loan interest, but NOT loan principal (principal is a balance-sheet
// transfer, not a P&L expense). That's the number that tells you whether a
// property earns its keep month to month.
//
// Pure functions, integer-cents arithmetic (see financeCalc.ts). Nothing is
// ever stored back to a row.

import type { Property, PropertyLedgerCategory, PropertyLedgerEntry } from './types';
import { centsToDollars, toCents } from './financeCalc';

export const INCOME_CATEGORIES = new Set<PropertyLedgerCategory>(['rent', 'other_income']);

export function isIncome(category: PropertyLedgerCategory): boolean {
  return INCOME_CATEGORIES.has(category);
}

// Expense categories in the order they should render on a statement.
export const EXPENSE_CATEGORIES: PropertyLedgerCategory[] = [
  'interest',
  'insurance',
  'strata',
  'water',
  'council_rates',
  'land_tax',
  'management_fees',
  'repairs_maintenance',
  'utilities',
  'other_expense',
];

export const PROPERTY_CATEGORY_LABEL: Record<PropertyLedgerCategory, string> = {
  rent: 'Rent',
  other_income: 'Other income',
  interest: 'Loan interest',
  insurance: 'Insurance',
  strata: 'Strata / body corp',
  water: 'Water',
  council_rates: 'Council rates',
  land_tax: 'Land tax',
  management_fees: 'Management fees',
  repairs_maintenance: 'Repairs & maintenance',
  utilities: 'Utilities',
  other_expense: 'Other expense',
};

export interface PropertyPnL {
  propertyId: string;
  period: string;
  rent: number;
  otherIncome: number;
  totalIncome: number;
  // Expense total per category (only categories with a non-zero amount).
  expensesByCategory: Partial<Record<PropertyLedgerCategory, number>>;
  totalExpenses: number;
  netCashflow: number; // totalIncome - totalExpenses (interest-only P&L)
}

function entriesFor(
  entries: PropertyLedgerEntry[],
  propertyId: string,
  period: string
): PropertyLedgerEntry[] {
  return entries.filter((e) => e.property_id === propertyId && e.period === period);
}

export function monthlyPnL(
  entries: PropertyLedgerEntry[],
  propertyId: string,
  period: string
): PropertyPnL {
  const rows = entriesFor(entries, propertyId, period);
  let rentC = 0;
  let otherIncomeC = 0;
  let totalExpensesC = 0;
  const byCatC: Partial<Record<PropertyLedgerCategory, number>> = {};

  for (const e of rows) {
    const amtC = toCents(e.amount);
    if (e.category === 'rent') rentC += amtC;
    else if (e.category === 'other_income') otherIncomeC += amtC;
    else {
      totalExpensesC += amtC;
      byCatC[e.category] = (byCatC[e.category] ?? 0) + amtC;
    }
  }

  const expensesByCategory: Partial<Record<PropertyLedgerCategory, number>> = {};
  for (const cat of EXPENSE_CATEGORIES) {
    if (byCatC[cat] !== undefined) expensesByCategory[cat] = centsToDollars(byCatC[cat]!);
  }

  const totalIncomeC = rentC + otherIncomeC;
  return {
    propertyId,
    period,
    rent: centsToDollars(rentC),
    otherIncome: centsToDollars(otherIncomeC),
    totalIncome: centsToDollars(totalIncomeC),
    expensesByCategory,
    totalExpenses: centsToDollars(totalExpensesC),
    netCashflow: centsToDollars(totalIncomeC - totalExpensesC),
  };
}

export interface PortfolioMonth {
  period: string;
  rows: (PropertyPnL & { address: string; value: number })[];
  totalIncome: number;
  totalExpenses: number;
  netCashflow: number;
  // Portfolio-wide expense total per category -- "where the costs come from".
  byCategory: Partial<Record<PropertyLedgerCategory, number>>;
}

export function portfolioMonth(
  entries: PropertyLedgerEntry[],
  properties: Property[],
  period: string
): PortfolioMonth {
  const byCatC: Partial<Record<PropertyLedgerCategory, number>> = {};
  let totalIncomeC = 0;
  let totalExpensesC = 0;

  const rows = properties.map((p) => {
    const pnl = monthlyPnL(entries, p.id, period);
    totalIncomeC += toCents(pnl.totalIncome);
    totalExpensesC += toCents(pnl.totalExpenses);
    for (const cat of EXPENSE_CATEGORIES) {
      const v = pnl.expensesByCategory[cat];
      if (v !== undefined) byCatC[cat] = (byCatC[cat] ?? 0) + toCents(v);
    }
    return { ...pnl, address: p.address, value: p.value };
  });

  const byCategory: Partial<Record<PropertyLedgerCategory, number>> = {};
  for (const cat of EXPENSE_CATEGORIES) {
    if (byCatC[cat] !== undefined) byCategory[cat] = centsToDollars(byCatC[cat]!);
  }

  return {
    period,
    rows,
    totalIncome: centsToDollars(totalIncomeC),
    totalExpenses: centsToDollars(totalExpensesC),
    netCashflow: centsToDollars(totalIncomeC - totalExpensesC),
    byCategory,
  };
}

// Sorted unique 'YYYY-MM' periods present in the ledger, most recent last.
export function availablePeriods(entries: PropertyLedgerEntry[]): string[] {
  return [...new Set(entries.map((e) => e.period))].sort();
}

export interface TrailingAverages {
  months: number;
  avgIncome: number;
  avgExpenses: number;
  avgNet: number;
}

// Averages over the trailing N periods that actually have entries for this
// property (so a property with 3 months of data averages over 3, not N).
export function trailingAverages(
  entries: PropertyLedgerEntry[],
  propertyId: string,
  trailingWindow = 6
): TrailingAverages {
  const periods = availablePeriods(entries.filter((e) => e.property_id === propertyId));
  const window = periods.slice(-trailingWindow);
  if (window.length === 0) return { months: 0, avgIncome: 0, avgExpenses: 0, avgNet: 0 };

  let incC = 0;
  let expC = 0;
  for (const period of window) {
    const pnl = monthlyPnL(entries, propertyId, period);
    incC += toCents(pnl.totalIncome);
    expC += toCents(pnl.totalExpenses);
  }
  const n = window.length;
  return {
    months: n,
    avgIncome: centsToDollars(Math.round(incC / n)),
    avgExpenses: centsToDollars(Math.round(expC / n)),
    avgNet: centsToDollars(Math.round((incC - expC) / n)),
  };
}

export interface PropertyYields {
  grossYield: number | null; // annualised gross rent / value
  netYield: number | null; // annualised net cashflow / value
}

// Yields annualise a monthly income/net figure (×12) against property value.
// Pass the trailing-average monthly figures for a smoothed read, or a single
// month's for a point read. Null when value is zero.
export function propertyYields(
  monthlyIncome: number,
  monthlyNet: number,
  value: number
): PropertyYields {
  if (value <= 0) return { grossYield: null, netYield: null };
  return {
    grossYield: (monthlyIncome * 12) / value,
    netYield: (monthlyNet * 12) / value,
  };
}
