import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase, isConfigured } from './supabase';
import { CadenceData, TABLES, emptyData } from './types';

type Table = keyof CadenceData;
type Row<K extends Table> = CadenceData[K][number];

interface Ctx {
  ready: boolean;
  configured: boolean;
  session: Session | null;
  needsPasswordSet: boolean;
  data: CadenceData;
  signIn: (email: string, password: string) => Promise<{ error?: string }>;
  setPassword: (password: string) => Promise<{ error?: string }>;
  resetPassword: (email: string) => Promise<{ error?: string }>;
  signOut: () => Promise<void>;
  insert: <K extends Table>(table: K, row: Partial<Row<K>>) => Promise<Row<K>>;
  update: <K extends Table>(table: K, id: string, patch: Partial<Row<K>>) => Promise<Row<K>>;
  remove: (table: Table, id: string) => Promise<void>;
  reload: (table?: Table) => Promise<void>;
  logActivity: (action: string, detail?: string, actor?: string) => Promise<void>;
}

// If a write fails because a column doesn't exist in the database yet (the
// schema predates a migration), pull the offending column name out of the
// Postgres / PostgREST error and return a copy of the payload without it, so
// the caller can retry. Returns null if the error isn't a missing-column error
// or the column can't be identified / isn't present in the payload.
function dropMissingColumn(payload: any, error: any): any | null {
  const msg = String(error?.message || error || '') + ' ' + String(error?.details || '');
  const m =
    msg.match(/could not find the '([^']+)' column/i) ||  // PostgREST PGRST204
    msg.match(/column "([^"]+)"/i) ||                       // Postgres 42703 (quoted)
    msg.match(/column ([a-z0-9_]+) does not exist/i);       // Postgres 42703 (unquoted)
  const col = m?.[1];
  if (!col || !(col in payload)) return null;
  const { [col]: _omit, ...rest } = payload;
  return rest;
}

const CadenceCtx = createContext<Ctx | null>(null);

export function useCadence(): Ctx {
  const c = useContext(CadenceCtx);
  if (!c) throw new Error('useCadence must be used inside <CadenceProvider>');
  return c;
}

export function CadenceProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [needsPasswordSet, setNeedsPasswordSet] = useState(false);
  const [data, setData] = useState<CadenceData>(emptyData());
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!isConfigured) { setReady(true); return; }
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setReady(true); });
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      if (event === 'PASSWORD_RECOVERY') {
        setSession(s);
        setNeedsPasswordSet(true);
      } else {
        setNeedsPasswordSet(false);
        setSession(s);
      }
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const reload = useCallback(async (table?: Table) => {
    const tables = table ? [table] : TABLES;
    const results = await Promise.all(tables.map(async (t) => {
      const q = supabase.from(t as string).select('*');
      const r = t === 'activity'
        ? await q.order('created_at', { ascending: false }).limit(200)
        : await q.is('deleted_at', null).order('created_at', { ascending: true });
      return { t, r };
    }));
    setData((prev) => {
      const next = { ...prev };
      results.forEach(({ t, r }) => { if (!r.error && r.data) (next as any)[t] = r.data; });
      return next;
    });
  }, []);

  useEffect(() => {
    if (!session || needsPasswordSet) { setData(emptyData()); return; }
    reload();
    const ch = supabase.channel('cadence-rt');
    TABLES.forEach((t) =>
      ch.on('postgres_changes', { event: '*', schema: 'public', table: t as string }, () => reload(t)),
    );
    ch.subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [session, needsPasswordSet, reload]);

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error: error?.message };
  };

  const setPassword = async (password: string) => {
    const { error } = await supabase.auth.updateUser({ password });
    if (!error) setNeedsPasswordSet(false);
    return { error: error?.message };
  };

  const resetPassword = async (email: string) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin + window.location.pathname,
    });
    return { error: error?.message };
  };

  const signOut = async () => { await supabase.auth.signOut(); };

  const insert = async <K extends Table>(table: K, row: Partial<Row<K>>) => {
    // Always include owner_id so tables that lack DEFAULT auth.uid() still work
    const ownedRow = session?.user?.id ? { owner_id: session.user.id, ...row } : row;
    let payload: any = ownedRow;
    // Tolerate a database that predates a migration: if a column the app writes
    // doesn't exist yet, drop it and retry rather than failing the whole save.
    for (let i = 0; i < 8; i++) {
      const { data: d, error } = await supabase.from(table as string).insert(payload).select().single();
      if (!error) {
        setData((prev) => ({ ...prev, [table]: [...(prev as any)[table], d] }));
        return d as Row<K>;
      }
      const stripped = dropMissingColumn(payload, error);
      if (!stripped) throw error;
      payload = stripped;
    }
    throw new Error('insert failed after stripping unknown columns');
  };

  const update = async <K extends Table>(table: K, id: string, patch: Partial<Row<K>>) => {
    let payload: any = patch;
    for (let i = 0; i < 8; i++) {
      const { data: d, error } = await supabase.from(table as string).update(payload).eq('id', id).select().single();
      if (!error) {
        setData((prev) => ({ ...prev, [table]: (prev as any)[table].map((r: any) => (r.id === id ? d : r)) }));
        return d as Row<K>;
      }
      const stripped = dropMissingColumn(payload, error);
      if (!stripped) throw error;
      payload = stripped;
    }
    throw new Error('update failed after stripping unknown columns');
  };

  const remove = async (table: Table, id: string) => {
    const { error } = await supabase.from(table as string).update({ deleted_at: new Date().toISOString() }).eq('id', id);
    if (error) throw error;
    setData((prev) => ({ ...prev, [table]: (prev as any)[table].filter((r: any) => r.id !== id) }));
  };

  const logActivity = async (action: string, detail = '', actor = 'you') => {
    try { await insert('activity', { actor, action, detail } as any); } catch { /* non-critical */ }
  };

  return (
    <CadenceCtx.Provider value={{ ready, configured: isConfigured, session, needsPasswordSet, data, signIn, setPassword, resetPassword, signOut, insert, update, remove, reload, logActivity }}>
      {children}
    </CadenceCtx.Provider>
  );
}
