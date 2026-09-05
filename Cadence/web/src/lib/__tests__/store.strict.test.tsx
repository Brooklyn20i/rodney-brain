import { renderHook, act, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const h = vi.hoisted(() => ({ insertCalls: [] as any[], updateCalls: [] as any[], insertError: null as any, updateError: null as any }));

vi.mock('../supabase', () => ({
  isConfigured: false,
  supabase: {
    auth: { getSession: vi.fn(), onAuthStateChange: vi.fn(), signOut: vi.fn() },
    from: (table: string) => ({
      insert: (row: any) => {
        h.insertCalls.push({ table, row });
        return { select: () => ({ single: async () => h.insertError ? { data: null, error: h.insertError } : { data: { id: row.id || 'server-id', created_at: 't', updated_at: 't', deleted_at: null, ...row }, error: null } }) };
      },
      update: (patch: any) => ({
        eq: (_col: string, id: string) => {
          h.updateCalls.push({ table, id, patch });
          return { select: () => ({ single: async () => h.updateError ? { data: null, error: h.updateError } : { data: { id, created_at: 't', updated_at: 't', deleted_at: null, title: 'server', ...patch }, error: null } }) };
        },
      }),
      select: () => ({ is: () => ({ order: async () => ({ data: [], error: null }) }), order: () => ({ limit: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }) }),
    }),
    channel: () => ({ on: () => ({ on: vi.fn() }), subscribe: vi.fn() }),
    removeChannel: vi.fn(),
  },
}));

import { CadenceProvider, useCadence } from '../store';

const setOnline = (online: boolean) => Object.defineProperty(window.navigator, 'onLine', { value: online, configurable: true });
const wrapper = ({ children }: { children: React.ReactNode }) => <CadenceProvider>{children}</CadenceProvider>;

describe('Work store strict writes', () => {
  beforeEach(() => {
    h.insertCalls = [];
    h.updateCalls = [];
    h.insertError = null;
    h.updateError = null;
    localStorage.removeItem('cadence_offline_queue');
    setOnline(true);
  });
  afterEach(() => setOnline(true));

  it('strict insert rejects offline instead of optimistic-queueing', async () => {
    setOnline(false);
    const { result } = renderHook(() => useCadence(), { wrapper });
    await waitFor(() => expect(result.current.ready).toBe(true));

    await expect(result.current.insert('notes', { title: 'Meeting', body: '' }, { strict: true })).rejects.toThrow(/server acknowledgement/);

    expect(h.insertCalls).toEqual([]);
    expect(localStorage.getItem('cadence_offline_queue')).toBeNull();
    expect(result.current.data.notes).toEqual([]);
  });

  it('strict update rejects server errors without optimistic state changes', async () => {
    const { result } = renderHook(() => useCadence(), { wrapper });
    await waitFor(() => expect(result.current.ready).toBe(true));
    await act(async () => { await result.current.insert('notes', { id: 'n1', title: 'Old', body: '' }, { strict: true }); });
    h.updateError = { message: 'RLS rejected' };

    await expect(result.current.update('notes', 'n1', { title: 'New' }, { strict: true })).rejects.toMatchObject({ message: 'RLS rejected' });

    expect(result.current.data.notes.find((n) => n.id === 'n1')?.title).toBe('Old');
    expect(localStorage.getItem('cadence_offline_queue')).toBeNull();
  });
});
