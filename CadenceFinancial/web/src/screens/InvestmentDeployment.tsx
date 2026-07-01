import { useCadenceFinancial } from '../lib/store';
import { ScreenHeader, Card, Metric } from '../components/bits';
import { investmentBuysSummary } from '../lib/financeCalc';
import { formatMoney, formatPercent, periodRange } from '../lib/util';

export function InvestmentDeployment({ onMenu }: { onMenu: () => void }) {
  const { data } = useCadenceFinancial();
  const range = periodRange(data.investment_transactions.map((t) => t.date.slice(0, 7)));
  const summary = range ? investmentBuysSummary(data.investment_transactions, range.start, range.end) : null;
  const entityName = (id: string | null) => data.entities.find((e) => e.id === id)?.name ?? 'Unassigned';

  return (
    <>
      <ScreenHeader title="Investment Deployment" subtitle="Capital deployed into shares and BTC, by holding and by month." onMenu={onMenu} />
      <div className="screen-content">
        {summary && (
          <div className="cf-metric-grid">
            <Metric label="Share buys captured" value={formatMoney(summary.shares, true)} />
            <Metric label="BTC buys captured" value={formatMoney(summary.btc, true)} />
            <Metric label="Total invested" value={formatMoney(summary.total, true)} />
            <Metric label="Active months" value={String(summary.activeMonths)} />
          </div>
        )}

        <Card title="Current holdings">
          <div className="cf-table-wrap">
            <table className="cf-table">
              <thead>
                <tr>
                  <th>Ticker</th>
                  <th>Market</th>
                  <th>Entity</th>
                  <th>Units</th>
                  <th>Value</th>
                  <th>Cost basis</th>
                  <th>Unrealised P/L</th>
                </tr>
              </thead>
              <tbody>
                {data.investment_holdings.map((h) => {
                  const pl = h.native_value - h.cost_basis;
                  const plPct = h.cost_basis > 0 ? pl / h.cost_basis : 0;
                  return (
                    <tr key={h.id}>
                      <td>{h.ticker}</td>
                      <td>{h.market}</td>
                      <td>{entityName(h.entity_id)}</td>
                      <td>{h.units}</td>
                      <td>{formatMoney(h.native_value)}</td>
                      <td>{formatMoney(h.cost_basis)}</td>
                      <td style={{ color: pl >= 0 ? 'var(--green)' : 'var(--red)' }}>
                        {formatMoney(pl)} ({formatPercent(plPct)})
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>

        <Card title="Buy transactions">
          <div className="cf-table-wrap">
            <table className="cf-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Ticker</th>
                  <th>Units</th>
                  <th>Price</th>
                  <th>Amount (native)</th>
                  <th>Amount (AUD)</th>
                  <th>Notes</th>
                </tr>
              </thead>
              <tbody>
                {[...data.investment_transactions]
                  .filter((t) => t.side === 'buy')
                  .sort((a, b) => a.date.localeCompare(b.date))
                  .map((t) => (
                    <tr key={t.id}>
                      <td>{t.date}</td>
                      <td>{t.ticker}</td>
                      <td>{t.units}</td>
                      <td>
                        {t.currency} {t.price}
                      </td>
                      <td>
                        {t.currency} {t.amount.toLocaleString('en-AU', { minimumFractionDigits: 2 })}
                      </td>
                      <td>{formatMoney(t.amount_aud)}</td>
                      <td style={{ textAlign: 'left', color: 'var(--text2)', fontSize: 12 }}>{t.notes}</td>
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
