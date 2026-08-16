import { useEffect, useState } from 'react';
import { render, screen, fireEvent, act, waitFor, cleanup } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CadenceFitnessCtx, type Ctx } from '../../lib/store';
import { emptyData, type CadenceFitnessData } from '../../lib/types';
import { Workout } from '../Workout';

// Gym-session resilience: the exact ways real workouts broke on a phone —
// a cold reload booting into the Start screen mid-session, duplicate/stale
// open sessions, the focus position resetting, and the auto-advance yanking
// the card away mid-rest. Renders the REAL Workout screen.

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
  control.latest = null;
});
afterEach(cleanup);

const control = { latest: null as CadenceFitnessData | null };
const STAMP = { owner_id: 't', created_at: '2026-07-01', updated_at: '2026-07-01', deleted_at: null };
const TODAY = new Date().toISOString().slice(0, 10);
const YESTERDAY = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);

// Two-exercise program day: Bench (2 sets, 120s rest) then Squat (1 set).
function seedTwoExercises(): CadenceFitnessData {
  const d = emptyData();
  d.programs.push({ id: 'prog', name: 'Test', description: '', weeks: 4, status: 'active', start_date: '2026-07-01', notes: '', ...STAMP } as never);
  d.program_days.push({ id: 'day1', program_id: 'prog', day_order: 1, name: 'Day 1 — Push', focus: 'chest', ...STAMP } as never);
  d.exercises.push(
    { id: 'ex1', name: 'Bench', muscle_group: 'chest', secondary_muscles: '', equipment: 'barbell', tracking: 'strength_weighted', notes: '', ...STAMP } as never,
    { id: 'ex2', name: 'Squat', muscle_group: 'legs', secondary_muscles: '', equipment: 'barbell', tracking: 'strength_weighted', notes: '', ...STAMP } as never
  );
  d.program_exercises.push(
    { id: 'slot1', program_day_id: 'day1', exercise_id: 'ex1', ex_order: 1, target_sets: 2, rep_min: 5, rep_max: 8, target_rpe: 8, rest_seconds: 120, notes: '', ...STAMP } as never,
    { id: 'slot2', program_day_id: 'day1', exercise_id: 'ex2', ex_order: 2, target_sets: 1, rep_min: 5, rep_max: 8, target_rpe: 8, rest_seconds: 120, notes: '', ...STAMP } as never
  );
  d.workouts.push({ id: 'wk', date: TODAY, program_id: 'prog', program_day_id: 'day1', week_number: 1, name: 'Day 1 — Push', status: 'in_progress', started_at: new Date().toISOString(), completed_at: null, notes: '', ...STAMP } as never);
  d.workout_sets.push(
    { id: 's1', workout_id: 'wk', exercise_id: 'ex1', set_number: 1, weight_kg: 100, reps: 5, duration_seconds: 0, rpe: null, is_warmup: false, done: false, ...STAMP } as never,
    { id: 's2', workout_id: 'wk', exercise_id: 'ex1', set_number: 2, weight_kg: 100, reps: 5, duration_seconds: 0, rpe: null, is_warmup: false, done: false, ...STAMP } as never,
    { id: 's3', workout_id: 'wk', exercise_id: 'ex2', set_number: 1, weight_kg: 140, reps: 5, duration_seconds: 0, rpe: null, is_warmup: false, done: false, ...STAMP } as never
  );
  return d;
}

