import { useCadenceFinancial } from '../lib/store';
import { ScreenHeader, Card, Metric } from '../components/bits';
import { performanceHistory } from '../lib/financeCalc';
import { formatMoney, formatPercent, monthLabel } from '../lib/util';

// Contribution vs return: how much of the wealth movement Rodney earned
// (operating) vs the market handed over (marks). The split every family
// office reports monthly, and the workbook's benchmark policy (07E) never
// actually computed.

const signCls = (v: number) => ({ color: v >= 0 ? 'var(--green)' : 'var(--red)' });

export function Performance({ onMenu }: { onMenu: () => void }) {
  const { data } = useCadenceFinancial();
  const history = performanceHistory(data.monthly_metrics);

  return (
    <>
      <ScreenHeader
        title="Performance"
        subtitle="What you did vs what markets did, month by month."
        onMenu={onMenu}
      />
      <div className="screen-content">
        {!history ? (
          <Card>Needs at least two closed months to attribute performance.</Card>
        ) : (
          <>
            <div className="cf-metric-grid">
              <Metric
                label="Net worth movement"
                value={formatMoney(history.totalMovement, true)}
                delta={`${monthLabel(history.rows[0].period)} – ${monthLabel(history.rows[history.rows.length - 1].period)}`}
                tone={history.totalMovement >= 0 ? 'good' : 'bad'}
              />
              <Metric
                label="You contributed"
                value={formatMoney(history.operatingTotal, true)}
                delta="cash + buys + debt paid"
                tone={history.operatingTotal >= 0 ? 'good' : 'bad'}
              />
              <Metric
                label="Markets contributed"
                value={formatMoney(history.marketTotal, true)}
                delta="marks, FX, everything else"
                tone={history.marketTotal >= 0 ? 'good' : 'bad'}
              />
              <Metric
                label="Operating share"
                value={history.operatingShare === null ? '—' : formatPercent(history.operatingShare, 0)}
                delta="of total movement"
              />
            </div>

            <Card title="Monthly attribution">
              <div className="cf-table-wrap">
                <table className="cf-table">
                  <thead>
                    <tr>
                      <th>Month</th>
                      <th>You did (operating)</th>
                      <th>Markets did</th>
                      <th>Net worth movement</th>
                      <th>Read</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...history.rows].reverse().map((r) => (
                      <tr key={r.period}>
                        <td>{monthLabel(r.period)}</td>
                        <td style={signCls(r.operating)}>{formatMoney(r.operating)}</td>
                        <td style={signCls(r.market)}>{formatMoney(r.market)}</td>
                        <td style={signCls(r.total)}>{formatMoney(r.total)}</td>
                        <td style={{ textAlign: 'left', color: 'var(--text2)', fontSize: 12 }}>
                          {r.operating >= 0 && r.market >= 0
                            ? 'Earned and market-assisted'
                            : r.operating >= 0 && r.market < 0
                              ? 'Earned through a market drawdown'
                              : r.operating < 0 && r.market >= 0
                                ? 'Market gains masked an operating deficit'
                                : 'Operating deficit in a down market'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="cf-total">
                      <td>Total</td>
                      <td style={signCls(history.operatingTotal)}>{formatMoney(history.operatingTotal)}</td>
                      <td style={signCls(history.marketTotal)}>{formatMoney(history.marketTotal)}</td>
                      <td style={signCls(history.totalMovement)}>{formatMoney(history.totalMovement)}</td>
                      <td />
                    </tr>
                  </tfoot>
                </table>
              </div>
              <p style={{ fontSize: 12, color: 'var(--text2)', marginTop: 10 }}>
                Operating + markets = total by construction, so this table always reconciles with
                the Net Worth Bridge. The operating column is the only one you control — judge
                months by it, not by the total.
              </p>
            </Card>
          </>
        )}
      </div>
    </>
  );
}
