// Shared WHOOP API client for the Cadence Edge Functions.
//
// Not deployed as its own function — Supabase treats a leading-underscore
// folder as shared code, imported by the real functions via `../_shared/whoop.ts`.
//
// Covers: OAuth constants, the token exchange + refresh (WHOOP rotates the
// refresh token on every refresh, so we always persist the *new* one),
// paginated GETs against the v2 API, and mapping WHOOP's shapes onto Cadence's
// recovery_metrics rows. WHOOP API v2 base + OAuth endpoints per
// developer.whoop.com (OAuth 2.0 authorization-code flow, `offline` scope for a
// refresh token).

import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export const WHOOP_AUTH_URL = "https://api.prod.whoop.com/oauth/oauth2/auth";
export const WHOOP_TOKEN_URL = "https://api.prod.whoop.com/oauth/oauth2/token";
export const WHOOP_API_BASE = "https://api.prod.whoop.com/developer";

// `offline` is required to get a refresh token at all; the rest are read scopes
// for the streams we ingest. Space-separated in the authorize request.
export const WHOOP_SCOPES = [
  "offline",
  "read:recovery",
  "read:cycles",
  "read:sleep",
  "read:profile",
] as const;

export interface WhoopTokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number; // seconds
  scope?: string;
  token_type: string;
}

export interface StoredToken {
  owner_id: string;
  access_token: string;
  refresh_token: string;
  expires_at: string; // ISO
  scopes: string;
}

// A service-role client — bypasses RLS, the only role allowed to touch the
// token table. SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are injected by the
// platform. Schema-qualified to `fitness` where the tables live.
export function serviceClient(): SupabaseClient {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { db: { schema: "fitness" }, auth: { persistSession: false } },
  );
}

function requireEnv(name: string): string {
  const v = Deno.env.get(name);
  if (!v) throw new Error(`Missing required secret: ${name}`);
  return v;
}

export const whoopConfig = () => ({
  clientId: requireEnv("WHOOP_CLIENT_ID"),
  clientSecret: requireEnv("WHOOP_CLIENT_SECRET"),
  // Must exactly match a redirect URI registered on the WHOOP app; points at
  // the whoop-oauth-callback function.
  redirectUri: requireEnv("WHOOP_REDIRECT_URI"),
});

// Exchange an authorization code (first connect) for tokens.
export async function exchangeCode(code: string): Promise<WhoopTokenResponse> {
  const { clientId, clientSecret, redirectUri } = whoopConfig();
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
  });
  const resp = await fetch(WHOOP_TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!resp.ok) {
    throw new Error(`WHOOP token exchange failed (${resp.status}): ${(await resp.text()).slice(0, 300)}`);
  }
  return await resp.json();
}

// Refresh an access token. WHOOP returns a NEW refresh token each time and
// invalidates the old one, so callers MUST persist the returned refresh_token.
export async function refreshToken(refresh: string): Promise<WhoopTokenResponse> {
  const { clientId, clientSecret } = whoopConfig();
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refresh,
    client_id: clientId,
    client_secret: clientSecret,
    // Re-request offline so the refreshed grant still yields a refresh token.
    scope: "offline",
  });
  const resp = await fetch(WHOOP_TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!resp.ok) {
    throw new Error(`WHOOP token refresh failed (${resp.status}): ${(await resp.text()).slice(0, 300)}`);
  }
  return await resp.json();
}

export function tokenExpiry(expiresInSeconds: number): string {
  // 60s safety margin so we never present a token that dies mid-request.
  return new Date(Date.now() + (expiresInSeconds - 60) * 1000).toISOString();
}

// Persist a token response for an owner (upsert on owner_id). Keeps the newest
// refresh token; if WHOOP omitted one on a refresh (shouldn't with `offline`),
// fall back to the previous value passed in.
export async function saveToken(
  supabase: SupabaseClient,
  ownerId: string,
  tok: WhoopTokenResponse,
  previousRefresh?: string,
): Promise<StoredToken> {
  const refresh = tok.refresh_token ?? previousRefresh;
  if (!refresh) throw new Error("WHOOP returned no refresh token and none was stored");
  const row: StoredToken = {
    owner_id: ownerId,
    access_token: tok.access_token,
    refresh_token: refresh,
    expires_at: tokenExpiry(tok.expires_in),
    scopes: tok.scope ?? "",
  };
  const { error } = await supabase.from("whoop_oauth_token").upsert(row, { onConflict: "owner_id" });
  if (error) throw new Error(`persist token: ${error.message}`);
  return row;
}

// Return a valid access token for the owner, refreshing (and rotating) if the
// stored one is expired or within the safety margin. Throws if the owner has no
// stored token (i.e. never connected / disconnected).
export async function getValidAccessToken(supabase: SupabaseClient, ownerId: string): Promise<string> {
  const { data, error } = await supabase
    .from("whoop_oauth_token")
    .select("access_token, refresh_token, expires_at")
    .eq("owner_id", ownerId)
    .maybeSingle();
  if (error) throw new Error(`load token: ${error.message}`);
  if (!data) throw new Error("No WHOOP token stored for this user");

  const expiresAt = new Date(data.expires_at).getTime();
  if (expiresAt > Date.now()) return data.access_token as string;

  const refreshed = await refreshToken(data.refresh_token as string);
  const saved = await saveToken(supabase, ownerId, refreshed, data.refresh_token as string);
  return saved.access_token;
}

