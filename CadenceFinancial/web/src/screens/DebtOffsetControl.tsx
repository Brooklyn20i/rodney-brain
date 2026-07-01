import { useCadenceFinancial } from '../lib/store';
import { ScreenHeader, Card, Metric } from '../components/bits';
import { latestMonth } from '../lib/financeCalc';
import { formatMoney, formatPercent } from '../lib/util';

export function DebtOffsetControl({ onMenu }: { onMenu: () => void }) {
  const { data } = useCadenceFinancial();
  const current = data.monthly_metrics.length ? latestMonth(data.monthly_metrics) : null;

  const propertyName = (id: string) => data.properties.find((p) => p.id === id)?.address ?? 'Unlinked property';

  return (
    <>
      <ScreenHeader title="Debt & Offset Control" subtitle="Net debt, offset protection and protected liquidity." onMenu={onMenu} />
      <div className="screen-content">
        {current && (
          <div className="cf-metric-grid">
            <Metric label="Total debt" value={formatMoney(current.total_debt, true)} />
            <Metric label="Net debt" value={formatMoney(current.net_debt, true)} />
            <Metric label="Debt reduced this month" value={formatMoney(current.debt_reduction, true)} tone="good" />
            <Metric label="Cash / offsets" value={formatMoney(current.cash_offsets, true)} />
          </div>
        )}

        <Card title="Loan & offset register">
          <div className="cf-table-wrap">
            <table className="cf-table">
              <thead>
                <tr>
                  <th>Property</th>
                  <th>Loan balance</th>
                  <th>Offset balance</th>
                  <th>Net debt</th>
                  <th>Offset protection</th>
                  <th>Rate</th>
                </tr>
              </thead>
              <tbody>
                {data.loans.map((l) => {
                  const netDebt = l.balance - l.offset_balance;
                  const protection = l.balance > 0 ? l.offset_balance / l.balance : 1;
                  return (
                    <tr key={l.id}>
                      <td>{propertyName(l.property_id)}</td>
                      <td>{formatMoney(l.balance)}</td>
                      <td>{formatMoney(l.offset_balance)}</td>
                      <td>{formatMoney(netDebt)}</td>
                      <td>{formatPercent(Math.min(protection, 1))}</td>
                      <td>
                        {formatPercent(l.rate)} ({l.rate_type})
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="cf-total">
                  <td>Total</td>
                  <td>{formatMoney(data.loans.reduce((s, l) => s + l.balance, 0))}</td>
                  <td>{formatMoney(data.loans.reduce((s, l) => s + l.offset_balance, 0))}</td>
                  <td>{formatMoney(data.loans.reduce((s, l) => s + (l.balance - l.offset_balance), 0))}</td>
                  <td />
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        </Card>

        <Card title="Liquidity buckets">
          <p style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 10 }}>
            Not everything labeled "cash" is deployable -- protected liquidity is separated from
            surplus available to deploy.
          </p>
          <div className="cf-table-wrap">
            <table className="cf-table">
              <thead>
                <tr>
                  <th>Bucket</th>
                  <th>Amount</th>
                  <th>Protected minimum</th>
                  <th>Available above minimum</th>
                  <th>Purpose</th>
                </tr>
              </thead>
              <tbody>
                {data.liquidity_buckets.map((b) => (
                  <tr key={b.id}>
                    <td>{b.label}</td>
                    <td>{formatMoney(b.amount)}</td>
                    <td>{formatMoney(b.protected_minimum)}</td>
                    <td>{formatMoney(Math.max(0, b.amount - b.protected_minimum))}</td>
                    <td style={{ textAlign: 'left', color: 'var(--text2)', fontSize: 12 }}>{b.purpose}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </>
  );
}
