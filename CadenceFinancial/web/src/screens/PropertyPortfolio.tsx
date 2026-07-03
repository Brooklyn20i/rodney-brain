import { useMemo, useState } from 'react';
import { useCadenceFinancial } from '../lib/store';
import { ScreenHeader, Card, Metric } from '../components/bits';
import {
  EXPENSE_CATEGORIES,
  PROPERTY_CATEGORY_LABEL,
  availablePeriods,
  monthlyPnL,
  portfolioMonth,
  propertyYields,
  trailingAverages,
} from '../lib/propertyCalc';
import type { PropertyLedgerCategory } from '../lib/types';
import { EVIDENCE_GRADE_LABEL, formatMoney, formatPercent, monthLabel } from '../lib/util';

const num = (s: string) => Number(s.replace(/[^0-9.-]/g, '')) || 0;
const thisMonth = () => new Date().toISOString().slice(0, 7);

// Categories offered in the Log Statement form, income first.
const FORM_CATEGORIES: PropertyLedgerCategory[] = ['rent', 'other_income', ...EXPENSE_CATEGORIES];

export function PropertyPortfolio({ onMenu }: { onMenu: () => void }) {
  const { data, insert } = useCadenceFinancial();
  const ledger = data.property_ledger;
  const tenanted = data.properties;

  const periods = availablePeriods(ledger);
  const latest = periods.length ? periods[periods.length - 1] : thisMonth();
  const [period, setPeriod] = useState(latest);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  const pm = useMemo(() => portfolioMonth(ledger, tenanted, period), [ledger, tenanted, period]);
  const portfolioValue = tenanted.reduce((s, p) => s + p.value, 0);
  const portfolioNetYield = portfolioValue > 0 ? (pm.netCashflow * 12) / portfolioValue : null;
  const maxCatCost = Math.max(1, ...Object.values(pm.byCategory));

  const selected = selectedId ? tenanted.find((p) => p.id === selectedId) ?? null : null;

  return (
    <>
      <ScreenHeader
        title="Property Portfolio"
        subtitle="Per-property P&L from your monthly statements — rent in, every cost out."
        onMenu={onMenu}
      >
        {periods.length > 0 && (
          <select value={period} onChange={(e) => setPeriod(e.target.value)} style={{ width: 'auto' }}>
            {periods.map((p) => (
              <option key={p} value={p}>
                {monthLabel(p)}
              </option>
            ))}
          </select>
        )}
        <button className="btn btn-primary btn-sm" onClick={() => setShowForm((s) => !s)}>
          {showForm ? 'Cancel' : '+ Log statement'}
        </button>
      </ScreenHeader>

      <div className="screen-content">
        {showForm && (
          <StatementForm
            properties={tenanted}
            defaultPeriod={period}
            onDone={(savedPeriod) => {
              setShowForm(false);
              setPeriod(savedPeriod);
            }}
            insert={insert}
          />
        )}

        {tenanted.length === 0 ? (
          <Card>
            No properties yet. Add them on the Debt &amp; Offset screen, then log their monthly
            statements here.
          </Card>
        ) : (
          <>
            <div className="cf-metric-grid">
              <Metric label="Portfolio value" value={formatMoney(portfolioValue, true)} />
              <Metric label={`Rent — ${monthLabel(period)}`} value={formatMoney(pm.totalIncome, true)} tone="good" />
              <Metric label="Costs this month" value={formatMoney(pm.totalExpenses, true)} tone="bad" />
              <Metric
                label="Net cashflow (P&L)"
                value={formatMoney(pm.netCashflow, true)}
                delta={portfolioNetYield !== null ? `${formatPercent(portfolioNetYield)} net yield` : undefined}
                tone={pm.netCashflow >= 0 ? 'good' : 'bad'}
              />
            </div>

            {Object.keys(pm.byCategory).length > 0 && (
              <Card title={`Where the costs come from — ${monthLabel(period)}`}>
                {EXPENSE_CATEGORIES.filter((c) => pm.byCategory[c] !== undefined).map((c) => {
                  const amt = pm.byCategory[c]!;
                  return (
                    <div key={c} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 7 }}>
                      <span style={{ width: 150, fontSize: 13, flexShrink: 0 }}>{PROPERTY_CATEGORY_LABEL[c]}</span>
                      <div style={{ flex: 1, background: 'var(--surface2)', borderRadius: 4, height: 14, overflow: 'hidden' }}>
                        <div
                          style={{
                            width: `${(amt / maxCatCost) * 100}%`,
                            height: '100%',
                            background: 'var(--accent)',
                            borderRadius: 4,
                          }}
                        />
                      </div>
                      <span style={{ width: 90, textAlign: 'right', fontSize: 13, fontWeight: 600 }}>
                        {formatMoney(amt)}
                      </span>
                    </div>
                  );
                })}
              </Card>
            )}

            <Card title="Per-property this month">
              <div className="cf-table-wrap">
                <table className="cf-table">
                  <thead>
                    <tr>
                      <th>Property</th>
                      <th>Value</th>
                      <th>Rent</th>
                      <th>Costs</th>
                      <th>Net cashflow</th>
                      <th>Net yield</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {pm.rows.map((r) => {
                      const y = propertyYields(r.totalIncome, r.netCashflow, r.value);
                      const active = selectedId === r.propertyId;
                      return (
                        <tr key={r.propertyId}>
                          <td style={{ textAlign: 'left' }}>{r.address}</td>
                          <td>{formatMoney(r.value, true)}</td>
                          <td style={{ color: 'var(--green)' }}>{formatMoney(r.totalIncome)}</td>
                          <td style={{ color: 'var(--red)' }}>{formatMoney(r.totalExpenses)}</td>
                          <td style={{ color: r.netCashflow >= 0 ? 'var(--green)' : 'var(--red)', fontWeight: 600 }}>
                            {formatMoney(r.netCashflow)}
                          </td>
                          <td>{y.netYield === null ? '—' : formatPercent(y.netYield)}</td>
                          <td>
                            <button
                              className="btn btn-secondary btn-sm"
                              onClick={() => setSelectedId(active ? null : r.propertyId)}
                            >
                              {active ? 'Hide' : 'Details'}
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="cf-total">
                      <td>Portfolio</td>
                      <td>{formatMoney(portfolioValue, true)}</td>
                      <td>{formatMoney(pm.totalIncome)}</td>
                      <td>{formatMoney(pm.totalExpenses)}</td>
                      <td>{formatMoney(pm.netCashflow)}</td>
                      <td>{portfolioNetYield === null ? '—' : formatPercent(portfolioNetYield)}</td>
                      <td />
                    </tr>
                  </tfoot>
                </table>
              </div>
              <p style={{ fontSize: 12, color: 'var(--text2)', marginTop: 10 }}>
                Net cashflow is an interest-only P&amp;L: rent less operating costs and loan
                interest, but not loan principal (that's a balance-sheet transfer, not a cost).
              </p>
            </Card>

            {selected && (
              <PropertyDetail
                ledger={ledger}
                propertyId={selected.id}
                address={selected.address}
                value={selected.value}
                period={period}
              />
            )}
          </>
        )}
      </div>
    </>
  );
}

function PropertyDetail({
  ledger,
  propertyId,
  address,
  value,
  period,
}: {
  ledger: ReturnType<typeof useCadenceFinancial>['data']['property_ledger'];
  propertyId: string;
  address: string;
  value: number;
  period: string;
}) {
  const pnl = monthlyPnL(ledger, propertyId, period);
  const trailing = trailingAverages(ledger, propertyId);
  const y = propertyYields(trailing.avgIncome, trailing.avgNet, value);
  const periods = availablePeriods(ledger.filter((e) => e.property_id === propertyId));

  return (
    <Card title={`${address} — ${monthLabel(period)}`}>
      <div className="cf-table-wrap">
        <table className="cf-table">
          <tbody>
            <tr>
              <td style={{ textAlign: 'left', fontWeight: 600 }}>Rent</td>
              <td style={{ textAlign: 'right', color: 'var(--green)' }}>{formatMoney(pnl.rent)}</td>
            </tr>
            {pnl.otherIncome > 0 && (
              <tr>
                <td style={{ textAlign: 'left', fontWeight: 600 }}>Other income</td>
                <td style={{ textAlign: 'right', color: 'var(--green)' }}>{formatMoney(pnl.otherIncome)}</td>
              </tr>
            )}
            {EXPENSE_CATEGORIES.filter((c) => pnl.expensesByCategory[c] !== undefined).map((c) => (
              <tr key={c}>
                <td style={{ textAlign: 'left' }}>{PROPERTY_CATEGORY_LABEL[c]}</td>
                <td style={{ textAlign: 'right', color: 'var(--red)' }}>
                  −{formatMoney(pnl.expensesByCategory[c]!)}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="cf-total">
              <td style={{ textAlign: 'left' }}>Net cashflow</td>
              <td style={{ textAlign: 'right', color: pnl.netCashflow >= 0 ? 'var(--green)' : 'var(--red)' }}>
                {formatMoney(pnl.netCashflow)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
      <div className="cf-metric-grid" style={{ marginTop: 14 }}>
        <Metric label={`Avg rent (${trailing.months}mo)`} value={formatMoney(trailing.avgIncome)} />
        <Metric label="Avg costs" value={formatMoney(trailing.avgExpenses)} />
        <Metric label="Avg net / mo" value={formatMoney(trailing.avgNet)} tone={trailing.avgNet >= 0 ? 'good' : 'bad'} />
        <Metric
          label="Yields (gross / net)"
          value={
            y.grossYield === null
              ? '—'
              : `${formatPercent(y.grossYield)} / ${formatPercent(y.netYield ?? 0)}`
          }
        />
      </div>
      <p style={{ fontSize: 12, color: 'var(--text2)', marginTop: 10 }}>
        Statements on file: {periods.length ? periods.map(monthLabel).join(', ') : 'none yet'}.
      </p>
    </Card>
  );
}

function StatementForm({
  properties,
  defaultPeriod,
  onDone,
  insert,
}: {
  properties: ReturnType<typeof useCadenceFinancial>['data']['properties'];
  defaultPeriod: string;
  onDone: (period: string) => void;
  insert: ReturnType<typeof useCadenceFinancial>['insert'];
}) {
  const [propertyId, setPropertyId] = useState(properties[0]?.id ?? '');
  const [period, setPeriod] = useState(defaultPeriod);
  const [grade, setGrade] = useState('statement');
  const [source, setSource] = useState('');
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    setError(null);
    if (!propertyId) {
      setError('Pick a property.');
      return;
    }
    if (!/^\d{4}-\d{2}$/.test(period)) {
      setError('Period must be YYYY-MM (e.g. 2025-07).');
      return;
    }
    const lines = FORM_CATEGORIES.map((c) => ({ category: c, amount: num(amounts[c] ?? '') })).filter(
      (l) => l.amount > 0
    );
    if (lines.length === 0) {
      setError('Enter at least one amount.');
      return;
    }
    setSaving(true);
    try {
      for (const line of lines) {
        await insert('property_ledger', {
          property_id: propertyId,
          period,
          entry_date: `${period}-01`,
          category: line.category,
          amount: line.amount,
          grade: grade as never,
          source: source.trim(),
          notes: '',
        });
      }
    } catch (e) {
      setSaving(false);
      setError(e instanceof Error ? `Save failed: ${e.message}` : 'Save failed — has the property_ledger migration been run?');
      return;
    }
    setSaving(false);
    onDone(period);
  };

  return (
    <Card title="Log a monthly statement">
      <div className="wizard-grid">
        <div className="form-group">
          <label className="field">Property</label>
          <select value={propertyId} onChange={(e) => setPropertyId(e.target.value)}>
            {properties.map((p) => (
              <option key={p.id} value={p.id}>
                {p.address}
              </option>
            ))}
          </select>
        </div>
        <div className="form-group">
          <label className="field">Period (YYYY-MM)</label>
          <input type="text" value={period} onChange={(e) => setPeriod(e.target.value)} />
        </div>
        <div className="form-group">
          <label className="field">Evidence grade</label>
          <select value={grade} onChange={(e) => setGrade(e.target.value)}>
            {Object.entries(EVIDENCE_GRADE_LABEL).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </div>
        <div className="form-group">
          <label className="field">Source (e.g. "May agent statement")</label>
          <input type="text" value={source} onChange={(e) => setSource(e.target.value)} />
        </div>
      </div>

      <div className="cf-table-wrap" style={{ marginTop: 4 }}>
        <table className="cf-table">
          <thead>
            <tr>
              <th>Line item</th>
              <th>Amount (A$)</th>
            </tr>
          </thead>
          <tbody>
            {FORM_CATEGORIES.map((c) => (
              <tr key={c}>
                <td style={{ textAlign: 'left', color: c === 'rent' || c === 'other_income' ? 'var(--green)' : undefined }}>
                  {PROPERTY_CATEGORY_LABEL[c]}
                </td>
                <td>
                  <input
                    type="text"
                    style={{ width: 120, textAlign: 'right' }}
                    value={amounts[c] ?? ''}
                    placeholder="0"
                    onChange={(e) => setAmounts((a) => ({ ...a, [c]: e.target.value }))}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {error && <p style={{ fontSize: 13, color: 'var(--red)', margin: '10px 0 0' }}>{error}</p>}
      <button className="btn btn-primary" onClick={save} disabled={saving} style={{ marginTop: 12 }}>
        {saving ? 'Saving…' : 'Save statement'}
      </button>
      <p style={{ fontSize: 12, color: 'var(--text2)', marginTop: 10 }}>
        Leave a line blank if it doesn't apply this month. One row is written per non-zero line, so
        the Evidence Register and P&amp;L both stay itemised. Enter loan interest from the loan
        statement — principal isn't a P&amp;L cost.
      </p>
    </Card>
  );
}
