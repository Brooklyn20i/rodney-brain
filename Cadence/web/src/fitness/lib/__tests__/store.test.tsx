/**
 * Fitness store write-path tests — the fitness store has DELIBERATELY different
 * write semantics from Work/Financial (optimistic-add-first, non-throwing
 * updates so a flaky gym-wifi save can't spam the error banner, upsert that
 * revives a soft-deleted day). These pin that behaviour so a future "cleanup"
 * doesn't silently change the gym-mode contract. Renders the REAL provider
 * against a mock Supabase.
 */
import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';

const h = vi.hoisted(() => ({
  writeResults: [] as Array<{ data: unknown; error: unknown }>,
  lastWritePayload: null as Record<string, unknown> | null,
  session: null as unknown,
}));

vi.mock('../../../lib/supabase', () => {
  const makeBuilder = () => {
    const b: Record<string, unknown> = {};
    // capture the payload passed to insert/update/upsert for assertions
    for (const m of ['insert', 'update', 'upsert']) {
      b[m] = (payload: Record<string, unknown>) => {
        h.lastWritePayload = payload;
        return b;
      };
    }
    for (const m of ['from', 'select', 'eq', 'is', 'order', 'delete']) b[m] = () => b;
    b.single = () => Promise.resolve(h.writeResults.shift() ?? { data: null, error: null });
    b.then = (onF: (v: { data: unknown[]; error: null }) => unknown) =>
      Promise.resolve({ data: [], error: null }).then(onF);
    return b;
  };
  const channel = { on: () => channel, subscribe: () => channel };
  return {
    supabase: {
      schema: () => makeBuilder(),
      channel: () => channel,
      removeChannel: () => {},
      auth: {
        getSession: () => Promise.resolve({ data: { session: h.session } }),
        onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
      },
    },
  };
});

import { CadenceFitnessProvider, useCadenceFitness } from '../store';

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <CadenceFitnessProvider>{children}</CadenceFitnessProvider>
);

beforeEach(() => {
  h.writeResults = [];
  h.lastWritePayload = null;
  h.session = null;
});

describe('CadenceFitnessProvider write path', () => {
  it('insert is optimistic then reconciles to the server row', async () => {
    const { result } = renderHook(() => useCadenceFitness(), { wrapper });
    h.writeResults.push({ data: { id: 'srv', name: 'Bench', muscle_group: 'chest' }, error: null });
    await act(async () => {
      await result.current.insert('exercises', { name: 'Bench', muscle_group: 'chest' } as never);
    });
    const ex = result.current.data.exercises as Array<{ id: string }>;
    expect(ex).toHaveLength(1);
    expect(ex[0].id).toBe('srv');
  });

  it('insert failure removes the optimistic row and surfaces a syncError', async () => {
    const { result } = renderHook(() => useCadenceFitness(), { wrapper });
    h.writeResults.push({ data: null, error: { code: '42501', message: 'permission denied' } });
    await act(async () => {
      await expect(result.current.insert('exercises', { name: 'X', muscle_group: 'back' } as never)).rejects.toBeTruthy();
    });
    expect((result.current.data.exercises as unknown[])).toHaveLength(0);
    expect(result.current.syncError).toBeTruthy();
  });

  it('update does NOT throw on failure and keeps the optimistic change (gym-flow contract)', async () => {
    const { result } = renderHook(() => useCadenceFitness(), { wrapper });
    // seed a row
    h.writeResults.push({ data: { id: 'w1', reps: 5 }, error: null });
    await act(async () => {
      await result.current.insert('workout_sets', { reps: 5 } as never);
    });
    // failing update must resolve (not reject) and leave the optimistic value showing
    h.writeResults.push({ data: null, error: { code: '42501', message: 'nope' } });
    await act(async () => {
      const ret = await result.current.update('workout_sets', 'w1', { reps: 8 } as never);
      expect(ret).toBeTruthy(); // resolved, not thrown
    });
    expect((result.current.data.workout_sets as Array<{ reps: number }>)[0].reps).toBe(8);
    expect(result.current.syncError).toBeTruthy();
  });

  it('upsert writes deleted_at=null so a re-saved day revives a soft-deleted row', async () => {
    const { result } = renderHook(() => useCadenceFitness(), { wrapper });
    h.writeResults.push({ data: { id: 'bm', date: '2026-07-01', weight_kg: 80 }, error: null });
    await act(async () => {
      await result.current.upsert('body_metrics', { date: '2026-07-01', weight_kg: 80 } as never, 'owner_id,date');
    });
    expect(h.lastWritePayload).toBeTruthy();
    expect(h.lastWritePayload).toHaveProperty('deleted_at', null);
  });

  it('exposes a saving flag and demo=false', async () => {
    const { result } = renderHook(() => useCadenceFitness(), { wrapper });
    expect(result.current.demo).toBe(false);
    expect(typeof result.current.saving).toBe('boolean');
  });
});
