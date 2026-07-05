import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase, isConfigured } from './supabase';
import { CadenceData, TABLES, emptyData, Workspace, WorkspaceMember } from './types';
import { enqueue, dequeueAll, dropEntry, queueCount, isNetworkError } from './offlineQueue';

type Table = keyof CadenceData;
type Row<K extends Table> = CadenceData[K][number];

export interface Ctx {
  ready: boolean;
  configured: boolean;
  session: Session | null;
  needsPasswordSet: boolean;
  data: CadenceData;
  workspace: Workspace | null;
  workspaceMembers: WorkspaceMember[];
  signIn: (email: string, password: string) => Promise<{ error?: string }>;
  signUp: (email: string, password: string, name: string) => Promise<{ error?: string; needsConfirm?: boolean }>;
  setPassword: (password: string) => Promise<{ error?: string }>;
  resetPassword: (email: string) => Promise<{ error?: string }>;
  signOut: () => Promise<void>;
  insert: <K extends Table>(table: K, row: Partial<Row<K>>) => Promise<Row<K>>;
  update: <K extends Table>(table: K, id: string, patch: Partial<Row<K>>) => Promise<Row<K>>;
  remove: (table: Table, id: string) => Promise<void>;
  reload: (table?: Table) => Promise<void>;
  logActivity: (action: string, detail?: string, actor?: string) => Promise<void>;
  myRole: 'admin' | 'editor' | 'viewer' | null;
  canEdit: boolean;
  syncError: string | null;
  clearSyncError: () => void;
  createWorkspace: (name: string) => Promise<void>;
  createInvite: (role: 'admin' | 'editor' | 'viewer') => Promise<string>;
  removeWorkspaceMember: (userId: string) => Promise<void>;
  acceptInvite: (token: string) => Promise<{ ok?: boolean; error?: string }>;
  pendingCount: number;
  isOffline: boolean;
  isSyncing: boolean;
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

export const CadenceCtx = createContext<Ctx | null>(null);

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
  const [syncError, setSyncError] = useState<string | null>(null);
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [workspaceMembers, setWorkspaceMembers] = useState<WorkspaceMember[]>([]);
  const [pendingCount, setPendingCount] = useState(() => queueCount());
  const [isOffline, setIsOffline] = useState(() => !navigator.onLine);
  const [isSyncing, setIsSyncing] = useState(false);
  const drainInFlight = useRef(false);
  const drainQueueRef = useRef<() => Promise<void>>(() => Promise.resolve());

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

  const reload = useCallback(async (table?: Table, workspaceId?: string | null) => {
    const tables = table ? [table] : TABLES;
    const results = await Promise.all(tables.map(async (t) => {
      const base = supabase.from(t as string).select('*');
      // Scope to workspace when available (migration 0012+ applied).
      const q = workspaceId ? (base as any).eq('workspace_id', workspaceId) : base;
      const r = t === 'activity'
        ? await q.order('created_at', { ascending: false }).limit(200)
        : t === 'agent_messages'
        // agent_messages is owner-scoped via RLS, not workspace-scoped; skip workspace filter
        // so Kobe's replies appear regardless of whether workspace_id is set on the row.
        ? await base.is('deleted_at', null).order('created_at', { ascending: true }).limit(200)
        : await q.is('deleted_at', null).order('created_at', { ascending: true });
      return { t, r };
    }));
    setData((prev) => {
      const next = { ...prev };
      results.forEach(({ t, r }) => { if (!r.error && r.data) (next as any)[t] = r.data; });
      return next;
    });
  }, []);

