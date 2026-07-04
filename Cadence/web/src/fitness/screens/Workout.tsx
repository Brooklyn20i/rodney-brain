import { useEffect, useMemo, useRef, useState } from 'react';
import { useCadenceFitness } from '../lib/store';
import { ScreenHeader, Card, Tag } from '../components/bits';
import { cyclePosition, lastSetsForExercise, nextProgramDay } from '../lib/fitnessCalc';
import { fmtDayShort, fmtKg, todayISO } from '../lib/util';
import type { ProgramDay, WorkoutSet } from '../lib/types';

// Guided gym mode: start today's program day (or an ad-hoc session), tick off
// sets with weight/reps, see what you did last time, and run a rest timer.
// On a phone it opens in full-screen focus mode (one exercise at a time, big
// touch targets) like Whoop / MacroFactor; a List toggle shows everything.
export function Workout({ onMenu, onNavigate }: { onMenu: () => void; onNavigate: (id: string) => void }) {
  const { data, insert, update, remove } = useCadenceFitness();
  const today = todayISO();

  const active = data.workouts.find((w) => w.status === 'in_progress');
  const activeProgram = data.programs.find((p) => p.status === 'active');

  // Focus (gym) mode: default on for phones, off on desktop. Toggleable.
  const [gymMode, setGymMode] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(max-width: 768px)').matches
  );
  const [focusIndex, setFocusIndex] = useState(0);

  // ── Rest timer ──────────────────────────────────────────────────────────
  const [restLeft, setRestLeft] = useState<number | null>(null);
  const [restTotal, setRestTotal] = useState(0);
  const restEndsAt = useRef<number | null>(null);
  const [, forceTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => {
      forceTick((x) => x + 1); // drives the elapsed-time display too
      if (restEndsAt.current !== null) {
        const left = Math.round((restEndsAt.current - Date.now()) / 1000);
        setRestLeft(left);
        if (left <= -30) {
          restEndsAt.current = null;
          setRestLeft(null);
        }
      }
    }, 1000);
    return () => clearInterval(t);
  }, []);
  const startRest = (seconds: number) => {
    restEndsAt.current = Date.now() + seconds * 1000;
    setRestTotal(seconds);
    setRestLeft(seconds);
  };
  const stopRest = () => {
    restEndsAt.current = null;
    setRestLeft(null);
  };

  // Local input drafts so typing doesn't hit Supabase per keystroke.
  const [drafts, setDrafts] = useState<Record<string, { weight?: string; reps?: string }>>({});

  const exName = (exerciseId: string) => data.exercises.find((e) => e.id === exerciseId)?.name || 'Exercise';

  // ── Start a session ─────────────────────────────────────────────────────
  const startSession = async (day: ProgramDay | null) => {
    const pos = activeProgram ? cyclePosition(activeProgram, today) : null;
    const workout = await insert('workouts', {
      date: today,
      program_id: day ? day.program_id : null,
      program_day_id: day ? day.id : null,
      week_number: pos?.week ?? null,
      name: day ? day.name : 'Ad-hoc session',
      status: 'in_progress',
      started_at: new Date().toISOString(),
      completed_at: null,
      notes: '',
    });
    if (day) {
      const slots = data.program_exercises
        .filter((s) => s.program_day_id === day.id)
        .sort((a, b) => a.ex_order - b.ex_order);
      for (const slot of slots) {
        const last = lastSetsForExercise(data.workout_sets, data.workouts, slot.exercise_id, workout.id);
        for (let n = 1; n <= slot.target_sets; n++) {
          const lastSet = last?.sets[Math.min(n - 1, (last?.sets.length ?? 1) - 1)];
          await insert('workout_sets', {
            workout_id: workout.id,
            exercise_id: slot.exercise_id,
            set_number: n,
            weight_kg: lastSet ? Number(lastSet.weight_kg) : 0,
            reps: 0,
            rpe: null,
            is_warmup: false,
            done: false,
          });
        }
      }
    }
    setFocusIndex(0);
  };

  // ── Session actions ─────────────────────────────────────────────────────
  const sessionSets = useMemo(
    () => (active ? data.workout_sets.filter((s) => s.workout_id === active.id) : []),
    [data.workout_sets, active]
  );

  const daySlots = useMemo(
    () =>
      active?.program_day_id
        ? data.program_exercises
            .filter((s) => s.program_day_id === active.program_day_id)
            .sort((a, b) => a.ex_order - b.ex_order)
        : [],
    [data.program_exercises, active]
  );

  // Exercise order: program-day slot order first, then extras by first log.
  const exerciseIds = useMemo(() => {
    const ordered: string[] = daySlots.map((s) => s.exercise_id);
    for (const s of [...sessionSets].sort((a, b) => a.created_at.localeCompare(b.created_at))) {
      if (!ordered.includes(s.exercise_id)) ordered.push(s.exercise_id);
    }
    return ordered.filter((id) => sessionSets.some((s) => s.exercise_id === id));
  }, [daySlots, sessionSets]);

  // Keep the focused index in range as exercises are added/removed.
  useEffect(() => {
    setFocusIndex((i) => Math.min(i, Math.max(0, exerciseIds.length - 1)));
  }, [exerciseIds.length]);

  const commitSet = async (set: WorkoutSet, extra?: Partial<WorkoutSet>) => {
    const d = drafts[set.id] || {};
    const patch: Partial<WorkoutSet> = { ...extra };
    if (d.weight !== undefined) patch.weight_kg = Number(d.weight) || 0;
    if (d.reps !== undefined) patch.reps = Math.max(0, Math.round(Number(d.reps) || 0));
    if (Object.keys(patch).length) await update('workout_sets', set.id, patch);
  };

  const toggleSet = async (set: WorkoutSet) => {
    const done = !set.done;
    await commitSet(set, { done });
    if (done) {
      const slot = daySlots.find((s) => s.exercise_id === set.exercise_id);
      startRest(slot?.rest_seconds ?? 120);
      // In focus mode, glide to the next exercise once this one's sets are all done.
      const others = sessionSets.filter((x) => x.exercise_id === set.exercise_id && x.id !== set.id);
      if (gymMode && others.length > 0 && others.every((x) => x.done)) {
        const idx = exerciseIds.indexOf(set.exercise_id);
        if (idx >= 0 && idx < exerciseIds.length - 1) setFocusIndex(idx + 1);
      }
    }
  };

  const addSet = async (exerciseId: string) => {
    const existing = sessionSets.filter((s) => s.exercise_id === exerciseId);
    const lastRow = existing.sort((a, b) => a.set_number - b.set_number)[existing.length - 1];
    await insert('workout_sets', {
      workout_id: active!.id,
      exercise_id: exerciseId,
      set_number: (lastRow?.set_number ?? 0) + 1,
      weight_kg: lastRow ? Number(lastRow.weight_kg) : 0,
      reps: 0,
      rpe: null,
      is_warmup: false,
      done: false,
    });
  };

  const [addExId, setAddExId] = useState('');
  const addExercise = async () => {
    if (!addExId || !active) return;
    // Already in the session -> just tack on another set. New to the session ->
    // seed it from the last time this movement was trained, so the weights (and
    // set count) carry forward, exactly like program-day sessions prefill.
    if (sessionSets.some((s) => s.exercise_id === addExId)) {
      await addSet(addExId);
    } else {
      const last = lastSetsForExercise(data.workout_sets, data.workouts, addExId, active.id);
      const count = last?.sets.length || 1;
      for (let n = 1; n <= count; n++) {
        const lastSet = last?.sets[Math.min(n - 1, (last?.sets.length ?? 1) - 1)];
        await insert('workout_sets', {
          workout_id: active.id,
          exercise_id: addExId,
          set_number: n,
          weight_kg: lastSet ? Number(lastSet.weight_kg) : 0,
          reps: 0,
          rpe: null,
          is_warmup: false,
          done: false,
        });
      }
    }
    setAddExId('');
  };

  const finishSession = async () => {
    if (!active) return;
    // Untouched target rows don't count as training -- drop them.
    for (const s of sessionSets.filter((x) => !x.done)) await remove('workout_sets', s.id);
    await update('workouts', active.id, { status: 'completed', completed_at: new Date().toISOString() });
    stopRest();
    setDrafts({});
    onNavigate('history');
  };

  const discardSession = async () => {
    if (!active) return;
    if (!window.confirm('Discard this session and all its sets?')) return;
    for (const s of sessionSets) await remove('workout_sets', s.id);
    await remove('workouts', active.id);
    stopRest();
    setDrafts({});
  };

  // ── Render: no active session -> start view ─────────────────────────────
  if (!active) {
    const days = activeProgram
      ? data.program_days
          .filter((d) => d.program_id === activeProgram.id)
          .sort((a, b) => a.day_order - b.day_order)
      : [];
    const suggested = activeProgram ? nextProgramDay(days, data.workouts, activeProgram.id) : null;
    const pos = activeProgram ? cyclePosition(activeProgram, today) : null;

    return (
      <>
        <ScreenHeader title="Workout" subtitle="Start today's session." onMenu={onMenu} />
        <div className="screen-content">
          {activeProgram ? (
            <>
              <Card
                title={activeProgram.name}
                actions={pos ? <Tag label={`Cycle ${pos.cycle} · Week ${pos.week}/${activeProgram.weeks}`} tone="info" /> : undefined}
              >
                {suggested && (
                  <div className="cf-callout">
                    Up next: <strong>{suggested.name}</strong>
                    {suggested.focus ? ` — ${suggested.focus}` : ''}
                    <div style={{ marginTop: 10 }}>
                      <button className="btn btn-primary" onClick={() => startSession(suggested)}>
                        ▶ Start {suggested.name}
                      </button>
                    </div>
                  </div>
                )}
                {days.map((d) => (
                  <div key={d.id} className="pick-row">
                    <div className="pick-main">
                      <div className="pick-title">{d.name}</div>
                      {d.focus && <div className="pick-sub">{d.focus}</div>}
                    </div>
                    <button className="btn btn-secondary btn-sm" onClick={() => startSession(d)}>
                      Start
                    </button>
                  </div>
                ))}
              </Card>
            </>
          ) : (
            <div className="cf-callout cf-callout-warn">
              No active program. Build one under <strong>Programs</strong> (and set it active) to get
              guided sessions with targets and cycle tracking — or just start an empty session below.
            </div>
          )}
          <Card title="Ad-hoc">
            <button className="btn btn-secondary" onClick={() => startSession(null)}>
              Start empty session
            </button>
          </Card>
        </div>
      </>
    );
  }

  // ── Render helpers for an active session ────────────────────────────────
  const renderExercise = (exerciseId: string, big: boolean) => {
    const rows = sessionSets
      .filter((s) => s.exercise_id === exerciseId)
      .sort((a, b) => a.set_number - b.set_number);
    const slot = daySlots.find((s) => s.exercise_id === exerciseId);
    const last = lastSetsForExercise(data.workout_sets, data.workouts, exerciseId, active.id);
    const doneRows = rows.filter((s) => s.done).length;
    return (
      <div key={exerciseId} className={`wo-exercise ${big ? 'gym' : ''}`}>
        <div className="wo-exercise-head">
          <span className="wo-exercise-name">{exName(exerciseId)}</span>
          {rows.length > 0 && (
            <span className={`wo-exercise-count ${doneRows === rows.length ? 'complete' : ''}`}>
              {doneRows}/{rows.length}
            </span>
          )}
        </div>
        <div className="wo-chips">
          {slot && (
            <span className="wo-chip wo-chip-target">
              {slot.target_sets} × {slot.rep_min}–{slot.rep_max}
              {slot.target_rpe ? ` · RPE ${slot.target_rpe}` : ''}
            </span>
          )}
          {slot && <span className="wo-chip">Rest {Math.round(slot.rest_seconds / 60)}m</span>}
          <span className="wo-chip wo-chip-last">
            {last
              ? `Last ${fmtDayShort(last.date)}: ${last.sets
                  .map((s) => `${Number(s.weight_kg)}×${s.reps}`)
                  .join(', ')}`
              : 'First time'}
          </span>
        </div>
        {slot?.notes && <div className="wo-note">{slot.notes}</div>}
        <div className="wo-set-labels">
          <span>Set</span>
          <span style={{ textAlign: 'center' }}>Weight (kg)</span>
          <span style={{ textAlign: 'center' }}>Reps</span>
          <span aria-hidden="true"> </span>
        </div>
        {rows.map((s) => {
          const d = drafts[s.id] || {};
          return (
            <div key={s.id} className={`wo-set-row ${s.done ? 'wo-set-done' : ''}`}>
              <span className="wo-set-num">{s.set_number}</span>
              <input
                type="number"
                inputMode="decimal"
                step="0.5"
                value={d.weight ?? (Number(s.weight_kg) || '')}
                placeholder="0"
                onChange={(e) => setDrafts((p) => ({ ...p, [s.id]: { ...p[s.id], weight: e.target.value } }))}
                onBlur={() => commitSet(s)}
              />
              <input
                type="number"
                inputMode="numeric"
                value={d.reps ?? (s.reps || '')}
                placeholder={slot ? `${slot.rep_min}–${slot.rep_max}` : '—'}
                onChange={(e) => setDrafts((p) => ({ ...p, [s.id]: { ...p[s.id], reps: e.target.value } }))}
                onBlur={() => commitSet(s)}
              />
              <button
                className={`wo-set-check ${s.done ? 'checked' : ''}`}
                aria-label={s.done ? 'Mark set not done' : 'Mark set done'}
                onClick={() => toggleSet(s)}
              >
                ✓
              </button>
            </div>
          );
        })}
        <button className="btn btn-ghost btn-sm wo-add-set" onClick={() => addSet(exerciseId)}>
          + Add set
        </button>
      </div>
    );
  };

  const addExerciseControl = (wrap: 'card' | 'plain') => {
    const control = (
      <div className={wrap === 'plain' ? 'gym-add-body' : ''} style={wrap === 'card' ? { display: 'flex', gap: 8 } : undefined}>
        <select value={addExId} onChange={(e) => setAddExId(e.target.value)}>
          <option value="">Choose an exercise…</option>
          {[...data.exercises]
            .sort((a, b) => a.name.localeCompare(b.name))
            .map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
        </select>
        <button className="btn btn-secondary" onClick={addExercise} disabled={!addExId}>
          Add
        </button>
      </div>
    );
    if (wrap === 'plain') {
      return (
        <details className="gym-add">
          <summary>+ Add an exercise to this session</summary>
          {control}
        </details>
      );
    }
    return (
      <Card title="Add exercise">
        {control}
        {data.exercises.length === 0 && (
          <p style={{ fontSize: 12, color: 'var(--text2)', marginTop: 8 }}>
            Library is empty — add exercises on the Exercises screen first.
          </p>
        )}
      </Card>
    );
  };

  // ── Render: active session ───────────────────────────────────────────────
  const elapsedMin = active.started_at
    ? Math.max(0, Math.floor((Date.now() - new Date(active.started_at).getTime()) / 60000))
    : 0;
  const doneCount = sessionSets.filter((s) => s.done).length;
  const allSetsDone = (exerciseId: string) => {
    const rows = sessionSets.filter((s) => s.exercise_id === exerciseId);
    return rows.length > 0 && rows.every((s) => s.done);
  };
  const idx = Math.min(focusIndex, Math.max(0, exerciseIds.length - 1));

  const restPct = restTotal > 0 ? Math.max(0, Math.min(100, (restLeft! / restTotal) * 100)) : 0;
  const restBar = restLeft !== null && (
    <div className={`rest-timer ${restLeft <= 0 ? 'done' : ''}`}>
      <div className="rest-timer-main">
        <span className="rest-timer-label">{restLeft <= 0 ? 'Rest complete' : 'Resting'}</span>
        <span className="rest-timer-time">
          {restLeft <= 0 ? 'GO' : `${Math.floor(restLeft / 60)}:${String(restLeft % 60).padStart(2, '0')}`}
        </span>
        <button className="rest-timer-skip" onClick={stopRest}>
          {restLeft <= 0 ? 'Done' : 'Skip'}
        </button>
      </div>
      <div className="rest-timer-track">
        <div className="rest-timer-fill" style={{ width: `${restLeft <= 0 ? 100 : restPct}%` }} />
      </div>
    </div>
  );

  return (
    <>
      <ScreenHeader
        title={active.name || 'Session'}
        subtitle={`${fmtDayShort(active.date)} · ${elapsedMin} min · ${doneCount}/${sessionSets.length} sets`}
        onMenu={onMenu}
      >
        <button className="btn btn-secondary btn-sm" onClick={() => setGymMode((g) => !g)}>
          {gymMode ? '☰ List' : '⛶ Focus'}
        </button>
        <button className="btn btn-danger btn-sm" onClick={discardSession}>
          Discard
        </button>
        <button className="btn btn-primary" onClick={finishSession}>
          Finish
        </button>
      </ScreenHeader>

      <div className={`screen-content ${gymMode ? 'gym-mode' : ''}`}>
        {restBar}

        {gymMode ? (
          exerciseIds.length === 0 ? (
            <>
              <div className="cf-callout">No exercises in this session yet — add one to get going.</div>
              {addExerciseControl('card')}
            </>
          ) : (
            <>
              <div className="gym-head">
                <div className="gym-seg">
                  {exerciseIds.map((id, i) => (
                    <button
                      key={id}
                      className={`gym-seg-item ${i === idx ? 'active' : ''} ${allSetsDone(id) ? 'complete' : ''}`}
                      aria-label={`Go to ${exName(id)}`}
                      onClick={() => setFocusIndex(i)}
                    />
                  ))}
                </div>
                <div className="gym-head-label">
                  <span>
                    Exercise <strong>{idx + 1}</strong> of {exerciseIds.length}
                  </span>
                  <span className="gym-head-done">{exerciseIds.filter((id) => allSetsDone(id)).length} done</span>
                </div>
              </div>
              {renderExercise(exerciseIds[idx], true)}
              <div className="gym-nav">
                <button className="btn btn-secondary" disabled={idx === 0} onClick={() => setFocusIndex(idx - 1)}>
                  ← Prev
                </button>
                {idx < exerciseIds.length - 1 ? (
                  <button className="btn btn-primary" onClick={() => setFocusIndex(idx + 1)}>
                    Next →
                  </button>
                ) : (
                  <button className="btn btn-primary" onClick={finishSession}>
                    Finish ✓
                  </button>
                )}
              </div>
              {addExerciseControl('plain')}
            </>
          )
        ) : (
          <>
            {exerciseIds.map((exerciseId) => renderExercise(exerciseId, false))}
            {addExerciseControl('card')}
            <Card title="Session notes">
              <textarea
                defaultValue={active.notes}
                placeholder="How did it go?"
                onBlur={(e) => update('workouts', active.id, { notes: e.target.value })}
              />
            </Card>
            <p style={{ fontSize: 11, color: 'var(--text3)' }}>
              Best set so far this session:{' '}
              {(() => {
                const done = sessionSets.filter((s) => s.done && Number(s.weight_kg) > 0 && s.reps > 0);
                if (!done.length) return '—';
                const top = done.reduce((a, b) =>
                  Number(a.weight_kg) * (1 + a.reps / 30) >= Number(b.weight_kg) * (1 + b.reps / 30) ? a : b
                );
                return `${exName(top.exercise_id)} ${fmtKg(Number(top.weight_kg))} × ${top.reps}`;
              })()}
            </p>
          </>
        )}
      </div>
    </>
  );
}
