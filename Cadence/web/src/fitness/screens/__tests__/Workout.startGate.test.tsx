import { useEffect, useState } from 'react';
import { render, screen, fireEvent, act, waitFor, cleanup } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CadenceFitnessCtx, type Ctx } from '../../lib/store';
import { emptyData, type CadenceFitnessData } from '../../lib/types';
import { loadRestTimer } from '../../lib/restTimerPersistence';
import { Workout } from '../Workout';

// Production-path tests: render the REAL Workout component against a
// controllable context. They prove (1) the atomic-start invariant — an
// interrupted start never surfaces or strands an empty active session, and the
// setup UI holds until the set batch settles — and (2) the rest +30s extension
// persists across a remount.

// jsdom has no matchMedia; Workout reads it for its gym/list default.
beforeEach(() => {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }),
  });
  localStorage.clear();
  Object.assign(control, {
    deferInsert: false,
    resolveInsert: [],
    deferInsertMany: false,
    resolveInsertMany: [],
    failInsertMany: false,
    failActivation: false,
    failCompletion: false,
    failRemove: false,
    latest: null,
    navigations: [],
  });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const control = {
  deferInsert: false,
  resolveInsert: [] as Array<() => void>,
  deferInsertMany: false,
  resolveInsertMany: [] as Array<() => void>,
  failInsertMany: false,
  failActivation: false,
  failCompletion: false,
  failRemove: false,
  latest: null as CadenceFitnessData | null,
  navigations: [] as string[],
};

const STAMP = { owner_id: 't', created_at: '2026-07-01', updated_at: '2026-07-01', deleted_at: null };

function seedStart(): CadenceFitnessData {
  const d = emptyData();
  d.programs.push({ id: 'prog', name: 'Test', description: '', weeks: 4, status: 'active', start_date: '2026-07-01', notes: '', ...STAMP } as never);
  d.program_days.push({ id: 'day1', program_id: 'prog', day_order: 1, name: 'Day 1 — Push', focus: 'chest', ...STAMP } as never);
  d.exercises.push({ id: 'ex1', name: 'Bench', muscle_group: 'chest', secondary_muscles: '', equipment: 'barbell', tracking: 'strength_weighted', notes: '', ...STAMP } as never);
  d.program_exercises.push({ id: 'slot1', program_day_id: 'day1', exercise_id: 'ex1', ex_order: 1, target_sets: 2, rep_min: 5, rep_max: 8, target_rpe: 8, rest_seconds: 120, notes: '', ...STAMP } as never);
  return d;
}

function seedActive(): CadenceFitnessData {
  const d = seedStart();
  d.workouts.push({ id: 'wk', date: '2026-07-01', program_id: 'prog', program_day_id: 'day1', week_number: 1, name: 'Day 1 — Push', status: 'in_progress', started_at: '2026-07-01T06:00:00.000Z', completed_at: null, notes: '', ...STAMP } as never);
  d.workout_sets.push({ id: 's1', workout_id: 'wk', exercise_id: 'ex1', set_number: 1, weight_kg: 100, reps: 0, duration_seconds: 0, rpe: null, is_warmup: false, done: false, ...STAMP } as never);
  return d;
}

function seedActiveCardioOnly(): CadenceFitnessData {
  const d = emptyData();
  d.workouts.push({ id: 'wk', date: '2026-07-01', program_id: null, program_day_id: null, week_number: null, name: 'Ad-hoc session', status: 'in_progress', started_at: '2026-07-01T06:00:00.000Z', completed_at: null, notes: '', ...STAMP } as never);
  d.cardio_sessions.push({ id: 'c1', date: '2026-07-01', workout_id: 'wk', kind: 'run', duration_min: 28, distance_km: 5, avg_hr: 0, calories: 0, notes: '', ...STAMP } as never);
  return d;
}

