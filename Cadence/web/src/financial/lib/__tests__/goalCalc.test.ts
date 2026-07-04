import { describe, expect, it } from 'vitest';
import {
  annualToMonthlyRate,
  computeRunway,
  periodAfterMonths,
  projectWhatIf,
  trailingOperatingAverage,
} from '../goalCalc';
import type { Goal, MonthlyMetric } from '../types';

// Fictional fixture data only -- see CadenceFinancial/AGENTS.md for why.
function month(overrides: Partial<MonthlyMetric> & Pick<MonthlyMetric, 'period'>): MonthlyMetric {
  return {
    id: overrides.period,
    owner_id: 'demo-owner',
    cash_saved: 0,
    share_buys: 0,
    btc_buys: 0,
    debt_reduction: 0,
    net_worth: 0,
    cash_offsets: 0,
    total_debt: 0,
    net_debt: 0,
    shares: 0,
    btc_crypto: 0,
    super_balance: 0,
    total_assets: 0,
    property_value: 0,
    property_equity: 0,
    collectibles_value: 0,
    created_at: '',
    updated_at: '',
    deleted_at: null,
    ...overrides,
  };
}

function goal(overrides: Partial<Goal> = {}): Goal {
  return {
    id: 'g-1',
    owner_id: 'demo-owner',
    label: 'Test goal',
    target_net_worth: 1_000_000,
    target_date: null,
    assumed_growth_rate: 0,
    notes: '',
    created_at: '',
    updated_at: '',
    deleted_at: null,
    ...overrides,
  };
}

// Six months, each contributing an all-in surplus of exactly 10,000
// (8,000 saved + 2,000 debt reduction), ending at NW 500,000. 200,000 of
// that is already-managed assets (100k shares + 50k BTC + 50k super); the
// rest (300,000) is cash/property/collectibles, which the runway model
// never assumes growth on.
const MANAGED = 100_000 + 50_000 + 50_000;
const months: MonthlyMetric[] = ['2025-02', '2025-03', '2025-04', '2025-05', '2025-06', '2025-07'].map(
  (period, i) =>
    month({
      period,
      cash_saved: 8_000,
      debt_reduction: 2_000,
      net_worth: 450_000 + i * 10_000,
      shares: 100_000,
      btc_crypto: 50_000,
      super_balance: 50_000,
    })
);

describe('computeRunway', () => {
  it('operating-only: months = gap / monthly average, computed by iteration', () => {
    const r = computeRunway(goal(), months)!;
    // Gap 500,000 at 10,000/month => exactly 50 months.
    expect(r.monthlyOperatingAverage).toBeCloseTo(10_000, 2);
    expect(r.monthsOperatingOnly).toBe(50);
    expect(r.progressFraction).toBeCloseTo(0.5, 4);
    expect(r.trailingMonths).toBe(6);
    expect(r.managedAssets).toBeCloseTo(MANAGED, 2);
  });

  it('growth assumption compounds only the managed-assets pool, never cash/property, and never lengthens the runway', () => {
    const withGrowth = computeRunway(goal({ assumed_growth_rate: 0.06 }), months)!;
    expect(withGrowth.monthsWithGrowth).not.toBeNull();
    expect(withGrowth.monthsWithGrowth!).toBeLessThan(withGrowth.monthsOperatingOnly!);
    // Cross-check against an independent closed-form projection where only
    // the managed pool compounds and the rest grows linearly via
    // contributions: FV(n) = managed*(1+r)^n + other + contribution*n.
    const r = annualToMonthlyRate(0.06);
    const other = 500_000 - MANAGED;
    const fv = (n: number) => MANAGED * (1 + r) ** n + other + 10_000 * n;
    const n = withGrowth.monthsWithGrowth!;
    expect(fv(n)).toBeGreaterThanOrEqual(1_000_000);
    expect(fv(n - 1)).toBeLessThan(1_000_000);
  });

  it('a zero managed-assets pool means growth has no effect (nothing to compound)', () => {
    const noManagedAssets = months.map((m) => ({ ...m, shares: 0, btc_crypto: 0, super_balance: 0 }));
    const r = computeRunway(goal({ assumed_growth_rate: 0.06 }), noManagedAssets)!;
    expect(r.managedAssets).toBe(0);
    expect(r.monthsWithGrowth).toBe(r.monthsOperatingOnly);
  });

  it('already-reached target reports zero months and progress >= 1', () => {
    const r = computeRunway(goal({ target_net_worth: 400_000 }), months)!;
    expect(r.monthsOperatingOnly).toBe(0);
    expect(r.monthsWithGrowth).toBe(0);
    expect(r.progressFraction).toBeGreaterThanOrEqual(1);
  });

  it('negative operating pace with no growth never reaches the target', () => {
    const shrinking = ['2025-06', '2025-07'].map((period, i) =>
      month({ period, cash_saved: -5_000, net_worth: 500_000 - i * 5_000 })
    );
    const r = computeRunway(goal(), shrinking)!;
    expect(r.monthsOperatingOnly).toBeNull();
  });

  it('returns null with no monthly data', () => {
    expect(computeRunway(goal(), [])).toBeNull();
  });
});

