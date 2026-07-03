import { useState } from 'react';
import { useCadenceFinancial } from '../lib/store';
import { ScreenHeader, Card, Metric } from '../components/bits';
import { latestMonth } from '../lib/financeCalc';
import { computeRunway, periodAfterMonths } from '../lib/goalCalc';
import { formatMoney, formatPercent, fmtDMY, monthLabel } from '../lib/util';

const num = (s: string) => Number(s.replace(/[^0-9.-]/g, '')) || 0;

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
                  </div>
                  <p style={{ fontSize: 12, color: 'var(--text2)', marginTop: 10 }}>
                    Operating-only is the honest floor: your actual trailing pace, zero market
                    assumption. The growth scenario is a planning input, not a forecast.
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
      </div>
    </>
  );
}
