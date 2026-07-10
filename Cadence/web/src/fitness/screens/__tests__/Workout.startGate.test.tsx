import { useState } from 'react';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { CadenceFitnessCtx, type Ctx } from '../../lib/store';
import { emptyData, type CadenceFitnessData } from '../../lib/types';
import { Workout } from '../Workout';

// Production-path test: renders the REAL Workout component against a controllable
// context whose workout insert AND set-batch insert are DEFERRED, proving the
// initialization UI stays up — and no add/cardio/finish control renders — from
// the moment the optimistic in_progress row appears until the set batch settles.

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
  control.resolveInsert = [];
  control.resolveInsertMany = [];
});

const control = {
  resolveInsert: [] as Array<() => void>,
  resolveInsertMany: [] as Array<() => void>,
};

function seedData(): CadenceFitnessData {
  const d = emptyData();
  const stamp = { owner_id: 't', created_at: '2026-07-01', updated_at: '2026-07-01', deleted_at: null };
  d.programs.push({ id: 'prog', name: 'Test', description: '', weeks: 4, status: 'active', start_date: '2026-07-01', notes: '', ...stamp } as never);
  d.program_days.push({ id: 'day1', program_id: 'prog', day_order: 1, name: 'Day 1 — Push', focus: 'chest', ...stamp } as never);
  d.exercises.push({ id: 'ex1', name: 'Bench', muscle_group: 'chest', secondary_muscles: '', equipment: 'barbell', tracking: 'strength_weighted', notes: '', ...stamp } as never);
  d.program_exercises.push({ id: 'slot1', program_day_id: 'day1', exercise_id: 'ex1', ex_order: 1, target_sets: 2, rep_min: 5, rep_max: 8, target_rpe: 8, rest_seconds: 120, notes: '', ...stamp } as never);
  return d;
}

function Harness() {
  const [data, setData] = useState<CadenceFitnessData>(seedData);

  const insert = (table: keyof CadenceFitnessData, row: Record<string, unknown>) => {
    const full = { id: (row.id as string) ?? `gen-${Math.random()}`, created_at: '', updated_at: '', deleted_at: null, ...row };
    setData((prev) => ({ ...prev, [table]: [...(prev[table] as unknown[]), full] }));
    // DEFERRED: the optimistic row is already in state, but the promise settles
    // only when the test says so.
    return new Promise((resolve) => control.resolveInsert.push(() => resolve(full)));
  };
  const insertMany = (table: keyof CadenceFitnessData, rows: Record<string, unknown>[]) => {
    const full = rows.map((r, i) => ({ id: `set-${i}`, created_at: '', updated_at: '', deleted_at: null, ...r }));
    setData((prev) => ({ ...prev, [table]: [...(prev[table] as unknown[]), ...full] }));
    return new Promise((resolve) => control.resolveInsertMany.push(() => resolve(full)));
  };
  const update = async (table: keyof CadenceFitnessData, id: string, patch: Record<string, unknown>) => {
    setData((prev) => ({ ...prev, [table]: (prev[table] as Array<{ id: string }>).map((r) => (r.id === id ? { ...r, ...patch } : r)) }));
    return {} as never;
  };
  const remove = async (table: keyof CadenceFitnessData, id: string) => {
    setData((prev) => ({ ...prev, [table]: (prev[table] as Array<{ id: string }>).filter((r) => r.id !== id) }));
  };

  const value = {
    demo: true,
    data,
    insert,
    insertMany,
    update,
    upsert: update,
    remove,
    saving: false,
    syncError: null,
    clearSyncError: () => {},
  } as unknown as Ctx;

  return (
    <CadenceFitnessCtx.Provider value={value}>
      <Workout onMenu={() => {}} onNavigate={() => {}} />
    </CadenceFitnessCtx.Provider>
  );
}

const setupVisible = () => screen.queryByRole('status'); // the cf-callout gate
const finishButtons = () => screen.queryAllByRole('button', { name: /Finish/i });
const setRows = () => document.querySelectorAll('.wo-set-row');

describe('session start initialization gate', () => {
  it('keeps the setup UI (no mutating controls) until the set batch settles', async () => {
    render(<Harness />);

    // Start the day — the workout insert is now in flight (deferred).
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Start' }));
    });

    // Optimistic in_progress row exists, but only the initialization UI shows.
    expect(setupVisible()).toBeTruthy();
    expect(finishButtons()).toHaveLength(0);
    expect(screen.queryByText(/Add an exercise/i)).toBeNull();
    expect(screen.queryByText(/Log cardio/i)).toBeNull();
    expect(setRows()).toHaveLength(0);

    // Resolve the workout insert → seeding proceeds to the set batch (still deferred).
    await act(async () => {
      control.resolveInsert.forEach((r) => r());
      control.resolveInsert = [];
      await Promise.resolve();
    });
    // Set rows now exist optimistically, but the gate still hides them.
    expect(setupVisible()).toBeTruthy();
    expect(finishButtons()).toHaveLength(0);
    expect(setRows()).toHaveLength(0);

    // Resolve the set batch → gate lifts, the interactive session renders.
    await act(async () => {
      control.resolveInsertMany.forEach((r) => r());
      control.resolveInsertMany = [];
      await Promise.resolve();
    });

    await waitFor(() => expect(setupVisible()).toBeNull());
    expect(finishButtons().length).toBeGreaterThan(0);
    expect(setRows()).toHaveLength(2);
  });
});
