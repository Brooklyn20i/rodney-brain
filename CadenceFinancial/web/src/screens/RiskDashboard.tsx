import { useCadenceFinancial } from '../lib/store';
import { ScreenHeader, Card } from '../components/bits';
import { latestMonth } from '../lib/financeCalc';
import { computeRiskMetrics } from '../lib/riskCalc';
import { formatPercent, monthLabel } from '../lib/util';

const STATUS_CLASS: Record<string, string> = {
  green: 'grade-strong',
  amber: 'grade-weak',
  red: 'status-blocked',
  na: 'grade-tag',
};

export function RiskDashboard({ onMenu }: { onMenu: () => void }) {
  const { data } = useCadenceFinancial();
  const current = data.monthly_metrics.length ? latestMonth(data.monthly_metrics) : null;

  return (
    <>
      <ScreenHeader
        title="Risk Dashboard"
        subtitle="Live risk metrics against your thresholds — computed, never carried forward."
        onMenu={onMenu}
      />
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
