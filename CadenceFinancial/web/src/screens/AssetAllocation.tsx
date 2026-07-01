import { useCadenceFinancial } from '../lib/store';
import { ScreenHeader, Card } from '../components/bits';
import { latestMonth } from '../lib/financeCalc';
import { formatMoney, formatPercent } from '../lib/util';

// Default target allocation bands. These are generic financial-planning
// defaults, not personal data -- Rodney can tune them once the app is wired
// to a real Supabase project (a future settings screen), but v0 needs some
// opinionated default rather than raw numbers with no read on them.
const TARGET_BANDS: Record<string, { min: number; max: number }> = {
  Property: { min: 0.35, max: 0.65 },
  'Cash / offsets': { min: 0.1, max: 0.35 },
  Shares: { min: 0.05, max: 0.3 },
  'BTC / crypto': { min: 0.0, max: 0.1 },
  Super: { min: 0.1, max: 0.25 },
  Collectibles: { min: 0.0, max: 0.05 },
};

export function AssetAllocation({ onMenu }: { onMenu: () => void }) {
  const { data } = useCadenceFinancial();
  const current = data.monthly_metrics.length ? latestMonth(data.monthly_metrics) : null;

  return (
    <>
      <ScreenHeader title="Asset Allocation" subtitle="Where net worth actually sits, against target bands." onMenu={onMenu} />
      <div className="screen-content">
        {!current ? (
          <Card>No monthly metrics loaded yet.</Card>
        ) : (
          (() => {
            const rows: { label: string; value: number }[] = [
              { label: 'Property', value: current.property_value },
              { label: 'Cash / offsets', value: current.cash_offsets },
              { label: 'Shares', value: current.shares },
              { label: 'BTC / crypto', value: current.btc_crypto },
              { label: 'Super', value: current.super_balance },
              { label: 'Collectibles', value: current.collectibles_value },
            ];
            const total = rows.reduce((s, r) => s + r.value, 0);
            return (
              <Card title="Allocation vs. target bands">
                <div className="cf-table-wrap">
                  <table className="cf-table">
                    <thead>
                      <tr>
                        <th>Asset class</th>
                        <th>Value</th>
                        <th>% of assets</th>
                        <th>Target band</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((r) => {
                        const pct = total > 0 ? r.value / total : 0;
                        const band = TARGET_BANDS[r.label];
                        const inBand = !band || (pct >= band.min && pct <= band.max);
                        return (
                          <tr key={r.label}>
                            <td>{r.label}</td>
                            <td>{formatMoney(r.value)}</td>
                            <td>{formatPercent(pct)}</td>
                            <td>
                              {band ? `${formatPercent(band.min, 0)}–${formatPercent(band.max, 0)}` : '—'}
                            </td>
                            <td>
                              <span className={`grade-tag ${inBand ? 'grade-strong' : 'grade-weak'}`}>
                                {inBand ? 'In band' : 'Out of band'}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      <tr className="cf-total">
                        <td>Total assets</td>
                        <td>{formatMoney(total)}</td>
                        <td>100%</td>
                        <td />
                        <td />
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </Card>
            );
          })()
        )}
      </div>
    </>
  );
}
