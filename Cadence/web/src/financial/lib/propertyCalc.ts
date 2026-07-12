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

import type { Loan, Property, PropertyLedgerCategory, PropertyLedgerEntry } from './types';
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
  // Portfolio-wide logged expense totals by category for the selected month.
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

export interface PropertyAnnualRunRate {
  months: number;
  annualIncome: number;
  annualExpenses: number;
  annualNet: number;
  provisional: boolean;
  notes: string[];
}

const QUARTERLY_BILL_CATEGORIES = new Set<PropertyLedgerCategory>(['strata', 'water', 'council_rates']);
const ANNUAL_BILL_CATEGORIES = new Set<PropertyLedgerCategory>(['insurance', 'land_tax']);
const ONE_OFF_EXPENSE_CATEGORIES = new Set<PropertyLedgerCategory>(['repairs_maintenance']);

function looksLikeMonthlyAccrual(e: PropertyLedgerEntry): boolean {
  const text = `${e.source} ${e.notes}`.toLowerCase();
  return /monthly|per month|\/\s*12|\/\s*3|accrual/.test(text);
}

function avgBillAnnualised(rows: PropertyLedgerEntry[], multiplier: number): number {
  if (rows.length === 0) return 0;
  const totalC = rows.reduce((s, e) => s + toCents(e.amount), 0);
  return centsToDollars(Math.round((totalC / rows.length) * multiplier));
}

function monthlyAccrualAnnualised(rows: PropertyLedgerEntry[]): number {
  const periods = availablePeriods(rows);
  if (periods.length === 0) return 0;
  const totalC = rows.reduce((s, e) => s + toCents(e.amount), 0);
  return centsToDollars(Math.round((totalC / periods.length) * 12));
}

