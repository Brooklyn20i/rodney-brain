import { useMemo, useState } from 'react';
import { useCadenceFitness } from '../lib/store';
import { ScreenHeader, Card, Metric, Tag } from '../components/bits';
import { weeklySetsByMuscle, weeklyHardSets, weekOf, workoutTonnage } from '../lib/fitnessCalc';
import { fmtDayShort, fmtKg, fmtNum, MUSCLE_GROUP_LABEL, stripDayPrefix, todayISO } from '../lib/util';
import type { Workout, WorkoutSet } from '../lib/types';

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
  const weekCardio = data.cardio_sessions.filter((c) => c.date >= thisWeek.start && c.date <= thisWeek.end).length;
  const weekSauna = data.sauna_sessions.filter((s) => s.date >= thisWeek.start && s.date <= thisWeek.end).length;

  const exName = (id: string) => data.exercises.find((e) => e.id === id)?.name || '?';

  return (
    <>
      <ScreenHeader title="History" subtitle="Every session, and this week's volume." onMenu={onMenu} />
      <div className="screen-content">
        <div className="cf-metric-grid">
          <Metric label="Sessions this week" value={String(weekWorkouts.length)} />
          <Metric label="Hard sets this week" value={String(weekSets)} />
          <Metric label="Cardio this week" value={String(weekCardio)} />
          <Metric label="Sauna this week" value={String(weekSauna)} />
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
            const openNow = openId === w.id;
            const mins =
              w.started_at && w.completed_at
                ? Math.round((new Date(w.completed_at).getTime() - new Date(w.started_at).getTime()) / 60000)
                : null;
            return (
              <div key={w.id}>
                <div className="pick-row" style={{ cursor: 'pointer' }} onClick={() => setOpenId(openNow ? null : w.id)}>
                  <div className="pick-main">
                    <div className="pick-title">
                      {stripDayPrefix(w.name || 'Session')} {w.week_number ? <Tag label={`Wk ${w.week_number}`} tone="info" /> : null}
                    </div>
                    <div className="pick-sub">
                      {fmtDayShort(w.date)} · {sets.length} sets · {fmtNum(workoutTonnage(data.workout_sets, w.id))}kg total
                      {mins !== null ? ` · ${mins} min` : ''}
                    </div>
                  </div>
                  <span style={{ color: 'var(--text3)' }}>{openNow ? '▾' : '▸'}</span>
                </div>
                {openNow && (
                  <SessionDetail
                    workout={w}
                    sets={data.workout_sets.filter((x) => x.workout_id === w.id)}
                    editing={editId === w.id}
                    onToggleEdit={() => setEditId(editId === w.id ? null : w.id)}
                    exName={exName}
                    onUpdateWorkout={(patch) => update('workouts', w.id, patch)}
                    onUpdateSet={(id, patch) => update('workout_sets', id, patch)}
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
              const done = data.workout_sets.filter((s) => s.done && !s.is_warmup);
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
  editing,
  onToggleEdit,
  exName,
  onUpdateWorkout,
  onUpdateSet,
  onAddSet,
  onRemoveSet,
  onDelete,
}: {
  workout: Workout;
  sets: WorkoutSet[];
  editing: boolean;
  onToggleEdit: () => void;
  exName: (id: string) => string;
  onUpdateWorkout: (patch: Partial<Workout>) => void;
  onUpdateSet: (id: string, patch: Partial<WorkoutSet>) => void;
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
      {byExercise.map(([exerciseId, rows]) => (
        <div key={exerciseId} style={{ fontSize: 13, padding: '3px 0' }}>
          <strong>{exName(exerciseId)}</strong>{' '}
          {!editing ? (
            <span style={{ color: 'var(--text2)' }}>
              {rows
                .sort((a, b) => a.set_number - b.set_number)
                .map((s) => `${Number(s.weight_kg)}×${s.reps}`)
                .join(', ')}
            </span>
          ) : (
            <div style={{ marginTop: 4 }}>
              {rows
                .sort((a, b) => a.set_number - b.set_number)
                .map((s) => (
                  <div key={s.id} className="hist-set-edit">
                    <span className="wo-set-num">{s.set_number}</span>
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
      ))}
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
