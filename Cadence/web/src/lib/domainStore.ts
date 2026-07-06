// Shared scaffolding for the schema-scoped domain stores (Financial, Fitness).
// Both track the signed-in user's id the same way and load their tables with
// the same query; keeping that here means one place to change, not two copies
// that drift. (The Work store is intentionally separate — it adds workspace
// scoping + an offline queue on top of this.)

import { useEffect, useState } from 'react';
import { supabase } from './supabase';

// The signed-in user's id, kept in sync with auth. `offline` (demo/e2e) skips
// Supabase entirely and leaves it null so no queries run.
export function useSupabaseOwnerId(offline: boolean): string | null {
  const [ownerId, setOwnerId] = useState<string | null>(null);
  useEffect(() => {
    if (offline) return;
    supabase.auth.getSession().then(({ data }) => setOwnerId(data.session?.user?.id ?? null));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => setOwnerId(s?.user?.id ?? null));
    return () => sub.subscription.unsubscribe();
  }, [offline]);
  return ownerId;
}

export interface TableFetch {
  t: string;
  error: unknown;
  data: unknown[] | null;
}

// Load the given tables from one Postgres schema: live (non-deleted) rows,
// oldest first — the shape every domain screen expects. Returns per-table
// results so the caller can merge only the ones that succeeded.
export async function fetchSchemaTables(schema: string, tables: readonly string[]): Promise<TableFetch[]> {
  return Promise.all(
    tables.map(async (t) => {
      const r = await supabase
        .schema(schema)
        .from(t)
        .select('*')
        .is('deleted_at', null)
        .order('created_at', { ascending: true });
      return { t, error: r.error, data: r.data };
    })
  );
}
