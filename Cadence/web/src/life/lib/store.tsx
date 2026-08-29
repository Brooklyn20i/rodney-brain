import React, { createContext, useContext, useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { writeWithColumnDrift } from '../../lib/supabaseWrite';
import { useSupabaseOwnerId, fetchSchemaTables } from '../../lib/domainStore';
import { CadenceLifeData, TABLES, emptyData } from './types';
import { loadDemoData } from './demoData';

// The Life *data* layer only — auth/login is handled once at the top of the
// unified app. Every table lives in the `life` Postgres schema, so every
// call below is schema-qualified via `supabase.schema('life')`. Same design
// as the Financial store: optimistic writes with rollback, write-aware
// debounced realtime reloads. (No WAL/touch-guard machinery — life admin is
// done from a couch, not a gym dead spot.)

type Table = keyof CadenceLifeData;
type Row<K extends Table> = CadenceLifeData[K][number];

const DEMO_MODE = import.meta.env.VITE_DEMO === '1';
// E2E builds (Playwright) must never reach a real backend. OFFLINE = "no live
// Supabase": demo (seeded data) OR e2e (empty, in-memory).
const E2E_MODE = import.meta.env.VITE_E2E === '1';
const OFFLINE = DEMO_MODE || E2E_MODE;

export interface Ctx {
  demo: boolean;
  data: CadenceLifeData;
  insert: <K extends Table>(table: K, row: Partial<Row<K>>) => Promise<Row<K>>;
  update: <K extends Table>(table: K, id: string, patch: Partial<Row<K>>) => Promise<Row<K>>;
  remove: (table: Table, id: string) => Promise<void>;
  syncError: string | null;
  clearSyncError: () => void;
}

export const CadenceLifeCtx = createContext<Ctx | null>(null);

export function useCadenceLife(): Ctx {
  const c = useContext(CadenceLifeCtx);
  if (!c) throw new Error('useCadenceLife must be used inside <CadenceLifeProvider>');
  return c;
}

function newId(): string {
  return crypto.randomUUID();
}

export function CadenceLifeProvider({ children }: { children: React.ReactNode }) {
  const ownerId = useSupabaseOwnerId(OFFLINE);
  const [data, setData] = useState<CadenceLifeData>(() => (DEMO_MODE ? loadDemoData() : emptyData()));
  const [syncError, setSyncError] = useState<string | null>(null);

  const reload = useCallback(async (table?: Table) => {
    if (OFFLINE) return;
    const tables = (table ? [table] : TABLES) as string[];
    const results = await fetchSchemaTables('life', tables);
    setData((prev) => {
      const next = { ...prev };
      results.forEach(({ t, error, data }) => {
        if (!error && data) (next as any)[t] = data;
      });
      return next;
    });
  }, []);

  // Writes in flight — realtime refetches must not race them (the same
  // clobber class the fitness store had). Refetches wait for write-quiet.
  const writesInFlight = useRef(0);

  useEffect(() => {
    if (OFFLINE || !ownerId) return;
    reload();
    const timers = new Map<string, ReturnType<typeof setTimeout>>();
    const scheduleReload = (t: Table) => {
      const existing = timers.get(t as string);
      if (existing) clearTimeout(existing);
      const fire = () => {
        if (writesInFlight.current > 0) {
          timers.set(t as string, setTimeout(fire, 700));
          return;
        }
        void reload(t);
      };
      timers.set(t as string, setTimeout(fire, 700));
    };
    const ch = supabase.channel('cadence-life-rt');
    TABLES.forEach((t) =>
      ch.on('postgres_changes', { event: '*', schema: 'life', table: t as string }, () => scheduleReload(t))
    );
    ch.subscribe();
    return () => {
      timers.forEach((h) => clearTimeout(h));
      supabase.removeChannel(ch);
    };
  }, [ownerId, reload]);

  const insert = async <K extends Table>(table: K, row: Partial<Row<K>>): Promise<Row<K>> => {
    const now = new Date().toISOString();
    const stamped: any = { id: newId(), created_at: now, updated_at: now, deleted_at: null, ...row };

    if (OFFLINE) {
      const withOwner = { owner_id: 'demo-owner', ...stamped };
      setData((prev) => ({ ...prev, [table]: [...(prev as any)[table], withOwner] }));
      return withOwner as Row<K>;
    }

    const ownedRow = ownerId ? { owner_id: ownerId, ...stamped } : stamped;
    writesInFlight.current += 1;
    let d: unknown, error: unknown;
    try {
      ({ data: d, error } = await writeWithColumnDrift(ownedRow, (p) =>
        supabase.schema('life').from(table as string).insert(p).select().single()
      ));
    } finally {
      writesInFlight.current = Math.max(0, writesInFlight.current - 1);
    }
    if (error) {
      setSyncError((error as { message?: string }).message || 'Save failed');
      throw error;
    }
    // A racing realtime reload may already hold the server row — never append
    // a duplicate id.
    setData((prev) => ({
      ...prev,
      [table]: [...(prev as any)[table].filter((r: any) => r.id !== (d as any).id), d],
    }));
    return d as unknown as Row<K>;
  };

  const update = async <K extends Table>(table: K, id: string, patch: Partial<Row<K>>): Promise<Row<K>> => {
    // Snapshot INSIDE the updater so back-to-back edits each roll back to the
    // state they actually patched, not a stale render closure.
    let prevRow: any = (data as any)[table].find((r: any) => r.id === id);
    setData((prev) => {
      const live = (prev as any)[table].find((r: any) => r.id === id);
      if (live) prevRow = live;
      return {
        ...prev,
        [table]: (prev as any)[table].map((r: any) => (r.id === id ? { ...r, ...patch } : r)),
      };
    });

    if (OFFLINE) {
      const found = (data as any)[table].find((r: any) => r.id === id);
      return { ...found, ...patch } as Row<K>;
    }

    writesInFlight.current += 1;
    let d: unknown, error: unknown;
    try {
      ({ data: d, error } = await writeWithColumnDrift(patch as Record<string, unknown>, (p) =>
        supabase.schema('life').from(table as string).update(p).eq('id', id).select().single()
      ));
    } finally {
      writesInFlight.current = Math.max(0, writesInFlight.current - 1);
    }
    if (error) {
      if (prevRow) setData((prev) => ({ ...prev, [table]: (prev as any)[table].map((r: any) => (r.id === id ? prevRow : r)) }));
      setSyncError((error as { message?: string }).message || 'Save failed');
      throw error;
    }
    setData((prev) => ({ ...prev, [table]: (prev as any)[table].map((r: any) => (r.id === id ? d : r)) }));
    return d as unknown as Row<K>;
  };

  const remove = async (table: Table, id: string): Promise<void> => {
    // Keep the row for rollback: a failed soft-delete must put it back.
    let removedRow: any = (data as any)[table].find((r: any) => r.id === id);
    setData((prev) => {
      const live = (prev as any)[table].find((r: any) => r.id === id);
      if (live) removedRow = live;
      return { ...prev, [table]: (prev as any)[table].filter((r: any) => r.id !== id) };
    });
    if (OFFLINE) return;
    writesInFlight.current += 1;
    let error: { message?: string } | null;
    try {
      ({ error } = await supabase
        .schema('life')
        .from(table as string)
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', id));
    } finally {
      writesInFlight.current = Math.max(0, writesInFlight.current - 1);
    }
    if (error) {
      if (removedRow) {
        setData((prev) => ({ ...prev, [table]: [...(prev as any)[table], removedRow] }));
      }
      setSyncError(error.message || 'Delete failed');
      throw error;
    }
  };

  const clearSyncError = useCallback(() => setSyncError(null), []);

  return (
    <CadenceLifeCtx.Provider
      value={{
        demo: OFFLINE,
        data,
        insert,
        update,
        remove,
        syncError,
        clearSyncError,
      }}
    >
      {children}
    </CadenceLifeCtx.Provider>
  );
}
