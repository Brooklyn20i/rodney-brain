import { useEffect, useMemo, useRef, useState } from 'react';
import { useCadenceFitness } from '../lib/store';
import { ScreenHeader, Card } from '../components/bits';
import { programPosition, lastSetsForExercise } from '../lib/fitnessCalc';
import { fmtDayShort, fmtKg, stripDayPrefix, todayISO } from '../lib/util';
import {
  cardioKindForName,
  isBodyweightTracking,
  isCardioTracking,
  isTimedTracking,
  setDuration,
  slotDestination,
  slotTracking,
} from '../lib/tracking';
import { setGymFocusOrientationActive } from '../lib/orientation';
import { planRestOnComplete } from '../lib/restTimerState';
import { applyStep, shouldCarryWeight } from '../lib/setStepper';
import { elapsedMsSince, formatElapsed } from '../lib/elapsedClock';
import { finishConfirmMessage, summariseFinish } from '../lib/finishGuard';
import { createWakeLock } from '../lib/wakeLock';
import { saveStatusLabel } from '../lib/saveStatus';
import { useRestTimer } from '../lib/useRestTimer';
import { useSetDrafts } from '../lib/useSetDrafts';
import { useKeyedLocks } from '../lib/useKeyedLocks';
import { draftPatch, draftTouched, foldDuration, foldReps, foldWeight, hasDraftValue } from '../lib/setDraftFold';
import { RestBar } from '../components/workout/RestBar';
import { GymProgress } from '../components/workout/GymProgress';
import { ExerciseCard } from '../components/workout/ExerciseCard';
import { AddExercisePicker } from '../components/workout/AddExercisePicker';
import { CardioBlock } from '../components/workout/CardioBlock';
import { WorkoutStart } from '../components/workout/WorkoutStart';
import type { CardioKind, ProgramDay, WorkoutSet } from '../lib/types';

// Guided gym mode: start today's program day (or an ad-hoc session), tick off
// sets with weight/reps, see what you did last time, and run a rest timer.
// On a phone it opens in full-screen focus mode (one exercise at a time, big
// touch targets) like Whoop / MacroFactor; a List toggle shows everything.
//
// This file is the ORCHESTRATOR: session lifecycle (start/finish/discard) and
// the write actions (tick, step, commit, carry-forward). The pieces live in
// focused modules — useRestTimer (countdown machine), useSetDrafts (typed
// drafts + stepper overlay), setDraftFold (the one draft-over-row fold rule),
// and components/workout/* (presentational blocks).
// Default rest for exercises without a program slot (ad-hoc sessions).
const REST_DEFAULT_KEY = 'cadence-fitness:rest-default';

