import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

// Surfaced in the UI if the build wasn't given its keys.
export const isConfigured = Boolean(url && anonKey);

// A harmless placeholder client when unconfigured keeps the app from crashing
// before setup; the login screen explains what to do.
export const supabase = createClient(
  url || 'https://placeholder.supabase.co',
  anonKey || 'placeholder-anon-key',
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      // Password-recovery links come back as a ?code= param; detectSessionInUrl
      // consumes it (PKCE code-exchange) and fires PASSWORD_RECOVERY on this
      // device. PKCE (not implicit) keeps access tokens out of the URL fragment
      // — no tokens in browser history / referrers. signInWithPassword (the main
      // path) is unaffected by flowType, and existing sessions stay valid.
      // Recovery must be opened in the same browser it was requested from (the
      // code verifier lives in this device's localStorage) — the reset UI says so.
      detectSessionInUrl: true,
      flowType: 'pkce',
    },
  },
);