function seedMetconStart(): CadenceFitnessData {
  const d = emptyData();
  d.programs.push({ id: 'prog', name: 'Test', description: '', weeks: 4, status: 'active', start_date: '2026-07-01', notes: '', ...STAMP } as never);
  d.program_days.push({ id: 'day1', program_id: 'prog', day_order: 1, name: 'Sunday — Weekly High-HR MetCon', focus: 'conditioning', ...STAMP } as never);
  d.exercises.push({ id: 'metcon', name: 'Weekly High-HR MetCon', muscle_group: 'full_body', secondary_muscles: '', equipment: 'ski,rower,dumbbell', tracking: 'cardio_interval', notes: '', ...STAMP } as never);
  d.program_exercises.push({
    id: 'slot-metcon',
    program_day_id: 'day1',
    exercise_id: 'metcon',
    ex_order: 1,
    target_sets: 1,
    rep_min: 0,
    rep_max: 0,
    target_rpe: null,
    rest_seconds: 0,
    tracking_type: 'cardio_interval',
    cardio_kind: 'hiit',
    target_duration_min: 20,
    target_distance_km: 0,
    target_calories: null,
    target_avg_hr: null,
    target_pace: '',
    target_incline: '',
    interval_notes: 'MetCon score: enter rounds/reps or time cap result, plus peak HR if available.',
    notes: '20-min AMRAP: 250m ski + 10 burpees + 250m row.',
    ...STAMP,
  } as never);
  return d;
}

function Harness({ seed }: { seed: () => CadenceFitnessData }) {
  const [data, setData] = useState<CadenceFitnessData>(seed);
  // Expose the latest committed data to the test (in an effect, not during
  // render, to satisfy the no-mutation-in-render lint rule).
  useEffect(() => {
    control.latest = data;
  }, [data]);

  const insert = (table: keyof CadenceFitnessData, row: Record<string, unknown>) => {
    const full = { id: (row.id as string) ?? `gen-${Math.random()}`, created_at: '', updated_at: '', deleted_at: null, ...row };
    setData((prev) => ({ ...prev, [table]: [...(prev[table] as unknown[]), full] }));
    if (control.deferInsert) return new Promise((resolve) => control.resolveInsert.push(() => resolve(full)));
    return Promise.resolve(full);
  };
  const insertMany = (table: keyof CadenceFitnessData, rows: Record<string, unknown>[]) => {
    if (control.failInsertMany) return Promise.reject(new Error('set batch failed'));
    const full = rows.map((r, i) => ({ id: `set-${i}`, created_at: '', updated_at: '', deleted_at: null, ...r }));
    setData((prev) => ({ ...prev, [table]: [...(prev[table] as unknown[]), ...full] }));
    if (control.deferInsertMany) return new Promise((resolve) => control.resolveInsertMany.push(() => resolve(full)));
    return Promise.resolve(full);
  };
  const update = async (
    table: keyof CadenceFitnessData,
    id: string,
    patch: Record<string, unknown>,
    opts?: { strict?: boolean }
  ) => {
    // Mirror the real store's STRICT semantics: a failed strict write throws and
    // does NOT apply the optimistic change (so a rejected activation can't leave
    // a false `in_progress` locally).
    if (opts?.strict && table === 'workouts' && patch.status === 'in_progress' && control.failActivation) throw new Error('activation rejected');
    if (opts?.strict && table === 'workouts' && patch.status === 'completed' && control.failCompletion) throw new Error('completion rejected');
    setData((prev) => ({ ...prev, [table]: (prev[table] as Array<{ id: string }>).map((r) => (r.id === id ? { ...r, ...patch } : r)) }));
    return {} as never;
  };
  const remove = async (table: keyof CadenceFitnessData, id: string) => {
    if (control.failRemove) throw new Error('cleanup failed');
    setData((prev) => ({ ...prev, [table]: (prev[table] as Array<{ id: string }>).filter((r) => r.id !== id) }));
  };

  const value = { demo: true, data, insert, insertMany, update, upsert: update, remove, saving: false, syncError: null, clearSyncError: () => {} } as unknown as Ctx;
  return (
    <CadenceFitnessCtx.Provider value={value}>
      <Workout onMenu={() => {}} onNavigate={(id) => control.navigations.push(id)} />
    </CadenceFitnessCtx.Provider>
  );
}

