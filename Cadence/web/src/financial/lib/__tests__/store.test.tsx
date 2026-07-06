/**
 * Store write-path tests — the riskiest, previously-untested code. Renders the
 * REAL CadenceFinancialProvider against a controllable mock Supabase and asserts
 * the optimistic-update / rollback / column-drift contracts (not demo mode — the
 * live path). Companion coverage to supabaseWrite.test.ts (the pure helper).
 */
import { renderHook, act, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';

// Controllable results: each terminal write shifts the next result off the queue.
// session stays null so the mount-time reload/realtime effects early-return
// (they guard on ownerId), isolating the write path under test. ownerId being
// null just means owner_id isn't stamped — irrelevant to optimistic/rollback.
const h = vi.hoisted(() => ({
  writeResults: [] as Array<{ data: unknown; error: unknown }>,
  session: null as unknown,
}));

vi.mock('../../../lib/supabase', () => {
  // A chainable + awaitable query builder. Writes end in .single() (pull a
  // queued result); reloads are awaited directly (return empty rows).
  const makeBuilder = () => {
    const b: Record<string, unknown> = {};
    for (const m of ['from', 'insert', 'update', 'upsert', 'select', 'eq', 'is', 'order', 'delete']) {
      b[m] = () => b;
    }
    b.single = () => Promise.resolve(h.writeResults.shift() ?? { data: null, error: null });
    // thenable so `await supabase.schema().from().select()...` (reload) resolves
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

import { CadenceFinancialProvider, useCadenceFinancial } from '../store';

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <CadenceFinancialProvider>{children}</CadenceFinancialProvider>
);

beforeEach(() => {
  h.writeResults = [];
  h.session = null;
});

describe('CadenceFinancialProvider write path', () => {
  it('optimistic insert adds the row, then reconciles with the server copy', async () => {
    const { result } = renderHook(() => useCadenceFinancial(), { wrapper });
    // Server returns a canonical row (server-generated fields differ from client).
    h.writeResults.push({ data: { id: 'srv-1', name: 'Server', owner_id: 'test-owner' }, error: null });
    await act(async () => {
      await result.current.insert('entities', { name: 'Client' } as never);
    });
    const entities = result.current.data.entities as Array<{ id: string; name: string }>;
    expect(entities).toHaveLength(1);
    expect(entities[0].id).toBe('srv-1'); // reconciled to the server row
    expect(entities[0].name).toBe('Server');
  });

  it('insert failure rolls the optimistic row back out and surfaces a syncError', async () => {
    const { result } = renderHook(() => useCadenceFinancial(), { wrapper });
    h.writeResults.push({ data: null, error: { message: 'permission denied' } });
    await act(async () => {
      await expect(result.current.insert('entities', { name: 'Nope' } as never)).rejects.toBeTruthy();
    });
    expect((result.current.data.entities as unknown[])).toHaveLength(0); // rolled back
    expect(result.current.syncError).toBeTruthy();
  });

  it('update failure restores the previous row (no "vanished edit")', async () => {
    const { result } = renderHook(() => useCadenceFinancial(), { wrapper });
    // Seed a row via a successful insert.
    h.writeResults.push({ data: { id: 'e1', name: 'Original', owner_id: 'test-owner' }, error: null });
    await act(async () => {
      await result.current.insert('entities', { name: 'Original' } as never);
    });
    // Now a failing update — the optimistic patch must be reverted.
    h.writeResults.push({ data: null, error: { message: 'check constraint violated' } });
    await act(async () => {
      await expect(result.current.update('entities', 'e1', { name: 'Edited' } as never)).rejects.toBeTruthy();
    });
    const row = (result.current.data.entities as Array<{ name: string }>)[0];
    expect(row.name).toBe('Original'); // rolled back, not left showing 'Edited'
    expect(result.current.syncError).toBeTruthy();
  });

  it('insert tolerates column drift: strips an unknown column and retries', async () => {
    const { result } = renderHook(() => useCadenceFinancial(), { wrapper });
    // First attempt fails on a missing column, second (stripped) succeeds.
    h.writeResults.push({ data: null, error: { message: "Could not find the 'ghost' column of 'entities'" } });
    h.writeResults.push({ data: { id: 'e2', name: 'Kept', owner_id: 'test-owner' }, error: null });
    await act(async () => {
      await result.current.insert('entities', { name: 'Kept', ghost: 1 } as never);
    });
    expect(h.writeResults).toHaveLength(0); // both attempts consumed
    expect((result.current.data.entities as Array<{ id: string }>)[0].id).toBe('e2');
  });

  it('exposes demo=false and a stable API surface', async () => {
    const { result } = renderHook(() => useCadenceFinancial(), { wrapper });
    await waitFor(() => expect(result.current).toBeTruthy());
    expect(result.current.demo).toBe(false);
    expect(typeof result.current.insert).toBe('function');
    expect(typeof result.current.update).toBe('function');
    expect(typeof result.current.remove).toBe('function');
  });
});
