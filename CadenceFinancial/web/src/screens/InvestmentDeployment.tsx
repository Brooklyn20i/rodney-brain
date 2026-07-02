import { useState } from 'react';
import { useCadenceFinancial } from '../lib/store';
import { ScreenHeader, Card, Metric } from '../components/bits';
import { investmentBuysSummary } from '../lib/financeCalc';
import { formatMoney, formatPercent, periodRange } from '../lib/util';

const num = (s: string) => Number(s.replace(/[^0-9.-]/g, '')) || 0;
const today = () => new Date().toISOString().slice(0, 10);

export function InvestmentDeployment({ onMenu }: { onMenu: () => void }) {
  const { data, insert, update } = useCadenceFinancial();
  const [form, setForm] = useState<'holding' | 'buy' | null>(null);
  // Per-row reprice state: holding id -> { value, date }
  const [reprice, setReprice] = useState<Record<string, { value: string; date: string }>>({});

  const [holding, setHolding] = useState({ ticker: '', market: '', currency: 'AUD', units: '', native_value: '', cost_basis: '' });
  const [buy, setBuy] = useState({ date: today(), ticker: '', currency: 'AUD', units: '', price: '', amount: '', amount_aud: '', notes: '' });

  const range = periodRange(data.investment_transactions.map((t) => t.date.slice(0, 7)));
  const summary = range ? investmentBuysSummary(data.investment_transactions, range.start, range.end) : null;
  const entityName = (id: string | null) => data.entities.find((e) => e.id === id)?.name ?? 'Unassigned';

  const addHolding = async () => {
    if (!holding.ticker.trim()) return;
    await insert('investment_holdings', {
      entity_id: null,
      ticker: holding.ticker.trim().toUpperCase(),
      market: holding.market.trim(),
      currency: holding.currency.trim().toUpperCase() || 'AUD',
      units: num(holding.units),
      native_value: num(holding.native_value),
      cost_basis: num(holding.cost_basis),
      as_of_date: today(),
    });
    setHolding({ ticker: '', market: '', currency: 'AUD', units: '', native_value: '', cost_basis: '' });
    setForm(null);
  };

  const addBuy = async () => {
    if (!buy.ticker.trim() || !buy.date) return;
    const amount = num(buy.amount);
    const currency = buy.currency.trim().toUpperCase() || 'AUD';
    await insert('investment_transactions', {
      date: buy.date,
      ticker: buy.ticker.trim().toUpperCase(),
      side: 'buy',
      currency,
      units: num(buy.units),
      price: num(buy.price),
      amount,
      // AUD rows: native amount IS the AUD amount. Foreign rows need it entered.
      amount_aud: currency === 'AUD' ? amount : num(buy.amount_aud) || amount,
      notes: buy.notes.trim(),
    });
    setBuy({ date: today(), ticker: '', currency: 'AUD', units: '', price: '', amount: '', amount_aud: '', notes: '' });
    setForm(null);
  };

  const saveReprice = async (id: string) => {
    const r = reprice[id];
    if (!r) return;
    await update('investment_holdings', id, { native_value: num(r.value), as_of_date: r.date || today() });
    setReprice((p) => {
      const { [id]: _drop, ...rest } = p;
      return rest;
    });
  };

  return (
    <>
      <ScreenHeader title="Investment Deployment" subtitle="Capital deployed into shares and BTC, by holding and by month." onMenu={onMenu}>
        <button className="btn btn-secondary btn-sm" onClick={() => setForm(form === 'holding' ? null : 'holding')}>
          {form === 'holding' ? 'Cancel' : '+ Holding'}
        </button>
        <button className="btn btn-primary btn-sm" onClick={() => setForm(form === 'buy' ? null : 'buy')}>
          {form === 'buy' ? 'Cancel' : '+ Buy'}
        </button>
      </ScreenHeader>
      <div className="screen-content">
        {form === 'holding' && (
          <Card title="New holding">
            <div className="wizard-grid">
              {(
                [
                  ['ticker', 'Ticker'],
                  ['market', 'Market / account'],
                  ['currency', 'Currency'],
                  ['units', 'Units'],
                  ['native_value', 'Current value (native)'],
                  ['cost_basis', 'Cost basis (native)'],
                ] as const
              ).map(([key, label]) => (
                <div className="form-group" key={key}>
                  <label className="field">{label}</label>
                  <input type="text" value={holding[key]} onChange={(e) => setHolding((h) => ({ ...h, [key]: e.target.value }))} />
                </div>
              ))}
            </div>
            <button className="btn btn-primary" onClick={addHolding}>
              Add holding
            </button>
          </Card>
        )}
        {form === 'buy' && (
          <Card title="New buy transaction">
            <div className="wizard-grid">
              {(
                [
                  ['date', 'Date (YYYY-MM-DD)'],
                  ['ticker', 'Ticker'],
                  ['currency', 'Currency'],
                  ['units', 'Units'],
                  ['price', 'Price (native)'],
                  ['amount', 'Amount (native)'],
                  ['amount_aud', 'Amount (AUD) — required if not AUD'],
                  ['notes', 'Notes / evidence'],
                ] as const
              ).map(([key, label]) => (
                <div className="form-group" key={key}>
                  <label className="field">{label}</label>
                  <input type="text" value={buy[key]} onChange={(e) => setBuy((b) => ({ ...b, [key]: e.target.value }))} />
                </div>
              ))}
            </div>
            <button className="btn btn-primary" onClick={addBuy}>
              Add buy
            </button>
          </Card>
        )}

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
                  <th>As of</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {data.investment_holdings.map((h) => {
                  const pl = h.native_value - h.cost_basis;
                  const plPct = h.cost_basis > 0 ? pl / h.cost_basis : 0;
                  const editing = reprice[h.id];
                  return (
                    <tr key={h.id}>
                      <td>{h.ticker}</td>
                      <td>{h.market}</td>
                      <td>{entityName(h.entity_id)}</td>
                      <td>{h.units}</td>
                      <td>
                        {editing ? (
                          <input
                            type="text"
                            style={{ width: 110 }}
                            value={editing.value}
                            onChange={(e) => setReprice((p) => ({ ...p, [h.id]: { ...editing, value: e.target.value } }))}
                          />
                        ) : (
                          formatMoney(h.native_value)
                        )}
                      </td>
                      <td>{formatMoney(h.cost_basis)}</td>
                      <td style={{ color: pl >= 0 ? 'var(--green)' : 'var(--red)' }}>
                        {formatMoney(pl)} ({formatPercent(plPct)})
                      </td>
                      <td style={{ fontSize: 12 }}>{h.as_of_date}</td>
                      <td>
                        {editing ? (
                          <button className="btn btn-primary btn-sm" onClick={() => saveReprice(h.id)}>
                            Save
                          </button>
                        ) : (
                          <button
                            className="btn btn-secondary btn-sm"
                            onClick={() =>
                              setReprice((p) => ({ ...p, [h.id]: { value: String(h.native_value), date: today() } }))
                            }
                          >
                            Reprice
                          </button>
                        )}
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