  // Online/offline tracking + queue drain on reconnect.
  useEffect(() => {
    const onOnline = () => {
      setIsOffline(false);
      if (queueCount() > 0) drainQueueRef.current();
    };
    const onOffline = () => setIsOffline(true);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  const drainQueue: () => Promise<void> = useCallback(async () => {
    if (drainInFlight.current) return;
    const entries = dequeueAll();
    if (entries.length === 0) return;
    drainInFlight.current = true;
    setIsSyncing(true);
    let _failed = 0;
    for (const entry of entries) {
      try {
        const { op } = entry;
        if (op.op === 'insert') {
          // Row carries a client-generated id, so replay is idempotent: a
          // duplicate insert collides on the primary key and is treated as done.
          const { error } = await supabase.from(op.table).insert(op.row);
          if (!error || /duplicate key|already exists/i.test(error.message || '')) dropEntry(entry.qid);
          else if (!isNetworkError(error)) dropEntry(entry.qid);
          else _failed++;
        } else if (op.op === 'update') {
          const { error } = await supabase
            .from(op.table)
            .update(op.patch)
            .eq('id', op.id);
          if (!error) dropEntry(entry.qid);
          else if (!isNetworkError(error)) {
            // Permanent error — drop it (don't retry forever).
            dropEntry(entry.qid);
          } else {
            _failed++;
          }
        } else if (op.op === 'remove') {
          const { error } = await supabase
            .from(op.table)
            .update({ deleted_at: new Date().toISOString() })
            .eq('id', op.id);
          if (!error) dropEntry(entry.qid);
          else if (!isNetworkError(error)) {
            dropEntry(entry.qid);
          } else {
            _failed++;
          }
        }
      } catch {
        _failed++;
      }
    }
    const remaining = queueCount();
    setPendingCount(remaining);
    setIsSyncing(false);
    drainInFlight.current = false;
    // Reload all tables to pick up any server-side changes.
    if (remaining === 0) await reload(undefined, workspace?.id ?? null);
  }, [reload, workspace]);

  // Keep the ref up to date so the online handler always calls the latest drain.
  useEffect(() => { drainQueueRef.current = drainQueue; }, [drainQueue]);

  // Resolve workspace membership after login. A brand-new user (self-serve
  // signup) has no membership yet, so we provision them their own workspace —
  // giving them an isolated space (own owner_id + own workspace) that no other
  // user can see. Existing users just load their workspace.
  useEffect(() => {
    if (!session || needsPasswordSet) { setWorkspace(null); setWorkspaceMembers([]); return; }
    let cancelled = false;
    (async () => {
      const { data: wm } = await supabase
        .from('workspace_members')
        .select('workspace_id, workspaces(id, name, created_by, plan, created_at, updated_at, deleted_at)')
        .eq('user_id', session.user.id)
        .limit(1)
        .maybeSingle();
      if (cancelled) return;
      if ((wm as any)?.workspaces) { setWorkspace((wm as any).workspaces as Workspace); return; }
      // No workspace — first login. Create one, named after the user if we have it.
      const name = (session.user.user_metadata?.name as string | undefined)?.trim();
      const { data: ws, error: wsErr } = await supabase
        .from('workspaces')
        .insert({ name: name ? `${name}'s Cadence` : 'My Cadence', created_by: session.user.id })
        .select()
        .single();
      if (wsErr || !ws || cancelled) return; // pre-migration or RLS: owner_id still protects data
      await supabase.from('workspace_members').insert({
        workspace_id: ws.id, user_id: session.user.id, role: 'admin', email: session.user.email ?? '',
      });
      if (!cancelled) setWorkspace(ws as Workspace);
    })();
    return () => { cancelled = true; };
  }, [session, needsPasswordSet]);

  // Fetch all workspace members whenever the workspace is resolved.
  useEffect(() => {
    if (!workspace) { setWorkspaceMembers([]); return; }
    supabase
      .from('workspace_members')
      .select('*')
      .eq('workspace_id', workspace.id)
      .then(({ data: members }) => {
        if (members) setWorkspaceMembers(members as WorkspaceMember[]);
      });
  }, [workspace]);

  useEffect(() => {
    if (!session || needsPasswordSet) { setData(emptyData()); return; }
    const wid = workspace?.id ?? null;
    reload(undefined, wid);
    const ch = supabase.channel('cadence-rt');
    TABLES.forEach((t) =>
      ch.on('postgres_changes', { event: '*', schema: 'public', table: t as string }, () => reload(t, wid)),
    );
    ch.subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [session, needsPasswordSet, workspace, reload]);

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error: error?.message };
  };

  // Self-serve signup. Supabase requires email confirmation, so a fresh signup
  // returns needsConfirm and no session until the link is clicked. On first
  // sign-in the effect below provisions the user their own workspace, so their
  // account is fully isolated (own owner_id + own workspace) from every other.
  const signUp = async (email: string, password: string, name: string) => {
    const { data, error } = await supabase.auth.signUp({
      email: email.trim().toLowerCase(),
      password,
      options: {
        data: { name: name.trim() },
        emailRedirectTo: `${window.location.origin}/work`,
      },
    });
    if (error) return { error: error.message };
    // No session means a confirmation email was sent (email confirmation is on).
    return { needsConfirm: !data.session };
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

  // The current user's role in the active workspace. Null when there's no
  // membership record yet (single-user / pre-migration) — treated as full access.
  const myRole: 'admin' | 'editor' | 'viewer' | null =
    (session && workspaceMembers.find((m) => m.user_id === session.user.id)?.role) || null;
  // Viewers are read-only; everyone else (incl. no-membership owner) can write.
  const canEdit = myRole !== 'viewer';

  const insert = async <K extends Table>(table: K, row: Partial<Row<K>>) => {
    if (!canEdit) { setSyncError('You have read-only access to this workspace.'); throw new Error('read-only'); }
    // Always include owner_id + workspace_id so rows are correctly scoped.
    // workspace_id is omitted pre-migration and dropMissingColumn handles it gracefully.
    const ownedRow = session?.user?.id
      ? { owner_id: session.user.id, ...(workspace?.id ? { workspace_id: workspace.id } : {}), ...row }
      : row;

    // Offline: stamp a client id so the optimistic row and the queued replay
    // share one stable primary key (idempotent on reconnect), then queue it.
    if (!navigator.onLine) {
      const now = new Date().toISOString();
      const offlineRow: any = {
        id: (row as any).id || crypto.randomUUID(),
        created_at: now, updated_at: now, deleted_at: null,
        ...ownedRow,
      };
      enqueue({ op: 'insert', table: table as string, row: offlineRow });
      setPendingCount((c) => c + 1);
      setData((prev) => ({ ...prev, [table]: [...(prev as any)[table], offlineRow] }));
      return offlineRow as Row<K>;
    }

    let payload: any = ownedRow;
    // Tolerate a database that predates a migration: if a column the app writes
    // doesn't exist yet, drop it and retry rather than failing the whole save.
    for (let i = 0; i < 8; i++) {
      const { data: d, error } = await supabase.from(table as string).insert(payload).select().single();
      if (!error) {
        setData((prev) => ({ ...prev, [table]: [...(prev as any)[table], d] }));
        return d as Row<K>;
      }
      if (isNetworkError(error)) {
        // Dropped connection mid-save — stamp an id and queue for replay.
        const now = new Date().toISOString();
        const offlineRow: any = { id: payload.id || crypto.randomUUID(), created_at: now, updated_at: now, deleted_at: null, ...payload };
        enqueue({ op: 'insert', table: table as string, row: offlineRow });
        setPendingCount((c) => c + 1);
        setData((prev) => ({ ...prev, [table]: [...(prev as any)[table], offlineRow] }));
        return offlineRow as Row<K>;
      }
      const stripped = dropMissingColumn(payload, error);
      if (!stripped) { setSyncError(error?.message || 'Save failed'); throw error; }
      payload = stripped;
    }
    setSyncError('Save failed — too many column errors');
    throw new Error('insert failed after stripping unknown columns');
  };

  const update = async <K extends Table>(table: K, id: string, patch: Partial<Row<K>>) => {
    if (!canEdit) { setSyncError('You have read-only access to this workspace.'); throw new Error('read-only'); }
    // Optimistic: apply patch to state immediately for instant UI feedback.
    const prev = (data as any)[table].find((r: any) => r.id === id) as Row<K> | undefined;
    setData((prev) => ({
      ...prev,
      [table]: (prev as any)[table].map((r: any) => (r.id === id ? { ...r, ...patch } : r)),
    }));

    if (!navigator.onLine) {
      enqueue({ op: 'update', table: table as string, id, patch: patch as Record<string, unknown> });
      setPendingCount((c) => c + 1);
      return { ...prev, ...patch } as Row<K>;
    }

    let payload: any = patch;
    for (let i = 0; i < 8; i++) {
      const { data: d, error } = await supabase.from(table as string).update(payload).eq('id', id).select().single();
      if (!error) {
        setData((p) => ({ ...p, [table]: (p as any)[table].map((r: any) => (r.id === id ? d : r)) }));
        return d as Row<K>;
      }
      if (isNetworkError(error)) {
        enqueue({ op: 'update', table: table as string, id, patch: payload });
        setPendingCount((c) => c + 1);
        return { ...prev, ...payload } as Row<K>;
      }
      const stripped = dropMissingColumn(payload, error);
      if (!stripped) {
        // Rollback optimistic state on non-network errors.
        if (prev) setData((p) => ({ ...p, [table]: (p as any)[table].map((r: any) => (r.id === id ? prev : r)) }));
        setSyncError(error?.message || 'Save failed');
        throw error;
      }
      payload = stripped;
    }
    setSyncError('Save failed — too many column errors');
    throw new Error('update failed after stripping unknown columns');
  };

  const remove = async (table: Table, id: string) => {
    if (!canEdit) { setSyncError('You have read-only access to this workspace.'); throw new Error('read-only'); }
    // Optimistic: remove from state immediately.
    const removed = (data as any)[table].find((r: any) => r.id === id);
    setData((prev) => ({ ...prev, [table]: (prev as any)[table].filter((r: any) => r.id !== id) }));

    if (!navigator.onLine) {
      enqueue({ op: 'remove', table: table as string, id });
      setPendingCount((c) => c + 1);
      return;
    }

    const { error } = await supabase.from(table as string).update({ deleted_at: new Date().toISOString() }).eq('id', id);
    if (!error) return;
    if (isNetworkError(error)) {
      enqueue({ op: 'remove', table: table as string, id });
      setPendingCount((c) => c + 1);
      return;
    }
    // Rollback on permanent error.
    if (removed) setData((prev) => ({ ...prev, [table]: [...(prev as any)[table], removed] }));
    setSyncError(error?.message || 'Delete failed');
    throw error;
  };

  const logActivity = async (action: string, detail = '', actor = 'you') => {
    try { await insert('activity', { actor, action, detail } as any); } catch { /* non-critical */ }
  };

  const createWorkspace = async (name: string): Promise<void> => {
    const { data: ws, error: wsErr } = await supabase
      .from('workspaces')
      .insert({ name: name.trim(), created_by: session!.user.id })
      .select()
      .single();
    if (wsErr || !ws) { setSyncError(wsErr?.message || 'Could not create workspace'); throw wsErr; }

    const { error: memErr } = await supabase
      .from('workspace_members')
      .insert({ workspace_id: ws.id, user_id: session!.user.id, role: 'admin', email: session!.user.email ?? '' });
    if (memErr) { setSyncError(memErr.message || 'Could not join workspace'); throw memErr; }

    setWorkspace(ws as Workspace);
  };

  const createInvite = async (role: 'admin' | 'editor' | 'viewer'): Promise<string> => {
    if (!workspace?.id) throw new Error('No workspace');
    const link = (id: string) => window.location.origin + window.location.pathname + '?invite=' + id;

    // Reuse an existing unexpired, unaccepted invite for this role rather than
    // minting a fresh token (and orphan row) every time the panel is opened.
    const { data: existing } = await supabase
      .from('workspace_invites')
      .select('id')
      .eq('workspace_id', workspace.id)
      .eq('role', role)
      .is('accepted_at', null)
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (existing?.id) return link(existing.id);

    const { data: row, error } = await supabase
      .from('workspace_invites')
      .insert({ workspace_id: workspace.id, invited_by: session!.user.id, role })
      .select('id')
      .single();
    if (error || !row) { setSyncError(error?.message || 'Could not create invite'); throw error; }
    return link(row.id);
  };

  const removeWorkspaceMember = async (userId: string): Promise<void> => {
    if (!workspace?.id) return;
    const { error } = await supabase
      .from('workspace_members')
      .delete()
      .eq('workspace_id', workspace.id)
      .eq('user_id', userId);
    if (error) { setSyncError(error?.message || 'Could not remove member'); throw error; }
    setWorkspaceMembers((prev) => prev.filter((m) => m.user_id !== userId));
  };

  const acceptInvite = async (token: string): Promise<{ ok?: boolean; error?: string }> => {
    const { data, error } = await supabase.rpc('accept_workspace_invite', { token });
    if (error) return { error: error.message };
    if ((data as any)?.error) return { error: (data as any).error };
    // Refresh workspace after acceptance.
    const { data: wm } = await supabase
      .from('workspace_members')
      .select('workspace_id, workspaces(id, name, created_by, plan, created_at, updated_at, deleted_at)')
      .eq('user_id', session!.user.id)
      .limit(1)
      .single();
    if (wm) setWorkspace((wm as any).workspaces as Workspace ?? null);
    return { ok: true };
  };

  const clearSyncError = useCallback(() => setSyncError(null), []);

  return (
    <CadenceCtx.Provider value={{ ready, configured: isConfigured, session, needsPasswordSet, data, workspace, workspaceMembers, signIn, signUp, setPassword, resetPassword, signOut, insert, update, remove, reload, logActivity, myRole, canEdit, syncError, clearSyncError, createWorkspace, createInvite, removeWorkspaceMember, acceptInvite, pendingCount, isOffline, isSyncing }}>
      {children}
    </CadenceCtx.Provider>
  );
}
