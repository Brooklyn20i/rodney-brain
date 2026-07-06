// Risk Dashboard + Stress Tests calculation engine.
//
// Implements the workbook's Sheet 09 (risk metrics with green/amber
// thresholds) and Sheet 10 (stress scenarios) -- which the workbook defined
// but never actually computed (every impact cell was zero because the
// formulas never recalculated). Computing these live from current data is
// the point: they can never silently go stale again.
//
// Pure functions only; integer-cents arithmetic via financeCalc helpers.

import type { LiquidityBucket, Loan, MonthlyMetric, Property, RiskPolicy } from './types';
import { centsToDollars, toCents } from './financeCalc';

export type RiskStatus = 'green' | 'amber' | 'red' | 'na';

export interface RiskMetricResult {
  key: string;
  label: string;
  // Ratio metrics carry a fraction (0.297 = 29.7%); 'na' rows carry null.
  value: number | null;
  status: RiskStatus;
  note: string;
}

function statusFor(value: number, policy: RiskPolicy | undefined): RiskStatus {
  if (!policy) return 'na';
  if (policy.direction === 'lower_better') {
    if (value <= policy.green_threshold) return 'green';
    if (value <= policy.amber_threshold) return 'amber';
    return 'red';
  }
  if (value >= policy.green_threshold) return 'green';
  if (value >= policy.amber_threshold) return 'amber';
  return 'red';
}

export function computeRiskMetrics(
  latest: MonthlyMetric,
  liquidityBuckets: LiquidityBucket[],
  policies: RiskPolicy[]
): RiskMetricResult[] {
  const policy = (key: string) => policies.find((p) => p.metric_key === key);
  const ratio = (numC: number, denC: number): number | null => (denC === 0 ? null : numC / denC);

  const assetsC = toCents(latest.total_assets);
  const nwC = toCents(latest.net_worth);

  const rows: { key: string; label: string; value: number | null; note: string }[] = [
    { key: 'debt_assets', label: 'Debt / assets', value: ratio(toCents(latest.total_debt), assetsC), note: 'Headline gross leverage' },
    { key: 'net_debt_nw', label: 'Net debt / net worth', value: ratio(toCents(latest.net_debt), nwC), note: 'Offsets reduce net exposure' },
    { key: 'property_equity_nw', label: 'Property equity / net worth', value: ratio(toCents(latest.property_equity), nwC), note: 'Concentration risk' },
    { key: 'cash_nw', label: 'Cash + offsets / net worth', value: ratio(toCents(latest.cash_offsets), nwC), note: 'Liquidity strength' },
    { key: 'crypto_nw', label: 'Crypto / net worth', value: ratio(toCents(latest.btc_crypto), nwC), note: 'Volatility contribution' },
    { key: 'shares_nw', label: 'Shares / net worth', value: ratio(toCents(latest.shares), nwC), note: 'Liquid market diversification' },
  ];

  // Protected liquidity coverage: cash/offsets vs the sum of protected
  // minimums across buckets. Coverage >= 1 means the protected floor is met.
  const protectedMinC = liquidityBuckets.reduce((s, b) => s + toCents(b.protected_minimum), 0);
  rows.push({
    key: 'protected_liquidity_coverage',
    label: 'Protected liquidity coverage',
    value: protectedMinC === 0 ? null : toCents(latest.cash_offsets) / protectedMinC,
    note: protectedMinC === 0 ? 'No protected minimum set in liquidity buckets' : 'Cash vs protected minimum',
  });

  // Property cashflow after repayments needs expense-level P&L data the app
  // doesn't hold yet (Phase B) -- shown honestly as n/a rather than a guess.
  rows.push({
    key: 'property_cashflow',
    label: 'Property cashflow after repayments',
    value: null,
    note: 'Needs property P&L (expenses) — Phase B',
  });

  return rows.map((r) => ({
    ...r,
    status: r.value === null ? 'na' : statusFor(r.value, policy(r.key)),
  }));
}

