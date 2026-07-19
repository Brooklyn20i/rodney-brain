/**
 * Fitness store write-path tests — the fitness store has DELIBERATELY different
 * write semantics from Work/Financial (optimistic-add-first, non-throwing
 * updates so a flaky gym-wifi save can't spam the error banner, upsert that
 * revives a soft-deleted day). These pin that behaviour so a future "cleanup"
 * doesn't silently change the gym-mode contract. Renders the REAL provider
 * against a mock Supabase.
 */
import { renderHook, act, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';

type WriteResult = { data: unknown; error: unknown };
const h = vi.hoisted(() => ({
  writeResults: [] as Array<WriteResult>,
  lastWritePayload: null as Record<string, unknown> | null,
  session: null as unknown,
  // Ordered log of every insert/update/upsert the store issued — proves writes
  // are serialized in issue order.
  calls: [] as Array<{ method: string; payload: unknown }>,
  // When true, `.single()` returns a promise the test resolves manually, so we
  // can drive deferred / out-of-order server responses deterministically.
  deferSingle: false,
  singlePending: [] as Array<{ resolve: (v: WriteResult) => void; payload: unknown }>,
  // Result for the `.select()`-terminated path (insertMany, reload fetches).
  // null → default.
  thenResult: null as WriteResult | null,
  // Realtime handlers registered via channel.on, so tests can fire a
  // postgres_changes echo and drive the debounced reload path for real.
  rtHandlers: [] as Array<{ table: string; fn: () => void }>,
}));

vi.mock('../../../lib/supabase', () => {
  const makeBuilder = () => {
    const b: Record<string, unknown> = {};
    let payload: unknown = null;
    // capture the payload passed to insert/update/upsert for assertions
    for (const m of ['insert', 'update', 'upsert']) {
      b[m] = (p: Record<string, unknown>) => {
        h.lastWritePayload = p as Record<string, unknown>;
        payload = p;
        h.calls.push({ method: m, payload: p });
        return b;
      };
    }
    for (const m of ['from', 'select', 'eq', 'is', 'order', 'delete']) b[m] = () => b;
    b.single = () => {
      if (h.deferSingle) {
        return new Promise<WriteResult>((resolve) => h.singlePending.push({ resolve, payload }));
      }
      return Promise.resolve(h.writeResults.shift() ?? { data: null, error: null });
    };
    b.then = (onF: (v: WriteResult) => unknown, onR?: (e: unknown) => unknown) =>
      Promise.resolve(h.thenResult ?? { data: [], error: null }).then(onF, onR);
    return b;
  };
  const channel = {
    on: (_event: string, filter: { table?: string }, fn: () => void) => {
      h.rtHandlers.push({ table: filter?.table ?? '', fn });
      return channel;
    },
    subscribe: () => channel,
  };
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
  h.calls = [];
  h.deferSingle = false;
  h.singlePending = [];
  h.thenResult = null;
  h.rtHandlers = [];
});

const flush = () => act(async () => { await Promise.resolve(); await Promise.resolve(); });

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

describe('per-row write serialization (rapid-tap safety)', () => {
  async function seedRow(result: { current: ReturnType<typeof useCadenceFitness> }, row: Record<string, unknown>) {
    h.writeResults.push({ data: row, error: null });
    await act(async () => {
      await result.current.insert('workout_sets', row as never);
    });
  }

  it('serializes writes to one row and lets the NEWEST value win, ignoring a stale earlier response', async () => {
    const { result } = renderHook(() => useCadenceFitness(), { wrapper });
    await seedRow(result, { id: 'w1', weight_kg: 100 });

    h.deferSingle = true;
    h.calls = [];
    h.singlePending = [];

    let p1: Promise<unknown>, p2: Promise<unknown>, p3: Promise<unknown>;
    await act(async () => {
      p1 = result.current.update('workout_sets', 'w1', { weight_kg: 107.5 } as never);
      p2 = result.current.update('workout_sets', 'w1', { weight_kg: 110 } as never);
      p3 = result.current.update('workout_sets', 'w1', { weight_kg: 112.5 } as never);
    });
    await flush();

    // Serialized: only the FIRST write has reached the network so far.
    expect(h.singlePending).toHaveLength(1);
    expect(h.calls.filter((c) => c.method === 'update')).toHaveLength(1);
    // Optimistic UI already shows the newest intent.
    expect((result.current.data.workout_sets as Array<{ weight_kg: number }>)[0].weight_kg).toBe(112.5);

    // Resolve the OLDEST response first — it must NOT regress the UI, and the
    // next queued write only now hits the network.
    await act(async () => {
      h.singlePending.shift()!.resolve({ data: { id: 'w1', weight_kg: 107.5 }, error: null });
    });
    await flush();
    expect((result.current.data.workout_sets as Array<{ weight_kg: number }>)[0].weight_kg).toBe(112.5);
    expect(h.singlePending).toHaveLength(1); // op2 now in flight

    await act(async () => {
      h.singlePending.shift()!.resolve({ data: { id: 'w1', weight_kg: 110 }, error: null });
    });
    await flush();
    await act(async () => {
      h.singlePending.shift()!.resolve({ data: { id: 'w1', weight_kg: 112.5 }, error: null });
    });
    await act(async () => {
      await Promise.all([p1, p2, p3]);
    });

    // Writes were issued to the DB in order (last write wins there too) and the
    // final reconciled value is the newest.
    const order = h.calls.filter((c) => c.method === 'update').map((c) => (c.payload as { weight_kg: number }).weight_kg);
    expect(order).toEqual([107.5, 110, 112.5]);
    expect((result.current.data.workout_sets as Array<{ weight_kg: number }>)[0].weight_kg).toBe(112.5);
  });

  it('a failed write does not deadlock later writes to the same row', async () => {
    const { result } = renderHook(() => useCadenceFitness(), { wrapper });
    await seedRow(result, { id: 'w1', reps: 5 });

    h.deferSingle = true;
    h.calls = [];
    h.singlePending = [];

    let pA: Promise<unknown>, pB: Promise<unknown>;
    await act(async () => {
      pA = result.current.update('workout_sets', 'w1', { reps: 6 } as never);
      pB = result.current.update('workout_sets', 'w1', { reps: 8 } as never);
    });
    await flush();
    expect(h.singlePending).toHaveLength(1);

    // Fail the first write — the queue must keep flowing.
    await act(async () => {
      h.singlePending.shift()!.resolve({ data: null, error: { code: '42501', message: 'no' } });
    });
    await flush();
    expect(h.singlePending).toHaveLength(1); // second write still ran

    await act(async () => {
      h.singlePending.shift()!.resolve({ data: { id: 'w1', reps: 8 }, error: null });
    });
    await act(async () => {
      await Promise.all([pA, pB]);
    });
    expect((result.current.data.workout_sets as Array<{ reps: number }>)[0].reps).toBe(8);
  });
});

describe('strict (server-acknowledged) update — session activation safety', () => {
  async function seedInitializing(result: { current: ReturnType<typeof useCadenceFitness> }) {
    h.writeResults.push({ data: { id: 'wk', status: 'initializing' }, error: null });
    await act(async () => {
      await result.current.insert('workouts', { id: 'wk', status: 'initializing' } as never);
    });
  }
  const status = (result: { current: ReturnType<typeof useCadenceFitness> }) =>
    (result.current.data.workouts as Array<{ status: string }>)[0].status;

  it('THROWS on a failed activation and never leaves a false optimistic in_progress', async () => {
    const { result } = renderHook(() => useCadenceFitness(), { wrapper });
    await seedInitializing(result);

    h.writeResults.push({ data: null, error: { code: '42501', message: 'denied' } });
    await act(async () => {
      await expect(
        result.current.update('workouts', 'wk', { status: 'in_progress' } as never, { strict: true })
      ).rejects.toBeTruthy();
    });

    // The row must still read `initializing` locally — activation was NOT
    // presented as successful, so no false active session can surface.
    expect(status(result)).toBe('initializing');
    expect(result.current.syncError).toBeTruthy();
  });

  it('applies the activation only after the server acknowledges it', async () => {
    const { result } = renderHook(() => useCadenceFitness(), { wrapper });
    await seedInitializing(result);

    h.writeResults.push({ data: { id: 'wk', status: 'in_progress' }, error: null });
    await act(async () => {
      await result.current.update('workouts', 'wk', { status: 'in_progress' } as never, { strict: true });
    });
    expect(status(result)).toBe('in_progress');
  });

  it('contrast: a NORMAL update still swallows the failure and keeps the optimistic value', async () => {
    const { result } = renderHook(() => useCadenceFitness(), { wrapper });
    await seedInitializing(result);

    h.writeResults.push({ data: null, error: { code: '42501', message: 'denied' } });
    await act(async () => {
      const ret = await result.current.update('workouts', 'wk', { status: 'in_progress' } as never);
      expect(ret).toBeTruthy(); // resolved, not thrown
    });
    // Non-strict optimistic-first contract is preserved elsewhere.
    expect(status(result)).toBe('in_progress');
    expect(result.current.syncError).toBeTruthy();
  });
});

describe('reload cannot clobber in-flight optimistic writes (the "set unticks itself" bug)', () => {
  // These run AUTHENTICATED so the realtime effect subscribes and we can fire a
  // postgres_changes echo, wait out the 700ms debounce, and let the real
  // reload() apply a refetch snapshot whose query ran BEFORE our write
  // committed (exactly what gym wifi produces).
  const signIn = () => {
    h.session = { user: { id: 'u1' } };
    localStorage.setItem('cadence-fitness:seeded-exercises', '1');
  };
  const fireStaleRefetch = async (table: string, rows: unknown[]) => {
    h.thenResult = { data: rows, error: null };
    act(() => {
      h.rtHandlers.find((r) => r.table === table)!.fn();
    });
    // Ride out the 700ms realtime debounce so reload() actually runs.
    await act(async () => {
      await new Promise((r) => setTimeout(r, 800));
    });
    h.thenResult = null;
  };
  const mount = async () => {
    signIn();
    const rendered = renderHook(() => useCadenceFitness(), { wrapper });
    await waitFor(() => expect(h.rtHandlers.length).toBeGreaterThan(0));
    return rendered;
  };

  it('a refetch that predates an in-flight tick does NOT untick the set', async () => {
    const { result } = await mount();
    h.writeResults.push({ data: { id: 'w1', done: false }, error: null });
    await act(async () => {
      await result.current.insert('workout_sets', { id: 'w1', done: false } as never);
    });

    // Tick the set; hold the server response open (slow gym wifi).
    h.deferSingle = true;
    let tick: Promise<unknown>;
    await act(async () => {
      tick = result.current.update('workout_sets', 'w1', { done: true } as never);
    });
    await flush();
    expect((result.current.data.workout_sets as Array<{ done: boolean }>)[0].done).toBe(true);

    // A realtime echo triggers a refetch whose SELECT ran pre-commit: the
    // snapshot still says done:false. It must not undo the tick.
    await fireStaleRefetch('workout_sets', [{ id: 'w1', done: false }]);
    expect((result.current.data.workout_sets as Array<{ done: boolean }>)[0].done).toBe(true);

    // The write finally lands; the tick survives end-to-end.
    await act(async () => {
      h.singlePending.shift()!.resolve({ data: { id: 'w1', done: true }, error: null });
      await tick!;
    });
    expect((result.current.data.workout_sets as Array<{ done: boolean }>)[0].done).toBe(true);
  });

  it('a freshly added row survives a refetch that does not include it yet', async () => {
    const { result } = await mount();
    h.deferSingle = true;
    let ins: Promise<unknown>;
    await act(async () => {
      ins = result.current.insert('workout_sets', { id: 'w2', set_number: 4 } as never);
    });
    await flush();
    expect(result.current.data.workout_sets as unknown[]).toHaveLength(1);

    // Refetch snapshot predates the insert commit → empty table. The optimistic
    // row must not vanish.
    await fireStaleRefetch('workout_sets', []);
    expect(result.current.data.workout_sets as unknown[]).toHaveLength(1);

    await act(async () => {
      h.singlePending.shift()!.resolve({ data: { id: 'w2', set_number: 4 }, error: null });
      await ins!;
    });
    expect(result.current.data.workout_sets as unknown[]).toHaveLength(1);
  });

  it('a deleted row is not resurrected by a refetch that still contains it', async () => {
    const { result } = await mount();
    h.writeResults.push({ data: { id: 'w3', set_number: 1 }, error: null });
    await act(async () => {
      await result.current.insert('workout_sets', { id: 'w3', set_number: 1 } as never);
    });
    await act(async () => {
      await result.current.remove('workout_sets', 'w3');
    });
    expect(result.current.data.workout_sets as unknown[]).toHaveLength(0);

    // Refetch snapshot from before the soft-delete committed still has the row.
    await fireStaleRefetch('workout_sets', [{ id: 'w3', set_number: 1 }]);
    expect(result.current.data.workout_sets as unknown[]).toHaveLength(0);
  });
});

describe('durable offline queue (dead-spot gym sets survive and sync)', () => {
  const QKEY = 'cadence_fitness_offline_queue';
  let onLine = true;
  beforeEach(() => {
    localStorage.removeItem(QKEY);
    onLine = true;
    Object.defineProperty(window.navigator, 'onLine', { get: () => onLine, configurable: true });
    h.session = { user: { id: 'u1' } };
    localStorage.setItem('cadence-fitness:seeded-exercises', '1');
  });
  const qOps = () => (JSON.parse(localStorage.getItem(QKEY) ?? '[]') as Array<{ op: { op: string } }>).map((e) => e.op.op);
  const mount = async () => {
    const rendered = renderHook(() => useCadenceFitness(), { wrapper });
    await waitFor(() => expect(h.rtHandlers.length).toBeGreaterThan(0));
    return rendered;
  };

  it('queues writes made offline (no network attempt), keeps them visible, and drains on reconnect', async () => {
    const { result } = await mount();
    onLine = false;

    // Log a set and tick it while fully offline — both resolve, nothing thrown.
    await act(async () => {
      await result.current.insert('workout_sets', { id: 'q1', done: false } as never);
      await result.current.update('workout_sets', 'q1', { done: true } as never);
    });
    expect(qOps()).toEqual(['insert', 'update']);
    expect(result.current.pendingCount).toBe(2);
    const rows = () => result.current.data.workout_sets as Array<{ id: string; done: boolean }>;
    expect(rows()).toHaveLength(1);
    expect(rows()[0].done).toBe(true);
    expect(result.current.syncError).toBeNull();

    // Reconnect: the replay succeeds and the post-drain reload returns the
    // server truth including the replayed row.
    onLine = true;
    h.thenResult = { data: [{ id: 'q1', done: true }], error: null };
    await act(async () => {
      window.dispatchEvent(new Event('online'));
    });
    await waitFor(() => expect(result.current.pendingCount).toBe(0));
    expect(qOps()).toEqual([]);
    expect(rows()[0].done).toBe(true);
  });

  it('queues an offline delete and keeps the row hidden', async () => {
    const { result } = await mount();
    h.writeResults.push({ data: { id: 'q2', set_number: 1 }, error: null });
    await act(async () => {
      await result.current.insert('workout_sets', { id: 'q2', set_number: 1 } as never);
    });

    onLine = false;
    await act(async () => {
      await result.current.remove('workout_sets', 'q2');
    });
    expect(qOps()).toEqual(['remove']);
    expect(result.current.data.workout_sets as unknown[]).toHaveLength(0);
    expect(result.current.pendingCount).toBe(1);
  });

  it('a mid-save connection drop (exhausted retries on a network error) queues instead of rolling back', async () => {
    const { result } = await mount();
    // Online, but every attempt dies like a dropped connection. runWithRetry
    // makes 4 attempts with 300/600/1200ms backoff — real timers, ~2.1s.
    for (let i = 0; i < 4; i++) h.writeResults.push({ data: null, error: new Error('Failed to fetch') });
    await act(async () => {
      await result.current.insert('workout_sets', { id: 'q3', reps: 8 } as never);
    });
    expect(qOps()).toEqual(['insert']);
    expect(result.current.data.workout_sets as unknown[]).toHaveLength(1);
    expect(result.current.syncError).toBeNull();
  }, 15000);
});

describe('insertMany (atomic multi-row create)', () => {
  it('adds every row optimistically in one batch', async () => {
    const { result } = renderHook(() => useCadenceFitness(), { wrapper });
    h.thenResult = { data: null, error: null }; // no reconcile rows → keep optimistic
    await act(async () => {
      await result.current.insertMany('workout_sets', [
        { set_number: 1 },
        { set_number: 2 },
        { set_number: 3 },
      ] as never);
    });
    expect(result.current.data.workout_sets as unknown[]).toHaveLength(3);
    // One server round-trip for the whole batch, not three.
    expect(h.calls.filter((c) => c.method === 'insert')).toHaveLength(1);
    expect(Array.isArray(h.calls[0].payload)).toBe(true);
  });

  it('rolls the WHOLE batch back and surfaces a syncError on failure', async () => {
    const { result } = renderHook(() => useCadenceFitness(), { wrapper });
    h.thenResult = { data: null, error: { code: '42501', message: 'denied' } };
    await act(async () => {
      await expect(
        result.current.insertMany('workout_sets', [{ set_number: 1 }, { set_number: 2 }] as never)
      ).rejects.toBeTruthy();
    });
    expect(result.current.data.workout_sets as unknown[]).toHaveLength(0);
    expect(result.current.syncError).toBeTruthy();
  });
});