const setupVisible = () => screen.queryByRole('status'); // the cf-callout gate
const finishButtons = () => screen.queryAllByRole('button', { name: /Finish/i });
const setRows = () => document.querySelectorAll('.wo-set-row');
const startButton = () => screen.queryByRole('button', { name: 'Start' });
const activeWorkouts = () => (control.latest?.workouts ?? []).filter((w) => w.status === 'in_progress');
const anyWorkouts = () => control.latest?.workouts ?? [];

describe('session start initialization gate', () => {
  it('keeps the setup UI (no mutating controls) until the set batch settles', async () => {
    control.deferInsert = true;
    control.deferInsertMany = true;
    render(<Harness seed={seedStart} />);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Start' }));
    });

    // Workout is still `initializing` (not surfaced); only the setup UI shows.
    expect(setupVisible()).toBeTruthy();
    expect(finishButtons()).toHaveLength(0);
    expect(screen.queryByText(/Add an exercise/i)).toBeNull();
    expect(screen.queryByText(/Log cardio/i)).toBeNull();
    expect(setRows()).toHaveLength(0);
    expect(activeWorkouts()).toHaveLength(0); // never an active empty session

    // Resolve the workout insert → seeding proceeds to the set batch (deferred).
    await act(async () => {
      control.resolveInsert.forEach((r) => r());
      control.resolveInsert = [];
      await Promise.resolve();
    });
    expect(setupVisible()).toBeTruthy();
    expect(setRows()).toHaveLength(0);
    expect(activeWorkouts()).toHaveLength(0);

    // Resolve the set batch → activation flips to in_progress and the gate lifts.
    await act(async () => {
      control.resolveInsertMany.forEach((r) => r());
      control.resolveInsertMany = [];
      await Promise.resolve();
    });

    await waitFor(() => expect(setupVisible()).toBeNull());
    expect(finishButtons().length).toBeGreaterThan(0);
    expect(setRows()).toHaveLength(2);
    expect(activeWorkouts()).toHaveLength(1);
  });

  it('rolls back and never surfaces an active session when the set batch fails', async () => {
    control.failInsertMany = true;
    render(<Harness seed={seedStart} />);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Start' }));
      await Promise.resolve();
    });

    await waitFor(() => expect(startButton()).toBeTruthy()); // back on the start screen
    expect(setupVisible()).toBeNull();
    expect(activeWorkouts()).toHaveLength(0);
    expect(anyWorkouts()).toHaveLength(0); // rolled back entirely
  });

  it('never surfaces a false active session when the server rejects activation', async () => {
    // The set batch lands, but the strict activation write (initializing →
    // in_progress) is rejected by the server. The store swallows normal writes,
    // so activation MUST be strict/throwing — otherwise the gate would lift on a
    // false success while the server row stays `initializing`.
    control.failActivation = true;
    render(<Harness seed={seedStart} />);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Start' }));
      await Promise.resolve();
    });

    await waitFor(() => expect(startButton()).toBeTruthy());
    expect(setupVisible()).toBeNull();
    expect(activeWorkouts()).toHaveLength(0); // no false active session
    // Rolled back after the failed activation (remove succeeds here).
    expect(anyWorkouts()).toHaveLength(0);
  });

  it('leaves no active session even if cleanup also fails (stranded row stays invisible)', async () => {
    control.failInsertMany = true;
    control.failRemove = true;
    render(<Harness seed={seedStart} />);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Start' }));
      await Promise.resolve();
    });

    await waitFor(() => expect(startButton()).toBeTruthy());
    expect(setupVisible()).toBeNull();
    // The workout could not be removed, but it is still `initializing` — invisible
    // everywhere, so NO empty active session is surfaced.
    expect(activeWorkouts()).toHaveLength(0);
    const stranded = anyWorkouts();
    expect(stranded).toHaveLength(1);
    expect(stranded[0].status).toBe('initializing');
  });
});

