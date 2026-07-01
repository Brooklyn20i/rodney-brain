import React, { createContext, useContext, useCallback, useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { isConfigured, supabase } from './supabase';
import { CadenceFinancialData, TABLES, emptyData } from './types';
import { loadDemoData } from './demoData';

type Table = keyof CadenceFinancialData;
type Row<K extends Table> = CadenceFinancialData[K][number];

// Local-only demo mode: shows fictional seed data without needing Supabase.
// Never set VITE_DEMO in a deployed environment -- see .env.example.
const DEMO_MODE = import.meta.env.VITE_DEMO === '1';

export interface Ctx {
  ready: boolean;
  configured: boolean;
  demo: boolean;
  session: Session | null;
  needsPasswordSet: boolean;
  data: CadenceFinancialData;
  signIn: (email: string, password: string) => Promise<{ error?: string }>;
  setPassword: (password: string) => Promise<{ error?: string }>;
  resetPassword: (email: string) => Promise<{ error?: string }>;
  signOut: () => Promise<void>;
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
  const [session, setSession] = useState<Session | null>(null);
  const [needsPasswordSet, setNeedsPasswordSet] = useState(false);
  const [data, setData] = useState<CadenceFinancialData>(() => (DEMO_MODE ? loadDemoData() : emptyData()));
  const [ready, setReady] = useState(DEMO_MODE);
  const [syncError, setSyncError] = useState<string | null>(null);

  const reload = useCallback(async (table?: Table) => {
    if (DEMO_MODE) return;
    const tables = table ? [table] : TABLES;
    const results = await Promise.all(
      tables.map(async (t) => {
        const r = await supabase
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
    if (DEMO_MODE || !isConfigured) {
      setReady(true);
      return;
    }
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setReady(true);
    });
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

  useEffect(() => {
    if (DEMO_MODE) return;
    if (!session || needsPasswordSet) {
      setData(emptyData());
      return;
    }
    reload();
    const ch = supabase.channel('cadence-financial-rt');
    TABLES.forEach((t) =>
      ch.on('postgres_changes', { event: '*', schema: 'public', table: t as string }, () => reload(t))
    );
    ch.subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
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

  const signOut = async () => {
    if (DEMO_MODE) return;
    await supabase.auth.signOut();
  };

  const insert = async <K extends Table>(table: K, row: Partial<Row<K>>): Promise<Row<K>> => {
    const now = new Date().toISOString();
    const stamped: any = { id: newId(), created_at: now, updated_at: now, deleted_at: null, ...row };

    if (DEMO_MODE) {
      const withOwner = { owner_id: 'demo-owner', ...stamped };
      setData((prev) => ({ ...prev, [table]: [...(prev as any)[table], withOwner] }));
      return withOwner as Row<K>;
    }

    const ownedRow = session?.user?.id ? { owner_id: session.user.id, ...stamped } : stamped;
    const { data: d, error } = await supabase.from(table as string).insert(ownedRow).select().single();
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

    const { data: d, error } = await supabase.from(table as string).update(patch as any).eq('id', id).select().single();
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
    const { error } = await supabase
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
        ready,
        configured: isConfigured,
        demo: DEMO_MODE,
        session,
        needsPasswordSet,
        data,
        signIn,
        setPassword,
        resetPassword,
        signOut,
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
