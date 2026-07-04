import { useCadenceFinancial } from '../lib/store';
import { ScreenHeader, Card } from '../components/bits';
import { latestMonth } from '../lib/financeCalc';
import { computeStressTests } from '../lib/riskCalc';
import { formatMoney, formatPercent, monthLabel } from '../lib/util';

export function StressTests({ onMenu }: { onMenu: () => void }) {
  const { data } = useCadenceFinancial();
  const current = data.monthly_metrics.length ? latestMonth(data.monthly_metrics) : null;

  return (
    <>
      <ScreenHeader
        title="Stress Tests"
        subtitle="Scenario impacts computed live from current balances."
        onMenu={onMenu}
      />
      <div className="screen-content">
        {!current ? (
          <Card>No monthly metrics loaded yet.</Card>
        ) : (
          <>
            <Card title={`Scenarios — ${monthLabel(current.period)} balances`}>
              <div className="cf-table-wrap">
                <table className="cf-table">
                  <thead>
                    <tr>
                      <th>Scenario</th>
                      <th>Net worth impact</th>
                      <th>% of net worth</th>
                      <th>Cashflow impact (annual)</th>
                      <th>Action gate</th>
                    </tr>
                  </thead>
                  <tbody>
                    {computeStressTests(current, data.loans, data.properties).map((s) => (
                      <tr key={s.key}>
                        <td>
                          {s.label}
                          <div style={{ fontSize: 11, color: 'var(--text3)' }}>{s.assumption}</div>
                        </td>
                        <td style={{ color: s.nwImpact !== null && s.nwImpact < 0 ? 'var(--red)' : undefined }}>
                          {s.nwImpact === null ? '—' : formatMoney(s.nwImpact)}
                        </td>
                        <td>
                          {s.nwImpact === null || current.net_worth === 0
                            ? '—'
                            : formatPercent(s.nwImpact / current.net_worth)}
                        </td>
                        <td style={{ color: s.cashflowImpactAnnual !== null && s.cashflowImpactAnnual < 0 ? 'var(--red)' : undefined }}>
                          {s.cashflowImpactAnnual === null ? '—' : formatMoney(s.cashflowImpactAnnual)}
                        </td>
                        <td style={{ textAlign: 'left', color: 'var(--text2)', fontSize: 12 }}>{s.gate}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
            <div className="cf-callout cf-callout-warn">
              Scenario arithmetic on current balances — first-pass magnitudes, not forecasts.
              Rate shocks apply to net property debt (loan balances less offsets, floored at zero
              per loan). No action is authorised by any scenario shown here.
            </div>
          </>
        )}
      </div>
    </>
  );
}
