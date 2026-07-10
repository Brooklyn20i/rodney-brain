import { useEffect, useState } from 'react';
import { render, screen, fireEvent, act, waitFor, cleanup } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
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
    failRemove: false,
    latest: null,
  });
});
afterEach(() => cleanup());

const control = {
  deferInsert: false,
  resolveInsert: [] as Array<() => void>,
  deferInsertMany: false,
  resolveInsertMany: [] as Array<() => void>,
  failInsertMany: false,
  failActivation: false,
  failRemove: false,
  latest: null as CadenceFitnessData | null,
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
    if (opts?.strict && control.failActivation) throw new Error('activation rejected');
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
      <Workout onMenu={() => {}} onNavigate={() => {}} />
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
