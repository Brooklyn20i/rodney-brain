import { useMemo, useState } from 'react';
import { useCadenceFinancial } from '../lib/store';
import { ScreenHeader, Card, Metric } from '../components/bits';
import {
  EXPENSE_CATEGORIES,
  PROPERTY_CATEGORY_LABEL,
  availablePeriods,
  monthlyPnL,
  portfolioMonth,
  propertyAnnualRunRate,
  propertyFinancials,
  trailingAverages,
} from '../lib/propertyCalc';
import type { Loan, Property, PropertyLedgerCategory, PropertyType } from '../lib/types';
import {
  EVIDENCE_GRADE_LABEL,
  GEARING_LABEL,
  PROPERTY_TYPE_LABEL,
  fmtDMY,
  formatMoney,
  formatPercent,
  monthLabel,
} from '../lib/util';

const num = (s: string) => Number(s.replace(/[^0-9.-]/g, '')) || 0;
const thisMonth = () => new Date().toISOString().slice(0, 7);
const pct = (v: number | null) => (v === null ? '—' : formatPercent(v));
const FORM_CATEGORIES: PropertyLedgerCategory[] = ['rent', 'other_income', ...EXPENSE_CATEGORIES];

// Compact label/value row for detail cards.
function KV({ label, value, tone }: { label: string; value: string; tone?: 'good' | 'bad' }) {
  const color = tone === 'good' ? 'var(--green)' : tone === 'bad' ? 'var(--red)' : undefined;
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '6px 0', borderBottom: '1px solid var(--border)', fontSize: 13 }}>
      <span style={{ color: 'var(--text2)' }}>{label}</span>
      <span style={{ fontWeight: 600, textAlign: 'right', color }}>{value}</span>
    </div>
  );
}

export function PropertyPortfolio({ onMenu }: { onMenu: () => void }) {
  const { data, insert, update } = useCadenceFinancial();
  const ledger = data.property_ledger;
  const properties = data.properties;
  const loansFor = (id: string) => data.loans.filter((l) => l.property_id === id);

  const periods = availablePeriods(ledger);
  const latest = periods.length ? periods[periods.length - 1] : thisMonth();
  const [period, setPeriod] = useState(latest);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const selected = selectedId ? properties.find((p) => p.id === selectedId) ?? null : null;

  if (selected) {
    return (
      <PropertyDetailPage
        property={selected}
        loans={loansFor(selected.id)}
        ledger={ledger}
        period={period}
        onBack={() => setSelectedId(null)}
        onMenu={onMenu}
        insert={insert}
        update={update}
        onPeriod={setPeriod}
        periods={periods}
      />
    );
  }

  return (
    <PortfolioOverview
      properties={properties}
      loansFor={loansFor}
      ledger={ledger}
      period={period}
      periods={periods}
      onPeriod={setPeriod}
      onSelect={setSelectedId}
      onMenu={onMenu}
      insert={insert}
    />
  );
}

