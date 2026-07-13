import { useMemo, useState } from 'react';
import { useCadenceFitness } from '../lib/store';
import { ScreenHeader, Card, Metric, Tag } from '../components/bits';
import { weeklySetsByMuscle, weeklyHardSets, weekOf, workoutTonnage } from '../lib/fitnessCalc';
import { fmtDayShort, fmtKg, fmtNum, MUSCLE_GROUP_LABEL, stripDayPrefix, todayISO } from '../lib/util';
import { fmtDuration, parseDuration, setDuration, isBodyweightTracking, isTimedTracking, slotTracking } from '../lib/tracking';
import {
  cardioDetailMetrics,
  compactCardioNote,
  CARDIO_KIND_LABEL,
  formatSessionSubtitle,
  parseCardioNoteMetrics,
} from '../lib/historySummary';
import type { CardioSession, ExerciseTracking, Workout, WorkoutSet } from '../lib/types';

// Session log + weekly volume: what actually happened, week by week.
// Sessions stay editable after the fact: fix a mistyped weight, add the set
// you forgot to log, or delete the whole thing.
export function History({ onMenu }: { onMenu: () => void }) {
  const { data, insert, update, remove } = useCadenceFitness();
  const [openId, setOpenId] = useState<string | null>(null);
  const [editId, setEditId] = useState<string | null>(null);

  const completed = useMemo(
    () =>
      [...data.workouts]
        .filter((w) => w.status === 'completed')
        .sort((a, b) => b.date.localeCompare(a.date) || (b.completed_at || '').localeCompare(a.completed_at || '')),
    [data.workouts]
  );

  const today = todayISO();
  const thisWeek = weekOf(today);
  const weekWorkouts = completed.filter((w) => w.date >= thisWeek.start && w.date <= thisWeek.end);
  const weekMuscle = weeklySetsByMuscle(data.workout_sets, data.workouts, data.exercises, thisWeek.start, thisWeek.end);
  // Headline count = every hard set logged this week. The per-muscle table below
  // can read lower because it drops sets whose exercise has no muscle mapping.
  const weekSets = weeklyHardSets(data.workout_sets, data.workouts, thisWeek.start, thisWeek.end);
  const weekCardioRows = data.cardio_sessions.filter((c) => c.date >= thisWeek.start && c.date <= thisWeek.end);
  const weekCardio = weekCardioRows.length;
  const weekCardioMin = weekCardioRows.reduce((sum, c) => sum + Number(c.duration_min || 0), 0);
  const weekCardioKm = weekCardioRows.reduce((sum, c) => sum + Number(c.distance_km || 0), 0);
  const weekCardioCals = weekCardioRows.reduce((sum, c) => sum + Number(c.calories || 0), 0);
  const weekSauna = data.sauna_sessions.filter((s) => s.date >= thisWeek.start && s.date <= thisWeek.end).length;

  const exName = (id: string) => data.exercises.find((e) => e.id === id)?.name || '?';
  const trackingFor = (id: string, workout?: Workout) =>
    slotTracking(
      workout?.program_day_id ? data.program_exercises.find((s) => s.program_day_id === workout.program_day_id && s.exercise_id === id) : null,
      data.exercises.find((e) => e.id === id) || null
    );

  return (
    <>
      <ScreenHeader title="History" subtitle="Every session, and this week's volume." onMenu={onMenu} />
      <div className="screen-content">
        <div className="cf-metric-grid">
          <Metric label="Sessions this week" value={String(weekWorkouts.length)} />
          <Metric label="Hard sets this week" value={String(weekSets)} />
          <Metric label="Cardio this week" value={`${fmtNum(weekCardioMin)} min`} delta={`${fmtNum(weekCardioKm, 1)} km · ${fmtNum(weekCardioCals)} kcal · ${weekCardio} sessions`} />
          <Metric label="Recovery activities" value={String(weekSauna)} delta="sauna" />
        </div>

        {weekMuscle.size > 0 && (
          <Card title="Hard sets per muscle group (this week)">
            <div className="cf-table-wrap">
              <table className="cf-table">
                <tbody>
                  {[...weekMuscle.entries()]
                    .sort((a, b) => b[1] - a[1])
                    .map(([m, n]) => (
                      <tr key={m}>
                        <td>{MUSCLE_GROUP_LABEL[m]}</td>
                        <td>{n}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}

        <Card title="Sessions">
          {completed.length === 0 && (
            <p style={{ fontSize: 13, color: 'var(--text2)' }}>No sessions logged yet — hit Workout to start one.</p>
          )}
          {completed.map((w) => {
            const sets = data.workout_sets.filter((s) => s.workout_id === w.id && s.done);
            const cardio = data.cardio_sessions.filter((c) => c.workout_id === w.id);
            const openNow = openId === w.id;
            const workoutDurationMin =
              w.started_at && w.completed_at
                ? Math.max(0, Math.round((new Date(w.completed_at).getTime() - new Date(w.started_at).getTime()) / 60000))
                : null;
            const subtitle = formatSessionSubtitle({
              dateLabel: fmtDayShort(w.date),
              doneSetCount: sets.length,
              tonnageKg: workoutTonnage(data.workout_sets, w.id),
              cardio,
              workoutDurationMin,
            });
            return (
              <div key={w.id}>
                <div className="pick-row" style={{ cursor: 'pointer' }} onClick={() => setOpenId(openNow ? null : w.id)}>
                  <div className="pick-main">
                    <div className="pick-title">
                      {stripDayPrefix(w.name || 'Session')} {w.week_number ? <Tag label={`Wk ${w.week_number}`} tone="info" /> : null}
                    </div>
                    <div className="pick-sub">{subtitle}</div>
                  </div>
                  <span style={{ color: 'var(--text3)' }}>{openNow ? '▾' : '▸'}</span>
                </div>
                {openNow && (
                  <SessionDetail
                    workout={w}
                    sets={data.workout_sets.filter((x) => x.workout_id === w.id)}
                    cardio={cardio}
                    editing={editId === w.id}
                    onToggleEdit={() => setEditId(editId === w.id ? null : w.id)}
                    exName={exName}
                    trackingFor={(id) => trackingFor(id, w)}
                    onUpdateWorkout={(patch) => update('workouts', w.id, patch)}
                    onUpdateSet={(id, patch) => update('workout_sets', id, patch)}
                    onUpdateCardio={(id, patch) => update('cardio_sessions', id, patch)}
                    onAddSet={async (exerciseId) => {
                      const rows = data.workout_sets
                        .filter((x) => x.workout_id === w.id && x.exercise_id === exerciseId)
                        .sort((a, b) => a.set_number - b.set_number);
                      const last = rows[rows.length - 1];
                      await insert('workout_sets', {
                        workout_id: w.id,
                        exercise_id: exerciseId,
                        set_number: (last?.set_number ?? 0) + 1,
                        weight_kg: last ? Number(last.weight_kg) : 0,
                        reps: last?.reps ?? 0,
                        duration_seconds: last ? setDuration(last) : 0,
                        rpe: null,
                        is_warmup: false,
                        done: true,
                      });
                    }}
                    onRemoveSet={(id) => remove('workout_sets', id)}
                    onDelete={async () => {
                      if (!window.confirm('Delete this session and its sets?')) return;
                      for (const s of data.workout_sets.filter((x) => x.workout_id === w.id)) {
                        await remove('workout_sets', s.id);
                      }
                      // Also remove any cardio logged inside this session, so a
                      // deleted run doesn't linger in the weekly cardio totals with
                      // a dangling workout_id (the in-session cardio block only ever
                      // shows for the active session, so it'd be un-deletable).
                      for (const c of data.cardio_sessions.filter((x) => x.workout_id === w.id)) {
                        await remove('cardio_sessions', c.id);
                      }
                      await remove('workouts', w.id);
                    }}
                  />
                )}
              </div>
            );
          })}
        </Card>
        {completed.length > 0 && (
          <p style={{ fontSize: 11, color: 'var(--text3)' }}>
            Heaviest logged set ever:{' '}
            {(() => {
              const done = data.workout_sets.filter((s) => s.done && !s.is_warmup && Number(s.weight_kg) > 0);
              if (!done.length) return '—';
              const top = done.reduce((a, b) => (Number(a.weight_kg) >= Number(b.weight_kg) ? a : b));
              return `${exName(top.exercise_id)} ${fmtKg(Number(top.weight_kg))} × ${top.reps}`;
            })()}
          </p>
        )}
      </div>
    </>
  );
}

// Expanded view of one past session: read-only summary by default, full edit
// mode (weights, reps, add/remove sets, name/date/notes) behind one tap.
function SessionDetail({
  workout: w,
  sets,
  cardio,
  editing,
  onToggleEdit,
  exName,
  trackingFor,
  onUpdateWorkout,
  onUpdateSet,
  onUpdateCardio,
  onAddSet,
  onRemoveSet,
  onDelete,
}: {
  workout: Workout;
  sets: WorkoutSet[];
  cardio: CardioSession[];
  editing: boolean;
  onToggleEdit: () => void;
  exName: (id: string) => string;
  trackingFor: (id: string) => ExerciseTracking;
  onUpdateWorkout: (patch: Partial<Workout>) => void;
  onUpdateSet: (id: string, patch: Partial<WorkoutSet>) => void;
  onUpdateCardio: (id: string, patch: Partial<CardioSession>) => void;
  onAddSet: (exerciseId: string) => void;
  onRemoveSet: (id: string) => void;
  onDelete: () => void;
}) {
  const shown = editing ? sets : sets.filter((s) => s.done);
  const byExercise = Object.entries(
    shown.reduce<Record<string, WorkoutSet[]>>((acc, s) => {
      ((acc[s.exercise_id] ||= []) as WorkoutSet[]).push(s);
      return acc;
    }, {})
  );

  return (
    <div style={{ padding: '4px 4px 12px' }}>
      {editing && (
        <div className="form-grid form-grid-2" style={{ marginBottom: 8 }}>
          <div>
            <label className="field">Name</label>
            <input
              type="text"
              defaultValue={w.name}
              onBlur={(e) => e.target.value.trim() && onUpdateWorkout({ name: e.target.value.trim() })}
            />
          </div>
          <div>
            <label className="field">Date</label>
            <input type="date" defaultValue={w.date} onBlur={(e) => e.target.value && onUpdateWorkout({ date: e.target.value })} />
          </div>
        </div>
      )}
      {byExercise.map(([exerciseId, rows]) => {
        const tracking = trackingFor(exerciseId);
        const sorted = [...rows].sort((a, b) => a.set_number - b.set_number);
        return (
        <div key={exerciseId} style={{ fontSize: 13, padding: '3px 0' }}>
          <strong>{exName(exerciseId)}</strong>{' '}
          {!editing ? (
            <span style={{ color: 'var(--text2)' }}>
              {sorted
                .map((s) =>
                  isTimedTracking(tracking)
                    ? fmtDuration(setDuration(s))
                    : isBodyweightTracking(tracking)
                      ? `${s.reps}`
                      : `${Number(s.weight_kg)}×${s.reps}`
                )
                .join(', ')}
            </span>
          ) : (
            <div style={{ marginTop: 4 }}>
              {sorted.map((s) => (
                  <div key={s.id} className="hist-set-edit">
                    <span className="wo-set-num">{s.set_number}</span>
                    {isTimedTracking(tracking) ? (
                      <input
                        type="text"
                        inputMode="numeric"
                        defaultValue={setDuration(s) ? fmtDuration(setDuration(s)) : ''}
                        placeholder="m:ss"
                        onBlur={(e) => onUpdateSet(s.id, { duration_seconds: parseDuration(e.target.value) })}
                      />
                    ) : isBodyweightTracking(tracking) ? (
                      <input
                        type="number"
                        inputMode="numeric"
                        defaultValue={s.reps || ''}
                        placeholder="reps"
                        onBlur={(e) => onUpdateSet(s.id, { reps: Math.max(0, Math.round(Number(e.target.value) || 0)) })}
                      />
                    ) : (
                      <>
                        <input
                          type="number"
                          inputMode="decimal"
                          step="0.5"
                          defaultValue={Number(s.weight_kg) || ''}
                          placeholder="kg"
                          onBlur={(e) => onUpdateSet(s.id, { weight_kg: Number(e.target.value) || 0 })}
                        />
                        <span className="hist-set-x">×</span>
                        <input
                          type="number"
                          inputMode="numeric"
                          defaultValue={s.reps || ''}
                          placeholder="reps"
                          onBlur={(e) => onUpdateSet(s.id, { reps: Math.max(0, Math.round(Number(e.target.value) || 0)) })}
                        />
                      </>
                    )}
                    <button className="btn btn-danger btn-sm" aria-label="Delete set" onClick={() => onRemoveSet(s.id)}>
                      ✕
                    </button>
                  </div>
                ))}
              <button className="btn btn-ghost btn-sm" onClick={() => onAddSet(exerciseId)}>
                + Add set
              </button>
            </div>
          )}
        </div>
        );
      })}
      {cardio.length > 0 && (
        <div className="hist-cardio-block">
          <strong>Cardio</strong>
          {cardio.map((c) => {
            const metrics = cardioDetailMetrics(c);
            const parsed = parseCardioNoteMetrics(c.notes || '');
            const compactNote = compactCardioNote(c.notes || '');
            return (
              <div key={c.id} className="hist-cardio-session">
                {!editing ? (
                  <>
                    <div className="hist-cardio-head">
                      <span>{CARDIO_KIND_LABEL[c.kind] || 'Cardio'}</span>
                      {c.avg_hr > 0 ? <Tag label={`${fmtNum(Number(c.avg_hr))} avg HR`} tone="info" /> : null}
                    </div>
                    <div className="hist-cardio-metrics">
                      {metrics.map((metric) => (
                        <div key={metric.label} className="hist-cardio-metric">
                          <span>{metric.label}</span>
                          <strong>{metric.value}</strong>
                        </div>
                      ))}
                    </div>
                    {parsed.zones.length > 0 && (
                      <div className="hist-zone-list" aria-label="Heart-rate zones">
                        {parsed.zones.map((zone) => (
                          <span key={zone.zone}>
                            <strong>{zone.zone}</strong> {zone.duration} · {zone.percent}%
                          </span>
                        ))}
                      </div>
                    )}
                    {compactNote && <div className="hist-cardio-note">Note: {compactNote}</div>}
                  </>
                ) : (
                  <div className="form-grid" style={{ marginTop: 4 }}>
                    <input type="number" inputMode="numeric" defaultValue={Number(c.duration_min) || ''} placeholder="min" onBlur={(e) => onUpdateCardio(c.id, { duration_min: Math.max(0, Number(e.target.value) || 0) })} />
                    <input type="number" inputMode="decimal" step="0.1" defaultValue={Number(c.distance_km) || ''} placeholder="km" onBlur={(e) => onUpdateCardio(c.id, { distance_km: Math.max(0, Number(e.target.value) || 0) })} />
                    <input type="number" inputMode="numeric" defaultValue={c.calories || ''} placeholder="kcal" onBlur={(e) => onUpdateCardio(c.id, { calories: Math.max(0, Math.round(Number(e.target.value) || 0)) })} />
                    <input type="number" inputMode="numeric" defaultValue={c.avg_hr || ''} placeholder="avg HR" onBlur={(e) => onUpdateCardio(c.id, { avg_hr: Math.max(0, Math.round(Number(e.target.value) || 0)) })} />
                    <input type="text" defaultValue={c.notes || ''} placeholder="pace / speed / incline / intervals" onBlur={(e) => onUpdateCardio(c.id, { notes: e.target.value })} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
      {editing ? (
        <div style={{ marginTop: 8 }}>
          <label className="field">Notes</label>
          <textarea
            defaultValue={w.notes}
            placeholder="How did it go?"
            onBlur={(e) => onUpdateWorkout({ notes: e.target.value })}
          />
        </div>
      ) : (
        w.notes && <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 6 }}>“{w.notes}”</div>
      )}
      <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
        <button className="btn btn-secondary btn-sm" onClick={onToggleEdit}>
          {editing ? 'Done editing' : '✎ Edit session'}
        </button>
        <button className="btn btn-danger btn-sm" onClick={onDelete}>
          Delete session
        </button>
      </div>
    </div>
  );
}
