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
  data: CadenceData;
  signIn: (email: string) => Promise<{ error?: string }>;
  verifyOtp: (email: string, token: string) => Promise<{ error?: string }>;
  signOut: () => Promise<void>;
  insert: <K extends Table>(table: K, row: Partial<Row<K>>) => Promise<Row<K>>;
  update: <K extends Table>(table: K, id: string, patch: Partial<Row<K>>) => Promise<Row<K>>;
  remove: (table: Table, id: string) => Promise<void>;
  reload: (table?: Table) => Promise<void>;
  logActivity: (action: string, detail?: string, actor?: string) => Promise<void>;
}

const CadenceCtx = createContext<Ctx | null>(null);

export function useCadence(): Ctx {
  const c = useContext(CadenceCtx);
  if (!c) throw new Error('useCadence must be used inside <CadenceProvider>');
  return c;
}

export function CadenceProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [data, setData] = useState<CadenceData>(emptyData());
  const [ready, setReady] = useState(false);

  // ── Auth bootstrap ──
  useEffect(() => {
    if (!isConfigured) { setReady(true); return; }
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setReady(true); });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  // ── Load one or all tables from the server ──
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

  // ── Load + subscribe to realtime whenever the session changes ──
  useEffect(() => {
    if (!session) { setData(emptyData()); return; }
    reload();
    const ch = supabase.channel('cadence-rt');
    TABLES.forEach((t) =>
      ch.on('postgres_changes', { event: '*', schema: 'public', table: t as string }, () => reload(t)),
    );
    ch.subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [session, reload]);

  const signIn = async (email: string) => {
    const { error } = await supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: true } });
    return { error: error?.message };
  };

  const verifyOtp = async (email: string, token: string) => {
    const { error } = await supabase.auth.verifyOtp({ email, token, type: 'email' });
    return { error: error?.message };
  };

  const signOut = async () => { await supabase.auth.signOut(); };

  const insert = async <K extends Table>(table: K, row: Partial<Row<K>>) => {
    const { data: d, error } = await supabase.from(table as string).insert(row as any).select().single();
    if (error) throw error;
    setData((prev) => ({ ...prev, [table]: [...(prev as any)[table], d] }));
    return d as Row<K>;
  };

  const update = async <K extends Table>(table: K, id: string, patch: Partial<Row<K>>) => {
    const { data: d, error } = await supabase.from(table as string).update(patch as any).eq('id', id).select().single();
    if (error) throw error;
    setData((prev) => ({ ...prev, [table]: (prev as any)[table].map((r: any) => (r.id === id ? d : r)) }));
    return d as Row<K>;
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
    <CadenceCtx.Provider value={{ ready, configured: isConfigured, session, data, signIn, verifyOtp, signOut, insert, update, remove, reload, logActivity }}>
      {children}
    </CadenceCtx.Provider>
  );
}