// ── Stress tests (Sheet 10, computed live) ─────────────────────────────

export interface StressScenarioResult {
  key: string;
  label: string;
  assumption: string;
  // One-off hit to net worth (negative = loss), null when not applicable.
  nwImpact: number | null;
  // Recurring annual cashflow hit (negative = cost), null when not applicable.
  cashflowImpactAnnual: number | null;
  gate: string;
}

export function computeStressTests(
  latest: MonthlyMetric,
  loans: Loan[],
  properties: Property[]
): StressScenarioResult[] {
  const propertyC = toCents(latest.property_value);
  const cryptoC = toCents(latest.btc_crypto);

  // Rate shocks apply to net property debt (loan balance less its offset,
  // floored at zero per loan -- an over-offset loan doesn't subsidise others).
  const netPropertyDebtC = loans.reduce(
    (s, l) => s + Math.max(0, toCents(l.balance) - toCents(l.offset_balance)),
    0
  );

  // Vacancy scenario: the largest-rent property loses 3 months of rent.
  // The in-app Property editor only writes weekly_rent (annual_rent comes from
  // the legacy CSV import), so derive annual rent from weekly when it's the only
  // one set — otherwise this stress row reads $0 and falsely reports "no risk".
  const annualRentOf = (p: (typeof properties)[number]) => Math.max(p.annual_rent || 0, (p.weekly_rent ?? 0) * 52);
  const largestRent = properties.reduce((max, p) => Math.max(max, annualRentOf(p)), 0);
  const vacancyC = Math.round(toCents(largestRent) / 4);

  const propertyDown10C = -Math.round(propertyC * 0.1);
  const cryptoDown50C = -Math.round(cryptoC * 0.5);
  const ratePlus1C = -Math.round(netPropertyDebtC * 0.01);

  return [
    {
      key: 'property_down_10',
      label: 'Property value −10%',
      assumption: 'All property values fall 10%',
      nwImpact: centsToDollars(propertyDown10C),
      cashflowImpactAnnual: null,
      gate: 'Review only',
    },
    {
      key: 'property_down_20',
      label: 'Property value −20%',
      assumption: 'All property values fall 20%',
      nwImpact: centsToDollars(-Math.round(propertyC * 0.2)),
      cashflowImpactAnnual: null,
      gate: 'Review debt/offset protection',
    },
    {
      key: 'crypto_down_50',
      label: 'Crypto −50%',
      assumption: 'Crypto aggregate falls 50%',
      nwImpact: centsToDollars(cryptoDown50C),
      cashflowImpactAnnual: null,
      gate: 'Review risk budget',
    },
    {
      key: 'rates_up_1',
      label: 'Rates +1% on net debt',
      assumption: 'Rate shock on net property debt',
      nwImpact: null,
      cashflowImpactAnnual: centsToDollars(ratePlus1C),
      gate: 'Review offset protection; no refinance/payment action without approval',
    },
    {
      key: 'rates_up_2',
      label: 'Rates +2% on net debt',
      assumption: 'Larger rate shock on net property debt',
      nwImpact: null,
      cashflowImpactAnnual: centsToDollars(-Math.round(netPropertyDebtC * 0.02)),
      gate: 'Review repayment capacity; no refinance/payment action without approval',
    },
    {
      key: 'vacancy_3m',
      label: 'Vacancy: largest rental, 3 months',
      assumption: 'Highest-rent property loses 3 months of rent',
      nwImpact: null,
      cashflowImpactAnnual: centsToDollars(-vacancyC),
      gate: 'Review cash buffer',
    },
    {
      key: 'combined_bear',
      label: 'Combined bear case',
      assumption: 'Property −10%, crypto −50%, rates +1%',
      nwImpact: centsToDollars(propertyDown10C + cryptoDown50C),
      cashflowImpactAnnual: centsToDollars(ratePlus1C),
      gate: 'Decision review',
    },
  ];
}
