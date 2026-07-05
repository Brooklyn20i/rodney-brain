import { useCadenceFinancial } from '../lib/store';
import { ScreenHeader, Card } from '../components/bits';
import { netWorthBridge } from '../lib/financeCalc';
import { formatMoney, monthLabel } from '../lib/util';

export function NetWorthBridge({ onMenu }: { onMenu: () => void }) {
  const { data } = useCadenceFinancial();
  const sorted = [...data.monthly_metrics].sort((a, b) => a.period.localeCompare(b.period));

  return (
    <>
      <ScreenHeader
        title="Net Worth Bridge"
        subtitle="What you controlled this month vs. what markets did."
        onMenu={onMenu}
      />
      <div className="screen-content">
        {sorted.length < 2 ? (
          <Card>Need at least two months of data to build a bridge.</Card>
        ) : (
          sorted.slice(1).map((current, i) => {
            const prior = sorted[i];
            const bridge = netWorthBridge(prior, current);
            const reconciles = Math.abs(bridge.operatingCashAndDebt + bridge.marketAndOtherMovement - bridge.netWorthMovement) < 0.01;
            return (
              <Card key={current.period} title={monthLabel(current.period)}>
                <table className="cf-table">
                  <thead>
                    <tr>
                      <th>Bridge item</th>
                      <th>Movement</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td>Opening net worth</td>
                      <td>{formatMoney(bridge.openingNetWorth)}</td>
                    </tr>
                    <tr>
                      <td>+ Cash saved</td>
                      <td>{formatMoney(bridge.cashSaved)}</td>
                    </tr>
                    <tr>
                      <td>+ Investments bought (shares + BTC)</td>
                      <td>{formatMoney(bridge.investmentBuys)}</td>
                    </tr>
                    <tr>
                      <td>+ Debt principal reduced</td>
                      <td>{formatMoney(bridge.debtReduction)}</td>
                    </tr>
                    <tr>
                      <td>= Operating cash + investments + debt reduction</td>
                      <td>{formatMoney(bridge.operatingCashAndDebt)}</td>
                    </tr>
                    <tr>
                      <td>+ Market and other movement (BTC/share/property/super marks)</td>
                      <td>{formatMoney(bridge.marketAndOtherMovement)}</td>
                    </tr>
                    <tr className="cf-total">
                      <td>Closing net worth</td>
                      <td>{formatMoney(bridge.closingNetWorth)}</td>
                    </tr>
                    <tr>
                      <td>Net movement</td>
                      <td>{formatMoney(bridge.netWorthMovement)}</td>
                    </tr>
                  </tbody>
                </table>
                <p style={{ fontSize: 11, color: 'var(--text2)', marginTop: 10 }}>
                  {reconciles
                    ? 'Reconciles: operating + market movement equals the net change exactly (market movement is computed as the residual).'
                    : 'Does not reconcile to the cent -- check for a data-entry error this month.'}
                </p>
              </Card>
            );
          })
        )}
      </div>
    </>
  );
}
