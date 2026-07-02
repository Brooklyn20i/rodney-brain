import { describe, expect, it } from 'vitest';
import { annualToMonthlyRate, computeRunway, periodAfterMonths } from '../goalCalc';
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
// (8,000 saved + 2,000 debt reduction), ending at NW 500,000.
const months: MonthlyMetric[] = ['2025-02', '2025-03', '2025-04', '2025-05', '2025-06', '2025-07'].map(
  (period, i) =>
    month({ period, cash_saved: 8_000, debt_reduction: 2_000, net_worth: 450_000 + i * 10_000 })
);

describe('computeRunway', () => {
  it('operating-only: months = gap / monthly average, computed by iteration', () => {
    const r = computeRunway(goal(), months)!;
    // Gap 500,000 at 10,000/month => exactly 50 months.
    expect(r.monthlyOperatingAverage).toBeCloseTo(10_000, 2);
    expect(r.monthsOperatingOnly).toBe(50);
    expect(r.progressFraction).toBeCloseTo(0.5, 4);
    expect(r.trailingMonths).toBe(6);
  });

  it('growth assumption shortens the runway and never lengthens it', () => {
    const withGrowth = computeRunway(goal({ assumed_growth_rate: 0.06 }), months)!;
    expect(withGrowth.monthsWithGrowth).not.toBeNull();
    expect(withGrowth.monthsWithGrowth!).toBeLessThan(withGrowth.monthsOperatingOnly!);
    // Cross-check against an independent closed-form annuity future value:
    // FV = P(1+r)^n + C[((1+r)^n - 1)/r] with r = monthly rate. The iterative
    // month count must be the first n where FV >= target.
    const r = annualToMonthlyRate(0.06);
    const fv = (n: number) => 500_000 * (1 + r) ** n + 10_000 * (((1 + r) ** n - 1) / r);
    const n = withGrowth.monthsWithGrowth!;
    expect(fv(n)).toBeGreaterThanOrEqual(1_000_000);
    expect(fv(n - 1)).toBeLessThan(1_000_000);
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

describe('periodAfterMonths', () => {
  it('advances across year boundaries', () => {
    expect(periodAfterMonths('2025-07', 0)).toBe('2025-07');
    expect(periodAfterMonths('2025-07', 5)).toBe('2025-12');
    expect(periodAfterMonths('2025-07', 6)).toBe('2026-01');
    expect(periodAfterMonths('2025-07', 50)).toBe('2029-09');
  });
});
