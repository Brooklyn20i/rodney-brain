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