// ── Portfolio overview ──────────────────────────────────────────────────
function PortfolioOverview({
  properties,
  loansFor,
  ledger,
  period,
  periods,
  onPeriod,
  onSelect,
  onMenu,
  insert,
}: {
  properties: Property[];
  loansFor: (id: string) => Loan[];
  ledger: ReturnType<typeof useCadenceFinancial>['data']['property_ledger'];
  period: string;
  periods: string[];
  onPeriod: (p: string) => void;
  onSelect: (id: string) => void;
  onMenu: () => void;
  insert: ReturnType<typeof useCadenceFinancial>['insert'];
}) {
  const [showForm, setShowForm] = useState(false);
  const pm = useMemo(() => portfolioMonth(ledger, properties, period), [ledger, properties, period]);

  const fins = properties.map((p) => {
    const trailing = trailingAverages(ledger, p.id);
    return propertyFinancials(p, loansFor(p.id), trailing, new Date(), propertyAnnualRunRate(ledger, p, trailing));
  });
  const totalValue = fins.reduce((s, f) => s + f.value, 0);
  const totalDebt = fins.reduce((s, f) => s + f.debt, 0);
  const totalEquity = totalValue - totalDebt;
  const totalAnnualRent = fins.reduce((s, f) => s + f.annualRent, 0);
  const totalAnnualNet = fins.reduce((s, f) => s + f.annualNet, 0);
  const portfolioLvr = totalValue > 0 ? totalDebt / totalValue : null;
  const grossYield = totalValue > 0 ? totalAnnualRent / totalValue : null;
  const maxCatCost = Math.max(1, ...Object.values(pm.byCategory));

  return (
    <>
      <ScreenHeader title="Property Portfolio" subtitle="Every property as an investment — returns, gearing, growth and P&L." onMenu={onMenu}>
        {periods.length > 0 && (
          <select value={period} onChange={(e) => onPeriod(e.target.value)} style={{ width: 'auto' }}>
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
          <StatementForm properties={properties} defaultPeriod={period} defaultPropertyId={properties[0]?.id ?? ''} insert={insert} onDone={(p) => { setShowForm(false); onPeriod(p); }} />
        )}

        {properties.length === 0 ? (
          <Card>No properties yet. Add them on the Debt &amp; Offset screen, then manage each one here.</Card>
        ) : (
          <>
            <div className="cf-metric-grid">
              <Metric label="Portfolio value" value={formatMoney(totalValue, true)} />
              <Metric label="Equity" value={formatMoney(totalEquity, true)} delta={portfolioLvr !== null ? `${formatPercent(portfolioLvr)} LVR` : undefined} />
              <Metric label="Gross yield" value={pct(grossYield)} delta={`${formatMoney(totalAnnualRent, true)} rent/yr`} />
              <Metric label="Net cashflow / yr" value={formatMoney(totalAnnualNet, true)} tone={totalAnnualNet >= 0 ? 'good' : 'bad'} delta="interest-only P&L" />
            </div>

            {Object.keys(pm.byCategory).length > 0 && (
              <Card title={`Where the costs come from — ${monthLabel(period)}`}>
                {EXPENSE_CATEGORIES.filter((c) => pm.byCategory[c] !== undefined).map((c) => {
                  const amt = pm.byCategory[c]!;
                  return (
                    <div key={c} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 7 }}>
                      <span style={{ width: 150, fontSize: 13, flexShrink: 0 }}>{PROPERTY_CATEGORY_LABEL[c]}</span>
                      <div style={{ flex: 1, background: 'var(--surface2)', borderRadius: 4, height: 14, overflow: 'hidden' }}>
                        <div style={{ width: `${(amt / maxCatCost) * 100}%`, height: '100%', background: 'var(--accent)', borderRadius: 4 }} />
                      </div>
                      <span style={{ width: 90, textAlign: 'right', fontSize: 13, fontWeight: 600 }}>{formatMoney(amt)}</span>
                    </div>
                  );
                })}
              </Card>
            )}

            <Card title="Properties">
              <div className="cf-table-wrap">
                <table className="cf-table">
                  <thead>
                    <tr>
                      <th>Property</th>
                      <th>Value</th>
                      <th>Equity</th>
                      <th>LVR</th>
                      <th>Gross yield</th>
                      <th>Weekly cashflow</th>
                      <th>Growth p.a.</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {properties.map((p) => {
                      const trailing = trailingAverages(ledger, p.id);
                      const f = propertyFinancials(p, loansFor(p.id), trailing, new Date(), propertyAnnualRunRate(ledger, p, trailing));
                      return (
                        <tr key={p.id}>
                          <td style={{ textAlign: 'left' }}>{p.address}</td>
                          <td>{formatMoney(f.value, true)}</td>
                          <td>{formatMoney(f.equity, true)}</td>
                          <td>{pct(f.lvr)}</td>
                          <td>{pct(f.grossYield)}</td>
                          <td style={{ color: f.weeklyCashflow >= 0 ? 'var(--green)' : 'var(--red)', fontWeight: 600 }}>
                            {formatMoney(f.weeklyCashflow)}/wk
                          </td>
                          <td>{f.cagr === null ? '—' : pct(f.cagr)}</td>
                          <td>
                            <button className="btn btn-secondary btn-sm" onClick={() => onSelect(p.id)}>
                              View →
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="cf-total">
                      <td>Portfolio</td>
                      <td>{formatMoney(totalValue, true)}</td>
                      <td>{formatMoney(totalEquity, true)}</td>
                      <td>{pct(portfolioLvr)}</td>
                      <td>{pct(grossYield)}</td>
                      <td>{formatMoney(totalAnnualNet / 52)}/wk</td>
                      <td />
                      <td />
                    </tr>
                  </tfoot>
                </table>
              </div>
              <p style={{ fontSize: 12, color: 'var(--text2)', marginTop: 10 }}>
                Weekly cashflow and yields use an annual run-rate: weekly rent where known, monthly costs as monthly,
                quarterly bills as quarterly, annual bills as annual, and repairs as one-off. Tap a
                property for its full returns dashboard, acquisition history and lease detail.
              </p>
            </Card>
          </>
        )}
      </div>
    </>
  );
}

// ── Per-property detail page ────────────────────────────────────────────
function PropertyDetailPage({
  property,
  loans,
  ledger,
  period,
  periods,
  onBack,
  onMenu,
  onPeriod,
  insert,
  update,
}: {
  property: Property;
  loans: Loan[];
  ledger: ReturnType<typeof useCadenceFinancial>['data']['property_ledger'];
  period: string;
  periods: string[];
  onBack: () => void;
  onMenu: () => void;
  onPeriod: (p: string) => void;
  insert: ReturnType<typeof useCadenceFinancial>['insert'];
  update: ReturnType<typeof useCadenceFinancial>['update'];
}) {
  const [tab, setTab] = useState<'none' | 'edit' | 'log'>('none');
  const trailing = trailingAverages(ledger, property.id);
  const runRate = propertyAnnualRunRate(ledger, property, trailing);
  const f = propertyFinancials(property, loans, trailing, new Date(), runRate);
  const pnl = monthlyPnL(ledger, property.id, period);
  const propPeriods = availablePeriods(ledger.filter((e) => e.property_id === property.id));

  const physical = [
    property.property_type ? PROPERTY_TYPE_LABEL[property.property_type] : null,
    property.bedrooms ? `${property.bedrooms} bed` : null,
    property.bathrooms ? `${property.bathrooms} bath` : null,
    property.car_spaces ? `${property.car_spaces} car` : null,
    property.land_size_sqm ? `${property.land_size_sqm} m²` : null,
  ].filter(Boolean).join(' · ');

  const leaseWarn = f.daysToLeaseEnd !== null && f.daysToLeaseEnd < 60;

  return (
    <>
      <ScreenHeader title={property.address} subtitle={physical || 'Property detail'} onMenu={onMenu}>
        <button className="btn btn-ghost btn-sm" onClick={onBack}>← Portfolio</button>
        <button className="btn btn-secondary btn-sm" onClick={() => setTab(tab === 'edit' ? 'none' : 'edit')}>
          {tab === 'edit' ? 'Cancel' : 'Edit details'}
        </button>
        <button className="btn btn-primary btn-sm" onClick={() => setTab(tab === 'log' ? 'none' : 'log')}>
          {tab === 'log' ? 'Cancel' : '+ Log statement'}
        </button>
      </ScreenHeader>

      <div className="screen-content">
        {tab === 'edit' && <EditPropertyForm property={property} update={update} onDone={() => setTab('none')} />}
        {tab === 'log' && (
          <StatementForm properties={[property]} defaultPeriod={period} defaultPropertyId={property.id} insert={insert} onDone={(p) => { setTab('none'); onPeriod(p); }} />
        )}

        {/* Hero metrics */}
        <div className="cf-metric-grid">
          <Metric label="Current value" value={formatMoney(f.value, true)} />
          <Metric label="Equity" value={formatMoney(f.equity, true)} delta={f.lvr !== null ? `${formatPercent(f.lvr)} LVR` : undefined} />
          <Metric label="Net yield" value={pct(f.netYield)} delta={`gross ${pct(f.grossYield)}`} />
          <Metric label="Weekly cashflow" value={`${formatMoney(f.weeklyCashflow)}/wk`} tone={f.weeklyCashflow >= 0 ? 'good' : 'bad'} />
          <Metric label="Capital growth p.a." value={f.cagr === null ? '—' : pct(f.cagr)} delta={f.capitalGrowth ? `${formatMoney(f.capitalGrowth, true)} total` : undefined} tone={f.capitalGrowth >= 0 ? 'good' : 'bad'} />
          <Metric label="Total return" value={pct(f.totalReturnPct)} delta="income + growth" />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16 }}>
          <Card title="Acquisition & growth">
            <KV label="Purchase price" value={f.purchasePrice ? formatMoney(f.purchasePrice) : '—'} />
            <KV label="Purchased" value={property.purchase_date ? fmtDMY(property.purchase_date) : '—'} />
            <KV label="Held" value={f.years !== null ? `${f.years.toFixed(1)} yrs` : '—'} />
            <KV label="Current value" value={formatMoney(f.value)} />
            <KV label="Capital growth" value={f.purchasePrice ? `${formatMoney(f.capitalGrowth)} (${pct(f.capitalGrowthPct)})` : '—'} tone={f.capitalGrowth >= 0 ? 'good' : 'bad'} />
            <KV label="Growth CAGR" value={f.cagr === null ? '—' : pct(f.cagr)} />
            <KV label="Cash invested" value={f.cashInvested ? formatMoney(f.cashInvested) : '—'} />
          </Card>

          <Card title="Financing">
            <KV label="Loan balance" value={formatMoney(f.debt)} />
            <KV label="Offset" value={formatMoney(f.offset)} />
            <KV label="Net debt" value={formatMoney(f.netDebt)} />
            <KV label="LVR" value={pct(f.lvr)} />
            <KV label="Usable equity (80%)" value={formatMoney(f.usableEquity)} tone="good" />
            {loans.map((l) => (
              <KV key={l.id} label={`Rate (${l.rate_type})`} value={`${formatPercent(l.rate)} · ${formatMoney(l.monthly_repayment)}/mo`} />
            ))}
            {loans.length === 0 && <KV label="Loan" value="No loan linked" />}
          </Card>

          <Card title="Income & lease">
            <KV label="Weekly rent" value={f.weeklyRent ? `${formatMoney(f.weeklyRent)}/wk` : '—'} tone="good" />
            <KV label="Annual rent" value={formatMoney(f.annualRent)} />
            <KV label="Gross yield" value={pct(f.grossYield)} />
            <KV label="Yield on cost" value={pct(f.yieldOnCost)} />
            <KV label="Tenant" value={property.tenant || '—'} />
            <KV label="Lease" value={property.lease_start || property.lease_end ? `${fmtDMY(property.lease_start ?? null) || '?'} → ${fmtDMY(property.lease_end ?? null) || '?'}` : '—'} />
            <KV label="Lease expiry" value={f.daysToLeaseEnd === null ? '—' : `${f.daysToLeaseEnd} days`} tone={leaseWarn ? 'bad' : undefined} />
          </Card>

          <Card title="Returns & gearing">
            <KV label="Net yield" value={pct(f.netYield)} />
            <KV label="Cash-on-cash" value={pct(f.cashOnCash)} />
            <KV label="Total return p.a." value={pct(f.totalReturnPct)} />
            <KV label="Total return $" value={formatMoney(f.totalReturnAnnual)} tone={f.totalReturnAnnual >= 0 ? 'good' : 'bad'} />
            <KV label="Cash gearing" value={GEARING_LABEL[f.gearing]} tone={f.gearing === 'negative' ? 'bad' : f.gearing === 'positive' ? 'good' : undefined} />
            <KV label="Depreciation (non-cash)" value={f.depreciationAnnual ? `${formatMoney(f.depreciationAnnual)}/yr` : '—'} />
            <KV label="Taxable position" value={`${formatMoney(f.taxablePosition)}/yr`} tone={f.negativelyGeared ? 'bad' : 'good'} />
            <p style={{ fontSize: 12, color: runRate.provisional ? 'var(--orange)' : 'var(--text2)', margin: '10px 0 0' }}>
              Annual run-rate: {runRate.notes.join(' ')}
            </p>
          </Card>
        </div>

        <Card title={`P&L — ${monthLabel(period)}`}>
          {periods.length > 1 && (
            <select value={period} onChange={(e) => onPeriod(e.target.value)} style={{ width: 'auto', marginBottom: 12 }}>
              {periods.map((p) => (
                <option key={p} value={p}>
                  {monthLabel(p)}
                </option>
              ))}
            </select>
          )}
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
                    <td style={{ textAlign: 'right', color: 'var(--red)' }}>−{formatMoney(pnl.expensesByCategory[c]!)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="cf-total">
                  <td style={{ textAlign: 'left' }}>Net cashflow</td>
                  <td style={{ textAlign: 'right', color: pnl.netCashflow >= 0 ? 'var(--green)' : 'var(--red)' }}>{formatMoney(pnl.netCashflow)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </Card>

        {propPeriods.length > 0 && (
          <Card title="Monthly history">
            <div className="cf-table-wrap">
              <table className="cf-table">
                <thead>
                  <tr>
                    <th>Month</th>
                    <th>Income</th>
                    <th>Costs</th>
                    <th>Net</th>
                  </tr>
                </thead>
                <tbody>
                  {[...propPeriods].reverse().map((pr) => {
                    const m = monthlyPnL(ledger, property.id, pr);
                    return (
                      <tr key={pr}>
                        <td style={{ textAlign: 'left' }}>{monthLabel(pr)}</td>
                        <td style={{ color: 'var(--green)' }}>{formatMoney(m.totalIncome)}</td>
                        <td style={{ color: 'var(--red)' }}>{formatMoney(m.totalExpenses)}</td>
                        <td style={{ color: m.netCashflow >= 0 ? 'var(--green)' : 'var(--red)', fontWeight: 600 }}>{formatMoney(m.netCashflow)}</td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="cf-total">
                    <td>Avg / mo ({trailing.months})</td>
                    <td>{formatMoney(trailing.avgIncome)}</td>
                    <td>{formatMoney(trailing.avgExpenses)}</td>
                    <td>{formatMoney(trailing.avgNet)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </Card>
        )}

        <p style={{ fontSize: 12, color: 'var(--text2)' }}>
          Net cashflow / net yield are interest-only P&amp;L (loan principal excluded — it's a
          balance-sheet transfer). Cash-on-cash is net cashflow over the cash you put in.
          Depreciation is non-cash: it lowers the taxable position without affecting cash, which is
          why a property can be cash-positive yet negatively geared for tax.
        </p>
      </div>
    </>
  );
}

// ── Edit property details ───────────────────────────────────────────────
function EditPropertyForm({
  property,
  update,
  onDone,
}: {
  property: Property;
  update: ReturnType<typeof useCadenceFinancial>['update'];
  onDone: () => void;
}) {
  const [form, setForm] = useState({
    value: String(property.value ?? ''),
    purchase_price: String(property.purchase_price ?? ''),
    purchase_date: property.purchase_date ?? '',
    cash_invested: String(property.cash_invested ?? ''),
    land_value: String(property.land_value ?? ''),
    depreciation_annual: String(property.depreciation_annual ?? ''),
    property_type: property.property_type ?? 'house',
    bedrooms: String(property.bedrooms ?? ''),
    bathrooms: String(property.bathrooms ?? ''),
    car_spaces: String(property.car_spaces ?? ''),
    land_size_sqm: String(property.land_size_sqm ?? ''),
    weekly_rent: String(property.weekly_rent ?? ''),
    lease_start: property.lease_start ?? '',
    lease_end: property.lease_end ?? '',
    tenant: property.tenant ?? '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const save = async () => {
    setError(null);
    setSaving(true);
    try {
      await update('properties', property.id, {
        value: num(form.value),
        purchase_price: num(form.purchase_price),
        purchase_date: form.purchase_date || null,
        cash_invested: num(form.cash_invested),
        land_value: num(form.land_value),
        depreciation_annual: num(form.depreciation_annual),
        property_type: form.property_type as PropertyType,
        bedrooms: Math.round(num(form.bedrooms)),
        bathrooms: Math.round(num(form.bathrooms)),
        car_spaces: Math.round(num(form.car_spaces)),
        land_size_sqm: num(form.land_size_sqm),
        weekly_rent: num(form.weekly_rent),
        lease_start: form.lease_start || null,
        lease_end: form.lease_end || null,
        tenant: form.tenant.trim(),
      });
    } catch (e) {
      setSaving(false);
      setError(e instanceof Error ? `Save failed: ${e.message}` : 'Save failed — has the property_details migration been run?');
      return;
    }
    setSaving(false);
    onDone();
  };

  const fields: [keyof typeof form, string][] = [
    ['value', 'Current value (A$)'],
    ['purchase_price', 'Purchase price (A$)'],
    ['purchase_date', 'Purchase date (YYYY-MM-DD)'],
    ['cash_invested', 'Cash invested — deposit + costs (A$)'],
    ['land_value', 'Land value (A$)'],
    ['depreciation_annual', 'Depreciation per year (A$)'],
    ['bedrooms', 'Bedrooms'],
    ['bathrooms', 'Bathrooms'],
    ['car_spaces', 'Car spaces'],
    ['land_size_sqm', 'Land size (m²)'],
    ['weekly_rent', 'Weekly rent (A$)'],
    ['lease_start', 'Lease start (YYYY-MM-DD)'],
    ['lease_end', 'Lease end (YYYY-MM-DD)'],
    ['tenant', 'Tenant / occupancy note'],
  ];

  return (
    <Card title="Edit property details">
      <div className="wizard-grid">
        <div className="form-group">
          <label className="field">Property type</label>
          <select value={form.property_type} onChange={(e) => set('property_type', e.target.value)}>
            {Object.entries(PROPERTY_TYPE_LABEL).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </div>
        {fields.map(([k, label]) => (
          <div className="form-group" key={k}>
            <label className="field">{label}</label>
            <input type="text" value={form[k]} onChange={(e) => set(k, e.target.value)} />
          </div>
        ))}
      </div>
      {error && <p style={{ fontSize: 13, color: 'var(--red)', margin: '0 0 10px' }}>{error}</p>}
      <button className="btn btn-primary" onClick={save} disabled={saving}>
        {saving ? 'Saving…' : 'Save details'}
      </button>
    </Card>
  );
}

// ── Log a monthly statement ─────────────────────────────────────────────
function StatementForm({
  properties,
  defaultPeriod,
  defaultPropertyId,
  onDone,
  insert,
}: {
  properties: Property[];
  defaultPeriod: string;
  defaultPropertyId: string;
  onDone: (period: string) => void;
  insert: ReturnType<typeof useCadenceFinancial>['insert'];
}) {
  const [propertyId, setPropertyId] = useState(defaultPropertyId || properties[0]?.id || '');
  const [period, setPeriod] = useState(defaultPeriod);
  const [grade, setGrade] = useState('statement');
  const [source, setSource] = useState('');
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    setError(null);
    if (!propertyId) return setError('Pick a property.');
    if (!/^\d{4}-\d{2}$/.test(period)) return setError('Period must be YYYY-MM (e.g. 2025-07).');
    const lines = FORM_CATEGORIES.map((c) => ({ category: c, amount: num(amounts[c] ?? '') })).filter((l) => l.amount > 0);
    if (lines.length === 0) return setError('Enter at least one amount.');
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
      return setError(e instanceof Error ? `Save failed: ${e.message}` : 'Save failed — has the property_ledger migration been run?');
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
                <td style={{ textAlign: 'left', color: c === 'rent' || c === 'other_income' ? 'var(--green)' : undefined }}>{PROPERTY_CATEGORY_LABEL[c]}</td>
                <td>
                  <input type="text" style={{ width: 120, textAlign: 'right' }} value={amounts[c] ?? ''} placeholder="0" onChange={(e) => setAmounts((a) => ({ ...a, [c]: e.target.value }))} />
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
        Leave a line blank if it doesn't apply. One row is written per non-zero line. Enter loan
        interest from the loan statement — principal isn't a P&amp;L cost.
      </p>
    </Card>
  );
}
