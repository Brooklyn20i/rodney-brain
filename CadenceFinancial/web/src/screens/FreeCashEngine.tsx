import { useMemo, useState } from 'react';
import { useCadenceFinancial } from '../lib/store';
import { ScreenHeader, Card, Metric } from '../components/bits';
import { summarizePeriod } from '../lib/financeCalc';
import { formatMoney, monthLabel, periodRange } from '../lib/util';

export function FreeCashEngine({ onMenu }: { onMenu: () => void }) {
  const { data } = useCadenceFinancial();
  const [watchAmount, setWatchAmount] = useState(0);
  const months = data.monthly_metrics;
  const range = periodRange(months.map((m) => m.period));

  const summary = useMemo(() => {
    if (!range) return null;
    return summarizePeriod(months, range.start, range.end, watchAmount);
  }, [months, range, watchAmount]);

  const sorted = [...months].sort((a, b) => a.period.localeCompare(b.period));
  const maxBar = Math.max(1, ...sorted.map((m) => Math.abs(m.cash_saved + m.share_buys + m.btc_buys)));

  return (
    <>
      <ScreenHeader
        title="Free Cash Engine"
        subtitle="Cash saved in accounts + share/BTC/collectible purchases. Debt reduction is a second layer."
        onMenu={onMenu}
      />
      <div className="screen-content">
        {!summary ? (
          <Card>No monthly metrics loaded yet.</Card>
        ) : (
          <>
            <div className="cf-metric-grid">
              <Metric label="Free cash generated" value={formatMoney(summary.freeCashGenerated, true)} delta={`${formatMoney(summary.freeCashMonthlyAverage)}/mo`} tone="neutral" />
              <Metric label="All-in surplus" value={formatMoney(summary.allInSurplus, true)} delta={`${formatMoney(summary.allInMonthlyAverage)}/mo`} tone="neutral" />
              <Metric label="Debt reduced" value={formatMoney(summary.debtReduction, true)} tone="good" />
              <Metric label="Investments bought" value={formatMoney(summary.investmentBuys, true)} tone="neutral" />
            </div>

            <Card title={`Monthly detail — ${monthLabel(range!.start)} to ${monthLabel(range!.end)}`}>
              <div className="cf-table-wrap">
                <table className="cf-table">
                  <thead>
                    <tr>
                      <th>Month</th>
                      <th>Cash saved</th>
                      <th>Shares bought</th>
                      <th>BTC bought</th>
                      <th>Free cash generated</th>
                      <th>Debt reduced</th>
                      <th>All-in surplus</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sorted.map((m) => {
                      const freeCash = m.cash_saved + m.share_buys + m.btc_buys;
                      const allIn = freeCash + m.debt_reduction;
                      return (
                        <tr key={m.period}>
                          <td>{monthLabel(m.period)}</td>
                          <td>{formatMoney(m.cash_saved)}</td>
                          <td>{formatMoney(m.share_buys)}</td>
                          <td>{formatMoney(m.btc_buys)}</td>
                          <td>{formatMoney(freeCash)}</td>
                          <td>{formatMoney(m.debt_reduction)}</td>
                          <td>{formatMoney(allIn)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="cf-total">
                      <td>Total</td>
                      <td>{formatMoney(summary.cashSaved)}</td>
                      <td>{formatMoney(summary.shareBuys)}</td>
                      <td>{formatMoney(summary.btcBuys)}</td>
                      <td>{formatMoney(summary.freeCashGenerated)}</td>
                      <td>{formatMoney(summary.debtReduction)}</td>
                      <td>{formatMoney(summary.allInSurplus)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </Card>

            <Card title="Monthly surplus deployed">
              {sorted.map((m) => {
                const freeCash = m.cash_saved + m.share_buys + m.btc_buys;
                const pct = Math.min(100, (Math.abs(freeCash) / maxBar) * 100);
                return (
                  <div className="cf-bar-row" key={m.period}>
                    <div className="cf-bar-label">{monthLabel(m.period)}</div>
                    <div className="cf-bar-track">
                      <div className={`cf-bar-fill ${freeCash < 0 ? 'negative' : ''}`} style={{ width: `${pct}%` }} />
                    </div>
                    <div className="cf-bar-value">{formatMoney(freeCash)}</div>
                  </div>
                );
              })}
            </Card>

            <Card title="Collectible / retained-asset scenario">
              <p style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 10 }}>
                Model a one-off purchase (e.g. a watch) as deployed surplus, not liquidity.
              </p>
              <div className="form-group" style={{ maxWidth: 220 }}>
                <label className="field">Collectible purchase amount</label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={watchAmount === 0 ? '' : watchAmount}
                  placeholder="0.00"
                  onChange={(e) => setWatchAmount(Number(e.target.value.replace(/[^0-9.]/g, '')) || 0)}
                />
              </div>
              <div className="cf-metric-grid" style={{ marginTop: 10 }}>
                <Metric label="Free cash + collectibles" value={formatMoney(summary.freeCashPlusCollectibles, true)} delta={`${formatMoney(summary.freeCashPlusCollectiblesMonthlyAverage)}/mo`} />
                <Metric label="All-in + collectibles" value={formatMoney(summary.allInPlusCollectibles, true)} delta={`${formatMoney(summary.allInPlusCollectiblesMonthlyAverage)}/mo`} />
              </div>
            </Card>
          </>
        )}
      </div>
    </>
  );
}
