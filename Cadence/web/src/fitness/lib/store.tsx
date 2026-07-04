import React, { createContext, useContext, useCallback, useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { CadenceFitnessData, TABLES, emptyData } from './types';
import { loadDemoData } from './demoData';
import { EXERCISE_CATALOG } from './exerciseCatalog';

// Fitness *data* layer only -- auth/login is handled once, at the top of the
// unified app (Cadence/web/src/App.tsx). Every table lives in the `fitness`
// Postgres schema (not `public`), so every call below is schema-qualified
// via `supabase.schema('fitness')`.

type Table = keyof CadenceFitnessData;
type Row<K extends Table> = CadenceFitnessData[K][number];

const DEMO_MODE = import.meta.env.VITE_DEMO === '1';

export interface Ctx {
  demo: boolean;
  data: CadenceFitnessData;
  insert: <K extends Table>(table: K, row: Partial<Row<K>>) => Promise<Row<K>>;
  update: <K extends Table>(table: K, id: string, patch: Partial<Row<K>>) => Promise<Row<K>>;
  remove: (table: Table, id: string) => Promise<void>;
  syncError: string | null;
  clearSyncError: () => void;
  // Writes currently in flight — lets screens show a truthful "Saving… /
  // Saved ✓" indicator instead of leaving saves invisible.
  saving: boolean;
}

export const CadenceFitnessCtx = createContext<Ctx | null>(null);

export function useCadenceFitness(): Ctx {
  const c = useContext(CadenceFitnessCtx);
  if (!c) throw new Error('useCadenceFitness must be used inside <CadenceFitnessProvider>');
  return c;
}

function newId(): string {
  return crypto.randomUUID();
}

export function CadenceFitnessProvider({ children }: { children: React.ReactNode }) {
  const [ownerId, setOwnerId] = useState<string | null>(null);
  const [data, setData] = useState<CadenceFitnessData>(() => (DEMO_MODE ? loadDemoData() : emptyData()));
  const [syncError, setSyncError] = useState<string | null>(null);
  const [inflight, setInflight] = useState(0);
  const trackWrite = async <T,>(op: () => PromiseLike<T>): Promise<T> => {
    setInflight((n) => n + 1);
    try {
      return await op();
    } finally {
      setInflight((n) => Math.max(0, n - 1));
    }
  };

  const reload = useCallback(async (table?: Table) => {
    if (DEMO_MODE) return;
    const tables = table ? [table] : TABLES;
    const results = await Promise.all(
      tables.map(async (t) => {
        const r = await supabase
          .schema('fitness')
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
    const ch = supabase.channel('cadence-fitness-rt');
    TABLES.forEach((t) =>
      ch.on('postgres_changes', { event: '*', schema: 'fitness', table: t as string }, () => reload(t))
    );
    ch.subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [ownerId, reload]);

  // One-time seed of the common-movement library on first sign-in (see
  // CadenceFitness's original comment) -- unchanged, just schema-qualified.
  useEffect(() => {
    if (DEMO_MODE || !ownerId) return;
    const FLAG = 'cadence-fitness:seeded-exercises';
    if (localStorage.getItem(FLAG)) return;
    let cancelled = false;
    (async () => {
      const { data: existing, error } = await supabase.schema('fitness').from('exercises').select('id').limit(1);
      if (cancelled || error) return;
      if (existing && existing.length > 0) {
        localStorage.setItem(FLAG, '1');
        return;
      }
      const now = new Date().toISOString();
      const rows = EXERCISE_CATALOG.map((e) => ({
        id: crypto.randomUUID(),
        owner_id: ownerId,
        name: e.name,
        muscle_group: e.muscle_group,
        secondary_muscles: '',
        equipment: e.equipment,
        notes: '',
        created_at: now,
        updated_at: now,
        deleted_at: null,
      }));
      const { error: insErr } = await supabase.schema('fitness').from('exercises').insert(rows);
      if (!cancelled && !insErr) {
        localStorage.setItem(FLAG, '1');
        reload('exercises');
      }
    })();
    return () => {
      cancelled = true;
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
    const { data: d, error } = await trackWrite(() =>
      supabase
        .schema('fitness')
        .from(table as string)
        .insert(ownedRow)
        .select()
        .single()
    );
    if (error) {
      setSyncError(error.message || 'Save failed');
      throw error;
    }
    setData((prev) => ({ ...prev, [table]: [...(prev as any)[table], d] }));
    return d as Row<K>;
  };

  const update = async <K extends Table>(table: K, id: string, patch: Partial<Row<K>>): Promise<Row<K>> => {
    setData((prev) => ({
      ...prev,
      [table]: (prev as any)[table].map((r: any) => (r.id === id ? { ...r, ...patch } : r)),
    }));

    if (DEMO_MODE) {
      const found = (data as any)[table].find((r: any) => r.id === id);
      return { ...found, ...patch } as Row<K>;
    }

    const { data: d, error } = await trackWrite(() =>
      supabase
        .schema('fitness')
        .from(table as string)
        .update(patch as any)
        .eq('id', id)
        .select()
        .single()
    );
    if (error) {
      setSyncError(error.message || 'Save failed');
      throw error;
    }
    setData((prev) => ({ ...prev, [table]: (prev as any)[table].map((r: any) => (r.id === id ? d : r)) }));
    return d as Row<K>;
  };

  const remove = async (table: Table, id: string): Promise<void> => {
    setData((prev) => ({ ...prev, [table]: (prev as any)[table].filter((r: any) => r.id !== id) }));
    if (DEMO_MODE) return;
    const { error } = await trackWrite(() =>
      supabase
        .schema('fitness')
        .from(table as string)
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', id)
    );
    if (error) {
      setSyncError(error.message || 'Delete failed');
      throw error;
    }
  };

  const clearSyncError = useCallback(() => setSyncError(null), []);

  return (
    <CadenceFitnessCtx.Provider
      value={{
        demo: DEMO_MODE,
        data,
        insert,
        update,
        remove,
        syncError,
        clearSyncError,
        saving: inflight > 0,
      }}
    >
      {children}
    </CadenceFitnessCtx.Provider>
  );
}
