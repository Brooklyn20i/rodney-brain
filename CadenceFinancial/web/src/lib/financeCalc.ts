// Core operating-vs-market calculation engine.
//
// Ported line-for-line from the already-tested Python prototype
// (cadence_financial/core.py -- summarize_period, net_worth_bridge,
// investment_buys_summary). Money is handled in integer cents internally to
// avoid floating-point drift, mirroring the Python version's use of
// Decimal + ROUND_HALF_UP. Every function here is pure: it takes raw rows
// and returns numbers, never storing a derived figure back onto a row.

import type { InvestmentTransaction, MonthlyMetric } from './types';
import { formatMoney } from './util';

const CENTS_PER_DOLLAR = 100;

export function toCents(dollars: number): number {
  return Math.round(dollars * CENTS_PER_DOLLAR);
}

export function centsToDollars(cents: number): number {
  return cents / CENTS_PER_DOLLAR;
}

// Round-half-up (away from zero), matching Python's Decimal ROUND_HALF_UP.
// Math.round() alone rounds -0.5 toward 0 rather than away from it, so we
// round the magnitude and reapply the sign.
export function divideRoundHalfUp(cents: number, divisor: number): number {
  if (divisor === 0) return 0;
  const sign = cents < 0 ? -1 : 1;
  return sign * Math.round(Math.abs(cents) / divisor);
}

export interface PeriodSummary {
  start: string;
  end: string;
  months: number;
  cashSaved: number;
  shareBuys: number;
  btcBuys: number;
  investmentBuys: number;
  freeCashGenerated: number;
  debtReduction: number;
  allInSurplus: number;
  collectibleAssetPurchase: number;
  freeCashPlusCollectibles: number;
  allInPlusCollectibles: number;
  freeCashMonthlyAverage: number;
  allInMonthlyAverage: number;
  freeCashPlusCollectiblesMonthlyAverage: number;
  allInPlusCollectiblesMonthlyAverage: number;
}

function inPeriod(period: string, start: string, end: string): boolean {
  return period >= start && period <= end;
}

// Free cash generated = cash saved in accounts + share/BTC purchases.
// All-in surplus = free cash generated + debt principal reduction.
// A collectible/retained-asset purchase (e.g. a watch) is treated as
// deployed surplus, not liquidity -- it's added as a separate layer rather
// than folded into "cash saved" so the liquid-vs-deployed split stays clean.
export function summarizePeriod(
  months: MonthlyMetric[],
  start: string,
  end: string,
  collectibleAssetPurchase = 0
): PeriodSummary {
  const selected = months.filter((m) => inPeriod(m.period, start, end));
  if (selected.length === 0) {
    throw new Error(`No monthly metrics between ${start} and ${end}`);
  }
  const count = selected.length;

  const cashSavedC = selected.reduce((sum, m) => sum + toCents(m.cash_saved), 0);
  const shareBuysC = selected.reduce((sum, m) => sum + toCents(m.share_buys), 0);
  const btcBuysC = selected.reduce((sum, m) => sum + toCents(m.btc_buys), 0);
  const debtReductionC = selected.reduce((sum, m) => sum + toCents(m.debt_reduction), 0);

  const investmentBuysC = shareBuysC + btcBuysC;
  const freeCashC = cashSavedC + investmentBuysC;
  const allInC = freeCashC + debtReductionC;
  const collectiblesC = toCents(collectibleAssetPurchase);
  const freePlusCollectiblesC = freeCashC + collectiblesC;
  const allInPlusCollectiblesC = allInC + collectiblesC;

  return {
    start,
    end,
    months: count,
    cashSaved: centsToDollars(cashSavedC),
    shareBuys: centsToDollars(shareBuysC),
    btcBuys: centsToDollars(btcBuysC),
    investmentBuys: centsToDollars(investmentBuysC),
    freeCashGenerated: centsToDollars(freeCashC),
    debtReduction: centsToDollars(debtReductionC),
    allInSurplus: centsToDollars(allInC),
    collectibleAssetPurchase: centsToDollars(collectiblesC),
    freeCashPlusCollectibles: centsToDollars(freePlusCollectiblesC),
    allInPlusCollectibles: centsToDollars(allInPlusCollectiblesC),
    freeCashMonthlyAverage: centsToDollars(divideRoundHalfUp(freeCashC, count)),
    allInMonthlyAverage: centsToDollars(divideRoundHalfUp(allInC, count)),
    freeCashPlusCollectiblesMonthlyAverage: centsToDollars(
      divideRoundHalfUp(freePlusCollectiblesC, count)
    ),
    allInPlusCollectiblesMonthlyAverage: centsToDollars(
      divideRoundHalfUp(allInPlusCollectiblesC, count)
    ),
  };
}