// GET a WHOOP collection endpoint, following nextToken pagination, bounded by a
// hard page cap so a runaway response can't spin forever.
export async function whoopGetAll<T>(
  accessToken: string,
  path: string,
  params: Record<string, string> = {},
  maxPages = 25,
): Promise<T[]> {
  const out: T[] = [];
  let nextToken: string | undefined;
  for (let page = 0; page < maxPages; page++) {
    const qs = new URLSearchParams({ limit: "25", ...params });
    if (nextToken) qs.set("nextToken", nextToken);
    const resp = await fetch(`${WHOOP_API_BASE}${path}?${qs}`, {
      headers: { authorization: `Bearer ${accessToken}` },
    });
    if (!resp.ok) {
      throw new Error(`WHOOP GET ${path} failed (${resp.status}): ${(await resp.text()).slice(0, 200)}`);
    }
    const body = await resp.json();
    if (Array.isArray(body?.records)) out.push(...body.records);
    nextToken = body?.next_token || undefined;
    if (!nextToken) break;
  }
  return out;
}

// ── WHOOP v2 response shapes (only the fields we read) ──────────────────────
interface WhoopRecovery {
  cycle_id: number;
  sleep_id: string;
  created_at: string;
  score_state: string;
  score?: { recovery_score?: number; resting_heart_rate?: number; hrv_rmssd_milli?: number };
}
interface WhoopCycle {
  id: number;
  start: string;
  end?: string | null;
  score_state: string;
  score?: { strain?: number; kilojoule?: number };
}
interface WhoopSleep {
  id: string;
  start: string;
  end: string;
  nap: boolean;
  score_state: string;
  score?: {
    sleep_performance_percentage?: number;
    stage_summary?: {
      total_in_bed_time_milli?: number;
      total_awake_time_milli?: number;
    };
  };
}

// A day's worth of merged WHOOP metrics, keyed by calendar date (local to the
// cycle start). One row per date lines up with recovery_metrics' (owner,date).
export interface DailyRecoveryRow {
  date: string;
  recovery_pct: number | null;
  strain: number | null;
  resting_hr: number | null;
  hrv_ms: number | null;
  sleep_hours: number | null;
  sleep_performance_pct: number | null;
  active_energy_kcal: number | null;
}

const isoDate = (ts: string) => ts.slice(0, 10);
const round = (n: number | undefined | null) =>
  n === undefined || n === null ? null : Math.round(n);
const kjToKcal = (kj: number | undefined) =>
  kj === undefined ? null : Math.round(kj / 4.184);

// Merge recovery + cycle (strain) + sleep records into one row per calendar
// day. Recovery is keyed to the cycle it belongs to; we date everything by the
// cycle's start day so a night's recovery lands on the day you wake up.
export function mergeDaily(
  recoveries: WhoopRecovery[],
  cycles: WhoopCycle[],
  sleeps: WhoopSleep[],
): DailyRecoveryRow[] {
  const cycleById = new Map<number, WhoopCycle>();
  for (const c of cycles) cycleById.set(c.id, c);

  const byDate = new Map<string, DailyRecoveryRow>();
  const ensure = (date: string): DailyRecoveryRow => {
    let row = byDate.get(date);
    if (!row) {
      row = {
        date,
        recovery_pct: null,
        strain: null,
        resting_hr: null,
        hrv_ms: null,
        sleep_hours: null,
        sleep_performance_pct: null,
        active_energy_kcal: null,
      };
      byDate.set(date, row);
    }
    return row;
  };

  // Strain + energy come from the physiological cycle.
  for (const c of cycles) {
    if (c.score_state !== "SCORED" || !c.score) continue;
    const row = ensure(isoDate(c.start));
    if (c.score.strain !== undefined) row.strain = Math.round(c.score.strain * 10) / 10;
    const kcal = kjToKcal(c.score.kilojoule);
    if (kcal !== null) row.active_energy_kcal = kcal;
  }

  // Recovery is dated by its parent cycle's start day.
  for (const r of recoveries) {
    if (r.score_state !== "SCORED" || !r.score) continue;
    const cyc = cycleById.get(r.cycle_id);
    const date = cyc ? isoDate(cyc.start) : isoDate(r.created_at);
    const row = ensure(date);
    if (r.score.recovery_score !== undefined) row.recovery_pct = round(r.score.recovery_score);
    if (r.score.resting_heart_rate !== undefined) row.resting_hr = round(r.score.resting_heart_rate);
    if (r.score.hrv_rmssd_milli !== undefined) row.hrv_ms = round(r.score.hrv_rmssd_milli);
  }

  // Sleep (skip naps) dated by the day you wake — the end of the sleep.
  for (const s of sleeps) {
    if (s.nap || s.score_state !== "SCORED" || !s.score) continue;
    const row = ensure(isoDate(s.end));
    const inBed = s.score.stage_summary?.total_in_bed_time_milli ?? 0;
    const awake = s.score.stage_summary?.total_awake_time_milli ?? 0;
    const asleepMs = Math.max(0, inBed - awake);
    if (asleepMs > 0) row.sleep_hours = Math.round((asleepMs / 3_600_000) * 100) / 100;
    if (s.score.sleep_performance_percentage !== undefined) {
      row.sleep_performance_pct = round(s.score.sleep_performance_percentage);
    }
  }

  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}

export type { WhoopRecovery, WhoopCycle, WhoopSleep };
