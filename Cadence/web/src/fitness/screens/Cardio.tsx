import { useMemo, useState } from 'react';
import { useCadenceFitness } from '../lib/store';
import { ScreenHeader, Card, Metric } from '../components/bits';
import { weekOf } from '../lib/fitnessCalc';
import { CARDIO_KIND_LABEL, CARDIO_KINDS, fmtDayShort, fmtNum, todayISO } from '../lib/util';
import type { CardioKind } from '../lib/types';

const KIND_ICON: Record<CardioKind, string> = {
  run: '🏃',
  bike: '🚴',
  row: '🚣',
  swim: '🏊',
  walk: '🚶',
  hike: '🥾',
  stairs: '🪜',
  elliptical: '⬭',
  hiit: '⚡',
  other: '•',
};

const DURATION_PRESETS = [15, 20, 30, 45, 60];

// One-tap sauna presets; tapping logs immediately (date = selected date).
const SAUNA_PRESETS: { label: string; duration_min: number; temperature_c: number; rounds: number }[] = [
  { label: '15 min · 90°', duration_min: 15, temperature_c: 90, rounds: 1 },
  { label: '20 min · 90°', duration_min: 20, temperature_c: 90, rounds: 1 },
  { label: '2 × 15 min', duration_min: 30, temperature_c: 90, rounds: 2 },
  { label: '3 × 15 min', duration_min: 45, temperature_c: 90, rounds: 3 },
];

