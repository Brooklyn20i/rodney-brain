import { describe, expect, it } from 'vitest';
import { computeRiskMetrics, computeStressTests } from '../riskCalc';
import type { LiquidityBucket, Loan, MonthlyMetric, Property, RiskPolicy } from '../types';

// Fictional fixture numbers only, hand-computed.
const base = { owner_id: 'demo-owner', created_at: '', updated_at: '', deleted_at: null };

const latest: MonthlyMetric = {
  ...base,
  id: 'm',
  period: '2025-07',
  cash_saved: 3_400,
  share_buys: 0,
  btc_buys: 0,
  debt_reduction: 1_130,
  net_worth: 2_000_000,
  cash_offsets: 400_000,
  total_debt: 1_000_000,
  net_debt: 600_000,
  shares: 100_000,
  btc_crypto: 100_000,
  super_balance: 200_000,
  total_assets: 3_000_000,
  property_value: 2_200_000,
  property_equity: 1_200_000,
  collectibles_value: 0,
};

const policies: RiskPolicy[] = [
  { ...base, id: 'p1', metric_key: 'debt_assets', green_threshold: 0.4, amber_threshold: 0.5, direction: 'lower_better' },
  { ...base, id: 'p2', metric_key: 'net_debt_nw', green_threshold: 0.2, amber_threshold: 0.3, direction: 'lower_better' },
  { ...base, id: 'p3', metric_key: 'cash_nw', green_threshold: 0.15, amber_threshold: 0.1, direction: 'higher_better' },
  { ...base, id: 'p4', metric_key: 'shares_nw', green_threshold: 0.1, amber_threshold: 0.05, direction: 'higher_better' },
  { ...base, id: 'p5', metric_key: 'protected_liquidity_coverage', green_threshold: 1.0, amber_threshold: 0.95, direction: 'higher_better' },
];

const buckets: LiquidityBucket[] = [
  { ...base, id: 'b1', label: 'Protected cash', amount: 400_000, protected_minimum: 380_000, purpose: '', note: '' },
];

describe('computeRiskMetrics', () => {
  const results = computeRiskMetrics(latest, buckets, policies);
  const byKey = Object.fromEntries(results.map((r) => [r.key, r]));

  it('computes ratios against the latest month', () => {
    expect(byKey.debt_assets.value).toBeCloseTo(1_000_000 / 3_000_000, 6);
    expect(byKey.net_debt_nw.value).toBeCloseTo(0.3, 6);
    expect(byKey.cash_nw.value).toBeCloseTo(0.2, 6);
    expect(byKey.shares_nw.value).toBeCloseTo(0.05, 6);
    expect(byKey.protected_liquidity_coverage.value).toBeCloseTo(400_000 / 380_000, 6);
  });

  it('colors lower_better and higher_better directions correctly', () => {
    expect(byKey.debt_assets.status).toBe('green'); // 0.333 <= 0.4
    expect(byKey.net_debt_nw.status).toBe('amber'); // 0.3 > 0.2, <= 0.3
    expect(byKey.cash_nw.status).toBe('green'); // 0.2 >= 0.15
    expect(byKey.shares_nw.status).toBe('amber'); // 0.05 < 0.1, >= 0.05
    expect(byKey.protected_liquidity_coverage.status).toBe('green'); // 1.05 >= 1.0
  });

  it('marks metrics with no policy or no data as na', () => {
    expect(byKey.crypto_nw.status).toBe('na'); // no policy in fixture
    expect(byKey.property_cashflow.status).toBe('na'); // Phase B data
    const noBuckets = computeRiskMetrics(latest, [], policies);
    expect(noBuckets.find((r) => r.key === 'protected_liquidity_coverage')!.status).toBe('na');
  });

  it('goes red past the amber threshold', () => {
    const stretched = { ...latest, total_debt: 1_600_000 }; // debt/assets = 0.533
    const r = computeRiskMetrics(stretched, buckets, policies);
    expect(r.find((x) => x.key === 'debt_assets')!.status).toBe('red');
  });
});

describe('computeStressTests', () => {
  const loans: Loan[] = [
    { ...base, id: 'l1', property_id: 'p1', balance: 750_000, offset_balance: 580_000, rate: 0.06, monthly_repayment: 4_400, rate_type: 'variable', review_date: null, notes: '' },
    { ...base, id: 'l2', property_id: 'p2', balance: 150_000, offset_balance: 160_000, rate: 0.06, monthly_repayment: 0, rate_type: 'variable', review_date: null, notes: '' },
  ];
  const properties: Property[] = [
    { ...base, id: 'p1', entity_id: null, address: '1 Fictional St', value: 1_450_000, valuation_basis: '', evidence_status: '', role: '', annual_rent: 42_000 },
    { ...base, id: 'p2', entity_id: null, address: '2 Fictional St', value: 750_000, valuation_basis: '', evidence_status: '', role: '', annual_rent: 18_000 },
  ];

  const results = computeStressTests(latest, loans, properties);
  const byKey = Object.fromEntries(results.map((r) => [r.key, r]));

  it('computes property and crypto drawdowns off the latest balances', () => {
    expect(byKey.property_down_10.nwImpact).toBeCloseTo(-220_000, 2);
    expect(byKey.property_down_20.nwImpact).toBeCloseTo(-440_000, 2);
    expect(byKey.crypto_down_50.nwImpact).toBeCloseTo(-50_000, 2);
  });

  it('applies rate shocks to net property debt, flooring over-offset loans at zero', () => {
    // Net debt = (750k - 580k) + max(0, 150k - 160k) = 170,000
    expect(byKey.rates_up_1.cashflowImpactAnnual).toBeCloseTo(-1_700, 2);
    expect(byKey.rates_up_2.cashflowImpactAnnual).toBeCloseTo(-3_400, 2);
  });

  it('takes 3 months of the largest rent for the vacancy scenario', () => {
    expect(byKey.vacancy_3m.cashflowImpactAnnual).toBeCloseTo(-10_500, 2); // 42,000 / 4
  });

  it('combined bear = property -10% + crypto -50% NW hit with rates +1% cashflow', () => {
    expect(byKey.combined_bear.nwImpact).toBeCloseTo(-270_000, 2);
    expect(byKey.combined_bear.cashflowImpactAnnual).toBeCloseTo(-1_700, 2);
  });
});
