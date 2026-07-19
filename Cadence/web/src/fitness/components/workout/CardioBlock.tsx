// Cardio done as part of this session — the right home for a run/row/ride
// (time, distance, calories), which then counts as cardio everywhere (week
// totals, the Cardio screen, the dashboard) and is linked to this workout via
// workout_id so it shows here and is cleaned up if the session is discarded.
// Owns its own form state; the screen can pre-open it with a kind when the
// exercise search redirects a "running"-style query here.

import { useEffect, useMemo, useState } from 'react';
import { useCadenceFitness } from '../../lib/store';
import { Card } from '../bits';
import { useKeyedLocks } from '../../lib/useKeyedLocks';
import { cardioKindForName, cardioTargetSummary, isCardioTracking, slotTracking } from '../../lib/tracking';
import { CARDIO_KINDS, CARDIO_KIND_ICON, CARDIO_KIND_LABEL, fmtNum } from '../../lib/util';
import type { CardioKind, CardioSession, ProgramExercise, Workout } from '../../lib/types';

export function CardioBlock({
  active,
  daySlots,
  prefillKind,
  onPrefillConsumed,
}: {
  active: Workout;
  daySlots: ProgramExercise[];
  /** Set by the exercise search's cardio redirect: open the form with this kind. */
  prefillKind: CardioKind | null;
  onPrefillConsumed: () => void;
}) {
  const { data, insert, update, remove } = useCadenceFitness();
  const { runLocked, isBusy } = useKeyedLocks();

  const [cardioKind, setCardioKind] = useState<CardioKind>('run');
  const [cardioMin, setCardioMin] = useState('');
  const [cardioKm, setCardioKm] = useState('');
  const [cardioCals, setCardioCals] = useState('');
  const [cardioHr, setCardioHr] = useState('');
  const [cardioNotes, setCardioNotes] = useState('');
  const [cardioOpen, setCardioOpen] = useState(false);

  useEffect(() => {
    if (!prefillKind) return;
    setCardioKind(prefillKind);
    setCardioOpen(true);
    onPrefillConsumed();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefillKind]);

  const sessionCardio = useMemo(
    () => data.cardio_sessions.filter((c) => c.workout_id === active.id),
    [data.cardio_sessions, active.id]
  );
  const plannedCardioSlots = useMemo(
    () =>
      daySlots.filter((slot) =>
        isCardioTracking(slotTracking(slot, data.exercises.find((e) => e.id === slot.exercise_id)))
      ),
    [daySlots, data.exercises]
  );

  const logSessionCardio = () =>
    runLocked('cardio:adhoc', async () => {
      const minutes = Math.round(Number(cardioMin)) || 0;
      if (!minutes) return;
      await insert('cardio_sessions', {
        date: active.date,
        workout_id: active.id,
        kind: cardioKind,
        duration_min: minutes,
        distance_km: Number(cardioKm) || 0,
        avg_hr: Math.round(Number(cardioHr)) || 0,
        calories: Math.round(Number(cardioCals)) || 0,
        notes: cardioNotes,
      });
      setCardioMin('');
      setCardioKm('');
      setCardioCals('');
      setCardioHr('');
      setCardioNotes('');
      setCardioOpen(false);
    });

  const logPlannedCardio = (slot: ProgramExercise) =>
    runLocked(`pcardio:${slot.id}`, async () => {
      const exercise = data.exercises.find((e) => e.id === slot.exercise_id);
      const targetSummary = cardioTargetSummary(slot);
      await insert('cardio_sessions', {
        date: active.date,
        workout_id: active.id,
        kind: slot.cardio_kind || cardioKindForName(exercise?.name || ''),
        duration_min: Number(slot.target_duration_min) || 0,
        distance_km: Number(slot.target_distance_km) || 0,
        avg_hr: Number(slot.target_avg_hr) || 0,
        calories: Number(slot.target_calories) || 0,
        notes: [targetSummary ? `Target: ${targetSummary}` : '', slot.interval_notes || '', slot.notes || '']
          .filter(Boolean)
          .join('\n'),
      });
    });

  const updateCardio = async (c: CardioSession, patch: Partial<CardioSession>) => {
    await update('cardio_sessions', c.id, patch);
  };

  return (
    <Card title="Cardio">
      {plannedCardioSlots.length > 0 && (
        <div className="cf-callout" style={{ marginBottom: 10 }}>
          <strong>Programmed cardio</strong>
          {plannedCardioSlots.map((slot) => {
            const exercise = data.exercises.find((e) => e.id === slot.exercise_id);
            const summary = cardioTargetSummary(slot) || `${slot.target_duration_min ?? 0} min`;
            return (
              <div key={slot.id} className="pick-row">
                <div className="pick-main">
                  <div className="pick-title">{exercise?.name || 'Cardio'}</div>
                  <div className="pick-sub">{summary}</div>
                </div>
                <button className="btn btn-primary btn-sm" onClick={() => logPlannedCardio(slot)} disabled={isBusy(`pcardio:${slot.id}`)}>
                  Record outcome
                </button>
              </div>
            );
          })}
        </div>
      )}
      {sessionCardio.map((c) => (
        <div key={c.id} className="pick-row">
          <span className="cd-feed-icon" aria-hidden="true">
            {CARDIO_KIND_ICON[c.kind]}
          </span>
          <div className="pick-main">
            <div className="pick-title">{CARDIO_KIND_LABEL[c.kind]}</div>
            <div className="pick-sub">
              {[
                `${fmtNum(Number(c.duration_min))} min`,
                Number(c.distance_km) > 0 ? `${fmtNum(Number(c.distance_km), 2)} km` : '',
                c.avg_hr > 0 ? `${c.avg_hr} avg HR` : '',
                c.calories > 0 ? `${c.calories} kcal` : '',
              ]
                .filter(Boolean)
                .join(' · ')}
            </div>
            <div className="form-grid" style={{ marginTop: 8 }}>
              <div>
                <label className="field" htmlFor={`cardio-duration-${c.id}`}>Duration (min)</label>
                <input id={`cardio-duration-${c.id}`} type="number" inputMode="numeric" defaultValue={Number(c.duration_min) || ''} onBlur={(e) => updateCardio(c, { duration_min: Math.max(0, Number(e.target.value) || 0) })} />
              </div>
              <div>
                <label className="field" htmlFor={`cardio-distance-${c.id}`}>Distance (km)</label>
                <input id={`cardio-distance-${c.id}`} type="number" inputMode="decimal" step="0.1" defaultValue={Number(c.distance_km) || ''} onBlur={(e) => updateCardio(c, { distance_km: Math.max(0, Number(e.target.value) || 0) })} />
              </div>
              <div>
                <label className="field" htmlFor={`cardio-calories-${c.id}`}>Calories</label>
                <input id={`cardio-calories-${c.id}`} type="number" inputMode="numeric" defaultValue={c.calories || ''} onBlur={(e) => updateCardio(c, { calories: Math.max(0, Math.round(Number(e.target.value) || 0)) })} />
              </div>
              <div>
                <label className="field" htmlFor={`cardio-avg-hr-${c.id}`}>Avg HR</label>
                <input id={`cardio-avg-hr-${c.id}`} type="number" inputMode="numeric" defaultValue={c.avg_hr || ''} onBlur={(e) => updateCardio(c, { avg_hr: Math.max(0, Math.round(Number(e.target.value) || 0)) })} />
              </div>
              <div>
                <label className="field" htmlFor={`cardio-notes-${c.id}`}>{c.kind === 'hiit' ? 'Score / rounds / reps / peak HR / notes' : 'Pace / incline / intervals'}</label>
                <input id={`cardio-notes-${c.id}`} type="text" defaultValue={c.notes || ''} placeholder={c.kind === 'hiit' ? 'e.g. 4 rounds + 250m ski; peak HR 176' : 'e.g. progressive 15 min, 3% incline, 6:00/km'} onBlur={(e) => updateCardio(c, { notes: e.target.value })} />
              </div>
            </div>
          </div>
          <button className="btn btn-danger btn-sm" aria-label="Delete cardio" onClick={() => remove('cardio_sessions', c.id)}>
            ✕
          </button>
        </div>
      ))}
      {!cardioOpen ? (
        <button className="btn btn-ghost btn-sm" onClick={() => setCardioOpen(true)}>
          + Log cardio (run, row, ride…)
        </button>
      ) : (
        <div className="wo-cardio-form">
          <div className="cd-kind-grid">
            {CARDIO_KINDS.map((k) => (
              <button key={k} className={`cd-kind ${cardioKind === k ? 'active' : ''}`} onClick={() => setCardioKind(k)}>
                <span className="cd-kind-icon">{CARDIO_KIND_ICON[k]}</span>
                <span>{CARDIO_KIND_LABEL[k]}</span>
              </button>
            ))}
          </div>
          <div className="form-grid" style={{ marginTop: 8 }}>
            <div>
              <label className="field" htmlFor="workout-cardio-time">Time (min)</label>
              <input id="workout-cardio-time" type="number" inputMode="numeric" value={cardioMin} autoFocus placeholder="e.g. 28"
                onChange={(e) => setCardioMin(e.target.value)} />
            </div>
            <div>
              <label className="field" htmlFor="workout-cardio-distance">Distance (km)</label>
              <input id="workout-cardio-distance" type="number" inputMode="decimal" value={cardioKm} placeholder="e.g. 5"
                onChange={(e) => setCardioKm(e.target.value)} />
            </div>
            <div>
              <label className="field" htmlFor="workout-cardio-calories">Calories</label>
              <input id="workout-cardio-calories" type="number" inputMode="numeric" value={cardioCals} placeholder="optional"
                onChange={(e) => setCardioCals(e.target.value)} />
            </div>
            <div>
              <label className="field" htmlFor="workout-cardio-avg-hr">Avg HR</label>
              <input id="workout-cardio-avg-hr" type="number" inputMode="numeric" value={cardioHr} placeholder="optional"
                onChange={(e) => setCardioHr(e.target.value)} />
            </div>
            <div>
              <label className="field" htmlFor="workout-cardio-notes">{cardioKind === 'hiit' ? 'Score / rounds / reps / peak HR / notes' : 'Pace / incline / intervals'}</label>
              <input id="workout-cardio-notes" type="text" value={cardioNotes} placeholder={cardioKind === 'hiit' ? 'e.g. 4 rounds + 250m ski; peak HR 176' : 'e.g. progressive 15 min, 3% incline'} onChange={(e) => setCardioNotes(e.target.value)} />
            </div>
          </div>
          <div className="wo-cardio-actions">
            <button className="btn btn-ghost btn-sm" onClick={() => setCardioOpen(false)}>
              Cancel
            </button>
            <button className="btn btn-primary" disabled={!Number(cardioMin) || isBusy('cardio:adhoc')} onClick={logSessionCardio}>
              {Number(cardioMin)
                ? `Log ${CARDIO_KIND_LABEL[cardioKind]} · ${Math.round(Number(cardioMin))} min`
                : 'Enter time'}
            </button>
          </div>
        </div>
      )}
      {sessionCardio.length === 0 && !cardioOpen && (
        <p className="wo-cardio-hint">A run, row or ride logged here counts as cardio for the week — no need to re-log it.</p>
      )}
    </Card>
  );
}
