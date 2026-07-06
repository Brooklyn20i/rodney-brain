// Client wrapper around the WHOOP Edge Functions + connection status.
//
// The browser never touches WHOOP tokens — it only kicks the server-side flow
// (whoop-oauth-start / whoop-sync / whoop-disconnect) with the user's JWT
// (supabase.functions.invoke attaches it) and reads the whoop_connection status
// row (RLS-scoped to the owner) to render the Sync screen.

import { supabase } from '../../lib/supabase';
import type { WhoopConnection } from './types';

// Begin the OAuth connect flow: ask the server for the WHOOP authorize URL,
// then send the browser there. `returnTo` is where WHOOP bounces back to after
// approval (this Sync screen), so the result banner shows up in the app.
export async function whoopConnect(returnTo: string): Promise<void> {
  const { data, error } = await supabase.functions.invoke('whoop-oauth-start', {
    body: { redirect_to: returnTo },
  });
  if (error) throw new Error(error.message || 'Could not start WHOOP connect');
  const url = (data as { url?: string })?.url;
  if (!url) throw new Error('WHOOP connect URL missing from response');
  window.location.href = url;
}

export interface SyncResult {
  ok: boolean;
  days_written?: number;
  error?: string;
}

// Trigger an on-demand sync for the signed-in user. Returns how many days were
// written (or the error the server recorded).
export async function whoopSyncNow(days = 14): Promise<SyncResult> {
  const { data, error } = await supabase.functions.invoke('whoop-sync', { body: { days } });
  if (error) {
    // The function returns 502 with a body on a per-owner failure; surface it.
    const ctx = (error as { context?: { error?: string } })?.context;
    return { ok: false, error: ctx?.error || error.message || 'Sync failed' };
  }
  const result = (data as { results?: SyncResult[] })?.results?.[0];
  return result ?? { ok: false, error: 'No result returned' };
}

export async function whoopDisconnect(): Promise<void> {
  const { error } = await supabase.functions.invoke('whoop-disconnect', { body: {} });
  if (error) throw new Error(error.message || 'Disconnect failed');
}

// Read the current connection status, or null if WHOOP has never been
// connected on this account.
export async function getWhoopConnection(): Promise<WhoopConnection | null> {
  const { data, error } = await supabase
    .schema('fitness')
    .from('whoop_connection')
    .select('*')
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as WhoopConnection) ?? null;
}
