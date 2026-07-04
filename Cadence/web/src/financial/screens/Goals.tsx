import { useState } from 'react';
import { useCadenceFinancial } from '../lib/store';
import { ScreenHeader, Card, Metric } from '../components/bits';
import { latestMonth } from '../lib/financeCalc';
import {
  computeRunway,
  periodAfterMonths,
  projectWhatIf,
  trailingOperatingAverage,
  WHAT_IF_CLASSES,
  type WhatIfClass,
} from '../lib/goalCalc';
import { formatMoney, formatPercent, fmtDMY, monthLabel } from '../lib/util';
import type { MonthlyMetric } from '../lib/types';

const num = (s: string) => Number(s.replace(/[^0-9.-]/g, '')) || 0;

const WHAT_IF_LABEL: Record<WhatIfClass, string> = {
  cash: 'Cash / offsets',
  property: 'Property',
  shares: 'Shares',
  btc: 'BTC / crypto',
  super: 'Super',
  collectibles: 'Collectibles',
};

const balanceFor = (m: MonthlyMetric, cls: WhatIfClass): number =>
  ({
    cash: m.cash_offsets,
    property: m.property_value,
    shares: m.shares,
    btc: m.btc_crypto,
    super: m.super_balance,
    collectibles: m.collectibles_value,
  })[cls];

const yearsMonths = (n: number) => `${Math.floor(n / 12)}y ${n % 12}m`;

// Interactive sandbox: what-if growth per asset class against any target.
// Nothing here persists -- it's a modelling tool, and keeping it ephemeral
// is what lets it stay clearly separated from the evidence-graded numbers.
function WhatIfModeller({ current, months, defaultTarget }: { current: MonthlyMetric; months: MonthlyMetric[]; defaultTarget: number }) {
  const trailingPace = trailingOperatingAverage(months);
  const [target, setTarget] = useState(String(defaultTarget));
  const [contribution, setContribution] = useState(String(Math.round(trailingPace)));
  const [rates, setRates] = useState<Record<WhatIfClass, string>>({
    cash: '0',
    property: '5',
    shares: '7',
    btc: '0',
    super: '7',
    collectibles: '0',
  });

  const result = projectWhatIf(current, {
    targetNetWorth: num(target),
    monthlyContribution: num(contribution),
    rates: Object.fromEntries(
      WHAT_IF_CLASSES.map((cls) => [cls, num(rates[cls]) / 100])
    ) as Partial<Record<WhatIfClass, number>>,
  });

  return (
    <Card title="What-if modeller — every asset, your assumptions">
      <div className="wizard-grid">
        <div className="form-group">
          <label className="field">Target net worth (A$)</label>
          <input type="text" value={target} onChange={(e) => setTarget(e.target.value)} />
        </div>
        <div className="form-group">
          <label className="field">Monthly operating surplus (A$)</label>
          <input type="text" value={contribution} onChange={(e) => setContribution(e.target.value)} />
        </div>
      </div>
      <div className="cf-table-wrap" style={{ marginTop: 4 }}>
        <table className="cf-table">
          <thead>
            <tr>
              <th>Asset class</th>
              <th>Current</th>
              <th>Assumed growth %/yr</th>
            </tr>
          </thead>
          <tbody>
            {WHAT_IF_CLASSES.map((cls) => (
              <tr key={cls}>
                <td style={{ textAlign: 'left' }}>{WHAT_IF_LABEL[cls]}</td>
                <td>{formatMoney(balanceFor(current, cls), true)}</td>
                <td>
                  <input
                    type="text"
                    style={{ width: 70, textAlign: 'right' }}
                    value={rates[cls]}
                    onChange={(e) => setRates((r) => ({ ...r, [cls]: e.target.value }))}
                  />
                </td>
              </tr>
            ))}
            <tr>
              <td style={{ textAlign: 'left', color: 'var(--text2)' }}>Total debt (carried flat)</td>
              <td>{formatMoney(current.total_debt, true)}</td>
              <td />
            </tr>
          </tbody>
        </table>
      </div>
      <div className="cf-metric-grid" style={{ marginTop: 14 }}>
        <Metric
          label={`Reaches ${formatMoney(num(target), true)}`}
          value={
            result.monthsToTarget === null
              ? 'Not in 100y'
              : result.monthsToTarget === 0
                ? 'Already there'
                : yearsMonths(result.monthsToTarget)
          }
          delta={
            result.monthsToTarget
              ? `~${monthLabel(periodAfterMonths(current.period, result.monthsToTarget))}`
              : undefined
          }
          tone={result.monthsToTarget === null ? 'bad' : 'good'}
        />
        {result.milestones
          .filter((m) => [12, 60, 120, 240].includes(m.months))
          .map((m) => (
            <Metric
              key={m.months}
              label={`In ${m.months / 12} year${m.months > 12 ? 's' : ''}`}
              value={formatMoney(m.netWorth, true)}
            />
          ))}
      </div>
      <p style={{ fontSize: 12, color: 'var(--text2)', marginTop: 10 }}>
        Property growth compounds the full property value while debt stays flat, so the leveraged
        equity effect is captured. All rates are your planning inputs — nothing here is a forecast,
        and nothing here is saved.
      </p>
    </Card>
  );
}