export function Workout({ onMenu, onNavigate }: { onMenu: () => void; onNavigate: (id: string) => void }) {
  const { data, insert, insertMany, update, remove, saving, syncError } = useCadenceFitness();
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
  // The whole Workout screen is landscape-capable — not just an active Gym
  // Focus session. Otherwise the rotate guard intercepts the Start button when
  // the phone is already sideways, and you can't begin a session in landscape.
  useEffect(() => {
    setGymFocusOrientationActive(true);
    return () => setGymFocusOrientationActive(false);
  }, []);

  // Keep the screen awake during an active Gym Focus session so the phone
  // doesn't dim/lock between sets. Feature-detected; a no-op where unsupported.
  const wakeLockRef = useRef(createWakeLock());
  const gymSessionActive = Boolean(active && gymMode);
  useEffect(() => {
    const wl = wakeLockRef.current;
    if (!gymSessionActive) {
      void wl.release();
      return;
    }
    void wl.request();
    const onVisible = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') void wl.request();
    };
    if (typeof document !== 'undefined') document.addEventListener('visibilitychange', onVisible);
    return () => {
      if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', onVisible);
      void wl.release();
    };
  }, [gymSessionActive]);

  // Rest countdown machine (chime, mute, persistence). Its 1s tick also drives
  // the live elapsed clock in the header.
  const rest = useRestTimer(active?.id);

  const sessionSets = useMemo(
    () => (active ? data.workout_sets.filter((s) => s.workout_id === active.id) : []),
    [data.workout_sets, active]
  );
  const sessionCardio = useMemo(
    () => (active ? data.cardio_sessions.filter((c) => c.workout_id === active.id) : []),
    [data.cardio_sessions, active]
  );

  // Typed drafts + rapid-tap stepper overlay (overlay → draft → stored).
  const sd = useSetDrafts(active?.id, sessionSets);

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

  const inSessionIds = useMemo(() => new Set(sessionSets.map((s) => s.exercise_id)), [sessionSets]);

  // Keep the focused index in range as exercises are added/removed.
  useEffect(() => {
    setFocusIndex((i) => Math.min(i, Math.max(0, exerciseIds.length - 1)));
  }, [exerciseIds.length]);

  const exName = (exerciseId: string) => data.exercises.find((e) => e.id === exerciseId)?.name || 'Exercise';
  // How a given exercise is logged (weight×reps / bodyweight reps / timed hold).
  const trackingFor = (exerciseId: string) =>
    slotTracking(
      daySlots.find((s) => s.exercise_id === exerciseId),
      data.exercises.find((e) => e.id === exerciseId)
    );

  // Serialise the heavy lifecycle actions (start / finish / discard) so a rapid
  // double-tap can't kick off two sessions, two completions or two deletes. The
  // ref guards re-entry synchronously; the state disables the buttons.
  const actionLock = useRef(false);
  const [pendingAction, setPendingAction] = useState<'start' | 'finish' | 'discard' | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const runGuarded = async (kind: 'start' | 'finish' | 'discard', fn: () => Promise<void>) => {
    if (actionLock.current) return;
    actionLock.current = true;
    setPendingAction(kind);
    setActionError(null);
    try {
      await fn();
    } catch {
      // The store already surfaces write failures via `syncError`; swallow here
      // so an un-awaited onClick handler can't raise an unhandled rejection.
      setActionError(
        kind === 'finish'
          ? "Couldn't finish yet. Your workout is still open; check connection and try Finish again."
          : kind === 'start'
            ? "Couldn't start the workout. Check connection and try again."
            : "Couldn't discard the workout. Check connection and try again."
      );
    } finally {
      actionLock.current = false;
      setPendingAction(null);
    }
  };

  // Per-row dedupe for the frequent mutations (add set, tick a set, add
  // exercise); a same-tick double-tap can never insert a duplicate row.
  const { runLocked, isBusy } = useKeyedLocks();

  // ── Start a session ─────────────────────────────────────────────────────
  const startSession = (day: ProgramDay | null) => runGuarded('start', () => beginSession(day));
  // `startingId` gates the active UI while a session is being seeded, so a
  // half-populated set list never becomes interactive. Cleared when the session
  // is fully created (or rolled back on failure).
  const [startingId, setStartingId] = useState<string | null>(null);
  const beginSession = async (day: ProgramDay | null) => {
    // Production-atomic start. The workout row and its set rows are two writes,
    // so we stage: insert the workout as `initializing` (a status NO screen
    // surfaces — every reader filters for in_progress/completed), write the set
    // batch, then flip to `in_progress` (activation). An interruption anywhere
    // before activation leaves at most an invisible `initializing` row, never a
    // stranded empty active session; a failure rolls it back best-effort, and
    // even if that cleanup fails the row stays invisible. `pendingAction ===
    // 'start'` gates the UI throughout so nothing interactive renders mid-seed.
    const newWorkoutId = crypto.randomUUID();
    setStartingId(newWorkoutId);
    try {
      const pos = activeProgram ? programPosition(activeProgram, data.program_days, data.workouts) : null;
      await insert('workouts', {
        id: newWorkoutId,
        date: today,
        program_id: day ? day.program_id : null,
        program_day_id: day ? day.id : null,
        week_number: pos?.week ?? null,
        name: day ? stripDayPrefix(day.name) : 'Ad-hoc session',
        status: 'initializing',
        started_at: new Date().toISOString(),
        completed_at: null,
        notes: '',
      } as never);
      if (day) {
        const slots = data.program_exercises
          .filter((s) => s.program_day_id === day.id)
          .sort((a, b) => a.ex_order - b.ex_order);
        // Build every set row up front, then insert them in ONE atomic batch.
        const rows: Partial<WorkoutSet>[] = [];
        for (const slot of slots) {
          const exercise = data.exercises.find((e) => e.id === slot.exercise_id);
          if (slotDestination(slot, exercise) === 'cardio_sessions') {
            // Cardio programme slots are planned work, not completed outcomes.
            // Do not create a cardio_sessions row until Rodney records the run/ride.
            continue;
          }
          const last = lastSetsForExercise(data.workout_sets, data.workouts, slot.exercise_id, newWorkoutId);
          for (let n = 1; n <= slot.target_sets; n++) {
            const lastSet = last?.sets[Math.min(n - 1, (last?.sets.length ?? 1) - 1)];
            rows.push({
              workout_id: newWorkoutId,
              exercise_id: slot.exercise_id,
              set_number: n,
              weight_kg: lastSet ? Number(lastSet.weight_kg) : 0,
              reps: 0,
              duration_seconds: lastSet ? setDuration(lastSet) : 0,
              rpe: null,
              is_warmup: false,
              done: false,
            } as Partial<WorkoutSet>);
          }
        }
        if (rows.length) await insertMany('workout_sets', rows);
      }
      // Activation: only now does the session become visible/active. STRICT so
      // the flip to `in_progress` is applied locally ONLY after the server
      // acknowledges — otherwise a swallowed activation failure would present a
      // false active session while the server row stays `initializing`.
      await update('workouts', newWorkoutId, { status: 'in_progress' } as never, { strict: true });
      setFocusIndex(0);
    } catch (err) {
      // Seeding failed → best-effort rollback. The workout is still
      // `initializing` (never surfaced), so even a failed remove can't strand a
      // visible empty session.
      await remove('workouts', newWorkoutId);
      throw err;
    } finally {
      setStartingId(null);
    }
  };

  // ── Set mutations ───────────────────────────────────────────────────────
  // Straight-set carry-forward. Changing the FIRST set's load moves the sibling
  // sets that are still just inherited (blank, or still equal to the previous
  // load) to the new weight — you rarely change load between straight sets, so
  // this saves re-typing it. A done row, or one you deliberately set to a
  // different weight, is never clobbered. Reads the live overlay so a burst of
  // taps cascades correctly.
  const carryForwardWeight = async (set: WorkoutSet, prevWeight: number, newWeight: number) => {
    if (newWeight <= 0) return;
    const siblings = sessionSets.filter((s) => s.exercise_id === set.exercise_id);
    const firstNum = Math.min(...siblings.map((s) => s.set_number));
    if (set.set_number !== firstNum) return;
    for (const s of siblings) {
      if (s.id === set.id || s.done) continue;
      if (!shouldCarryWeight(sd.liveWeight(s), prevWeight, newWeight)) continue;
      sd.notePendingStep(s.id, 'weight', newWeight);
      await update('workout_sets', s.id, { weight_kg: newWeight });
    }
  };

  const commitSet = async (set: WorkoutSet, extra?: Partial<WorkoutSet>) => {
    const d = sd.draftFor(set.id);
    const hadDraft = hasDraftValue(d);
    const prevWeight = Number(set.weight_kg) || 0;
    const patch: Partial<WorkoutSet> = { ...extra, ...draftPatch(d) };
    if (Object.keys(patch).length) await update('workout_sets', set.id, patch);
    if (patch.weight_kg !== undefined) {
      sd.notePendingStep(set.id, 'weight', patch.weight_kg);
      await carryForwardWeight(set, prevWeight, patch.weight_kg);
    }
    if (hadDraft) sd.clearSetDraft(set.id);
  };

  // One-handed steppers: read the LIVE value (pending overlay → draft → stored),
  // apply the step, record the new intent in the overlay so rapid taps stack,
  // then write through and drop the draft so the row shows the committed value.
  const stepWeight = async (set: WorkoutSet, delta: number) => {
    const prev = sd.liveWeight(set);
    const next = applyStep(prev, delta, { min: 0, round: 2 });
    sd.notePendingStep(set.id, 'weight', next);
    sd.setDraftField(set.id, 'weight', undefined);
    await update('workout_sets', set.id, { weight_kg: next });
    await carryForwardWeight(set, prev, next);
  };
  const stepReps = async (set: WorkoutSet, delta: number) => {
    const next = applyStep(sd.liveReps(set), delta, { min: 0, round: 0 });
    sd.notePendingStep(set.id, 'reps', next);
    sd.setDraftField(set.id, 'reps', undefined);
    await update('workout_sets', set.id, { reps: next });
  };
  const stepDuration = async (set: WorkoutSet, delta: number) => {
    const next = applyStep(sd.liveDuration(set), delta, { min: 0, round: 0 });
    sd.notePendingStep(set.id, 'dur', next);
    sd.setDraftField(set.id, 'dur', undefined);
    await update('workout_sets', set.id, { duration_seconds: next });
  };

  const toggleSet = (set: WorkoutSet) =>
    runLocked(`toggle:${set.id}`, async () => {
      const done = !set.done;
      // This runs inside a tap (user gesture) — the one place we're allowed to
      // unlock audio for the later, timer-driven chime.
      rest.primeAudio();
      // Anchor the rest timer to the TAP, before any awaited network write, so a
      // slow save/carry-forward doesn't delay the countdown. Zero/disabled rest
      // starts nothing (no bar, no GO, no chime/vibrate).
      if (done) {
        const slot = daySlots.find((s) => s.exercise_id === set.exercise_id);
        const plan = planRestOnComplete(slot?.rest_seconds, restDefault);
        if (plan.start) rest.startRest(plan.seconds, set.id);
        else rest.stopRest();
      } else {
        // Un-ticked by mistake → the rest you started for it no longer applies.
        rest.stopRest();
      }
      await commitSet(set, { done });
      if (done) {
        // In focus mode, glide to the next exercise once this one's sets are all done.
        const others = sessionSets.filter((x) => x.exercise_id === set.exercise_id && x.id !== set.id);
        if (gymMode && others.length > 0 && others.every((x) => x.done)) {
          const idx = exerciseIds.indexOf(set.exercise_id);
          if (idx >= 0 && idx < exerciseIds.length - 1) setFocusIndex(idx + 1);
        }
      }
    });

  const addSet = (exerciseId: string) =>
    runLocked(`addset:${exerciseId}`, async () => {
      // Read the freshest sibling list at execution time (the lock guarantees no
      // two adds interleave), so the next set_number is never duplicated.
      const existing = sessionSets.filter((s) => s.exercise_id === exerciseId);
      const nextNumber = existing.reduce((max, s) => Math.max(max, s.set_number), 0) + 1;
      const lastRow = existing.sort((a, b) => a.set_number - b.set_number)[existing.length - 1];
      await insert('workout_sets', {
        workout_id: active!.id,
        exercise_id: exerciseId,
        set_number: nextNumber,
        weight_kg: lastRow ? Number(lastRow.weight_kg) : 0,
        reps: 0,
        duration_seconds: lastRow ? setDuration(lastRow) : 0,
        rpe: null,
        is_warmup: false,
        done: false,
      });
    });

  // Cardio-typed picks redirect to the Cardio block, pre-opened with the kind.
  const [cardioPrefill, setCardioPrefill] = useState<CardioKind | null>(null);
  const addExerciseById = async (exId: string) => {
    if (!active) return;
    const exercise = data.exercises.find((e) => e.id === exId);
    if (exercise && isCardioTracking(slotTracking(null, exercise))) {
      setCardioPrefill(cardioKindForName(exercise.name));
      return;
    }
    // Deduped so a double-tap can't seed the movement twice. Already in the
    // session -> tack on one set. New -> seed from the last time it was trained
    // (weights + set count carry forward) in ONE atomic batch.
    await runLocked(`addex:${exId}`, async () => {
      if (sessionSets.some((s) => s.exercise_id === exId)) {
        await addSet(exId);
      } else {
        const last = lastSetsForExercise(data.workout_sets, data.workouts, exId, active.id);
        const count = last?.sets.length || 1;
        const rows = Array.from({ length: count }, (_, i) => {
          const n = i + 1;
          const lastSet = last?.sets[Math.min(n - 1, (last?.sets.length ?? 1) - 1)];
          return {
            workout_id: active.id,
            exercise_id: exId,
            set_number: n,
            weight_kg: lastSet ? Number(lastSet.weight_kg) : 0,
            reps: 0,
            duration_seconds: lastSet ? setDuration(lastSet) : 0,
            rpe: null,
            is_warmup: false,
            done: false,
          };
        });
        await insertMany('workout_sets', rows as never);
      }
    });
  };

  // ── Finish / discard ────────────────────────────────────────────────────
  const finishSession = () => runGuarded('finish', doFinishSession);
  const doFinishSession = async () => {
    if (!active) return;
    // Warn before ending an incomplete session so a stray tap can't silently
    // finish with 0/16 done (and log nothing). Counts are draft-aware, using
    // the same fold rule as the fold-in pass below.
    const finishRows = sessionSets.map((s) => {
      const d = sd.draftFor(s.id);
      const value = isTimedTracking(trackingFor(s.exercise_id)) ? foldDuration(s, d) : foldReps(s, d);
      return { done: s.done, value };
    });
    const loggedCardio = sessionCardio.filter((c) => Number(c.duration_min) > 0 || Number(c.distance_km) > 0 || Number(c.calories) > 0).length;
    const confirmMessage = finishConfirmMessage(summariseFinish(finishRows, loggedCardio));
    if (confirmMessage && !window.confirm(confirmMessage)) return;
    // First pass the server-acknowledged completion gate. If this fails, leave
    // the still-open workout exactly as-is so retry does not lose planned rows.
    await update('workouts', active.id, { status: 'completed', completed_at: new Date().toISOString() }, { strict: true });
    // Fold in any weight/reps typed but not yet blurred, then decide each set's
    // fate from its EFFECTIVE reps (draft beats stored). A set you filled in but
    // forgot to tick still counts as trained — that was the "did 12, logged 11"
    // bug. Only genuinely empty target rows (no reps) are dropped.
    for (const s of sessionSets) {
      const d = sd.draftFor(s.id);
      const reps = foldReps(s, d);
      const weight = foldWeight(s, d);
      const dur = foldDuration(s, d);
      const tracking = trackingFor(s.exercise_id);
      const touched = draftTouched(d);
      // A timed hold counts if it has a hold time; everything else if it has
      // reps. A genuinely empty target row (no value) is dropped.
      const value = isTimedTracking(tracking) ? dur : reps;
      if (value > 0) {
        if (!s.done || touched) {
          const patch: Partial<WorkoutSet> =
            isTimedTracking(tracking)
              ? { done: true, duration_seconds: dur }
              : isBodyweightTracking(tracking)
                ? { done: true, reps }
                : { done: true, reps, weight_kg: weight };
          await update('workout_sets', s.id, patch);
        }
      } else if (!s.done) {
        await remove('workout_sets', s.id);
      }
    }
    rest.stopRest();
    sd.resetAll();
    onNavigate('history');
  };

  const discardSession = () => runGuarded('discard', doDiscardSession);
  const doDiscardSession = async () => {
    if (!active) return;
    if (!window.confirm('Discard this session and all its sets?')) return;
    for (const s of sessionSets) await remove('workout_sets', s.id);
    for (const c of sessionCardio) await remove('cardio_sessions', c.id);
    await remove('workouts', active.id);
    rest.stopRest();
    sd.resetAll();
  };

  // Session initialization gate. While a session is being seeded the workout is
  // still `initializing` (so `active` is undefined) — show a non-interactive
  // setup state, never the start screen or a half-populated session, until the
  // set batch has landed and the workout is activated. Gated on the lifecycle
  // 'start' action and (once active) the pre-generated startingId, so no
  // mutating control can render mid-seed.
  if (pendingAction === 'start' || (active && startingId === active.id)) {
    return (
      <>
        <ScreenHeader title="Workout" subtitle="Setting up your session…" onMenu={onMenu} />
        <div className="screen-content">
          <div className="cf-callout" role="status" aria-live="polite">
            Setting up your session…
          </div>
        </div>
      </>
    );
  }

  // ── Render: no active session -> start view ─────────────────────────────
  if (!active) {
    return <WorkoutStart onMenu={onMenu} activeProgram={activeProgram} onStart={startSession} onSwitchProgram={switchProgram} />;
  }

  // ── Render: active session ───────────────────────────────────────────────
  const renderExercise = (exerciseId: string, big: boolean) => {
    const rows = sessionSets
      .filter((s) => s.exercise_id === exerciseId)
      .sort((a, b) => a.set_number - b.set_number);
    const slot = daySlots.find((s) => s.exercise_id === exerciseId);
    return (
      <ExerciseCard
        key={exerciseId}
        exerciseId={exerciseId}
        name={exName(exerciseId)}
        big={big}
        rows={rows}
        slot={slot}
        tracking={trackingFor(exerciseId)}
        activeWorkoutId={active.id}
        restSeconds={slot ? slot.rest_seconds : restDefault}
        restPickerOpen={restPickerFor === exerciseId}
        onToggleRestPicker={() => setRestPickerFor(restPickerFor === exerciseId ? null : exerciseId)}
        onPickRest={async (s) => {
          if (slot) await update('program_exercises', slot.id, { rest_seconds: s });
          else changeRestDefault(s);
          setRestPickerFor(null);
        }}
        addSetBusy={isBusy(`addset:${exerciseId}`)}
        onAddSet={() => addSet(exerciseId)}
        draftFor={sd.draftFor}
        onDraftChange={sd.setDraftField}
        onCommit={commitSet}
        onStepWeight={stepWeight}
        onStepReps={stepReps}
        onStepDuration={stepDuration}
        onToggle={toggleSet}
      />
    );
  };

  const addExerciseControl = (wrap: 'card' | 'plain') => (
    <AddExercisePicker
      wrap={wrap}
      exercises={data.exercises}
      inSessionIds={inSessionIds}
      isBusy={(id) => isBusy(`addex:${id}`)}
      onAdd={addExerciseById}
    />
  );

  const cardioBlock = (
    <CardioBlock active={active} daySlots={daySlots} prefillKind={cardioPrefill} onPrefillConsumed={() => setCardioPrefill(null)} />
  );

  // Live, compact elapsed clock (m:ss → h:mm:ss). useRestTimer's 1s tick
  // re-renders this so it visibly advances, instead of "0 min" for a minute.
  const elapsedClock = formatElapsed(elapsedMsSince(active.started_at, Date.now()));
  const doneCount = sessionSets.filter((s) => s.done).length;
  const summary = [
    elapsedClock,
    sessionSets.length ? `${doneCount}/${sessionSets.length} sets` : null,
    sessionCardio.length ? `${sessionCardio.length} cardio` : null,
  ].filter(Boolean);
  if (summary.length === 1) summary.push('0 sets'); // nothing logged yet
  const allSetsDone = (exerciseId: string) => {
    const rows = sessionSets.filter((s) => s.exercise_id === exerciseId);
    return rows.length > 0 && rows.every((s) => s.done);
  };
  const idx = Math.min(focusIndex, Math.max(0, exerciseIds.length - 1));

  const restSet = rest.restSetId ? sessionSets.find((s) => s.id === rest.restSetId) : null;
  const restSetHasUnsavedDraft = restSet ? sd.setHasDraft(restSet.id) : false;
  const completeRest = () =>
    restSet && restSetHasUnsavedDraft
      ? runLocked(`rest-done:${restSet.id}`, async () => {
          await commitSet(restSet);
          rest.stopRest();
        })
      : rest.stopRest();
  const restBar = rest.restLeft !== null && (
    <RestBar
      restLeft={rest.restLeft}
      restPct={rest.restPct}
      hasRestSet={Boolean(restSet)}
      hasUnsavedDraft={restSetHasUnsavedDraft}
      muted={rest.restCueMuted}
      onToggleMuted={() => rest.changeRestCueMuted(!rest.restCueMuted)}
      onExtend={() => rest.extendRest(30)}
      onDiscardEdits={() => restSet && sd.clearSetDraft(restSet.id)}
      onComplete={completeRest}
    />
  );

  return (
    <>
      <ScreenHeader
        title={stripDayPrefix(active.name || 'Session')}
        subtitle={`${fmtDayShort(active.date)} · ${summary.join(' · ')} · ${saveStatusLabel(saving, Boolean(syncError))}`}
        onMenu={onMenu}
      >
        <button className="btn btn-secondary btn-sm" onClick={() => setGymMode((g) => !g)}>
          {gymMode ? '☰ List' : '⛶ Focus'}
        </button>
        <button className="btn btn-primary" onClick={finishSession} disabled={pendingAction !== null}>
          {pendingAction === 'finish' ? 'Finishing…' : 'Finish'}
        </button>
      </ScreenHeader>

      <div className={`screen-content ${gymMode ? 'gym-mode' : ''}`}>
        {actionError && <div className="cf-callout cf-callout-warn" role="alert">{actionError}</div>}
        {/* List mode keeps the timer at the top; Gym Focus docks it at the
            bottom with the nav so it never buries the exercise card. */}
        {!gymMode && restBar}

        {gymMode ? (
          exerciseIds.length === 0 ? (
            <>
              <div className="cf-callout">No exercises in this session yet — add one, or log a run below.</div>
              {addExerciseControl('card')}
              {cardioBlock}
              {restBar && <div className="gym-dock">{restBar}</div>}
            </>
          ) : (
            <>
              <GymProgress exerciseIds={exerciseIds} idx={idx} nameFor={exName} completeFor={allSetsDone} onFocus={setFocusIndex} />
              {renderExercise(exerciseIds[idx], true)}
              {addExerciseControl('plain')}
              {cardioBlock}
              <button className="btn btn-ghost btn-sm wo-discard" onClick={discardSession} disabled={pendingAction !== null}>
                Discard session
              </button>
              {/* Docked footer: the rest timer (when running) sits right above
                  always-reachable Prev/Next — nothing to scroll for mid-set,
                  nothing cut off by the home indicator. */}
              <div className="gym-dock">
                {restBar}
                <div className="gym-nav">
                  <button className="btn btn-secondary" disabled={idx === 0} onClick={() => setFocusIndex(idx - 1)}>
                    ← Prev
                  </button>
                  {idx < exerciseIds.length - 1 ? (
                    <button className="btn btn-primary" onClick={() => setFocusIndex(idx + 1)}>
                      Next →
                    </button>
                  ) : (
                    <button className="btn btn-primary" onClick={finishSession} disabled={pendingAction !== null}>
                      {pendingAction === 'finish' ? 'Finishing…' : 'Finish ✓'}
                    </button>
                  )}
                </div>
              </div>
            </>
          )
        ) : (
          <>
            {exerciseIds.map((exerciseId) => renderExercise(exerciseId, false))}
            {addExerciseControl('card')}
            {cardioBlock}
            <Card title="Session notes">
              <textarea
                defaultValue={active.notes}
                placeholder="How did it go?"
                onBlur={(e) => update('workouts', active.id, { notes: e.target.value })}
              />
            </Card>
            <button className="btn btn-ghost btn-sm wo-discard" onClick={discardSession} disabled={pendingAction !== null}>
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
