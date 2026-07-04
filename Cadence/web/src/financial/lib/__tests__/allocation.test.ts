import { describe, expect, it } from 'vitest';
import { allocationRows } from '../allocation';
import type { MonthlyMetric } from '../types';

function month(overrides: Partial<MonthlyMetric>): MonthlyMetric {
  return {
    id: 'm-2026-07',
    owner_id: 'owner',
    period: '2026-07',
    cash_saved: 0,
    share_buys: 0,
    btc_buys: 0,
    debt_reduction: 0,
    net_worth: 6_662_190.08,
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

describe('allocationRows', () => {
  it('calculates asset allocation against total assets, not net worth', () => {
    const latest = month({
      property_value: 6_449_000,
      cash_offsets: 1_801_198.36,
      shares: 105_406.63,
      btc_crypto: 335_570.07,
      super_balance: 791_000,
      collectibles_value: 0,
      total_assets: 9_482_175.06,
      // Net worth is lower than total assets because debt exists. The allocation
      // table displays gross asset classes and a total-assets footer, so the
      // percentage column must reconcile to total assets rather than net worth.
      net_worth: 6_662_190.08,
    });

    const rows = allocationRows(latest, []);
    const row = (cls: string) => rows.find((r) => r.cls === cls)!;

    expect(row('property').pct).toBeCloseTo(0.68, 3);
    expect(row('cash').pct).toBeCloseTo(0.19, 3);
    expect(row('shares').pct).toBeCloseTo(0.011, 3);
    expect(row('btc').pct).toBeCloseTo(0.035, 3);
    expect(row('super').pct).toBeCloseTo(0.083, 3);
    expect(rows.reduce((sum, r) => sum + r.pct, 0)).toBeCloseTo(1, 3);
  });
});
