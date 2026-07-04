// Shared allocation-band logic. One source of truth for both the Asset
// Allocation screen and the Overview flash report's band-breach flags, so
// they can never disagree about what "out of band" means.

import type { AllocationPolicy, AssetClass, MonthlyMetric } from './types';

// Fallback bands when no allocation_policies rows exist yet (fresh install).
// Generic financial-planning defaults -- the real policy lives in the DB.
export const DEFAULT_BANDS: Record<AssetClass, { min: number; base: number; max: number }> = {
  property: { min: 0.35, base: 0.5, max: 0.65 },
  cash: { min: 0.1, base: 0.2, max: 0.35 },
  shares: { min: 0.05, base: 0.15, max: 0.3 },
  btc: { min: 0, base: 0.05, max: 0.1 },
  super: { min: 0.1, base: 0.15, max: 0.25 },
  collectibles: { min: 0, base: 0, max: 0.05 },
};

export const ASSET_CLASS_LABEL: Record<AssetClass, string> = {
  property: 'Property',
  cash: 'Cash / offsets',
  shares: 'Shares',
  btc: 'BTC / crypto',
  super: 'Super',
  collectibles: 'Collectibles',
};

export type BandStatus = 'in_band' | 'below_band' | 'above_band';

export interface AllocationRow {
  cls: AssetClass;
  label: string;
  value: number;
  // Fraction of gross total assets. The table displays gross asset-class
  // values plus a total-assets footer, so percentages must reconcile to that
  // same denominator rather than the lower debt-adjusted net worth.
  pct: number;
  band: { min: number; base: number; max: number };
  status: BandStatus;
}

export function allocationRows(
  latest: MonthlyMetric,
  policies: AllocationPolicy[]
): AllocationRow[] {
  const bandFor = (cls: AssetClass) => {
    const policy = policies.find((p) => p.asset_class === cls);
    return policy
      ? { min: policy.target_min, base: policy.target_base, max: policy.target_max }
      : DEFAULT_BANDS[cls];
  };

  const values: { cls: AssetClass; value: number }[] = [
    { cls: 'property', value: latest.property_value },
    { cls: 'cash', value: latest.cash_offsets },
    { cls: 'shares', value: latest.shares },
    { cls: 'btc', value: latest.btc_crypto },
    { cls: 'super', value: latest.super_balance },
    { cls: 'collectibles', value: latest.collectibles_value },
  ];

  const derivedTotalAssets = values.reduce((sum, row) => sum + row.value, 0);
  const totalAssets = latest.total_assets > 0 ? latest.total_assets : derivedTotalAssets;
  return values.map(({ cls, value }) => {
    const pct = totalAssets > 0 ? value / totalAssets : 0;
    const band = bandFor(cls);
    const status: BandStatus =
      pct < band.min ? 'below_band' : pct > band.max ? 'above_band' : 'in_band';
    return { cls, label: ASSET_CLASS_LABEL[cls], value, pct, band, status };
  });
}
