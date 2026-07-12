import { useMemo, useState } from 'react';
import { useCadenceFitness } from '../lib/store';
import { ScreenHeader, Card, Tag, SparkBars } from '../components/bits';
import { epley1RM, prsByExercise, workingSets } from '../lib/fitnessCalc';
import { EQUIPMENT_OPTIONS, fmtDMY, fmtKg, MUSCLE_GROUP_LABEL, MUSCLE_GROUPS } from '../lib/util';
import { EXERCISE_CATALOG } from '../lib/exerciseCatalog';
import {
  fmtDuration,
  guessTracking,
  isTimedTracking,
  isWeightedTracking,
  looksLikeCardio,
  setDuration,
  TRACKING_OPTIONS,
  trackingOf,
} from '../lib/tracking';
import type { ExerciseTracking, MuscleGroup } from '../lib/types';

// Exercise library + per-lift history: PRs (best e1RM), and an e1RM-over-time
// spark for the selected lift.
export function Exercises({ onMenu }: { onMenu: () => void }) {
  const { data, insert, update, remove } = useCadenceFitness();
  const [filter, setFilter] = useState<MuscleGroup | 'all'>('all');
  const [openId, setOpenId] = useState<string | null>(null);

  const prs = useMemo(() => prsByExercise(data.workout_sets, data.workouts), [data.workout_sets, data.workouts]);

  const list = [...data.exercises]
    .filter((e) => filter === 'all' || e.muscle_group === filter)
    .sort((a, b) => a.name.localeCompare(b.name));

  const [newName, setNewName] = useState('');
  const [newMuscle, setNewMuscle] = useState<MuscleGroup>('chest');
  const [newEquip, setNewEquip] = useState('barbell');
  // Tracking mode for the new exercise. Auto-guessed from the name (so "Plank"
  // defaults to a timed hold) until the user picks one explicitly.
  const [newTracking, setNewTracking] = useState<ExerciseTracking>('strength_weighted');
  const [trackingTouched, setTrackingTouched] = useState(false);
  const onNewName = (name: string) => {
    setNewName(name);
    if (!trackingTouched) setNewTracking(guessTracking(name));
  };
  const addExercise = async () => {
    if (!newName.trim()) return;
    await insert('exercises', {
      name: newName.trim(),
      muscle_group: newMuscle,
      secondary_muscles: '',
      equipment: newEquip,
      tracking: newTracking,
      notes: '',
    });
    setNewName('');
    setNewTracking('strength_weighted');
    setTrackingTouched(false);
  };

  const seedStarter = async () => {
    const have = new Set(data.exercises.map((e) => e.name.toLowerCase()));
    for (const e of EXERCISE_CATALOG) {
      if (have.has(e.name.toLowerCase())) continue;
      await insert('exercises', { ...e, secondary_muscles: '', notes: '' });
    }
  };

  const open = data.exercises.find((e) => e.id === openId) || null;

  return (
    <>
      <ScreenHeader title="Exercises" subtitle="Library, PRs and per-lift history." onMenu={onMenu}>
        <select value={filter} onChange={(e) => setFilter(e.target.value as MuscleGroup | 'all')}>
          <option value="all">All muscle groups</option>
          {MUSCLE_GROUPS.map((m) => (
            <option key={m} value={m}>
              {MUSCLE_GROUP_LABEL[m]}
            </option>
          ))}
        </select>
      </ScreenHeader>
      <div className="screen-content">
        {data.exercises.length === 0 && (
          <div className="cf-callout">
            Your library is empty — the common movements normally load automatically on first
            sign-in.{' '}
            <button className="btn btn-primary btn-sm" onClick={seedStarter}>
              Load common movements ({EXERCISE_CATALOG.length})
            </button>
          </div>
        )}

        {open && (
          <ExerciseDetail
            exerciseId={open.id}
            onClose={() => setOpenId(null)}
            onDelete={async () => {
              if (!window.confirm(`Delete ${open.name}? Its logged sets are kept but lose their name.`)) return;
              await remove('exercises', open.id);
              setOpenId(null);
            }}
          />
        )}

        <Card title="Library">
          {list.map((e) => {
            const pr = prs.get(e.id);
            return (
              <div key={e.id} className="pick-row">
                <div className="pick-main">
                  <div className="pick-title">{e.name}</div>
                  <div className="pick-sub">
                    {MUSCLE_GROUP_LABEL[e.muscle_group]}
                    {e.equipment ? ` · ${e.equipment}` : ''}
                    {pr ? ` · PR ${fmtKg(pr.weight_kg)} × ${pr.reps} (e1RM ${fmtKg(pr.e1rm)})` : ''}
                  </div>
                </div>
                {pr && <Tag label={`e1RM ${fmtKg(pr.e1rm)}`} tone="good" />}
                <button className="btn btn-ghost btn-sm" onClick={() => setOpenId(e.id)}>
                  Open
                </button>
              </div>
            );
          })}
          {list.length === 0 && data.exercises.length > 0 && (
            <p style={{ fontSize: 13, color: 'var(--text2)' }}>Nothing in this muscle group.</p>
          )}
        </Card>

        <Card title="Add exercise">
          <div className="form-grid">
            <div style={{ gridColumn: 'span 2' }}>
              <label className="field">Name</label>
              <input type="text" value={newName} placeholder="e.g. Pendlay Row" onChange={(e) => onNewName(e.target.value)} />
            </div>
            <div>
              <label className="field">Muscle group</label>
              <select value={newMuscle} onChange={(e) => setNewMuscle(e.target.value as MuscleGroup)}>
                {MUSCLE_GROUPS.map((m) => (
                  <option key={m} value={m}>
                    {MUSCLE_GROUP_LABEL[m]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="field">Equipment</label>
              <select value={newEquip} onChange={(e) => setNewEquip(e.target.value)}>
                {EQUIPMENT_OPTIONS.map((x) => (
                  <option key={x} value={x}>
                    {x}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="field">Tracked as</label>
              <select
                value={newTracking}
                onChange={(e) => {
                  setNewTracking(e.target.value as ExerciseTracking);
                  setTrackingTouched(true);
                }}
              >
                {TRACKING_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          {looksLikeCardio(newName) && (
            <p className="cf-callout cf-callout-warn" style={{ fontSize: 12, marginTop: 4 }}>
              🏃 Running, rowing, cycling and swimming are tracked as <strong>cardio inside Workout</strong>{' '}
              (time + distance) — log those in a session's Cardio block, not here.
            </p>
          )}
          <button className="btn btn-primary" onClick={addExercise} disabled={!newName.trim()}>
            Add
          </button>
        </Card>
      </div>
    </>
  );

  function ExerciseDetail({ exerciseId, onClose, onDelete }: { exerciseId: string; onClose: () => void; onDelete: () => void }) {
    const e = data.exercises.find((x) => x.id === exerciseId)!;
    const workoutById = new Map(data.workouts.map((w) => [w.id, w]));
    const history = workingSets(data.workout_sets)
      .filter((s) => s.exercise_id === exerciseId)
      .map((s) => ({ s, w: workoutById.get(s.workout_id) }))
      .filter((r) => r.w && r.w.status === 'completed')
      .sort((a, b) => a.w!.date.localeCompare(b.w!.date));

    // Best e1RM per session, for the spark.
    const bySession = new Map<string, { date: string; e1rm: number }>();
    for (const { s, w } of history) {
      const v = epley1RM(Number(s.weight_kg), s.reps);
      const prev = bySession.get(w!.id);
      if (!prev || v > prev.e1rm) bySession.set(w!.id, { date: w!.date, e1rm: v });
    }
    const spark = [...bySession.values()].map((p) => ({ label: fmtDMY(p.date), value: Math.round(p.e1rm * 10) / 10 }));
    const pr = prs.get(exerciseId);
    const recent = [...history].reverse().slice(0, 12);
    const tracking = trackingOf(e);
    const isWeighted = isWeightedTracking(tracking);

    return (
      <Card
        title={e.name}
        actions={
          <>
            <button className="btn btn-ghost btn-sm" onClick={onClose}>
              Close
            </button>
            <button className="btn btn-danger btn-sm" onClick={onDelete}>
              Delete
            </button>
          </>
        }
      >
        <div className="form-grid" style={{ marginBottom: 10 }}>
          <div>
            <label className="field">Muscle group</label>
            <select value={e.muscle_group} onChange={(ev) => update('exercises', e.id, { muscle_group: ev.target.value as MuscleGroup })}>
              {MUSCLE_GROUPS.map((m) => (
                <option key={m} value={m}>
                  {MUSCLE_GROUP_LABEL[m]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="field">Equipment</label>
            <input type="text" defaultValue={e.equipment} onBlur={(ev) => update('exercises', e.id, { equipment: ev.target.value })} />
          </div>
          <div>
            <label className="field">Tracked as</label>
            <select value={tracking} onChange={(ev) => update('exercises', e.id, { tracking: ev.target.value as ExerciseTracking })}>
              {TRACKING_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div style={{ gridColumn: 'span 2' }}>
            <label className="field">Notes / cues</label>
            <input type="text" defaultValue={e.notes} onBlur={(ev) => update('exercises', e.id, { notes: ev.target.value })} />
          </div>
        </div>
        {isWeighted ? (
          <>
            {pr ? (
              <p style={{ fontSize: 13, marginBottom: 10 }}>
                PR: <strong>{fmtKg(pr.weight_kg)} × {pr.reps}</strong> (e1RM {fmtKg(pr.e1rm)}) on {fmtDMY(pr.date)}
              </p>
            ) : (
              <p style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 10 }}>No working sets logged yet.</p>
            )}
            {spark.length > 1 && (
              <>
                <div className="cf-card-title" style={{ marginBottom: 6 }}>
                  e1RM per session
                </div>
                <SparkBars points={spark} formatTip={(p) => `${p.label}: e1RM ${p.value}kg`} />
              </>
            )}
            {recent.length > 0 && (
              <div className="cf-table-wrap" style={{ marginTop: 12 }}>
                <table className="cf-table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>kg</th>
                      <th>Reps</th>
                      <th>e1RM</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recent.map(({ s, w }) => (
                      <tr key={s.id}>
                        <td>{fmtDMY(w!.date)}</td>
                        <td>{Number(s.weight_kg)}</td>
                        <td>{s.reps}</td>
                        <td>{fmtKg(epley1RM(Number(s.weight_kg), s.reps))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        ) : recent.length > 0 ? (
          // Bodyweight reps / timed holds: no weight, so show the raw value history
          // (e1RM/PRs don't apply).
          <div className="cf-table-wrap" style={{ marginTop: 12 }}>
            <table className="cf-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>{isTimedTracking(tracking) ? 'Hold' : 'Reps'}</th>
                </tr>
              </thead>
              <tbody>
                {recent.map(({ s, w }) => (
                  <tr key={s.id}>
                    <td>{fmtDMY(w!.date)}</td>
                    <td>{isTimedTracking(tracking) ? fmtDuration(setDuration(s)) : s.reps}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 10 }}>No sets logged yet.</p>
        )}
      </Card>
    );
  }
}
