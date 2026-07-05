import { useEffect, useMemo, useRef, useState } from 'react';
import { useCadenceFitness } from '../lib/store';
import { ScreenHeader, Card, Tag } from '../components/bits';
import { programPosition, lastSetsForExercise, nextProgramDay } from '../lib/fitnessCalc';
import { fmtDayShort, fmtKg, stripDayPrefix, todayISO } from '../lib/util';
import type { ProgramDay, WorkoutSet } from '../lib/types';

// Guided gym mode: start today's program day (or an ad-hoc session), tick off
// sets with weight/reps, see what you did last time, and run a rest timer.
// On a phone it opens in full-screen focus mode (one exercise at a time, big
// touch targets) like Whoop / MacroFactor; a List toggle shows everything.
// Default rest for exercises without a program slot (ad-hoc sessions).
const REST_DEFAULT_KEY = 'cadence-fitness:rest-default';
const REST_PRESETS = [60, 90, 120, 180, 300];
const fmtRest = (s: number) => (s % 60 === 0 ? `${s / 60}m` : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`);

export function Workout({ onMenu, onNavigate }: { onMenu: () => void; onNavigate: (id: string) => void }) {
  const { data, insert, update, remove, saving } = useCadenceFitness();
  const today = todayISO();

  const active = data.workouts.find((w) => w.status === 'in_progress');
  const activeProgram = data.programs.find((p) => p.status === 'active');

  // Rest default for slot-less exercises; user-adjustable, persisted locally.
  const [restDefault, setRestDefault] = useState(() => Number(localStorage.getItem(REST_DEFAULT_KEY)) || 120);
  const changeRestDefault = (s: number) => {
    setRestDefault(s);
    localStorage.setItem(REST_DEFAULT_KEY, String(s));
  };
  // Which exercise's rest picker is open (exercise id or null).
  const [restPickerFor, setRestPickerFor] = useState<string | null>(null);

  // Switch the running program without touching the others' history: the
  // previous active program goes back to draft (NOT archived), so you can
  // flip between programs at any time.
  const switchProgram = async (programId: string) => {
    const target = data.programs.find((p) => p.id === programId);
    if (!target || target.status === 'active') return;
    for (const other of data.programs.filter((x) => x.status === 'active' && x.id !== programId)) {
      await update('programs', other.id, { status: 'draft' });
    }
    await update('programs', programId, { status: 'active', start_date: target.start_date || today });
  };

  // Focus (gym) mode: default on for phones, off on desktop. Toggleable.
  const [gymMode, setGymMode] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(max-width: 768px)').matches
  );
  const [focusIndex, setFocusIndex] = useState(0);

  // ── Rest-finished chime ───────────────────────────────────────────────────
  // A short ping when rest ends, so you can look away from the phone. Built on
  // Web Audio with an "ambient" session so on iOS it MIXES over a podcast/music
  // instead of pausing it. The context must be created/resumed inside a user
  // gesture (a set tap), so we prime it there; by the time the timer fires it's
  // already unlocked and the chime just plays.
  const audioCtxRef = useRef<AudioContext | null>(null);
  const primeAudio = () => {
    if (typeof window === 'undefined') return null;
    try {
      if (!audioCtxRef.current) {
        const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!Ctx) return null;
        // ambient = don't interrupt other audio, obey the mute switch.
        const anyNav = navigator as unknown as { audioSession?: { type: string } };
        if (anyNav.audioSession) anyNav.audioSession.type = 'ambient';
        audioCtxRef.current = new Ctx();
      }
      if (audioCtxRef.current.state === 'suspended') void audioCtxRef.current.resume();
      return audioCtxRef.current;
    } catch {
      return null;
    }
  };
  const chime = () => {
    const ctx = primeAudio();
    if (!ctx) return;
    const now = ctx.currentTime;
    // Two quick rising pings — distinct from a notification, easy over audio.
    [ [0, 880], [0.16, 1175] ].forEach(([t, freq]) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, now + t);
      gain.gain.exponentialRampToValueAtTime(0.25, now + t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + t + 0.15);
      osc.connect(gain).connect(ctx.destination);
      osc.start(now + t);
      osc.stop(now + t + 0.16);
    });
  };

  // ── Rest timer ──────────────────────────────────────────────────────────
  const [restLeft, setRestLeft] = useState<number | null>(null);
  const [restTotal, setRestTotal] = useState(0);
  const restEndsAt = useRef<number | null>(null);
  const chimedRef = useRef(false);
  const [, forceTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => {
      forceTick((x) => x + 1); // drives the elapsed-time display too
      if (restEndsAt.current !== null) {
        const left = Math.round((restEndsAt.current - Date.now()) / 1000);
        setRestLeft(left);
        if (left <= 0 && !chimedRef.current) {
          chimedRef.current = true;
          chime();
          if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate([120, 60, 120]);
        }
        if (left <= -30) {
          restEndsAt.current = null;
          setRestLeft(null);
        }
      }
    }, 1000);
    return () => clearInterval(t);
    // chime is stable enough for this once-mounted interval; deps intentionally empty.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const startRest = (seconds: number) => {
    restEndsAt.current = Date.now() + seconds * 1000;
    chimedRef.current = false;
    setRestTotal(seconds);
    setRestLeft(seconds);
  };
  const stopRest = () => {
    restEndsAt.current = null;
    chimedRef.current = false;
    setRestLeft(null);
  };

  // Local input drafts so typing doesn't hit Supabase per keystroke.
  const [drafts, setDrafts] = useState<Record<string, { weight?: string; reps?: string }>>({});

  const exName = (exerciseId: string) => data.exercises.find((e) => e.id === exerciseId)?.name || 'Exercise';

  // ── Start a session ─────────────────────────────────────────────────────
  const startSession = async (day: ProgramDay | null) => {
    const pos = activeProgram ? programPosition(activeProgram, data.program_days, data.workouts) : null;
    const workout = await insert('workouts', {
      date: today,
      program_id: day ? day.program_id : null,
      program_day_id: day ? day.id : null,
      week_number: pos?.week ?? null,
      name: day ? stripDayPrefix(day.name) : 'Ad-hoc session',
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

  // Entering a weight on an exercise's FIRST set carries it down to the sets
  // below that are still blank — you rarely change load between straight sets,
  // so this saves re-typing it three times. Only fills sets that are still 0 and
  // not yet done, so it never clobbers a weight you deliberately set.
  const propagateWeightToBlanks = async (set: WorkoutSet, weight: number) => {
    if (weight <= 0) return;
    const siblings = sessionSets.filter((s) => s.exercise_id === set.exercise_id);
    const firstNum = Math.min(...siblings.map((s) => s.set_number));
    if (set.set_number !== firstNum) return;
    for (const s of siblings) {
      if (s.id === set.id || s.done) continue;
      const draftWeight = drafts[s.id]?.weight;
      const cur = draftWeight !== undefined ? Number(draftWeight) || 0 : Number(s.weight_kg) || 0;
      if (cur > 0) continue;
      await update('workout_sets', s.id, { weight_kg: weight });
    }
  };

  const commitSet = async (set: WorkoutSet, extra?: Partial<WorkoutSet>) => {
    const d = drafts[set.id] || {};
    const patch: Partial<WorkoutSet> = { ...extra };
    if (d.weight !== undefined) patch.weight_kg = Number(d.weight) || 0;
    if (d.reps !== undefined) patch.reps = Math.max(0, Math.round(Number(d.reps) || 0));
    if (Object.keys(patch).length) await update('workout_sets', set.id, patch);
    if (patch.weight_kg !== undefined) await propagateWeightToBlanks(set, patch.weight_kg);
  };

  // One-handed steppers: read draft-or-stored, apply the step, write through
  // immediately and drop the draft so the row shows the committed value.
  const stepWeight = async (set: WorkoutSet, delta: number) => {
    const d = drafts[set.id] || {};
    const cur = d.weight !== undefined ? Number(d.weight) || 0 : Number(set.weight_kg) || 0;
    const next = Math.max(0, Math.round((cur + delta) * 100) / 100);
    setDrafts((p) => ({ ...p, [set.id]: { ...p[set.id], weight: undefined } }));
    await update('workout_sets', set.id, { weight_kg: next });
    await propagateWeightToBlanks(set, next);
  };
  const stepReps = async (set: WorkoutSet, delta: number) => {
    const d = drafts[set.id] || {};
    const cur = d.reps !== undefined ? Math.round(Number(d.reps)) || 0 : set.reps || 0;
    const next = Math.max(0, cur + delta);
    setDrafts((p) => ({ ...p, [set.id]: { ...p[set.id], reps: undefined } }));
    await update('workout_sets', set.id, { reps: next });
  };

  const toggleSet = async (set: WorkoutSet) => {
    const done = !set.done;
    // This runs inside a tap (user gesture) — the one place we're allowed to
    // unlock audio for the later, timer-driven chime.
    primeAudio();
    await commitSet(set, { done });
    if (done) {
      const slot = daySlots.find((s) => s.exercise_id === set.exercise_id);
      startRest(slot?.rest_seconds ?? restDefault);
      // In focus mode, glide to the next exercise once this one's sets are all done.
      const others = sessionSets.filter((x) => x.exercise_id === set.exercise_id && x.id !== set.id);
      if (gymMode && others.length > 0 && others.every((x) => x.done)) {
        const idx = exerciseIds.indexOf(set.exercise_id);
        if (idx >= 0 && idx < exerciseIds.length - 1) setFocusIndex(idx + 1);
      }
    } else {
      // Un-ticked by mistake → the rest you started for it no longer applies.
      stopRest();
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
  const [exSearch, setExSearch] = useState('');
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
    setExSearch('');
  };

  const finishSession = async () => {
    if (!active) return;
    // Fold in any weight/reps typed but not yet blurred, then decide each set's
    // fate from its EFFECTIVE reps (draft beats stored). A set you filled in but
    // forgot to tick still counts as trained — that was the "did 12, logged 11"
    // bug. Only genuinely empty target rows (no reps) are dropped.
    for (const s of sessionSets) {
      const d = drafts[s.id] || {};
      const reps = d.reps !== undefined ? Math.max(0, Math.round(Number(d.reps) || 0)) : s.reps;
      const weight = d.weight !== undefined ? Number(d.weight) || 0 : Number(s.weight_kg) || 0;
      if (reps > 0) {
        if (!s.done || d.weight !== undefined || d.reps !== undefined) {
          await update('workout_sets', s.id, { done: true, reps, weight_kg: weight });
        }
      } else if (!s.done) {
        await remove('workout_sets', s.id);
      }
    }
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
    const pos = activeProgram ? programPosition(activeProgram, data.program_days, data.workouts) : null;
    const switchable = data.programs.filter((p) => p.status === 'draft' || p.status === 'active');

    return (
      <>
        <ScreenHeader title="Workout" subtitle="Start today's session." onMenu={onMenu} />
        <div className="screen-content">
          {switchable.length > 1 && (
            <div className="wo-program-switch">
              <label className="field" style={{ margin: 0 }}>
                Program
              </label>
              <select value={activeProgram?.id ?? ''} onChange={(e) => e.target.value && switchProgram(e.target.value)}>
                {!activeProgram && <option value="">Choose…</option>}
                {switchable.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
          )}
          {activeProgram ? (
            <>
              <Card
                title={activeProgram.name}
                actions={pos ? <Tag label={`Cycle ${pos.cycle} · Week ${pos.week}/${activeProgram.weeks}`} tone="info" /> : undefined}
              >
                {suggested && (
                  <div className="cf-callout">
                    Up next: <strong>{stripDayPrefix(suggested.name)}</strong>
                    {suggested.focus ? ` — ${suggested.focus}` : ''}
                    <div style={{ marginTop: 10 }}>
                      <button className="btn btn-primary" onClick={() => startSession(suggested)}>
                        ▶ Start {stripDayPrefix(suggested.name)}
                      </button>
                    </div>
                  </div>
                )}
                {days.map((d) => (
                  <div key={d.id} className="pick-row">
                    <div className="pick-main">
                      <div className="pick-title">{stripDayPrefix(d.name)}</div>
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
          <button
            className="wo-chip wo-chip-btn"
            onClick={() => setRestPickerFor(restPickerFor === exerciseId ? null : exerciseId)}
            aria-expanded={restPickerFor === exerciseId}
          >
            Rest {fmtRest(slot ? slot.rest_seconds : restDefault)} ▾
          </button>
          <span className="wo-chip wo-chip-last">
            {last
              ? `Last ${fmtDayShort(last.date)}: ${last.sets
                  .map((s) => `${Number(s.weight_kg)}×${s.reps}`)
                  .join(', ')}`
              : 'First time'}
          </span>
        </div>
        {restPickerFor === exerciseId && (
          <div className="wo-rest-picker">
            {REST_PRESETS.map((s) => (
              <button
                key={s}
                className={`cd-dur ${(slot ? slot.rest_seconds : restDefault) === s ? 'active' : ''}`}
                onClick={async () => {
                  if (slot) await update('program_exercises', slot.id, { rest_seconds: s });
                  else changeRestDefault(s);
                  setRestPickerFor(null);
                }}
              >
                {fmtRest(s)}
              </button>
            ))}
            <span className="wo-rest-note">{slot ? 'Saved to this exercise in your program' : 'Default for ad-hoc exercises'}</span>
          </div>
        )}
        <div className={`wo-set-labels ${big ? 'gym' : ''}`}>
          <span>Set</span>
          <span style={{ textAlign: 'center' }}>Weight (kg)</span>
          <span style={{ textAlign: 'center' }}>Reps</span>
          <span aria-hidden="true"> </span>
        </div>
        {rows.map((s) => {
          const d = drafts[s.id] || {};
          const weightField = (
            <input
              type="number"
              inputMode="decimal"
              step="0.5"
              value={d.weight ?? (Number(s.weight_kg) || '')}
              placeholder="0"
              onChange={(e) => setDrafts((p) => ({ ...p, [s.id]: { ...p[s.id], weight: e.target.value } }))}
              onBlur={() => commitSet(s)}
              onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
            />
          );
          const repsField = (
            <input
              type="number"
              inputMode="numeric"
              value={d.reps ?? (s.reps || '')}
              placeholder={slot ? `${slot.rep_min}–${slot.rep_max}` : '—'}
              onChange={(e) => setDrafts((p) => ({ ...p, [s.id]: { ...p[s.id], reps: e.target.value } }))}
              onBlur={() => commitSet(s)}
              onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
            />
          );
          return (
            <div key={s.id} className={`wo-set-row ${big ? 'gym' : ''} ${s.done ? 'wo-set-done' : ''}`}>
              <span className="wo-set-num">{s.set_number}</span>
              {big ? (
                <>
                  <div className="wo-step-group">
                    <button className="wo-step" aria-label="Weight down 2.5kg" onClick={() => stepWeight(s, -2.5)}>
                      −
                    </button>
                    {weightField}
                    <button className="wo-step" aria-label="Weight up 2.5kg" onClick={() => stepWeight(s, 2.5)}>
                      +
                    </button>
                  </div>
                  <div className="wo-step-group">
                    <button className="wo-step" aria-label="One rep fewer" onClick={() => stepReps(s, -1)}>
                      −
                    </button>
                    {repsField}
                    <button className="wo-step" aria-label="One rep more" onClick={() => stepReps(s, 1)}>
                      +
                    </button>
                  </div>
                </>
              ) : (
                <>
                  {weightField}
                  {repsField}
                </>
              )}
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
    const q = exSearch.trim().toLowerCase();
    const matches = q
      ? [...data.exercises]
          .filter((e) => e.name.toLowerCase().includes(q) || e.muscle_group.includes(q))
          .sort((a, b) => a.name.localeCompare(b.name))
          .slice(0, 8)
      : [];
    const control = (
      <div className="wo-add-ex">
        <input
          type="search"
          value={exSearch}
          placeholder="Search exercises… e.g. incline press"
          onChange={(e) => {
            setExSearch(e.target.value);
            setAddExId('');
          }}
        />
        {q && matches.length === 0 && (
          <p style={{ fontSize: 12, color: 'var(--text2)', margin: '6px 0 0' }}>
            No match — add it on the Exercises screen first.
          </p>
        )}
        {matches.map((e) => (
          <button
            key={e.id}
            className="wo-add-ex-row"
            onClick={() => {
              setAddExId(e.id);
              setExSearch(e.name);
            }}
            aria-pressed={addExId === e.id}
          >
            <span>{e.name}</span>
            <span className="wo-add-ex-meta">
              {e.muscle_group.replace('_', ' ')}
              {sessionSets.some((s) => s.exercise_id === e.id) ? ' · in session' : ''}
            </span>
          </button>
        ))}
        {addExId && (
          <button className="btn btn-primary" style={{ marginTop: 8 }} onClick={addExercise}>
            Add to session
          </button>
        )}
      </div>
    );
    if (wrap === 'plain') {
      return (
        <details className="gym-add">
          <summary>+ Add an exercise to this session</summary>
          <div className="gym-add-body">{control}</div>
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
        {restLeft > 0 && (
          <button
            className="rest-timer-skip"
            onClick={() => {
              restEndsAt.current = (restEndsAt.current ?? Date.now()) + 30_000;
              setRestTotal((t) => t + 30);
              setRestLeft((l) => (l ?? 0) + 30);
            }}
          >
            +30s
          </button>
        )}
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
        title={stripDayPrefix(active.name || 'Session')}
        subtitle={`${fmtDayShort(active.date)} · ${elapsedMin} min · ${doneCount}/${sessionSets.length} sets · ${saving ? 'saving…' : 'saved ✓'}`}
        onMenu={onMenu}
      >
        <button className="btn btn-secondary btn-sm" onClick={() => setGymMode((g) => !g)}>
          {gymMode ? '☰ List' : '⛶ Focus'}
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
              <button className="btn btn-ghost btn-sm wo-discard" onClick={discardSession}>
                Discard session
              </button>
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
            <button className="btn btn-ghost btn-sm wo-discard" onClick={discardSession}>
              Discard session
            </button>
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
