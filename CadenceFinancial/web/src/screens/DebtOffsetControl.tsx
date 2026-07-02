import { useState } from 'react';
import { useCadenceFinancial } from '../lib/store';
import { ScreenHeader, Card, Metric } from '../components/bits';
import { latestMonth } from '../lib/financeCalc';
import { formatMoney, formatPercent } from '../lib/util';

const num = (s: string) => Number(s.replace(/[^0-9.-]/g, '')) || 0;

export function DebtOffsetControl({ onMenu }: { onMenu: () => void }) {
  const { data, insert, update } = useCadenceFinancial();
  const current = data.monthly_metrics.length ? latestMonth(data.monthly_metrics) : null;

  // Per-row edit state: loan id -> { balance, offset }, bucket id -> { amount, min }
  const [loanEdit, setLoanEdit] = useState<Record<string, { balance: string; offset: string }>>({});
  const [bucketEdit, setBucketEdit] = useState<Record<string, { amount: string; min: string }>>({});
  const [showLoanForm, setShowLoanForm] = useState(false);
  const [newLoan, setNewLoan] = useState({ property_id: '', balance: '', offset: '', rate: '', repayment: '' });

  const propertyName = (id: string) => data.properties.find((p) => p.id === id)?.address ?? 'Unlinked property';

  const saveLoan = async (id: string) => {
    const e = loanEdit[id];
    if (!e) return;
    await update('loans', id, { balance: num(e.balance), offset_balance: num(e.offset) });
    setLoanEdit((p) => {
      const { [id]: _drop, ...rest } = p;
      return rest;
    });
  };

  const saveBucket = async (id: string) => {
    const e = bucketEdit[id];
    if (!e) return;
    await update('liquidity_buckets', id, { amount: num(e.amount), protected_minimum: num(e.min) });
    setBucketEdit((p) => {
      const { [id]: _drop, ...rest } = p;
      return rest;
    });
  };

  const addLoan = async () => {
    if (!newLoan.property_id) return;
    await insert('loans', {
      property_id: newLoan.property_id,
      balance: num(newLoan.balance),
      offset_balance: num(newLoan.offset),
      rate: num(newLoan.rate),
      monthly_repayment: num(newLoan.repayment),
      rate_type: 'variable',
      review_date: null,
      notes: '',
    });
    setNewLoan({ property_id: '', balance: '', offset: '', rate: '', repayment: '' });
    setShowLoanForm(false);
  };

  return (
    <>
      <ScreenHeader title="Debt & Offset Control" subtitle="Net debt, offset protection and protected liquidity." onMenu={onMenu}>
        <button className="btn btn-primary btn-sm" onClick={() => setShowLoanForm((s) => !s)}>
          {showLoanForm ? 'Cancel' : '+ Loan'}
        </button>
      </ScreenHeader>
      <div className="screen-content">
        {showLoanForm && (
          <Card title="New loan">
            <div className="wizard-grid">
              <div className="form-group">
                <label className="field">Property</label>
                <select value={newLoan.property_id} onChange={(e) => setNewLoan((l) => ({ ...l, property_id: e.target.value }))}>
                  <option value="">Select property…</option>
                  {data.properties.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.address}
                    </option>
                  ))}
                </select>
              </div>
              {(
                [
                  ['balance', 'Loan balance'],
                  ['offset', 'Offset balance'],
                  ['rate', 'Rate (e.g. 0.0604)'],
                  ['repayment', 'Monthly repayment'],
                ] as const
              ).map(([key, label]) => (
                <div className="form-group" key={key}>
                  <label className="field">{label}</label>
                  <input type="text" value={newLoan[key]} onChange={(e) => setNewLoan((l) => ({ ...l, [key]: e.target.value }))} />
                </div>
              ))}
            </div>
            <button className="btn btn-primary" onClick={addLoan}>
              Add loan
            </button>
          </Card>
        )}

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
                  <th />
                </tr>
              </thead>
              <tbody>
                {data.loans.map((l) => {
                  const netDebt = l.balance - l.offset_balance;
                  const protection = l.balance > 0 ? l.offset_balance / l.balance : 1;
                  const editing = loanEdit[l.id];
                  return (
                    <tr key={l.id}>
                      <td>{propertyName(l.property_id)}</td>
                      <td>
                        {editing ? (
                          <input
                            type="text"
                            style={{ width: 120 }}
                            value={editing.balance}
                            onChange={(e) => setLoanEdit((p) => ({ ...p, [l.id]: { ...editing, balance: e.target.value } }))}
                          />
                        ) : (
                          formatMoney(l.balance)
                        )}
                      </td>
                      <td>
                        {editing ? (
                          <input
                            type="text"
                            style={{ width: 120 }}
                            value={editing.offset}
                            onChange={(e) => setLoanEdit((p) => ({ ...p, [l.id]: { ...editing, offset: e.target.value } }))}
                          />
                        ) : (
                          formatMoney(l.offset_balance)
                        )}
                      </td>
                      <td>{formatMoney(netDebt)}</td>
                      <td>{formatPercent(Math.min(protection, 1))}</td>
                      <td>
                        {formatPercent(l.rate)} ({l.rate_type})
                      </td>
                      <td>
                        {editing ? (
                          <button className="btn btn-primary btn-sm" onClick={() => saveLoan(l.id)}>
                            Save
                          </button>
                        ) : (
                          <button
                            className="btn btn-secondary btn-sm"
                            onClick={() =>
                              setLoanEdit((p) => ({
                                ...p,
                                [l.id]: { balance: String(l.balance), offset: String(l.offset_balance) },
                              }))
                            }
                          >
                            Edit
                          </button>
                        )}
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
                  <th />
                </tr>
              </thead>
              <tbody>
                {data.liquidity_buckets.map((b) => {
                  const editing = bucketEdit[b.id];
                  return (
                    <tr key={b.id}>
                      <td>{b.label}</td>
                      <td>
                        {editing ? (
                          <input
                            type="text"
                            style={{ width: 120 }}
                            value={editing.amount}
                            onChange={(e) => setBucketEdit((p) => ({ ...p, [b.id]: { ...editing, amount: e.target.value } }))}
                          />
                        ) : (
                          formatMoney(b.amount)
                        )}
                      </td>
                      <td>
                        {editing ? (
                          <input
                            type="text"
                            style={{ width: 120 }}
                            value={editing.min}
                            onChange={(e) => setBucketEdit((p) => ({ ...p, [b.id]: { ...editing, min: e.target.value } }))}
                          />
                        ) : (
                          formatMoney(b.protected_minimum)
                        )}
                      </td>
                      <td>{formatMoney(Math.max(0, b.amount - b.protected_minimum))}</td>
                      <td style={{ textAlign: 'left', color: 'var(--text2)', fontSize: 12 }}>{b.purpose}</td>
                      <td>
                        {editing ? (
                          <button className="btn btn-primary btn-sm" onClick={() => saveBucket(b.id)}>
                            Save
                          </button>
                        ) : (
                          <button
                            className="btn btn-secondary btn-sm"
                            onClick={() =>
                              setBucketEdit((p) => ({
                                ...p,
                                [b.id]: { amount: String(b.amount), min: String(b.protected_minimum) },
                              }))
                            }
                          >
                            Edit
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
      </div>
    </>
  );
}
