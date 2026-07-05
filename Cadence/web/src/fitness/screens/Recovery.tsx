import { useMemo, useState } from 'react';
import { useCadenceFitness } from '../lib/store';
import { ScreenHeader, Card, Metric, TrendLine } from '../components/bits';
import {
  metricSeries,
  monthlyRecovery,
  rangeStats,
  trajectory,
  type RecoveryField,
} from '../lib/fitnessCalc';
import { recoveryDrivers } from '../lib/insights';
import { fmtDayShort, fmtNum, SOURCE_LABEL, todayISO } from '../lib/util';

// Recovery over the long haul. Kobe backfilled years of Whoop data; a 14-day
// table hid all of it, so this screen works over the whole history: a range
// switch, each metric's latest reading vs its own baseline, trend charts with
// a rolling baseline line, a then-vs-now trajectory, and a monthly table.
// Manual entry lives at the bottom for the occasional gap.

type RangeKey = '30d' | '90d' | '6m' | '1y' | 'all';
const RANGES: { key: RangeKey; label: string; days: number | null }[] = [
  { key: '30d', label: '30d', days: 30 },
  { key: '90d', label: '90d', days: 90 },
  { key: '6m', label: '6m', days: 182 },
  { key: '1y', label: '1y', days: 365 },
  { key: 'all', label: 'All', days: null },
];

const METRICS: {
  field: RecoveryField;
  label: string;
  unit: string;
  tone: 'accent' | 'good' | 'teal' | 'bad';
  digits?: number;
}[] = [
  { field: 'hrv_ms', label: 'HRV', unit: 'ms', tone: 'teal' },
  { field: 'resting_hr', label: 'Resting HR', unit: 'bpm', tone: 'accent' },
  { field: 'recovery_pct', label: 'Recovery', unit: '%', tone: 'good' },
  { field: 'sleep_hours', label: 'Sleep', unit: 'h', tone: 'accent', digits: 1 },
];

