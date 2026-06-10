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
  { auth: { persistSession: true, autoRefreshToken: true } },
);
