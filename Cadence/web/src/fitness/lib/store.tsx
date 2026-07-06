import React, { createContext, useContext, useCallback, useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { writeWithColumnDrift } from '../../lib/supabaseWrite';
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
// E2E builds (Playwright) must never reach a real backend. OFFLINE = "no live
// Supabase": demo (seeded) OR e2e (empty, in-memory). Data still initialises
// from demo only, so e2e keeps its empty-state assertions.
const E2E_MODE = import.meta.env.VITE_E2E === '1';
const OFFLINE = DEMO_MODE || E2E_MODE;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// A gym has terrible wifi. A single dropped request should not throw a scary
// red banner — retry a few times with backoff first, and only give up (surface
// an error) if it's a *permanent* failure (auth/RLS/constraint) or every retry
// failed. Transient network blips heal silently. Returns { data, error } like
// the underlying supabase call; a thrown network error is caught and retried.
const PERMANENT_CODE = /^(22|23|42|PGRST)/; // pg data/constraint/syntax + PostgREST
async function runWithRetry<T>(
  op: () => PromiseLike<{ data: T | null; error: any }>,
  attempts = 4
): Promise<{ data: T | null; error: any }> {
  let result: { data: T | null; error: any } = { data: null, error: null };
  for (let i = 0; i < attempts; i++) {
    try {
      result = await op();
    } catch (e: any) {
      result = { data: null, error: e };
    }
    if (!result.error) return result;
    const code = String(result.error?.code ?? '');
    const status = Number(result.error?.status ?? 0);
    if (PERMANENT_CODE.test(code) || status === 400 || status === 401 || status === 403) return result;
    if (i < attempts - 1) await sleep(300 * 2 ** i); // 300, 600, 1200ms
  }
  return result;
}

export interface Ctx {
  demo: boolean;
  data: CadenceFitnessData;
  insert: <K extends Table>(table: K, row: Partial<Row<K>>) => Promise<Row<K>>;
  update: <K extends Table>(table: K, id: string, patch: Partial<Row<K>>) => Promise<Row<K>>;
  // Insert-or-update keyed by a unique constraint (e.g. 'owner_id,date'). Robust
  // against a stale in-memory `rows` racing realtime: the DB resolves the
  // conflict instead of throwing a duplicate-key error on a re-saved day.
  upsert: <K extends Table>(table: K, row: Partial<Row<K>>, onConflict: string) => Promise<Row<K>>;
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

// A short, non-alarming message for the sync banner. Raw Postgres/PostgREST
// text ("PGRST204 …") means nothing to someone mid-set.
function friendlyError(error: any): string {
  const status = Number(error?.status ?? 0);
  if (status === 401 || status === 403) return 'Not signed in — your last change may not have saved.';
  return "Couldn't reach the server — your last change may not have saved. It'll retry automatically.";
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
    if (OFFLINE) return;
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
    if (OFFLINE) return;
    supabase.auth.getSession().then(({ data }) => setOwnerId(data.session?.user?.id ?? null));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => setOwnerId(s?.user?.id ?? null));
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (OFFLINE || !ownerId) return;
    reload();
    // Coalesce realtime echoes: our own writes each bounce back a change event,
    // and rapid set-logging fires many in a burst. Debounce per table so we
    // refetch once the dust settles instead of thrashing state mid-workout
    // (which was re-creating row objects and re-rendering the set list on every
    // tap — the "not super smooth" feel).
    const timers = new Map<string, ReturnType<typeof setTimeout>>();
    const scheduleReload = (t: Table) => {
      const existing = timers.get(t as string);
      if (existing) clearTimeout(existing);
      timers.set(t as string, setTimeout(() => reload(t), 700));
    };
    const ch = supabase.channel('cadence-fitness-rt');
    TABLES.forEach((t) =>
      ch.on('postgres_changes', { event: '*', schema: 'fitness', table: t as string }, () => scheduleReload(t))
    );
    ch.subscribe();
    return () => {
      timers.forEach((h) => clearTimeout(h));
      supabase.removeChannel(ch);
    };
  }, [ownerId, reload]);

  // One-time seed of the common-movement library on first sign-in (see
  // CadenceFitness's original comment) -- unchanged, just schema-qualified.
  useEffect(() => {
    if (OFFLINE || !ownerId) return;
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

    if (OFFLINE) {
      const withOwner = { owner_id: 'demo-owner', ...stamped };
      setData((prev) => ({ ...prev, [table]: [...(prev as any)[table], withOwner] }));
      return withOwner as Row<K>;
    }

    const ownedRow = ownerId ? { owner_id: ownerId, ...stamped } : stamped;
    // Show the row immediately (optimistic) so the UI never stalls on a slow
    // gym connection; reconcile with the server copy once the write lands.
    setData((prev) => ({ ...prev, [table]: [...(prev as any)[table], ownedRow] }));
    // Column-drift tolerant (shared helper): strip + retry a column the DB
    // doesn't have yet, composed with the gym-wifi network retry.
    const { data: d, error } = await trackWrite(() =>
      writeWithColumnDrift(ownedRow, (p) =>
        runWithRetry(() =>
          supabase.schema('fitness').from(table as string).insert(p).select().single()
        )
      )
    );
    if (error) {
      setData((prev) => ({ ...prev, [table]: (prev as any)[table].filter((r: any) => r.id !== ownedRow.id) }));
      setSyncError(friendlyError(error));
      throw error;
    }
    if (d) setData((prev) => ({ ...prev, [table]: (prev as any)[table].map((r: any) => (r.id === ownedRow.id ? d : r)) }));
    return (d ?? ownedRow) as Row<K>;
  };

  const update = async <K extends Table>(table: K, id: string, patch: Partial<Row<K>>): Promise<Row<K>> => {
    setData((prev) => ({
      ...prev,
      [table]: (prev as any)[table].map((r: any) => (r.id === id ? { ...r, ...patch } : r)),
    }));

    if (OFFLINE) {
      const found = (data as any)[table].find((r: any) => r.id === id);
      return { ...found, ...patch } as Row<K>;
    }

    const optimistic = { ...(data as any)[table].find((r: any) => r.id === id), ...patch };
    const { data: d, error } = await trackWrite(() =>
      writeWithColumnDrift(patch as Record<string, unknown>, (p) =>
        runWithRetry(() =>
          supabase.schema('fitness').from(table as string).update(p).eq('id', id).select().single()
        )
      )
    );
    // Local state already reflects the change (optimistic, above). If the write
    // ultimately failed, note it quietly but DON'T throw — an un-awaited reject
    // during a workout would fire the global "unhandled rejection" banner on
    // every flaky tap. The change stays local and realtime reconciles later.
    if (error) {
      setSyncError(friendlyError(error));
      return optimistic as Row<K>;
    }
    if (d) setData((prev) => ({ ...prev, [table]: (prev as any)[table].map((r: any) => (r.id === id ? d : r)) }));
    return (d ?? optimistic) as Row<K>;
  };

  const upsert = async <K extends Table>(
    table: K,
    row: Partial<Row<K>>,
    onConflict: string
  ): Promise<Row<K>> => {
    const now = new Date().toISOString();
    const keyCols = onConflict.split(',').map((c) => c.trim());
    // Deliberately omit id/created_at so the DB keeps the existing row's identity
    // on conflict (and generates them via defaults on a fresh insert). owner_id
    // is part of the conflict key; include it when known, else let the column's
    // auth.uid() default fill it rather than writing a null.
    const ownedRow: any = { ...(ownerId ? { owner_id: ownerId } : {}), updated_at: now, ...row };
    const matchesKey = (r: any) => keyCols.every((c) => r[c] === ownedRow[c]);

    if (OFFLINE) {
      setData((prev) => {
        const list = (prev as any)[table] as any[];
        const idx = list.findIndex(matchesKey);
        if (idx >= 0) return { ...prev, [table]: list.map((r, i) => (i === idx ? { ...r, ...ownedRow } : r)) };
        return { ...prev, [table]: [...list, { id: newId(), owner_id: 'demo-owner', created_at: now, deleted_at: null, ...ownedRow }] };
      });
      return ((data as any)[table].find(matchesKey) ?? ownedRow) as Row<K>;
    }

    // Optimistic: if we already hold the row locally, reflect the change now.
    setData((prev) => {
      const list = (prev as any)[table] as any[];
      const idx = list.findIndex(matchesKey);
      if (idx < 0) return prev;
      return { ...prev, [table]: list.map((r, i) => (i === idx ? { ...r, ...ownedRow } : r)) };
    });

    const { data: d, error } = await trackWrite(() =>
      writeWithColumnDrift(ownedRow, (p) =>
        runWithRetry(() =>
          supabase.schema('fitness').from(table as string).upsert(p, { onConflict }).select().single()
        )
      )
    );
    if (error) {
      setSyncError(friendlyError(error));
      // Don't throw — mirror update()'s design so a flaky save can't spam the
      // unhandled-rejection banner; the change is local and realtime reconciles.
      return ownedRow as Row<K>;
    }
    if (d) {
      // Replace by id or conflict key so we never leave a duplicate behind.
      setData((prev) => {
        const list = (prev as any)[table] as any[];
        const filtered = list.filter((r) => r.id !== (d as any).id && !matchesKey(r));
        return { ...prev, [table]: [...filtered, d] };
      });
    }
    return (d ?? ownedRow) as Row<K>;
  };

  const remove = async (table: Table, id: string): Promise<void> => {
    setData((prev) => ({ ...prev, [table]: (prev as any)[table].filter((r: any) => r.id !== id) }));
    if (OFFLINE) return;
    const { error } = await trackWrite(() =>
      runWithRetry(() =>
        supabase
          .schema('fitness')
          .from(table as string)
          .update({ deleted_at: new Date().toISOString() })
          .eq('id', id)
          .then((r) => ({ data: null, error: r.error }))
      )
    );
    // Same reasoning as update(): the row is already gone locally; a failed
    // delete is noted but never thrown, so it can't spam the rejection banner.
    if (error) setSyncError(friendlyError(error));
  };

  const clearSyncError = useCallback(() => setSyncError(null), []);

  return (
    <CadenceFitnessCtx.Provider
      value={{
        demo: OFFLINE,
        data,
        insert,
        update,
        upsert,
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
