import { useCadenceFinancial } from '../lib/store';
import { Card } from '../components/bits';
import { latestMonth } from '../lib/financeCalc';
import { computeRiskMetrics } from '../lib/riskCalc';
import { formatPercent, monthLabel } from '../lib/util';

const STATUS_CLASS: Record<string, string> = {
  green: 'grade-strong',
  amber: 'grade-weak',
  red: 'status-blocked',
  na: 'grade-tag',
};

// Rendered inside the Risk & Protection hub — the hub owns the ScreenHeader.
export function RiskDashboardView() {
  const { data } = useCadenceFinancial();
  const current = data.monthly_metrics.length ? latestMonth(data.monthly_metrics) : null;

  return (
    <>
      <div className="screen-content">
        {!current ? (
          <Card>No monthly metrics loaded yet.</Card>
        ) : (
          <Card title={`Risk metrics — ${monthLabel(current.period)}`}>
            <div className="cf-table-wrap">
              <table className="cf-table">
                <thead>
                  <tr>
                    <th>Metric</th>
                    <th>Current</th>
                    <th>Status</th>
                    <th>Note</th>
                  </tr>
                </thead>
                <tbody>
                  {computeRiskMetrics(current, data.liquidity_buckets, data.risk_policies).map((m) => (
                    <tr key={m.key}>
                      <td>{m.label}</td>
                      <td>{m.value === null ? '—' : formatPercent(m.value)}</td>
                      <td>
                        <span className={`grade-tag ${STATUS_CLASS[m.status]}`}>
                          {m.status === 'na' ? 'n/a' : m.status}
                        </span>
                      </td>
                      <td style={{ textAlign: 'left', color: 'var(--text2)', fontSize: 12 }}>{m.note}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {data.risk_policies.length === 0 && (
              <p style={{ fontSize: 12, color: 'var(--text2)', marginTop: 10 }}>
                No risk thresholds set yet — run the policy seed (see AGENTS.md) or metrics show n/a.
              </p>
            )}
          </Card>
        )}
      </div>
    </>
  );
}