describe('MetCon programme logging', () => {
  it('starts a MetCon day without fake strength set rows and records HIIT cardio outcome', async () => {
    render(<Harness seed={seedMetconStart} />);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Start' }));
      await Promise.resolve();
    });

    await waitFor(() => expect(activeWorkouts()).toHaveLength(1));
    expect(setRows()).toHaveLength(0);
    expect(screen.getByText('Programmed cardio')).toBeTruthy();
    expect(screen.getAllByText('Weekly High-HR MetCon').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/MetCon score/i)).toBeTruthy();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Record outcome/i }));
      await Promise.resolve();
    });

    await waitFor(() => expect(control.latest?.cardio_sessions).toHaveLength(1));
    const logged = control.latest!.cardio_sessions[0];
    expect(logged.workout_id).toBe(activeWorkouts()[0].id);
    expect(logged.kind).toBe('hiit');
    expect(Number(logged.duration_min)).toBe(20);
    expect(logged.notes).toContain('MetCon score');
    expect(screen.getByText(/Score \/ rounds \/ reps \/ peak HR \/ notes/i)).toBeTruthy();
  });
});

describe('rest timer +30s persistence', () => {
  const REST_KEY = 'cadence-fitness:rest-timer';
  const snapshot = () => JSON.parse(localStorage.getItem(REST_KEY) as string);

  it('persists the extended deadline so it survives a remount', async () => {
    render(<Harness seed={seedActive} />);

    // Tick the set → rest starts (slot rest = 120s) and is persisted.
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /set 1, mark done/i }));
    });
    const before = snapshot();
    expect(before.total).toBe(120);

    // +30s must persist the NEW absolute deadline + total, not just memory.
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '+30s' }));
    });
    const after = snapshot();
    expect(after.endsAt - before.endsAt).toBe(30_000);
    expect(after.total).toBe(150);

    // A remount restores from the extended deadline (not the original 120s).
    const restored = loadRestTimer(localStorage, 'wk', Date.now());
    expect(restored?.endsAt).toBe(after.endsAt);
    expect(restored?.total).toBe(150);

    cleanup();
    render(<Harness seed={seedActive} />);
    await waitFor(() => expect(document.querySelector('.rest-timer-time')).toBeTruthy());
    const [m, s] = (document.querySelector('.rest-timer-time')!.textContent || '0:0').split(':').map(Number);
    expect(m * 60 + s).toBeGreaterThan(120); // the +30 survived the remount
  });
});

