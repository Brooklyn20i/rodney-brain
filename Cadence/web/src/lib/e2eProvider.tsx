// E2E-only data provider. Activated solely when the app is built with
// VITE_E2E=1 (Playwright). It supplies the exact same CadenceCtx shape as the
// real store, but backed by in-memory React state seeded from
// window.__CADENCE_E2E__ — no Supabase, no network. insert/update/remove mutate
// local state so real browser interactions (a Board move, a QuickAdd, completing
// a task) re-render exactly as they would in production.
//
// This file is dead code in any normal build (main.tsx only imports it behind
// the VITE_E2E flag), so it never touches the production bundle.
import React, { useCallback, useMemo, useState } from 'react';
import { CadenceCtx } from './store';
import type { Ctx } from './store';
import { CadenceData, emptyData } from './types';

declare global {
  interface Window { __CADENCE_E2E__?: Partial<CadenceData>; }
}

const now = () => new Date().toISOString();
const uid = () =>
  (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : Math.random().toString(36).slice(2);

export function E2EProvider({ children }: { children: React.ReactNode }) {
  const [data, setData] = useState<CadenceData>(() => ({ ...emptyData(), ...(window.__CADENCE_E2E__ || {}) }));

  const insert = useCallback(async (table: any, row: any) => {
    const full = { id: row.id || uid(), created_at: now(), updated_at: now(), deleted_at: null, owner_id: 'e2e', ...row };
    setData((prev) => ({ ...prev, [table]: [...(prev as any)[table], full] }));
    return full;
  }, []);

  const update = useCallback(async (table: any, id: string, patch: any) => {
    let updated: any;
    setData((prev) => ({
      ...prev,
      [table]: (prev as any)[table].map((r: any) => {
        if (r.id !== id) return r;
        updated = { ...r, ...patch, updated_at: now() };
        return updated;
      }),
    }));
    return updated;
  }, []);

  const remove = useCallback(async (table: any, id: string) => {
    setData((prev) => ({ ...prev, [table]: (prev as any)[table].filter((r: any) => r.id !== id) }));
  }, []);

  const value = useMemo<Ctx>(() => ({
    ready: true,
    configured: true,
    session: { user: { id: 'e2e', email: 'e2e@cadence.test' } } as any,
    needsPasswordSet: false,
    data,
    workspace: { id: 'ws', name: 'E2E Workspace' } as any,
    workspaceMembers: [],
    signIn: async () => ({}),
    signUp: async () => ({}),
    setPassword: async () => ({}),
    resetPassword: async () => ({}),
    signOut: async () => {},
    insert: insert as Ctx['insert'],
    update: update as Ctx['update'],
    remove: remove as Ctx['remove'],
    reload: async () => {},
    logActivity: async () => {},
    myRole: 'admin',
    canEdit: true,
    syncError: null,
    clearSyncError: () => {},
    createWorkspace: async () => {},
    createInvite: async () => 'e2e-invite',
    removeWorkspaceMember: async () => {},
    acceptInvite: async () => ({ ok: true }),
    pendingCount: 0,
    isOffline: false,
    isSyncing: false,
  }), [data, insert, update, remove]);

  return <CadenceCtx.Provider value={value}>{children}</CadenceCtx.Provider>;
}