describe('projectWhatIf', () => {
  // Balance sheet: 200k cash + 1m property + 100k shares + 50k BTC + 150k
  // super - 500k debt = 1m net worth.
  const latest = month({
    period: '2025-07',
    cash_offsets: 200_000,
    property_value: 1_000_000,
    shares: 100_000,
    btc_crypto: 50_000,
    super_balance: 150_000,
    total_debt: 500_000,
    net_worth: 1_000_000,
  });

  it('with zero rates it reduces to the linear operating floor', () => {
    const r = projectWhatIf(latest, { targetNetWorth: 1_120_000, monthlyContribution: 10_000, rates: {} });
    expect(r.startingNetWorth).toBeCloseTo(1_000_000, 2);
    expect(r.monthsToTarget).toBe(12); // 120k gap / 10k per month
    expect(r.milestones.find((m) => m.months === 12)!.netWorth).toBeCloseTo(1_120_000, 0);
  });

  it('property growth compounds the full property value, capturing the leverage effect', () => {
    // 5% on the 1m property only, no contributions: equity grows by the full
    // property appreciation because debt is carried flat.
    const r = projectWhatIf(latest, { targetNetWorth: 2_000_000, monthlyContribution: 0, rates: { property: 0.05 } });
    const rm = annualToMonthlyRate(0.05);
    const propertyAt = (n: number) => 1_000_000 * (1 + rm) ** n;
    const nwAt = (n: number) => propertyAt(n) + 500_000 - 500_000; // other assets flat, debt flat
    const n = r.monthsToTarget!;
    expect(nwAt(n)).toBeGreaterThanOrEqual(2_000_000 - 5); // cents rounding tolerance
    expect(nwAt(n - 1)).toBeLessThan(2_000_000);
    // ~14.2 years for property to double at 5%: sanity-check the ballpark.
    expect(n).toBeGreaterThan(160);
    expect(n).toBeLessThan(180);
  });

  it('multi-class rates apply independently per class', () => {
    const r = projectWhatIf(latest, {
      targetNetWorth: 10_000_000,
      monthlyContribution: 5_000,
      rates: { property: 0.05, shares: 0.07, btc: 0.1, super: 0.06 },
    });
    expect(r.monthsToTarget).not.toBeNull();
    // Independent closed-form cross-check at the 120-month milestone.
    const g = (v: number, rate: number, n: number) => v * (1 + annualToMonthlyRate(rate)) ** n;
    const expected120 =
      200_000 +
      g(1_000_000, 0.05, 120) +
      g(100_000, 0.07, 120) +
      g(50_000, 0.1, 120) +
      g(150_000, 0.06, 120) -
      500_000 +
      5_000 * 120;
    const actual120 = r.milestones.find((m) => m.months === 120)!.netWorth;
    expect(Math.abs(actual120 - expected120)).toBeLessThan(expected120 * 0.0001);
  });

  it('unreachable targets report null within the 100-year horizon', () => {
    const r = projectWhatIf(latest, { targetNetWorth: 100_000_000, monthlyContribution: 0, rates: {} });
    expect(r.monthsToTarget).toBeNull();
  });
});

describe('trailingOperatingAverage', () => {
  it('matches the runway floor basis', () => {
    expect(trailingOperatingAverage(months)).toBeCloseTo(10_000, 2);
    expect(trailingOperatingAverage([])).toBe(0);
  });
});

describe('periodAfterMonths', () => {
  it('advances across year boundaries', () => {
    expect(periodAfterMonths('2025-07', 0)).toBe('2025-07');
    expect(periodAfterMonths('2025-07', 5)).toBe('2025-12');
    expect(periodAfterMonths('2025-07', 6)).toBe('2026-01');
    expect(periodAfterMonths('2025-07', 50)).toBe('2029-09');
  });
});