// Conditioning log: cardio and sauna in one quick, thumb-friendly flow —
// pick what you did, tap a duration, done. Details are optional, not a form
// you have to fill in.
export function Cardio({ onMenu }: { onMenu: () => void }) {
  const { data, insert, remove } = useCadenceFitness();
  const today = todayISO();
  const week = weekOf(today);

  const weekCardio = data.cardio_sessions.filter((c) => c.date >= week.start && c.date <= week.end);
  const weekSauna = data.sauna_sessions.filter((s) => s.date >= week.start && s.date <= week.end);

  const [mode, setMode] = useState<'cardio' | 'sauna'>('cardio');
  const [date, setDate] = useState(today);

  // Cardio draft
  const [kind, setKind] = useState<CardioKind>('run');
  const [dur, setDur] = useState<number | null>(null);
  const [durCustom, setDurCustom] = useState('');
  const [showDetails, setShowDetails] = useState(false);
  const [dist, setDist] = useState('');
  const [hr, setHr] = useState('');
  const [cals, setCals] = useState('');
  const [saving, setSaving] = useState(false);
  const [savedFlash, setSavedFlash] = useState('');

  const flash = (msg: string) => {
    setSavedFlash(msg);
    setTimeout(() => setSavedFlash(''), 2500);
  };

  const minutes = durCustom !== '' ? Number(durCustom) || 0 : (dur ?? 0);

  const logCardio = async () => {
    if (!minutes || saving) return;
    setSaving(true);
    try {
      await insert('cardio_sessions', {
        date,
        kind,
        duration_min: minutes,
        distance_km: Number(dist) || 0,
        avg_hr: Math.round(Number(hr)) || 0,
        calories: Math.round(Number(cals)) || 0,
        notes: '',
      });
      setDur(null);
      setDurCustom('');
      setDist('');
      setHr('');
      setCals('');
      setShowDetails(false);
      flash(`${CARDIO_KIND_LABEL[kind]} · ${minutes} min logged ✓`);
    } finally {
      setSaving(false);
    }
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

  // Unified feed: cardio + sauna interleaved, newest first.
  const feed = useMemo(() => {
    const cardio = data.cardio_sessions.map((c) => ({
      id: c.id,
      table: 'cardio_sessions' as const,
      date: c.date,
      created_at: c.created_at,
      icon: KIND_ICON[c.kind],
      title: CARDIO_KIND_LABEL[c.kind],
      sub: [
        `${fmtNum(Number(c.duration_min))} min`,
        Number(c.distance_km) > 0 ? `${fmtNum(Number(c.distance_km), 2)} km` : '',
        c.avg_hr > 0 ? `${c.avg_hr} bpm` : '',
        c.calories > 0 ? `${c.calories} kcal` : '',
      ]
        .filter(Boolean)
        .join(' · '),
    }));
    const sauna = data.sauna_sessions.map((s) => ({
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
    }));
    return [...cardio, ...sauna].sort(
      (a, b) => b.date.localeCompare(a.date) || b.created_at.localeCompare(a.created_at)
    );
  }, [data.cardio_sessions, data.sauna_sessions]);

  return (
    <>
      <ScreenHeader title="Cardio & Sauna" subtitle="Conditioning and heat work." onMenu={onMenu} />
      <div className="screen-content">
        <div className="cf-metric-grid">
          <Metric
            label="Cardio this week"
            value={String(weekCardio.length)}
            delta={`${fmtNum(weekCardio.reduce((s, c) => s + Number(c.duration_min), 0))} min`}
          />
          <Metric
            label="Sauna this week"
            value={String(weekSauna.length)}
            delta={`${fmtNum(weekSauna.reduce((s, x) => s + Number(x.duration_min), 0))} min`}
          />
        </div>

        {savedFlash && <div className="cd-flash">{savedFlash}</div>}

        <Card>
          <div className="cd-seg" role="tablist">
            <button role="tab" aria-selected={mode === 'cardio'} className={mode === 'cardio' ? 'active' : ''} onClick={() => setMode('cardio')}>
              Cardio
            </button>
            <button role="tab" aria-selected={mode === 'sauna'} className={mode === 'sauna' ? 'active' : ''} onClick={() => setMode('sauna')}>
              🔥 Sauna
            </button>
          </div>

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

          {mode === 'cardio' ? (
            <>
              <div className="cd-kind-grid">
                {CARDIO_KINDS.map((k) => (
                  <button key={k} className={`cd-kind ${kind === k ? 'active' : ''}`} onClick={() => setKind(k)}>
                    <span className="cd-kind-icon">{KIND_ICON[k]}</span>
                    <span>{CARDIO_KIND_LABEL[k]}</span>
                  </button>
                ))}
              </div>
              <div className="cd-dur-row">
                {DURATION_PRESETS.map((m) => (
                  <button
                    key={m}
                    className={`cd-dur ${dur === m && durCustom === '' ? 'active' : ''}`}
                    onClick={() => {
                      setDur(m);
                      setDurCustom('');
                    }}
                  >
                    {m}′
                  </button>
                ))}
                <input
                  type="number"
                  inputMode="numeric"
                  className="cd-dur-custom"
                  placeholder="min"
                  value={durCustom}
                  onChange={(e) => {
                    setDurCustom(e.target.value);
                    setDur(null);
                  }}
                />
              </div>
              {!showDetails ? (
                <button className="btn btn-ghost btn-sm" onClick={() => setShowDetails(true)}>
                  + Distance, heart rate, calories (optional)
                </button>
              ) : (
                <div className="form-grid" style={{ marginTop: 8 }}>
                  <div>
                    <label className="field">Distance (km)</label>
                    <input type="number" inputMode="decimal" value={dist} onChange={(e) => setDist(e.target.value)} />
                  </div>
                  <div>
                    <label className="field">Avg HR</label>
                    <input type="number" inputMode="numeric" value={hr} placeholder="from Whoop" onChange={(e) => setHr(e.target.value)} />
                  </div>
                  <div>
                    <label className="field">Calories</label>
                    <input type="number" inputMode="numeric" value={cals} placeholder="from Whoop" onChange={(e) => setCals(e.target.value)} />
                  </div>
                </div>
              )}
              <button className="btn btn-primary cd-log-btn" onClick={logCardio} disabled={!minutes || saving}>
                {minutes ? `Log ${CARDIO_KIND_LABEL[kind]} · ${minutes} min` : 'Pick a duration'}
              </button>
            </>
          ) : (
            <>
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
            </>
          )}
        </Card>

        <Card title="Recent">
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
