import { useCadenceFinancial } from '../lib/store';
import { ScreenHeader, Card } from '../components/bits';
import { latestMonth } from '../lib/financeCalc';
import { formatMoney, formatPercent } from '../lib/util';
import type { AssetClass } from '../lib/types';

// Fallback bands when no allocation_policies rows exist yet (fresh install).
// Generic financial-planning defaults -- the real policy lives in the DB and
// is editable there (allocation_policies table, migration 0004).
const DEFAULT_BANDS: Record<AssetClass, { min: number; base: number; max: number }> = {
  property: { min: 0.35, base: 0.5, max: 0.65 },
  cash: { min: 0.1, base: 0.2, max: 0.35 },
  shares: { min: 0.05, base: 0.15, max: 0.3 },
  btc: { min: 0, base: 0.05, max: 0.1 },
  super: { min: 0.1, base: 0.15, max: 0.25 },
  collectibles: { min: 0, base: 0, max: 0.05 },
};

const LABELS: Record<AssetClass, string> = {
  property: 'Property',
  cash: 'Cash / offsets',
  shares: 'Shares',
  btc: 'BTC / crypto',
  super: 'Super',
  collectibles: 'Collectibles',
};

export function AssetAllocation({ onMenu }: { onMenu: () => void }) {
  const { data } = useCadenceFinancial();
  const current = data.monthly_metrics.length ? latestMonth(data.monthly_metrics) : null;

  const bandFor = (cls: AssetClass) => {
    const policy = data.allocation_policies.find((p) => p.asset_class === cls);
    return policy
      ? { min: policy.target_min, base: policy.target_base, max: policy.target_max }
      : DEFAULT_BANDS[cls];
  };

  return (
    <>
      <ScreenHeader
        title="Asset Allocation"
        subtitle="Where net worth actually sits, against your policy bands."
        onMenu={onMenu}
      />
      <div className="screen-content">
        {!current ? (
          <Card>No monthly metrics loaded yet.</Card>
        ) : (
          (() => {
            const rows: { cls: AssetClass; value: number }[] = [
              { cls: 'property', value: current.property_value },
              { cls: 'cash', value: current.cash_offsets },
              { cls: 'shares', value: current.shares },
              { cls: 'btc', value: current.btc_crypto },
              { cls: 'super', value: current.super_balance },
              { cls: 'collectibles', value: current.collectibles_value },
            ];
            // Band percentages are policy fractions of NET WORTH (matching the
            // workbook's Balance Sheet "% net worth" targets), not gross assets.
            const nw = current.net_worth;
            const totalAssets = rows.reduce((s, r) => s + r.value, 0);
            return (
              <Card title="Allocation vs. policy bands (% of net worth)">
                <div className="cf-table-wrap">
                  <table className="cf-table">
                    <thead>
                      <tr>
                        <th>Asset class</th>
                        <th>Value</th>
                        <th>% of net worth</th>
                        <th>Target band</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((r) => {
                        const pct = nw > 0 ? r.value / nw : 0;
                        const band = bandFor(r.cls);
                        const inBand = pct >= band.min && pct <= band.max;
                        return (
                          <tr key={r.cls}>
                            <td>{LABELS[r.cls]}</td>
                            <td>{formatMoney(r.value)}</td>
                            <td>{formatPercent(pct)}</td>
                            <td>
                              {formatPercent(band.min, 0)}–{formatPercent(band.max, 0)} (base{' '}
                              {formatPercent(band.base, 0)})
                            </td>
                            <td>
                              <span className={`grade-tag ${inBand ? 'grade-strong' : 'grade-weak'}`}>
                                {inBand ? 'In band' : pct < band.min ? 'Below band' : 'Above band'}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      <tr className="cf-total">
                        <td>Total assets</td>
                        <td>{formatMoney(totalAssets)}</td>
                        <td />
                        <td />
                        <td />
                      </tr>
                    </tfoot>
                  </table>
                </div>
                {data.allocation_policies.length === 0 && (
                  <p style={{ fontSize: 12, color: 'var(--text2)', marginTop: 10 }}>
                    Showing generic default bands — run the policy seed (see AGENTS.md) to load
                    your own.
                  </p>
                )}
              </Card>
            );
          })()
        )}
      </div>
    </>
  );
}