function Harness({ seed, ready = true }: { seed: () => CadenceFitnessData; ready?: boolean }) {
  const [data, setData] = useState<CadenceFitnessData>(seed);
  useEffect(() => {
    control.latest = data;
  }, [data]);
  const insert = (table: keyof CadenceFitnessData, row: Record<string, unknown>) => {
    const full = { id: (row.id as string) ?? `gen-${Math.random()}`, created_at: '', updated_at: '', deleted_at: null, ...row };
    setData((prev) => ({ ...prev, [table]: [...(prev[table] as unknown[]), full] }));
    return Promise.resolve(full);
  };
  const insertMany = (table: keyof CadenceFitnessData, rows: Record<string, unknown>[]) => {
    const full = rows.map((r, i) => ({ id: `set-${i}`, created_at: '', updated_at: '', deleted_at: null, ...r }));
    setData((prev) => ({ ...prev, [table]: [...(prev[table] as unknown[]), ...full] }));
    return Promise.resolve(full);
  };
  const update = async (table: keyof CadenceFitnessData, id: string, patch: Record<string, unknown>) => {
    setData((prev) => ({ ...prev, [table]: (prev[table] as Array<{ id: string }>).map((r) => (r.id === id ? { ...r, ...patch } : r)) }));
    return {} as never;
  };
  const remove = async (table: keyof CadenceFitnessData, id: string) => {
    setData((prev) => ({ ...prev, [table]: (prev[table] as Array<{ id: string }>).filter((r) => r.id !== id) }));
  };
  const value = { demo: true, data, insert, insertMany, update, upsert: update, remove, saving: false, syncError: null, clearSyncError: () => {}, pendingCount: 0, ready } as unknown as Ctx;
  return (
    <CadenceFitnessCtx.Provider value={value}>
      <Workout onMenu={() => {}} onNavigate={() => {}} />
    </CadenceFitnessCtx.Provider>
  );
}

const openWorkouts = () => (control.latest?.workouts ?? []).filter((w) => w.status === 'in_progress');

describe('boot gate', () => {
  it('never shows the Start screen before the first snapshot lands', () => {
    render(<Harness seed={emptyData} ready={false} />);
    expect(screen.getByText(/Restoring your session/i)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Start' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Start empty session' })).toBeNull();
  });
});

describe('session self-heal', () => {
  it('closes yesterday’s forgotten session with its trained sets, so today starts clean', async () => {
    const seed = () => {
      const d = seedTwoExercises();
      d.workouts[0].date = YESTERDAY;
      d.workout_sets[0].done = true; // one set was actually trained
      return d;
    };
    render(<Harness seed={seed} />);
    await waitFor(() => expect(openWorkouts()).toHaveLength(0));
    const healed = control.latest!.workouts.find((w) => w.id === 'wk')!;
    expect(healed.status).toBe('completed'); // history kept, not deleted
    expect(healed.completed_at).toBeTruthy();
    // Back on the start screen for a fresh day.
    await waitFor(() => expect(screen.getByRole('button', { name: 'Start' })).toBeTruthy());
  });

  it('discards a stale session in which nothing was trained', async () => {
    const seed = () => {
      const d = seedTwoExercises();
      d.workouts[0].date = YESTERDAY; // no sets done
      return d;
    };
    render(<Harness seed={seed} />);
    await waitFor(() => expect(control.latest!.workouts).toHaveLength(0));
    expect(control.latest!.workout_sets).toHaveLength(0);
  });

  it('resolves duplicate open sessions to the newest; an empty older twin is discarded', async () => {
    const seed = () => {
      const d = seedTwoExercises();
      // A phantom duplicate started from a stale boot screen, 10 min earlier.
      d.workouts.push({ id: 'dupe', date: TODAY, program_id: null, program_day_id: null, week_number: null, name: 'Ad-hoc session', status: 'in_progress', started_at: new Date(Date.now() - 600_000).toISOString(), completed_at: null, notes: '', ...STAMP } as never);
      return d;
    };
    render(<Harness seed={seed} />);
    await waitFor(() => expect(openWorkouts()).toHaveLength(1));
    expect(openWorkouts()[0].id).toBe('wk'); // the session with his sets survives
    expect(control.latest!.workouts.find((w) => w.id === 'dupe')).toBeUndefined();
  });

  it('sweeps a long-stranded initializing row', async () => {
    const seed = () => {
      const d = seedTwoExercises();
      d.workouts[0].status = 'initializing' as never;
      d.workouts[0].started_at = new Date(Date.now() - 2 * 3600_000).toISOString();
      return d;
    };
    render(<Harness seed={seed} />);
    await waitFor(() => expect(control.latest!.workouts).toHaveLength(0));
  });
});