// 'YYYY-MM' -> the following month's 'YYYY-MM'.
export function nextPeriod(period: string): string {
  const [y, m] = period.split('-').map(Number);
  const nm = m === 12 ? 1 : m + 1;
  const ny = m === 12 ? y + 1 : y;
  return `${ny}-${String(nm).padStart(2, '0')}`;
}

// What the Month Close wizard collects: closing balances as evidenced, plus
// the purchases made during the month (which can't be derived from balances).
export interface NewMonthInputs {
  period: string;
  cash_offsets: number;
  total_debt: number;
  shares: number;
  btc_crypto: number;
  super_balance: number;
  property_value: number;
  collectibles_value: number;
  share_buys: number;
  btc_buys: number;
}

// Derives a full MonthlyMetric row from closing balances + the prior month,
// replacing the manual workbook-update ritual. Derivation rules match the
// workbook's own conventions (verified against its recomputed figures):
//   cash_saved      = Δ cash/offsets
//   debt_reduction  = -Δ total debt (paying debt down is positive)
//   net_debt        = total debt - cash/offsets
//   property_equity = property value - total debt
//   total_assets    = cash + property + shares + crypto + super + collectibles
//   net_worth       = total assets - total debt
// All arithmetic in integer cents (see module header).
export function deriveNewMonth(
  prior: MonthlyMetric,
  inputs: NewMonthInputs
): Omit<MonthlyMetric, 'id' | 'owner_id' | 'created_at' | 'updated_at' | 'deleted_at'> {
  const cashC = toCents(inputs.cash_offsets);
  const debtC = toCents(inputs.total_debt);
  const sharesC = toCents(inputs.shares);
  const btcC = toCents(inputs.btc_crypto);
  const superC = toCents(inputs.super_balance);
  const propertyC = toCents(inputs.property_value);
  const collectiblesC = toCents(inputs.collectibles_value);

  const totalAssetsC = cashC + propertyC + sharesC + btcC + superC + collectiblesC;

  return {
    period: inputs.period,
    cash_saved: centsToDollars(cashC - toCents(prior.cash_offsets)),
    share_buys: inputs.share_buys,
    btc_buys: inputs.btc_buys,
    debt_reduction: centsToDollars(toCents(prior.total_debt) - debtC),
    net_worth: centsToDollars(totalAssetsC - debtC),
    cash_offsets: inputs.cash_offsets,
    total_debt: inputs.total_debt,
    net_debt: centsToDollars(debtC - cashC),
    shares: inputs.shares,
    btc_crypto: inputs.btc_crypto,
    super_balance: inputs.super_balance,
    total_assets: centsToDollars(totalAssetsC),
    property_value: inputs.property_value,
    property_equity: centsToDollars(propertyC - debtC),
    collectibles_value: inputs.collectibles_value,
  };
}

export function latestMonth(months: MonthlyMetric[]): MonthlyMetric {
  if (months.length === 0) throw new Error('No monthly metrics loaded');
  return [...months].sort((a, b) => a.period.localeCompare(b.period))[months.length - 1];
}

export interface NetWorthBridge {
  openingNetWorth: number;
  closingNetWorth: number;
  netWorthMovement: number;
  cashSaved: number;
  investmentBuys: number;
  debtReduction: number;
  // Everything Rodney directly controlled this month: saving cash, buying
  // shares/BTC, paying down debt principal.
  operatingCashAndDebt: number;
  // Whatever's left once operating effects are accounted for -- BTC/share/
  // property/super marks moving, FX, etc. Computed as a residual (not
  // independently summed) so it always reconciles with the net movement by
  // construction: it's literally "what markets did that Rodney didn't."
  marketAndOtherMovement: number;
}

export function netWorthBridge(prior: MonthlyMetric, current: MonthlyMetric): NetWorthBridge {
  const netWorthMovementC = toCents(current.net_worth) - toCents(prior.net_worth);
  const investmentBuysC = toCents(current.share_buys) + toCents(current.btc_buys);
  const operatingC = toCents(current.cash_saved) + toCents(current.debt_reduction) + investmentBuysC;
  const marketC = netWorthMovementC - operatingC;

  return {
    openingNetWorth: prior.net_worth,
    closingNetWorth: current.net_worth,
    netWorthMovement: centsToDollars(netWorthMovementC),
    cashSaved: current.cash_saved,
    investmentBuys: centsToDollars(investmentBuysC),
    debtReduction: current.debt_reduction,
    operatingCashAndDebt: centsToDollars(operatingC),
    marketAndOtherMovement: centsToDollars(marketC),
  };
}