export function Goals({ onMenu }: { onMenu: () => void }) {
  const { data, insert, update } = useCadenceFinancial();
  const months = data.monthly_metrics;
  const current = months.length ? latestMonth(months) : null;

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ label: '', target: '', date: '', growth: '', notes: '' });
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const startEdit = (id: string) => {
    const g = data.goals.find((x) => x.id === id);
    if (!g) return;
    setForm({
      label: g.label,
      target: String(g.target_net_worth),
      date: g.target_date ?? '',
      growth: String(g.assumed_growth_rate * 100),
      notes: g.notes,
    });
    setEditingId(id);
    setFormError(null);
    setShowForm(true);
  };

  const save = async () => {
    setFormError(null);
    if (!form.label.trim()) {
      setFormError('Goal name is required.');
      return;
    }
    if (num(form.target) <= 0) {
      setFormError('Target net worth must be a number greater than zero (e.g. 4000000).');
      return;
    }
    const row = {
      label: form.label.trim(),
      target_net_worth: num(form.target),
      target_date: form.date || null,
      assumed_growth_rate: num(form.growth) / 100,
      notes: form.notes.trim(),
    };
    setSaving(true);
    try {
      if (editingId) await update('goals', editingId, row);
      else await insert('goals', row);
    } catch (e) {
      setSaving(false);
      setFormError(
        e instanceof Error
          ? `Save failed: ${e.message}`
          : 'Save failed. If you haven\'t run the goals/insurance/estate SQL migration in Supabase yet, that\'s almost certainly why.'
      );
      return;
    }
    setSaving(false);
    setForm({ label: '', target: '', date: '', growth: '', notes: '' });
    setEditingId(null);
    setShowForm(false);
  };

  return (
    <>
      <ScreenHeader
        title="Goals & Runway"
        subtitle="The objective, and when you get there at your actual pace."
        onMenu={onMenu}
      >
        <button
          className="btn btn-primary btn-sm"
          onClick={() => {
            setEditingId(null);
            setForm({ label: '', target: '', date: '', growth: '', notes: '' });
            setFormError(null);
            setShowForm((s) => !s);
          }}
        >
          {showForm && !editingId ? 'Cancel' : '+ Goal'}
        </button>
      </ScreenHeader>
      <div className="screen-content">
        {showForm && (
          <Card title={editingId ? 'Edit goal' : 'New goal'}>
            <div className="wizard-grid">
              {(
                [
                  ['label', 'Goal name (e.g. Financial independence)'],
                  ['target', 'Target net worth (A$)'],
                  ['date', 'Target date (YYYY-MM-DD, optional)'],
                  ['growth', 'Assumed annual growth % (0 = none)'],
                  ['notes', 'Notes'],
                ] as const
              ).map(([key, label]) => (
                <div className="form-group" key={key}>
                  <label className="field">{label}</label>
                  <input
                    type="text"
                    value={form[key]}
                    onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                  />
                </div>
              ))}
            </div>
            {formError && (
              <p style={{ fontSize: 13, color: 'var(--red)', margin: '0 0 10px' }}>{formError}</p>
            )}
            <button className="btn btn-primary" onClick={save} disabled={saving}>
              {saving ? 'Saving…' : editingId ? 'Save changes' : 'Add goal'}
            </button>
          </Card>
        )}

        {data.goals.length === 0 && !showForm && (
          <Card title="No objective defined">
            <p style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.6 }}>
              This was the single biggest governance gap in the old workbook: every month was
              tracked, but toward nothing in particular. Define a target net worth and the app
              will compute the runway from your actual trailing operating pace — no forecasts,
              just arithmetic on what you already do.
            </p>
          </Card>
        )}

        {data.goals.map((goal) => {
          const runway = current ? computeRunway(goal, months) : null;
          return (
            <Card key={goal.id} title={goal.label}>
              {runway && current ? (
                <>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                    <span>
                      {formatMoney(current.net_worth, true)} of{' '}
                      {formatMoney(goal.target_net_worth, true)}
                      {goal.target_date && <> · target date {fmtDMY(goal.target_date)}</>}
                    </span>
                    <strong>{formatPercent(Math.min(runway.progressFraction, 1), 0)}</strong>
                  </div>
                  <div className="progress-track">
                    <div
                      className="progress-fill"
                      style={{ width: `${Math.min(runway.progressFraction, 1) * 100}%` }}
                    />
                  </div>
                  <div className="cf-metric-grid" style={{ marginTop: 14 }}>
                    <Metric
                      label="Trailing operating pace"
                      value={`${formatMoney(runway.monthlyOperatingAverage, true)}/mo`}
                      delta={`${runway.trailingMonths}-month average`}
                    />
                    <Metric
                      label="Operating only"
                      value={
                        runway.monthsOperatingOnly === null
                          ? 'Not on pace'
                          : runway.monthsOperatingOnly === 0
                            ? 'Reached'
                            : `${Math.floor(runway.monthsOperatingOnly / 12)}y ${runway.monthsOperatingOnly % 12}m`
                      }
                      delta={
                        runway.monthsOperatingOnly
                          ? `~${monthLabel(periodAfterMonths(current.period, runway.monthsOperatingOnly))}`
                          : undefined
                      }
                      tone="neutral"
                    />
                    <Metric
                      label={`With ${formatPercent(goal.assumed_growth_rate, 0)} growth`}
                      value={
                        goal.assumed_growth_rate <= 0
                          ? '—'
                          : runway.monthsWithGrowth === null
                            ? 'Not on pace'
                            : runway.monthsWithGrowth === 0
                              ? 'Reached'
                              : `${Math.floor(runway.monthsWithGrowth / 12)}y ${runway.monthsWithGrowth % 12}m`
                      }
                      delta={
                        goal.assumed_growth_rate > 0 && runway.monthsWithGrowth
                          ? `~${monthLabel(periodAfterMonths(current.period, runway.monthsWithGrowth))}`
                          : undefined
                      }
                      tone="neutral"
                    />
                    <Metric
                      label="Gap to target"
                      value={formatMoney(Math.max(0, goal.target_net_worth - current.net_worth), true)}
                    />
                    <Metric
                      label="Already-managed assets"
                      value={formatMoney(runway.managedAssets, true)}
                      delta="shares + BTC + super"
                    />
                  </div>
                  <p style={{ fontSize: 12, color: 'var(--text2)', marginTop: 10 }}>
                    Operating-only is the honest floor: your actual trailing pace, zero market
                    assumption anywhere. The growth scenario compounds only your{' '}
                    {formatMoney(runway.managedAssets, true)} of already-managed assets (shares,
                    BTC, super) at {formatPercent(goal.assumed_growth_rate, 0)}/yr — cash and
                    property are still carried flat, since cash doesn't compound and property
                    appreciation is a separate, uncertain assumption tracked as market movement in
                    Performance, not folded into runway math. Planning input, not a forecast.
                    {goal.notes && <> {goal.notes}</>}
                  </p>
                </>
              ) : (
                <p style={{ fontSize: 13, color: 'var(--text2)' }}>
                  Target {formatMoney(goal.target_net_worth, true)} — runway math needs monthly
                  metrics loaded.
                </p>
              )}
              <button className="btn btn-secondary btn-sm" onClick={() => startEdit(goal.id)} style={{ marginTop: 10 }}>
                Edit
              </button>
            </Card>
          );
        })}

        {current && (
          <WhatIfModeller
            current={current}
            months={months}
            defaultTarget={data.goals[0]?.target_net_worth ?? 10_000_000}
          />
        )}
      </div>
    </>
  );
}
