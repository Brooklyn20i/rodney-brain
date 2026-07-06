import React, { createContext, useContext, useCallback, useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { CadenceFinancialData, TABLES, emptyData } from './types';
import { loadDemoData } from './demoData';

// This is the Financial *data* layer only -- auth/login is handled once, at
// the top of the unified app (Cadence/web/src/App.tsx), since all three
// domains now share one Supabase project and one session. Every table lives
// in the `financial` Postgres schema (not `public`), so every call below is
// schema-qualified via `supabase.schema('financial')` -- that's the only
// thing that changed versus the original standalone CadenceFinancial app.

type Table = keyof CadenceFinancialData;
type Row<K extends Table> = CadenceFinancialData[K][number];

const DEMO_MODE = import.meta.env.VITE_DEMO === '1';

export interface Ctx {
  demo: boolean;
  data: CadenceFinancialData;
  insert: <K extends Table>(table: K, row: Partial<Row<K>>) => Promise<Row<K>>;
  update: <K extends Table>(table: K, id: string, patch: Partial<Row<K>>) => Promise<Row<K>>;
  remove: (table: Table, id: string) => Promise<void>;
  syncError: string | null;
  clearSyncError: () => void;
}

export const CadenceFinancialCtx = createContext<Ctx | null>(null);

export function useCadenceFinancial(): Ctx {
  const c = useContext(CadenceFinancialCtx);
  if (!c) throw new Error('useCadenceFinancial must be used inside <CadenceFinancialProvider>');
  return c;
}

function newId(): string {
  return crypto.randomUUID();
}

export function CadenceFinancialProvider({ children }: { children: React.ReactNode }) {
  const [ownerId, setOwnerId] = useState<string | null>(null);
  const [data, setData] = useState<CadenceFinancialData>(() => (DEMO_MODE ? loadDemoData() : emptyData()));
  const [syncError, setSyncError] = useState<string | null>(null);

  const reload = useCallback(async (table?: Table) => {
    if (DEMO_MODE) return;
    const tables = table ? [table] : TABLES;
    const results = await Promise.all(
      tables.map(async (t) => {
        const r = await supabase
          .schema('financial')
          .from(t as string)
          .select('*')
          .is('deleted_at', null)
          .order('created_at', { ascending: true });
        return { t, r };
      })
    );
    setData((prev) => {
      const next = { ...prev };
      results.forEach(({ t, r }) => {
        if (!r.error && r.data) (next as any)[t] = r.data;
      });
      return next;
    });
  }, []);

  useEffect(() => {
    if (DEMO_MODE) return;
    supabase.auth.getSession().then(({ data }) => setOwnerId(data.session?.user?.id ?? null));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => setOwnerId(s?.user?.id ?? null));
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (DEMO_MODE || !ownerId) return;
    reload();
    const ch = supabase.channel('cadence-financial-rt');
    TABLES.forEach((t) =>
      ch.on('postgres_changes', { event: '*', schema: 'financial', table: t as string }, () => reload(t))
    );
    ch.subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [ownerId, reload]);

  const insert = async <K extends Table>(table: K, row: Partial<Row<K>>): Promise<Row<K>> => {
    const now = new Date().toISOString();
    const stamped: any = { id: newId(), created_at: now, updated_at: now, deleted_at: null, ...row };

    if (DEMO_MODE) {
      const withOwner = { owner_id: 'demo-owner', ...stamped };
      setData((prev) => ({ ...prev, [table]: [...(prev as any)[table], withOwner] }));
      return withOwner as Row<K>;
    }

    const ownedRow = ownerId ? { owner_id: ownerId, ...stamped } : stamped;
    const { data: d, error } = await supabase
      .schema('financial')
      .from(table as string)
      .insert(ownedRow)
      .select()
      .single();
    if (error) {
      setSyncError(error.message || 'Save failed');
      throw error;
    }
    setData((prev) => ({ ...prev, [table]: [...(prev as any)[table], d] }));
    return d as Row<K>;
  };

  const update = async <K extends Table>(table: K, id: string, patch: Partial<Row<K>>): Promise<Row<K>> => {
    // Snapshot the row before the optimistic write so a permanent (non-network)
    // failure can roll back — otherwise the UI keeps showing an edit the DB
    // rejected until the next reload silently snaps it back ("my change vanished").
    const prevRow = (data as any)[table].find((r: any) => r.id === id);
    setData((prev) => ({
      ...prev,
      [table]: (prev as any)[table].map((r: any) => (r.id === id ? { ...r, ...patch } : r)),
    }));

    if (DEMO_MODE) {
      const found = (data as any)[table].find((r: any) => r.id === id);
      return { ...found, ...patch } as Row<K>;
    }

    const { data: d, error } = await supabase
      .schema('financial')
      .from(table as string)
      .update(patch as any)
      .eq('id', id)
      .select()
      .single();
    if (error) {
      if (prevRow) setData((prev) => ({ ...prev, [table]: (prev as any)[table].map((r: any) => (r.id === id ? prevRow : r)) }));
      setSyncError(error.message || 'Save failed');
      throw error;
    }
    setData((prev) => ({ ...prev, [table]: (prev as any)[table].map((r: any) => (r.id === id ? d : r)) }));
    return d as Row<K>;
  };

  const remove = async (table: Table, id: string): Promise<void> => {
    setData((prev) => ({ ...prev, [table]: (prev as any)[table].filter((r: any) => r.id !== id) }));
    if (DEMO_MODE) return;
    const { error } = await supabase
      .schema('financial')
      .from(table as string)
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', id);
    if (error) {
      setSyncError(error.message || 'Delete failed');
      throw error;
    }
  };

  const clearSyncError = useCallback(() => setSyncError(null), []);

  return (
    <CadenceFinancialCtx.Provider
      value={{
        demo: DEMO_MODE,
        data,
        insert,
        update,
        remove,
        syncError,
        clearSyncError,
      }}
    >
      {children}
    </CadenceFinancialCtx.Provider>
  );
}
