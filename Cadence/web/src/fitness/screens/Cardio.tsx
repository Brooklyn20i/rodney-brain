import { useMemo, useState } from 'react';
import { useCadenceFitness } from '../lib/store';
import { ScreenHeader, Card, Metric } from '../components/bits';
import { weekOf } from '../lib/fitnessCalc';
import { fmtDayShort, fmtNum, todayISO } from '../lib/util';

// One-tap sauna presets; tapping logs immediately (date = selected date).
const SAUNA_PRESETS: { label: string; duration_min: number; temperature_c: number; rounds: number }[] = [
  { label: '15 min · 90°', duration_min: 15, temperature_c: 90, rounds: 1 },
  { label: '20 min · 90°', duration_min: 20, temperature_c: 90, rounds: 1 },
  { label: '2 × 15 min', duration_min: 30, temperature_c: 90, rounds: 2 },
  { label: '3 × 15 min', duration_min: 45, temperature_c: 90, rounds: 3 },
];

// Recovery Activities is intentionally narrow for now. Cardio belongs in the
// Workout flow; this surface is for restoration work that is not a workout.
export function Cardio({ onMenu }: { onMenu: () => void }) {
  const { data, insert, remove } = useCadenceFitness();
  const today = todayISO();
  const week = weekOf(today);

  const weekSauna = data.sauna_sessions.filter((s) => s.date >= week.start && s.date <= week.end);

  const [date, setDate] = useState(today);
  const [saving, setSaving] = useState(false);
  const [savedFlash, setSavedFlash] = useState('');

  const flash = (msg: string) => {
    setSavedFlash(msg);
    setTimeout(() => setSavedFlash(''), 2500);
  };

  // Sauna draft (custom entry; presets log immediately)
  const [sDur, setSDur] = useState('');
  const [sTemp, setSTemp] = useState('90');
  const [sRounds, setSRounds] = useState('1');

  const logSauna = async (row: { duration_min: number; temperature_c: number; rounds: number }) => {
    if (!row.duration_min || saving) return;
    setSaving(true);
    try {
      // Build the payload explicitly: presets carry a `label` field that is
      // not a sauna_sessions column, and spreading the whole object would send
      // it to Postgres and fail the insert.
      await insert('sauna_sessions', {
        date,
        duration_min: row.duration_min,
        temperature_c: row.temperature_c,
        rounds: row.rounds,
        notes: '',
      });
      setSDur('');
      flash(`Sauna · ${row.duration_min} min logged ✓`);
    } finally {
      setSaving(false);
    }
  };

  const feed = useMemo(
    () =>
      data.sauna_sessions
        .map((s) => ({
          id: s.id,
          table: 'sauna_sessions' as const,
          date: s.date,
          created_at: s.created_at,
          icon: '🔥',
          title: 'Sauna',
          sub: [
            `${fmtNum(Number(s.duration_min))} min`,
            Number(s.temperature_c) > 0 ? `${fmtNum(Number(s.temperature_c))}°C` : '',
            s.rounds > 1 ? `${s.rounds} rounds` : '',
          ]
            .filter(Boolean)
            .join(' · '),
        }))
        .sort((a, b) => b.date.localeCompare(a.date) || b.created_at.localeCompare(a.created_at)),
    [data.sauna_sessions]
  );

  const weekSaunaMin = weekSauna.reduce((s, x) => s + Number(x.duration_min), 0);

  return (
    <>
      <ScreenHeader title="Recovery Activities" subtitle="Restoration work outside training." onMenu={onMenu} />
      <div className="screen-content">
        <div className="cf-callout" style={{ marginBottom: 12 }}>
          <strong>Cardio lives in Workout.</strong> Start or resume a workout, then use the Cardio block for runs,
          rides, rows or conditioning so training stress stays with the session.
        </div>

        <div className="cf-metric-grid">
          <Metric label="Sauna this week" value={String(weekSauna.length)} delta={`${fmtNum(weekSaunaMin)} min`} />
          <Metric label="Recovery minutes" value={fmtNum(weekSaunaMin)} delta="sauna logged" />
        </div>

        {savedFlash && <div className="cd-flash">{savedFlash}</div>}

        <Card title="Log sauna">
          <div className="cd-date-row">
            <label className="field" style={{ margin: 0 }}>
              Date
            </label>
            <input type="date" value={date} max={today} onChange={(e) => setDate(e.target.value)} />
            {date !== today && (
              <button className="btn btn-ghost btn-sm" onClick={() => setDate(today)}>
                Today
              </button>
            )}
          </div>

          <div className="cd-preset-grid">
            {SAUNA_PRESETS.map((p) => (
              <button key={p.label} className="cd-preset" disabled={saving} onClick={() => logSauna(p)}>
                <span className="cd-preset-label">{p.label}</span>
                <span className="cd-preset-sub">tap to log</span>
              </button>
            ))}
          </div>
          <details className="cd-custom">
            <summary>Custom session</summary>
            <div className="form-grid" style={{ marginTop: 8 }}>
              <div>
                <label className="field">Minutes</label>
                <input type="number" inputMode="decimal" value={sDur} onChange={(e) => setSDur(e.target.value)} />
              </div>
              <div>
                <label className="field">Temp (°C)</label>
                <input type="number" inputMode="numeric" value={sTemp} onChange={(e) => setSTemp(e.target.value)} />
              </div>
              <div>
                <label className="field">Rounds</label>
                <input type="number" inputMode="numeric" value={sRounds} onChange={(e) => setSRounds(e.target.value)} />
              </div>
            </div>
            <button
              className="btn btn-primary"
              disabled={!Number(sDur) || saving}
              onClick={() =>
                logSauna({
                  duration_min: Number(sDur) || 0,
                  temperature_c: Math.round(Number(sTemp)) || 0,
                  rounds: Math.max(1, Math.round(Number(sRounds)) || 1),
                })
              }
            >
              Log sauna
            </button>
          </details>
        </Card>

        <Card title="Recent recovery activities">
          {feed.slice(0, 30).map((f) => (
            <div key={f.id} className="pick-row">
              <span className="cd-feed-icon" aria-hidden="true">
                {f.icon}
              </span>
              <div className="pick-main">
                <div className="pick-title">{f.title}</div>
                <div className="pick-sub">
                  {fmtDayShort(f.date)} · {f.sub}
                </div>
              </div>
              <button
                className="btn btn-danger btn-sm"
                aria-label={`Delete ${f.title}`}
                onClick={() => remove(f.table, f.id)}
              >
                ✕
              </button>
            </div>
          ))}
          {feed.length === 0 && <p style={{ fontSize: 13, color: 'var(--text2)' }}>Nothing logged yet.</p>}
        </Card>
      </div>
    </>
  );
}