// Converts actual property-ledger lines into a sensible annual run-rate.
// Important: not every ledger row is monthly. Water/council/body-corp bills are
// usually quarterly; insurance/land tax are often annual; repairs are one-off.
// The old trailing.avgNet × 12 approach treated one quarterly water bill as if
// it recurred every month, which created false negative-gearing signals.
export function propertyAnnualRunRate(
  entries: PropertyLedgerEntry[],
  property: Property,
  trailing: TrailingAverages = trailingAverages(entries, property.id)
): PropertyAnnualRunRate {
  const rows = entries.filter((e) => e.property_id === property.id);
  const months = availablePeriods(rows).length;
  const weeklyRent = property.weekly_rent ?? 0;
  const annualIncome = weeklyRent > 0 ? weeklyRent * 52 : trailing.avgIncome * 12;

  let annualExpensesC = 0;
  for (const cat of EXPENSE_CATEGORIES) {
    const catRows = rows.filter((e) => e.category === cat);
    if (catRows.length === 0) continue;

    let annualised = 0;
    if (catRows.some(looksLikeMonthlyAccrual)) {
      annualised = monthlyAccrualAnnualised(catRows);
    } else if (QUARTERLY_BILL_CATEGORIES.has(cat)) {
      annualised = avgBillAnnualised(catRows, 4);
    } else if (ANNUAL_BILL_CATEGORIES.has(cat)) {
      annualised = avgBillAnnualised(catRows, 1);
    } else if (ONE_OFF_EXPENSE_CATEGORIES.has(cat)) {
      annualised = centsToDollars(catRows.reduce((s, e) => s + toCents(e.amount), 0));
    } else {
      annualised = monthlyAccrualAnnualised(catRows);
    }
    annualExpensesC += toCents(annualised);
  }

  const annualIncomeC = toCents(annualIncome);
  const annualExpenses = centsToDollars(annualExpensesC);
  const notes: string[] = [];
  if (months < 3) notes.push(`Only ${months} ledger month${months === 1 ? '' : 's'} on file.`);
  if (weeklyRent <= 0 && trailing.avgIncome <= 0) notes.push('No rent baseline on file.');
  notes.push('Quarterly bills are annualised ×4; annual bills ×1; repairs are treated as one-off.');

  return {
    months,
    annualIncome: centsToDollars(annualIncomeC),
    annualExpenses,
    annualNet: centsToDollars(annualIncomeC - annualExpensesC),
    provisional: months < 3 || (weeklyRent <= 0 && trailing.avgIncome <= 0),
    notes,
  };
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

// ── Full per-property investment metrics ────────────────────────────────
// The dashboard a serious property tool shows per property: acquisition
// economics, financing/LVR, income yields (on value AND on cost), capital
// growth CAGR, weekly cashflow, cash-on-cash, total return, and the
// after-depreciation tax position. Pure; guards every optional field.

const MS_PER_YEAR = 365.25 * 24 * 60 * 60 * 1000;

export type GearingStatus = 'positive' | 'neutral' | 'negative';

export interface PropertyFinancials {
  value: number;
  // Financing (summed across this property's loans).
  debt: number; // gross loan balance
  offset: number;
  netDebt: number; // debt - offset, floored at 0
  equity: number; // value - gross debt
  usableEquity: number; // max(0, 0.8*value - debt) -- borrowable headroom
  lvr: number | null; // gross debt / value

  // Acquisition & capital growth.
  purchasePrice: number;
  capitalGrowth: number; // value - purchase price
  capitalGrowthPct: number | null; // vs purchase price
  years: number | null; // held, from purchase_date
  cagr: number | null; // annualised capital growth rate

  // Income.
  annualRent: number; // weekly_rent*52 if set, else trailing income annualised
  grossYield: number | null; // annualRent / value
  yieldOnCost: number | null; // annualRent / purchase price

  // Cashflow (interest-only P&L basis).
  annualNet: number; // trailing avg monthly net * 12
  netYield: number | null; // annualNet / value
  weeklyCashflow: number; // annualNet / 52 -- the "out of pocket per week" read
  cashInvested: number;
  cashOnCash: number | null; // annualNet / cash invested
  gearing: GearingStatus;

  // Tax (depreciation is a non-cash deduction).
  depreciationAnnual: number;
  taxablePosition: number; // annualNet - depreciation (annual)
  negativelyGeared: boolean; // taxable position < 0

  // Total return = income return + capital growth rate.
  totalReturnPct: number | null; // netYield + cagr
  totalReturnAnnual: number; // annualNet + implied annual capital growth ($)

  // Lease.
  weeklyRent: number;
  leaseEnd: string | null;
  daysToLeaseEnd: number | null;

  // Basis used for annualised net-cashflow metrics when supplied by the UI.
  annualRunRate: PropertyAnnualRunRate | null;
}

// trailing: the trailingAverages() result for this property (monthly figures).
// asOf: reference date for CAGR / lease countdown (defaults to now); passed in
// so tests are deterministic.
export function propertyFinancials(
  property: Property,
  loans: Loan[],
  trailing: TrailingAverages,
  asOf: Date = new Date(),
  runRate: PropertyAnnualRunRate | null = null
): PropertyFinancials {
  const value = property.value;
  const debtC = loans.reduce((s, l) => s + toCents(l.balance), 0);
  const offsetC = loans.reduce((s, l) => s + toCents(l.offset_balance), 0);
  const debt = centsToDollars(debtC);
  const offset = centsToDollars(offsetC);
  const netDebt = centsToDollars(Math.max(0, debtC - offsetC));
  const equity = centsToDollars(toCents(value) - debtC);
  const usableEquity = centsToDollars(Math.max(0, Math.round(toCents(value) * 0.8) - debtC));
  const lvr = value > 0 ? debt / value : null;

  const purchasePrice = property.purchase_price ?? 0;
  const capitalGrowth = purchasePrice > 0 ? value - purchasePrice : 0;
  const capitalGrowthPct = purchasePrice > 0 ? capitalGrowth / purchasePrice : null;

  let years: number | null = null;
  let cagr: number | null = null;
  if (property.purchase_date && purchasePrice > 0 && value > 0) {
    const y = (asOf.getTime() - new Date(property.purchase_date + 'T00:00:00').getTime()) / MS_PER_YEAR;
    if (y > 0) {
      years = y;
      cagr = Math.pow(value / purchasePrice, 1 / y) - 1;
    }
  }

  const weeklyRent = property.weekly_rent ?? 0;
  const annualRent = runRate?.annualIncome ?? (weeklyRent > 0 ? weeklyRent * 52 : trailing.avgIncome * 12);
  const grossYield = value > 0 ? annualRent / value : null;
  const yieldOnCost = purchasePrice > 0 ? annualRent / purchasePrice : null;

  const annualNet = runRate?.annualNet ?? trailing.avgNet * 12;
  const netYield = value > 0 ? annualNet / value : null;
  const weeklyCashflow = annualNet / 52;
  const cashInvested = property.cash_invested ?? 0;
  const cashOnCash = cashInvested > 0 ? annualNet / cashInvested : null;
  const gearing: GearingStatus = annualNet > 0 ? 'positive' : annualNet < 0 ? 'negative' : 'neutral';

  const depreciationAnnual = property.depreciation_annual ?? 0;
  const taxablePosition = annualNet - depreciationAnnual;

  const impliedGrowthAnnual = cagr !== null ? value * cagr : 0;
  const totalReturnAnnual = annualNet + impliedGrowthAnnual;
  const totalReturnPct = value > 0 && (netYield !== null || cagr !== null) ? (netYield ?? 0) + (cagr ?? 0) : null;

  let daysToLeaseEnd: number | null = null;
  if (property.lease_end) {
    daysToLeaseEnd = Math.round(
      (new Date(property.lease_end + 'T00:00:00').getTime() - asOf.getTime()) / (24 * 60 * 60 * 1000)
    );
  }

  return {
    value,
    debt,
    offset,
    netDebt,
    equity,
    usableEquity,
    lvr,
    purchasePrice,
    capitalGrowth,
    capitalGrowthPct,
    years,
    cagr,
    annualRent,
    grossYield,
    yieldOnCost,
    annualNet,
    netYield,
    weeklyCashflow,
    cashInvested,
    cashOnCash,
    gearing,
    depreciationAnnual,
    taxablePosition,
    negativelyGeared: taxablePosition < 0,
    totalReturnPct,
    totalReturnAnnual,
    weeklyRent,
    leaseEnd: property.lease_end ?? null,
    daysToLeaseEnd,
    annualRunRate: runRate,
  };
}
