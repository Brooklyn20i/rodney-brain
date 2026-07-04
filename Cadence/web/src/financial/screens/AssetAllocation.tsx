import { useCadenceFinancial } from '../lib/store';
import { ScreenHeader, Card } from '../components/bits';
import { latestMonth } from '../lib/financeCalc';
import { allocationRows } from '../lib/allocation';
import { formatMoney, formatPercent } from '../lib/util';

const STATUS_LABEL = { in_band: 'In band', below_band: 'Below band', above_band: 'Above band' };

export function AssetAllocation({ onMenu }: { onMenu: () => void }) {
  const { data } = useCadenceFinancial();
  const current = data.monthly_metrics.length ? latestMonth(data.monthly_metrics) : null;

  return (
    <>
      <ScreenHeader
        title="Asset Allocation"
        subtitle="Where gross assets actually sit, against your policy bands."
        onMenu={onMenu}
      />
      <div className="screen-content">
        {!current ? (
          <Card>No monthly metrics loaded yet.</Card>
        ) : (
          (() => {
            const rows = allocationRows(current, data.allocation_policies);
            const totalAssets = rows.reduce((s, r) => s + r.value, 0);
            return (
              <Card title="Allocation vs. policy bands (% of total assets)">
                <div className="cf-table-wrap">
                  <table className="cf-table">
                    <thead>
                      <tr>
                        <th>Asset class</th>
                        <th>Value</th>
                        <th>% of total assets</th>
                        <th>Target band</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((r) => (
                        <tr key={r.cls}>
                          <td>{r.label}</td>
                          <td>{formatMoney(r.value)}</td>
                          <td>{formatPercent(r.pct)}</td>
                          <td>
                            {formatPercent(r.band.min, 0)}–{formatPercent(r.band.max, 0)} (base{' '}
                            {formatPercent(r.band.base, 0)})
                          </td>
                          <td>
                            <span
                              className={`grade-tag ${r.status === 'in_band' ? 'grade-strong' : 'grade-weak'}`}
                            >
                              {STATUS_LABEL[r.status]}
                            </span>
                          </td>
                        </tr>
                      ))}
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