describe('set persistence state', () => {
  it('clears typed set drafts once ticking the set saves them', async () => {
    render(<Harness seed={seedActive} />);

    await act(async () => {
      fireEvent.change(screen.getByRole('spinbutton', { name: /Bench, set 1, reps/i }), { target: { value: '8' } });
      fireEvent.click(screen.getByRole('button', { name: /Bench, set 1, mark done/i }));
      await Promise.resolve();
    });

    await waitFor(() => expect(control.latest?.workout_sets[0].reps).toBe(8));
    await waitFor(() => expect(localStorage.getItem('cadence-fitness:workout-drafts')).toBeNull());
  });

  it('clamps negative typed weights on blur before saving', async () => {
    render(<Harness seed={seedActive} />);

    await act(async () => {
      const weight = screen.getByRole('spinbutton', { name: /Bench, set 1, weight in kilograms/i });
      fireEvent.change(weight, { target: { value: '-20' } });
      fireEvent.blur(weight);
      await Promise.resolve();
    });

    await waitFor(() => expect(Number(control.latest?.workout_sets[0].weight_kg)).toBe(0));
  });

  it('finishes cardio-only sessions without calling them empty', async () => {
    const confirm = vi.spyOn(window, 'confirm');
    render(<Harness seed={seedActiveCardioOnly} />);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /^Finish$/i }));
      await Promise.resolve();
    });

    await waitFor(() => expect(control.latest?.workouts[0].status).toBe('completed'));
    expect(confirm).not.toHaveBeenCalled();
    expect(control.navigations).toContain('history');
  });

  it('keeps the workout open with a recoverable message if completion is rejected', async () => {
    control.failCompletion = true;
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<Harness seed={seedActiveCardioOnly} />);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /^Finish$/i }));
      await Promise.resolve();
    });

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/Couldn't finish yet/i));
    expect(control.latest?.workouts[0].status).toBe('in_progress');
    expect(control.navigations).toEqual([]);
  });

  it('does not mutate set rows when the final completion gate is rejected', async () => {
    control.failCompletion = true;
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<Harness seed={seedActive} />);

    await act(async () => {
      fireEvent.change(screen.getByRole('spinbutton', { name: /Bench, set 1, reps/i }), { target: { value: '8' } });
      fireEvent.click(screen.getByRole('button', { name: /^Finish$/i }));
      await Promise.resolve();
    });

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/Couldn't finish yet/i));
    expect(control.latest?.workouts[0].status).toBe('in_progress');
    expect(control.latest?.workout_sets).toHaveLength(1);
    expect(control.latest?.workout_sets[0].done).toBe(false);
    expect(control.latest?.workout_sets[0].reps).toBe(0);
    expect(control.navigations).toEqual([]);
  });

  it('associates cardio form labels with their inputs', async () => {
    render(<Harness seed={seedActiveCardioOnly} />);

    expect(screen.getByLabelText(/Duration \(min\)/i)).toBeTruthy();
    expect(screen.getByLabelText(/Distance \(km\)/i)).toBeTruthy();
    expect(screen.getByLabelText(/Calories/i)).toBeTruthy();
    expect(screen.getByLabelText(/Avg HR/i)).toBeTruthy();
  });

  it('mutes rest-complete sound and persists the setting', async () => {
    render(<Harness seed={seedActive} />);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Bench, set 1, mark done/i }));
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Sound on/i }));
    });

    expect(localStorage.getItem('cadence-fitness:rest-cue-muted')).toBe('1');
    expect(screen.getByRole('button', { name: /Sound off/i }).getAttribute('aria-pressed')).toBe('true');
  });

  it('makes expired rest show whether the previous set has unsaved edits', async () => {
    vi.useFakeTimers();
    render(<Harness seed={seedActive} />);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Bench, set 1, mark done/i }));
      await Promise.resolve();
    });
    await act(async () => {
      fireEvent.change(screen.getByRole('spinbutton', { name: /Bench, set 1, reps/i }), { target: { value: '9' } });
    });
    await act(async () => {
      vi.advanceTimersByTime(121_000);
    });

    expect(screen.getByText(/Set has unsaved edits/i)).toBeTruthy();
    expect(screen.getByRole('button', { name: /Save set/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Discard edits/i })).toBeTruthy();
  });

  it('restores long-expired rest state after mobile resume instead of hiding stranded set edits', async () => {
    const now = Date.now();
    localStorage.setItem(
      'cadence-fitness:rest-timer',
      JSON.stringify({ workoutId: 'wk', endsAt: now - 31_000, total: 120, completedSetId: 's1' })
    );
    localStorage.setItem(
      'cadence-fitness:workout-drafts',
      JSON.stringify({ workoutId: 'wk', drafts: { s1: { reps: '9' } } })
    );

    render(<Harness seed={seedActive} />);

    await waitFor(() => expect(screen.getByText(/Set has unsaved edits/i)).toBeTruthy());
    expect(screen.getByText('GO')).toBeTruthy();
  });
});