export function Recovery({ onMenu }: { onMenu: () => void }) {
  const { data, upsert } = useCadenceFitness();
  const today = todayISO();
  const rows = data.recovery_metrics;

  const [range, setRange] = useState<RangeKey>('90d');
  const rangeDays = RANGES.find((r) => r.key === range)!.days;

  const sinceISO = useMemo(() => {
    if (rangeDays == null) return null;
    const all = metricSeries(rows, 'hrv_ms', 1);
    const newest = all.length ? all[all.length - 1].date : today;
    const d = new Date(newest + 'T12:00:00');
    d.setDate(d.getDate() - rangeDays);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }, [rows, rangeDays, today]);

  const totalDays = useMemo(() => rows.filter((r) => !r.deleted_at).length, [rows]);
  const months = useMemo(() => monthlyRecovery(rows).slice().reverse(), [rows]);
  const [showMonths, setShowMonths] = useState(false);

  // Direction-aware delta wording for a value change.
  const deltaTone = (v: number | null, higherBetter: boolean): 'good' | 'bad' | 'neutral' => {
    if (v == null || v === 0) return 'neutral';
    return (v > 0) === higherBetter ? 'good' : 'bad';
  };

  const hrvTraj = useMemo(() => trajectory(rows, 'hrv_ms'), [rows]);
  const rhrTraj = useMemo(() => trajectory(rows, 'resting_hr'), [rows]);

  const driverReport = useMemo(
    () =>
      recoveryDrivers({
        recovery_metrics: data.recovery_metrics,
        workouts: data.workouts,
        workout_sets: data.workout_sets,
        cardio_sessions: data.cardio_sessions,
        sauna_sessions: data.sauna_sessions,
        nutrition_logs: data.nutrition_logs,
      }),
    [data.recovery_metrics, data.workouts, data.workout_sets, data.cardio_sessions, data.sauna_sessions, data.nutrition_logs]
  );

  if (totalDays === 0) {
    return (
      <>
        <ScreenHeader title="Recovery" subtitle="Whoop recovery, HRV, sleep — over time." onMenu={onMenu} />
        <div className="screen-content">
          <Card>
            <p style={{ fontSize: 14, margin: 0 }}>
              No recovery data yet. Import your Whoop history from the <strong>Sync</strong> screen (or send the
              export to Kobe), and this becomes a long-range view of your HRV, resting HR, recovery and sleep.
            </p>
          </Card>
        </div>
      </>
    );
  }

  return (
    <>
      <ScreenHeader title="Recovery" subtitle={`${totalDays} days of Whoop history.`} onMenu={onMenu}>
        <div className="rec-range">
          {RANGES.map((r) => (
            <button key={r.key} className={range === r.key ? 'active' : ''} onClick={() => setRange(r.key)}>
              {r.label}
            </button>
          ))}
        </div>
      </ScreenHeader>
      <div className="screen-content">
        {/* Headline: latest vs the selected range's baseline */}
        <div className="cf-metric-grid">
          {METRICS.map((m) => {
            const st = rangeStats(rows, m.field, rangeDays);
            const dir = st.vsAvg != null ? `${st.vsAvg >= 0 ? '+' : ''}${fmtNum(st.vsAvg, m.digits ?? 0)} vs avg` : undefined;
            return (
              <Metric
                key={m.field}
                label={m.label}
                value={st.latest != null ? `${fmtNum(st.latest, m.digits ?? 0)}${m.unit}` : '—'}
                delta={dir}
                tone={deltaTone(st.vsAvg, st.higherBetter)}
              />
            );
          })}
        </div>

        {/* The 3-year story — the thing the 14-day view hid */}
        {hrvTraj.delta != null && hrvTraj.spanDays >= 120 && (
          <Card title={`Your trajectory — ${Math.round(hrvTraj.spanDays / 30)} months`}>
            <p style={{ fontSize: 14, margin: '0 0 8px', lineHeight: 1.5 }}>
              HRV has moved from <strong>{fmtNum(hrvTraj.thenAvg!)}ms</strong> to{' '}
              <strong style={{ color: hrvTraj.improved ? 'var(--green)' : 'var(--red)' }}>
                {fmtNum(hrvTraj.nowAvg!)}ms
              </strong>{' '}
              ({hrvTraj.pctChange! >= 0 ? '+' : ''}
              {fmtNum(hrvTraj.pctChange! * 100)}%)
              {rhrTraj.delta != null && (
                <>
                  , and resting HR from <strong>{fmtNum(rhrTraj.thenAvg!)}</strong> to{' '}
                  <strong style={{ color: rhrTraj.improved ? 'var(--green)' : 'var(--red)' }}>
                    {fmtNum(rhrTraj.nowAvg!)} bpm
                  </strong>
                </>
              )}
              .
            </p>
            <p style={{ fontSize: 12, color: 'var(--text2)', margin: 0 }}>
              {hrvTraj.improved === false
                ? 'Falling HRV with a rising resting heart rate points to lower recovery capacity over this period — usually reduced training, more stress, or worse sleep. The charts below show when it turned.'
                : 'Rising HRV with a steady or falling resting heart rate points to improving recovery capacity over this period.'}
            </p>
          </Card>
        )}

        {/* What moves your recovery — drivers learned across all your data */}
        {(driverReport.drivers.length > 0 || driverReport.consideredDays >= 30) && (
          <Card title="What moves your recovery">
            {driverReport.drivers.length === 0 ? (
              <p style={{ fontSize: 13, color: 'var(--text2)', margin: 0 }}>{driverReport.note}</p>
            ) : (
              <>
                {driverReport.drivers.map((d) => (
                  <div key={d.id} className="rec-driver">
                    <div className="rec-driver-main">
                      <div className="rec-driver-head">
                        <span className="rec-driver-label">{d.label}</span>
                        <span className={`rec-driver-delta ${d.helps ? 'up' : 'down'}`}>
                          {d.delta >= 0 ? '+' : '−'}
                          {fmtNum(Math.abs(d.delta))} pts
                        </span>
                      </div>
                      <div className="rec-driver-sub">
                        {fmtNum(d.meanWith)}% vs {fmtNum(d.meanWithout)}% {d.detail} · {d.nWith}/{d.nWithout} days ·{' '}
                        <span className={`rec-conf rec-conf-${d.confidence}`}>{d.confidence} confidence</span>
                      </div>
                    </div>
                  </div>
                ))}
                <p style={{ fontSize: 11, color: 'var(--text3)', margin: '10px 0 0' }}>{driverReport.note}</p>
              </>
            )}
          </Card>
        )}

        {/* Trend charts — one per metric, over the selected range */}
        {METRICS.map((m) => {
          const series = metricSeries(rows, m.field, 14, sinceISO);
          if (series.length < 2) return null;
          const st = rangeStats(rows, m.field, rangeDays);
          return (
            <Card
              key={m.field}
              title={`${m.label} · ${range === 'all' ? 'all time' : range}`}
            >
              <TrendLine points={series} tone={m.tone} />
              <div className="rec-chart-foot">
                <span>
                  avg <strong>{fmtNum(st.avg ?? 0, m.digits ?? 0)}{m.unit}</strong>
                </span>
                <span>
                  range {fmtNum(st.min ?? 0, m.digits ?? 0)}–{fmtNum(st.max ?? 0, m.digits ?? 0)}
                  {m.unit}
                </span>
                <span className="rec-chart-legend">
                  <i className="rec-legend-avg" /> {m.digits ? '2-week' : '2-week'} baseline
                </span>
              </div>
            </Card>
          );
        })}

        {/* Monthly table — the full record, collapsed by default */}
        <Card title="Monthly averages">
          <button className="btn btn-ghost btn-sm" onClick={() => setShowMonths((s) => !s)}>
            {showMonths ? 'Hide' : `Show all ${months.length} months`}
          </button>
          {showMonths && (
            <div className="cf-table-wrap" style={{ marginTop: 10 }}>
              <table className="cf-table">
                <thead>
                  <tr>
                    <th>Month</th>
                    <th>Days</th>
                    <th>Recovery</th>
                    <th>HRV</th>
                    <th>RHR</th>
                    <th>Sleep</th>
                    <th>Strain</th>
                  </tr>
                </thead>
                <tbody>
                  {months.map((mo) => (
                    <tr key={mo.month}>
                      <td>{mo.month}</td>
                      <td>{mo.days}</td>
                      <td>{mo.recovery != null ? `${fmtNum(mo.recovery)}%` : '—'}</td>
                      <td>{mo.hrv != null ? fmtNum(mo.hrv) : '—'}</td>
                      <td>{mo.rhr != null ? fmtNum(mo.rhr) : '—'}</td>
                      <td>{mo.sleep != null ? `${fmtNum(mo.sleep, 1)}h` : '—'}</td>
                      <td>{mo.strain != null ? fmtNum(mo.strain, 1) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        {/* Manual entry — the fallback for gaps */}
        <ManualEntry rows={rows} upsert={upsert} today={today} />
      </div>
    </>
  );
}

// One-day manual entry, tucked behind a disclosure — the everyday path is now
// the Whoop import, not typing.
function ManualEntry({
  rows,
  upsert,
  today,
}: {
  rows: ReturnType<typeof useCadenceFitness>['data']['recovery_metrics'];
  upsert: ReturnType<typeof useCadenceFitness>['upsert'];
  today: string;
}) {
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState(today);
  const existing = rows.find((r) => r.date === date && !r.deleted_at);
  const [rec, setRec] = useState('');
  const [hrv, setHrv] = useState('');
  const [rhr, setRhr] = useState('');
  const [sleep, setSleep] = useState('');

  const save = async () => {
    const patch = {
      recovery_pct: rec === '' ? (existing?.recovery_pct ?? null) : Math.round(Number(rec)),
      hrv_ms: hrv === '' ? (existing?.hrv_ms ?? null) : Math.round(Number(hrv)),
      resting_hr: rhr === '' ? (existing?.resting_hr ?? null) : Math.round(Number(rhr)),
      sleep_hours: sleep === '' ? (existing?.sleep_hours ?? null) : Number(sleep),
      source: 'manual' as const,
    };
    // Upsert on (owner_id, date) so a re-saved day updates rather than colliding
    // with the UNIQUE constraint when the in-memory `existing` lookup is stale.
    await upsert('recovery_metrics', { date, ...patch }, 'owner_id,date');
    setRec('');
    setHrv('');
    setRhr('');
    setSleep('');
  };

  const latest = [...rows].filter((r) => !r.deleted_at).sort((a, b) => b.date.localeCompare(a.date))[0];

  return (
    <Card title="Add or fix a day">
      <p style={{ fontSize: 12, color: 'var(--text2)', margin: '0 0 6px' }}>
        Whoop history syncs via the <strong>Sync</strong> screen. Use this for a missing day or a manual
        correction. {latest ? `Last row: ${fmtDayShort(latest.date)} (${SOURCE_LABEL[latest.source]}).` : ''}
      </p>
      <button className="btn btn-ghost btn-sm" onClick={() => setOpen((o) => !o)}>
        {open ? 'Hide' : 'Manual entry'}
      </button>
      {open && (
        <div style={{ marginTop: 10 }}>
          <div className="form-grid">
            <div>
              <label className="field">Date</label>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div>
              <label className="field">Recovery %</label>
              <input type="number" inputMode="numeric" value={rec} placeholder={existing?.recovery_pct?.toString() ?? ''} onChange={(e) => setRec(e.target.value)} />
            </div>
            <div>
              <label className="field">HRV (ms)</label>
              <input type="number" inputMode="numeric" value={hrv} placeholder={existing?.hrv_ms?.toString() ?? ''} onChange={(e) => setHrv(e.target.value)} />
            </div>
            <div>
              <label className="field">Resting HR</label>
              <input type="number" inputMode="numeric" value={rhr} placeholder={existing?.resting_hr?.toString() ?? ''} onChange={(e) => setRhr(e.target.value)} />
            </div>
            <div>
              <label className="field">Sleep (h)</label>
              <input type="number" inputMode="decimal" value={sleep} placeholder={existing?.sleep_hours?.toString() ?? ''} onChange={(e) => setSleep(e.target.value)} />
            </div>
          </div>
          <button className="btn btn-primary btn-sm" onClick={save}>
            {existing ? `Update ${fmtDayShort(date)}` : `Save ${fmtDayShort(date)}`}
          </button>
        </div>
      )}
    </Card>
  );
}
