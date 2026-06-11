import { createClient } from '@supabase/supabase-js';

// GitHub Pages serves this as a static app. The Supabase publishable key is
// intentionally browser-visible; safety comes from RLS, not secrecy. Build-time
// env vars still override these defaults for non-production projects.
const defaultUrl = 'https://uimjzehrykeebocphdna.supabase.co';
const defaultAnonKey = 'sb_publishable_QIu9g9ULRa-spgzHUJWSqQ_cVKMv9sr';

const url = (import.meta.env.VITE_SUPABASE_URL as string | undefined) || defaultUrl;
const anonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) || defaultAnonKey;

// Surfaced in the UI if the build wasn't given its keys.
export const isConfigured = Boolean(url && anonKey);

// A harmless placeholder client when unconfigured keeps the app from crashing
// before setup; the login screen explains what to do.
export const supabase = createClient(
  url || 'https://placeholder.supabase.co',
  anonKey || 'placeholder-anon-key',
  { auth: { persistSession: true, autoRefreshToken: true } },
);
