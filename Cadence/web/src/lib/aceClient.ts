// Shared client for talking to Ace (the ace-chat Edge Function) — extracted
// from the Ace screen so the slide-over panel, prep briefs and proactive
// briefing all reuse one send path and one thread subscription, with the same
// idempotent-retry semantics everywhere.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase, isConfigured } from './supabase';
import { useCadence } from './store';
import type { AgentMessage } from './types';

export const ACE_RECIPIENT_KEY = 'agent:ace';

export type AceSendResult =
  | { accepted: true }
  | { accepted: false; reason: 'rejected' | 'transport' };

// One turn to Ace. `requestId` is the idempotency key: the ace-chat function
// (backed by migration 0041's partial unique index) treats a duplicate id as
// "already accepted", so retrying an ambiguous failure with the SAME id can
// never double-send.
export async function sendAceTurn({ message, requestId, workspaceId, kind }: {
  message: string;
  requestId: string;
  workspaceId?: string | null;
  kind?: string; // optional turn class (e.g. 'briefing') persisted in metadata
}): Promise<AceSendResult> {
  try {
    const { error } = await supabase.functions.invoke('ace-chat', {
      body: {
        message,
        request_id: requestId,
        ...(workspaceId ? { workspace_id: workspaceId } : {}),
        ...(kind ? { kind } : {}),
      },
    });
    if (error) {
      console.error('Ace error:', error);
      return { accepted: false, reason: 'rejected' };
    }
    return { accepted: true };
  } catch (e) {
    console.error('Ace error:', e);
    return { accepted: false, reason: 'transport' };
  }
}

// Idempotency-key keeper bound to the exact text a key was minted for. Reused
// only when retrying that *same* instruction after a not-accepted send;
// cleared once the function accepts the turn. If the user edits the restored
// draft, the text no longer matches and a fresh id is minted — so a changed
// instruction is never sent under the previous turn's id.
export function createTurnKeeper() {
  let pending: { id: string; text: string } | null = null;
  return {
    idFor(text: string): string {
      if (pending?.text === text) return pending.id;
      const id = crypto.randomUUID();
      pending = { id, text };
      return id;
    },
    accepted() { pending = null; },
  };
}

let channelSeq = 0;

// The agent:ace thread: a direct read of agent_messages merged with the
// global store's copy (so the screen still works if the all-table reload or
// Realtime merge misses this personal, owner-scoped chat table), kept live by
// a Realtime subscription.
export function useAceThread() {
  const { data } = useCadence();
  const [directMessages, setDirectMessages] = useState<AgentMessage[]>([]);
  const [threadError, setThreadError] = useState<string | null>(null);
  // True once the first direct read has completed (either way) — callers that
  // auto-act on "no message found" must wait for this to avoid acting on an
  // empty not-yet-loaded thread.
  const [loaded, setLoaded] = useState(false);
  const mountedRef = useRef(true);
  const directMessagesRef = useRef<AgentMessage[]>([]);

  const refresh = useCallback(async () => {
    // Unconfigured/E2E builds have no backend to read — stay inert (the
    // global store's agent_messages still feed the merged thread below).
    if (!isConfigured) { setLoaded(true); return; }
    const { data: rows, error } = await supabase
      .from('agent_messages')
      .select('*')
      .eq('recipient_key', ACE_RECIPIENT_KEY)
      .is('deleted_at', null)
      // Fetch latest 200, then render chronologically.
      .order('created_at', { ascending: false })
      .limit(200);

    if (!mountedRef.current) return;
    setLoaded(true);
    if (error) {
      console.error('Ace thread load error:', error);
      setThreadError((prev) => prev || "Couldn't load the Ace thread. Refresh and try again.");
      return;
    }
    const nextRows = [...(rows || [])].reverse() as AgentMessage[];
    const prevRows = directMessagesRef.current;
    const unchanged = prevRows.length === nextRows.length
      && prevRows.every((m, i) => m.id === nextRows[i]?.id && m.updated_at === nextRows[i]?.updated_at);
    if (!unchanged) {
      directMessagesRef.current = nextRows;
      setDirectMessages(nextRows);
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    void refresh();
    if (!isConfigured) return () => { mountedRef.current = false; };
    const channel = supabase
      .channel(`ace-thread-rt-${++channelSeq}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'agent_messages' }, () => {
        void refresh();
      })
      .subscribe();

    return () => {
      mountedRef.current = false;
      supabase.removeChannel(channel);
    };
  }, [refresh]);

  const messages = useMemo(() => {
    const byId = new Map<string, AgentMessage>();
    for (const m of directMessages) {
      if (!m.deleted_at && m.recipient_key === ACE_RECIPIENT_KEY) byId.set(m.id, m);
    }
    for (const m of data.agent_messages || []) {
      if (!m.deleted_at && m.recipient_key === ACE_RECIPIENT_KEY) byId.set(m.id, m as AgentMessage);
    }
    return [...byId.values()].sort((a, b) => a.created_at.localeCompare(b.created_at));
  }, [data.agent_messages, directMessages]);

  return { messages, refresh, threadError, loaded };
}