describe('focus position survives interruptions', () => {
  it('restores the focused exercise for the same session after a remount', async () => {
    localStorage.setItem('cadence-fitness:gym-mode', '1');
    localStorage.setItem('cadence-fitness:gym-focus-idx', JSON.stringify({ workoutId: 'wk', index: 1 }));
    render(<Harness seed={seedTwoExercises} />);
    // Straight back on Squat (exercise 2), not dumped to exercise 1.
    await waitFor(() => expect(screen.getByText(/Exercise/).textContent).toContain('2'));
    expect(document.querySelector('.wo-exercise-name')!.textContent).toBe('Squat');
  });

  it('ignores a stored position that belongs to a different session', async () => {
    localStorage.setItem('cadence-fitness:gym-mode', '1');
    localStorage.setItem('cadence-fitness:gym-focus-idx', JSON.stringify({ workoutId: 'other', index: 1 }));
    render(<Harness seed={seedTwoExercises} />);
    await waitFor(() => expect(document.querySelector('.wo-exercise-name')!.textContent).toBe('Bench'));
  });

  it('the Focus/List choice is sticky across sessions', async () => {
    localStorage.setItem('cadence-fitness:gym-mode', '0');
    render(<Harness seed={seedTwoExercises} />);
    await waitFor(() => expect(screen.getByRole('button', { name: /Focus/ })).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: /Focus/ }));
    expect(localStorage.getItem('cadence-fitness:gym-mode')).toBe('1');
  });
});

describe('focus-mode glide waits for rest', () => {
  it('finishing an exercise mid-rest stays put; acknowledging the rest bar advances', async () => {
    localStorage.setItem('cadence-fitness:gym-mode', '1');
    render(<Harness seed={seedTwoExercises} />);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Bench, set 1, mark done/i }));
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Bench, set 2, mark done/i }));
    });

    // Rest is counting down — the card must NOT be yanked away under a finger.
    expect(document.querySelector('.wo-exercise-name')!.textContent).toBe('Bench');
    expect(document.querySelector('.rest-timer')).toBeTruthy();

    // Skip (or Done after GO) acknowledges the rest — NOW we glide to Squat.
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /^Skip$/i }));
    });
    await waitFor(() => expect(document.querySelector('.wo-exercise-name')!.textContent).toBe('Squat'));
  });

  it('the Next button names the next exercise', async () => {
    localStorage.setItem('cadence-fitness:gym-mode', '1');
    render(<Harness seed={seedTwoExercises} />);
    expect(screen.getByRole('button', { name: /Next: Squat/ })).toBeTruthy();
  });

  it('ticking a set drops keyboard focus (no field left for iOS shake-to-undo)', async () => {
    localStorage.setItem('cadence-fitness:gym-mode', '1');
    render(<Harness seed={seedTwoExercises} />);

    const reps = screen.getByRole('spinbutton', { name: /Bench, set 1, reps/i });
    reps.focus();
    fireEvent.change(reps, { target: { value: '8' } });
    expect(document.activeElement).toBe(reps);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Bench, set 1, mark done/i }));
    });
    // The tick ends the typing turn — nothing may keep first-responder status,
    // or a phone bump ("shake") pops iOS's Undo Typing dialog mid-workout.
    expect(document.activeElement).not.toBe(reps);
  });

  it('un-ticking cancels a queued glide', async () => {
    localStorage.setItem('cadence-fitness:gym-mode', '1');
    render(<Harness seed={seedTwoExercises} />);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Bench, set 1, mark done/i }));
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Bench, set 2, mark done/i }));
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Bench, set 2, mark not done/i }));
    });
    // Rest stopped, glide cancelled — still on Bench with no timer.
    expect(document.querySelector('.rest-timer')).toBeNull();
    expect(document.querySelector('.wo-exercise-name')!.textContent).toBe('Bench');
  });
});