// A deterministic, rule-based read of the bridge -- not free text. Used by
// both the Month Close screen and the PDF so the "what happened and why"
// story is generated once from the numbers, never typed by hand.
export function buildExecutiveSummary(bridge: NetWorthBridge, periodLabel: string): string {
  const operatingWord = bridge.operatingCashAndDebt >= 0 ? 'a strong operating month' : 'a weak operating month';
  const marketWord = bridge.marketAndOtherMovement >= 0 ? 'market-positive' : 'market-negative';
  return (
    `${periodLabel} was ${operatingWord} and ${marketWord}. Operating activity (cash saved, ` +
    `investments bought, debt reduced) contributed ${formatMoney(bridge.operatingCashAndDebt)}, ` +
    `while markets contributed ${formatMoney(bridge.marketAndOtherMovement)} -- net worth moved ` +
    `${formatMoney(bridge.netWorthMovement)} overall.`
  );
}

// ── Performance attribution ────────────────────────────────────────────
// "How much of the wealth movement did the owner earn (operating) vs the
// market hand over (marks)?" -- the contribution-vs-return split a family
// office reports monthly. Reuses netWorthBridge per consecutive month pair,
// so each row reconciles by construction: operating + market = total.

export interface PerformanceRow {
  period: string;
  operating: number; // cash saved + investment buys + debt principal reduction
  market: number; // residual: marks, FX, everything the owner didn't do
  total: number; // net worth movement for the month
}

export interface PerformanceHistory {
  rows: PerformanceRow[];
  openingNetWorth: number;
  closingNetWorth: number;
  operatingTotal: number;
  marketTotal: number;
  totalMovement: number;
  // Fraction of the cumulative movement attributable to operating activity.
  // null when the total movement is zero (nothing to attribute).
  operatingShare: number | null;
}

export function performanceHistory(months: MonthlyMetric[]): PerformanceHistory | null {
  if (months.length < 2) return null;
  const sorted = [...months].sort((a, b) => a.period.localeCompare(b.period));

  let operatingC = 0;
  let marketC = 0;
  const rows: PerformanceRow[] = [];
  for (let i = 1; i < sorted.length; i++) {
    const bridge = netWorthBridge(sorted[i - 1], sorted[i]);
    operatingC += toCents(bridge.operatingCashAndDebt);
    marketC += toCents(bridge.marketAndOtherMovement);
    rows.push({
      period: sorted[i].period,
      operating: bridge.operatingCashAndDebt,
      market: bridge.marketAndOtherMovement,
      total: bridge.netWorthMovement,
    });
  }

  const totalC = operatingC + marketC;
  return {
    rows,
    openingNetWorth: sorted[0].net_worth,
    closingNetWorth: sorted[sorted.length - 1].net_worth,
    operatingTotal: centsToDollars(operatingC),
    marketTotal: centsToDollars(marketC),
    totalMovement: centsToDollars(totalC),
    operatingShare: totalC === 0 ? null : operatingC / totalC,
  };
}

export interface InvestmentBuysSummary {
  shares: number;
  btc: number;
  total: number;
  activeMonths: number;
}

// Classifies each buy transaction as BTC or "shares" (everything else) and
// aggregates by calendar month, the same split investment_buys.csv encodes
// as separate share_buys/btc_buys columns.
export function investmentBuysSummary(
  transactions: InvestmentTransaction[],
  start: string,
  end: string
): InvestmentBuysSummary {
  const buys = transactions.filter(
    (t) => t.side === 'buy' && inPeriod(t.date.slice(0, 7), start, end)
  );
  const isBtc = (t: InvestmentTransaction) => t.ticker.toUpperCase() === 'BTC';

  // Sum amount_aud, not amount -- amount is in the transaction's native
  // currency and summing it directly would mix AUD and USD.
  const sharesC = buys.filter((t) => !isBtc(t)).reduce((sum, t) => sum + toCents(t.amount_aud), 0);
  const btcC = buys.filter(isBtc).reduce((sum, t) => sum + toCents(t.amount_aud), 0);
  const activeMonths = new Set(buys.map((t) => t.date.slice(0, 7))).size;

  return {
    shares: centsToDollars(sharesC),
    btc: centsToDollars(btcC),
    total: centsToDollars(sharesC + btcC),
    activeMonths,
  };
}
