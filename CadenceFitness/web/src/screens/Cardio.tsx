import { useState } from 'react';
import { useCadenceFitness } from '../lib/store';
import { ScreenHeader, Card, Metric } from '../components/bits';
import { weekOf } from '../lib/fitnessCalc';
import { CARDIO_KIND_LABEL, CARDIO_KINDS, fmtDayShort, fmtNum, todayISO } from '../lib/util';
import type { CardioKind } from '../lib/types';

// Quick logging for the non-lifting work: cardio sessions and sauna.
export function Cardio({ onMenu }: { onMenu: () => void }) {
  const { data, insert, remove } = useCadenceFitness();
  const today = todayISO();
  const week = weekOf(today);

  const cardio = [...data.cardio_sessions].sort((a, b) => b.date.localeCompare(a.date));
  const sauna = [...data.sauna_sessions].sort((a, b) => b.date.localeCompare(a.date));
  const weekCardio = cardio.filter((c) => c.date >= week.start && c.date <= week.end);
  const weekSauna = sauna.filter((s) => s.date >= week.start && s.date <= week.end);

  // Cardio form
  const [cDate, setCDate] = useState(today);
  const [kind, setKind] = useState<CardioKind>('run');
  const [dur, setDur] = useState('');
  const [dist, setDist] = useState('');
  const [hr, setHr] = useState('');
  const [cals, setCals] = useState('');
  const logCardio = async () => {
    if (!Number(dur)) return;
    await insert('cardio_sessions', {
      date: cDate,
      kind,
      duration_min: Number(dur) || 0,
      distance_km: Number(dist) || 0,
      avg_hr: Math.round(Number(hr)) || 0,
      calories: Math.round(Number(cals)) || 0,
      notes: '',
    });
    setDur('');
    setDist('');
    setHr('');
    setCals('');
  };

  // Sauna form
  const [sDate, setSDate] = useState(today);
  const [sDur, setSDur] = useState('20');
  const [sTemp, setSTemp] = useState('90');
  const [sRounds, setSRounds] = useState('1');
  const logSauna = async () => {
    if (!Number(sDur)) return;
    await insert('sauna_sessions', {
      date: sDate,
      duration_min: Number(sDur) || 0,
      temperature_c: Math.round(Number(sTemp)) || 0,
      rounds: Math.max(1, Math.round(Number(sRounds)) || 1),
      notes: '',
    });
  };

  return (
    <>
      <ScreenHeader title="Cardio & Sauna" subtitle="Conditioning and heat work." onMenu={onMenu} />
      <div className="screen-content">
        <div className="cf-metric-grid">
          <Metric label="Cardio this week" value={String(weekCardio.length)} />
          <Metric label="Cardio minutes (wk)" value={fmtNum(weekCardio.reduce((s, c) => s + Number(c.duration_min), 0))} />
          <Metric label="Sauna this week" value={String(weekSauna.length)} />
          <Metric label="Sauna minutes (wk)" value={fmtNum(weekSauna.reduce((s, x) => s + Number(x.duration_min), 0))} />
        </div>

        <Card title="Log cardio">
          <div className="form-grid">
            <div>
              <label className="field">Date</label>
              <input type="date" value={cDate} onChange={(e) => setCDate(e.target.value)} />
            </div>
            <div>
              <label className="field">Type</label>
              <select value={kind} onChange={(e) => setKind(e.target.value as CardioKind)}>
                {CARDIO_KINDS.map((k) => (
                  <option key={k} value={k}>
                    {CARDIO_KIND_LABEL[k]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="field">Minutes</label>
              <input type="number" inputMode="decimal" value={dur} onChange={(e) => setDur(e.target.value)} />
            </div>
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
          <button className="btn btn-primary" onClick={logCardio} disabled={!Number(dur)}>
            Log cardio
          </button>
        </Card>

        <Card title="Log sauna">
          <div className="form-grid">
            <div>
              <label className="field">Date</label>
              <input type="date" value={sDate} onChange={(e) => setSDate(e.target.value)} />
            </div>
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
          <button className="btn btn-primary" onClick={logSauna} disabled={!Number(sDur)}>
            Log sauna
          </button>
        </Card>

        <Card title="Recent cardio">
          {cardio.slice(0, 20).map((c) => (
            <div key={c.id} className="pick-row">
              <div className="pick-main">
                <div className="pick-title">{CARDIO_KIND_LABEL[c.kind]}</div>
                <div className="pick-sub">
                  {fmtDayShort(c.date)} · {fmtNum(Number(c.duration_min))} min
                  {Number(c.distance_km) > 0 ? ` · ${fmtNum(Number(c.distance_km), 2)} km` : ''}
                  {c.avg_hr > 0 ? ` · ${c.avg_hr} bpm` : ''}
                  {c.calories > 0 ? ` · ${c.calories} kcal` : ''}
                </div>
              </div>
              <button className="btn btn-danger btn-sm" onClick={() => remove('cardio_sessions', c.id)}>
                ✕
              </button>
            </div>
          ))}
          {cardio.length === 0 && <p style={{ fontSize: 13, color: 'var(--text2)' }}>Nothing logged yet.</p>}
        </Card>

        <Card title="Recent sauna">
          {sauna.slice(0, 20).map((s) => (
            <div key={s.id} className="pick-row">
              <div className="pick-main">
                <div className="pick-title">
                  {fmtNum(Number(s.duration_min))} min at {fmtNum(Number(s.temperature_c))}°C
                </div>
                <div className="pick-sub">
                  {fmtDayShort(s.date)}
                  {s.rounds > 1 ? ` · ${s.rounds} rounds` : ''}
                </div>
              </div>
              <button className="btn btn-danger btn-sm" onClick={() => remove('sauna_sessions', s.id)}>
                ✕
              </button>
            </div>
          ))}
          {sauna.length === 0 && <p style={{ fontSize: 13, color: 'var(--text2)' }}>Nothing logged yet.</p>}
        </Card>
      </div>
    </>
  );
}
