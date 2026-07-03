import { useState } from 'react';
import { useCadenceFitness } from '../lib/store';
import { ScreenHeader, Card, Metric, SparkBars } from '../components/bits';
import { fmtDayShort, fmtNum, SOURCE_LABEL, todayISO } from '../lib/util';

// Whoop dailies (recovery, strain, sleep, HRV, RHR). Entered manually or by
// Kobe for now -- one row per day, so re-saving a day updates it. The Whoop
// API sync is a planned phase-2 (see AGENTS.md); the schema already carries
// `source = 'whoop'`.
export function Recovery({ onMenu }: { onMenu: () => void }) {
  const { data, insert, update } = useCadenceFitness();
  const today = todayISO();

  const rows = [...data.recovery_metrics].sort((a, b) => b.date.localeCompare(a.date));
  const latest = rows[0];

  const [date, setDate] = useState(today);
  const existing = data.recovery_metrics.find((r) => r.date === date);
  const [rec, setRec] = useState('');
  const [strain, setStrain] = useState('');
  const [sleep, setSleep] = useState('');
  const [sleepPerf, setSleepPerf] = useState('');
  const [hrv, setHrv] = useState('');
  const [rhr, setRhr] = useState('');

  const save = async () => {
    const patch = {
      recovery_pct: rec === '' ? (existing?.recovery_pct ?? null) : Math.round(Number(rec)),
      strain: strain === '' ? (existing?.strain ?? null) : Number(strain),
      sleep_hours: sleep === '' ? (existing?.sleep_hours ?? null) : Number(sleep),
      sleep_performance_pct: sleepPerf === '' ? (existing?.sleep_performance_pct ?? null) : Math.round(Number(sleepPerf)),
      hrv_ms: hrv === '' ? (existing?.hrv_ms ?? null) : Math.round(Number(hrv)),
      resting_hr: rhr === '' ? (existing?.resting_hr ?? null) : Math.round(Number(rhr)),
      source: 'whoop' as const,
    };
    if (existing) await update('recovery_metrics', existing.id, patch);
    else await insert('recovery_metrics', { date, notes: '', ...patch });
    setRec('');
    setStrain('');
    setSleep('');
    setSleepPerf('');
    setHrv('');
    setRhr('');
  };

  const recSpark = [...rows]
    .slice(0, 14)
    .reverse()
    .map((r) => ({ label: fmtDayShort(r.date), value: r.recovery_pct ?? 0 }));

  const tone = (pct: number | null): 'good' | 'bad' | 'neutral' =>
    pct === null ? 'neutral' : pct >= 67 ? 'good' : pct >= 34 ? 'neutral' : 'bad';

  return (
    <>
      <ScreenHeader title="Recovery" subtitle="Whoop dailies — recovery, strain, sleep." onMenu={onMenu} />
      <div className="screen-content">
        <div className="cf-metric-grid">
          <Metric
            label={`Recovery ${latest ? `(${fmtDayShort(latest.date)})` : ''}`}
            value={latest?.recovery_pct != null ? `${latest.recovery_pct}%` : '—'}
            tone={tone(latest?.recovery_pct ?? null)}
            delta={latest?.recovery_pct != null ? (latest.recovery_pct >= 67 ? 'Green' : latest.recovery_pct >= 34 ? 'Yellow' : 'Red') : undefined}
          />
          <Metric label="Day strain" value={latest?.strain != null ? fmtNum(Number(latest.strain), 1) : '—'} />
          <Metric label="Sleep" value={latest?.sleep_hours != null ? `${fmtNum(Number(latest.sleep_hours), 1)}h` : '—'} />
          <Metric label="HRV / RHR" value={latest ? `${latest.hrv_ms ?? '—'}ms / ${latest.resting_hr ?? '—'}` : '—'} />
        </div>

        {recSpark.length > 1 && (
          <Card title="Recovery, last 14 days">
            <SparkBars points={recSpark} formatTip={(p) => `${p.label}: ${p.value}%`} />
          </Card>
        )}

        <Card title={existing ? `Update ${fmtDayShort(date)} (from Whoop)` : `Log ${fmtDayShort(date)} (from Whoop)`}>
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
              <label className="field">Strain</label>
              <input type="number" inputMode="decimal" value={strain} placeholder={existing?.strain?.toString() ?? ''} onChange={(e) => setStrain(e.target.value)} />
            </div>
            <div>
              <label className="field">Sleep (h)</label>
              <input type="number" inputMode="decimal" value={sleep} placeholder={existing?.sleep_hours?.toString() ?? ''} onChange={(e) => setSleep(e.target.value)} />
            </div>
            <div>
              <label className="field">Sleep perf %</label>
              <input type="number" inputMode="numeric" value={sleepPerf} placeholder={existing?.sleep_performance_pct?.toString() ?? ''} onChange={(e) => setSleepPerf(e.target.value)} />
            </div>
            <div>
              <label className="field">HRV (ms)</label>
              <input type="number" inputMode="numeric" value={hrv} placeholder={existing?.hrv_ms?.toString() ?? ''} onChange={(e) => setHrv(e.target.value)} />
            </div>
            <div>
              <label className="field">Resting HR</label>
              <input type="number" inputMode="numeric" value={rhr} placeholder={existing?.resting_hr?.toString() ?? ''} onChange={(e) => setRhr(e.target.value)} />
            </div>
          </div>
          <button className="btn btn-primary" onClick={save}>
            {existing ? 'Update day' : 'Save day'}
          </button>
        </Card>

        <Card title="Last 14 days">
          <div className="cf-table-wrap">
            <table className="cf-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Recovery</th>
                  <th>Strain</th>
                  <th>Sleep</th>
                  <th>HRV</th>
                  <th>RHR</th>
                  <th>Source</th>
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, 14).map((r) => (
                  <tr key={r.id}>
                    <td>{fmtDayShort(r.date)}</td>
                    <td>{r.recovery_pct != null ? `${r.recovery_pct}%` : '—'}</td>
                    <td>{r.strain != null ? fmtNum(Number(r.strain), 1) : '—'}</td>
                    <td>{r.sleep_hours != null ? `${fmtNum(Number(r.sleep_hours), 1)}h` : '—'}</td>
                    <td>{r.hrv_ms ?? '—'}</td>
                    <td>{r.resting_hr ?? '—'}</td>
                    <td>{SOURCE_LABEL[r.source]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {rows.length === 0 && <p style={{ fontSize: 13, color: 'var(--text2)' }}>No recovery data yet.</p>}
        </Card>
      </div>
    </>
  );
}
