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
  "read:workout",
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
  score?: {
    recovery_score?: number;
    resting_heart_rate?: number;
    hrv_rmssd_milli?: number;
    spo2_percentage?: number;
    skin_temp_celsius?: number;
  };
}
interface WhoopCycle {
  id: number;
  start: string;
  end?: string | null;
  score_state: string;
  score?: { strain?: number; kilojoule?: number; average_heart_rate?: number; max_heart_rate?: number };
}
interface WhoopSleep {
  id: string;
  start: string;
  end: string;
  nap: boolean;
  score_state: string;
  score?: {
    sleep_performance_percentage?: number;
    sleep_efficiency_percentage?: number;
    sleep_consistency_percentage?: number;
    respiratory_rate?: number;
    stage_summary?: {
      total_in_bed_time_milli?: number;
      total_awake_time_milli?: number;
      total_light_sleep_time_milli?: number;
      total_slow_wave_sleep_time_milli?: number;
      total_rem_sleep_time_milli?: number;
      sleep_cycle_count?: number;
      disturbance_count?: number;
    };
    sleep_needed?: {
      baseline_milli?: number;
      need_from_sleep_debt_milli?: number;
      need_from_recent_strain_milli?: number;
      need_from_recent_nap_milli?: number;
    };
  };
}
interface WhoopWorkout {
  id: string;
  start: string;
  end: string;
  sport_id?: number;
  sport_name?: string;
  score_state: string;
  score?: {
    strain?: number;
    average_heart_rate?: number;
    max_heart_rate?: number;
    kilojoule?: number;
    distance_meter?: number;
    altitude_gain_meter?: number;
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
  spo2_percentage: number | null;
  skin_temp_celsius: number | null;
  sleep_hours: number | null;
  sleep_performance_pct: number | null;
  sleep_efficiency_pct: number | null;
  sleep_consistency_pct: number | null;
  respiratory_rate: number | null;
  sleep_light_min: number | null;
  sleep_deep_min: number | null;
  sleep_rem_min: number | null;
  sleep_awake_min: number | null;
  sleep_cycle_count: number | null;
  sleep_disturbance_count: number | null;
  sleep_need_min: number | null;
  sleep_debt_min: number | null;
  active_energy_kcal: number | null;
  day_avg_hr: number | null;
  day_max_hr: number | null;
}

const isoDate = (ts: string) => ts.slice(0, 10);
const round = (n: number | undefined | null) =>
  n === undefined || n === null ? null : Math.round(n);
const round1 = (n: number | undefined | null) =>
  n === undefined || n === null ? null : Math.round(n * 10) / 10;
const kjToKcal = (kj: number | undefined) =>
  kj === undefined ? null : Math.round(kj / 4.184);
const milliToMin = (ms: number | undefined) =>
  ms === undefined ? null : Math.round(ms / 60_000);

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
        spo2_percentage: null,
        skin_temp_celsius: null,
        sleep_hours: null,
        sleep_performance_pct: null,
        sleep_efficiency_pct: null,
        sleep_consistency_pct: null,
        respiratory_rate: null,
        sleep_light_min: null,
        sleep_deep_min: null,
        sleep_rem_min: null,
        sleep_awake_min: null,
        sleep_cycle_count: null,
        sleep_disturbance_count: null,
        sleep_need_min: null,
        sleep_debt_min: null,
        active_energy_kcal: null,
        day_avg_hr: null,
        day_max_hr: null,
      };
      byDate.set(date, row);
    }
    return row;
  };

  // Strain + energy + day HR come from the physiological cycle.
  for (const c of cycles) {
    if (c.score_state !== "SCORED" || !c.score) continue;
    const row = ensure(isoDate(c.start));
    if (c.score.strain !== undefined) row.strain = round1(c.score.strain);
    const kcal = kjToKcal(c.score.kilojoule);
    if (kcal !== null) row.active_energy_kcal = kcal;
    if (c.score.average_heart_rate !== undefined) row.day_avg_hr = round(c.score.average_heart_rate);
    if (c.score.max_heart_rate !== undefined) row.day_max_hr = round(c.score.max_heart_rate);
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
    if (r.score.spo2_percentage !== undefined) row.spo2_percentage = round1(r.score.spo2_percentage);
    if (r.score.skin_temp_celsius !== undefined) row.skin_temp_celsius = round1(r.score.skin_temp_celsius);
  }

  // Sleep (skip naps) dated by the day you wake — the end of the sleep.
  for (const s of sleeps) {
    if (s.nap || s.score_state !== "SCORED" || !s.score) continue;
    const row = ensure(isoDate(s.end));
    const stages = s.score.stage_summary;
    const inBed = stages?.total_in_bed_time_milli ?? 0;
    const awake = stages?.total_awake_time_milli ?? 0;
    const asleepMs = Math.max(0, inBed - awake);
    if (asleepMs > 0) row.sleep_hours = Math.round((asleepMs / 3_600_000) * 100) / 100;
    if (s.score.sleep_performance_percentage !== undefined) {
      row.sleep_performance_pct = round(s.score.sleep_performance_percentage);
    }
    if (s.score.sleep_efficiency_percentage !== undefined) {
      row.sleep_efficiency_pct = round(s.score.sleep_efficiency_percentage);
    }
    if (s.score.sleep_consistency_percentage !== undefined) {
      row.sleep_consistency_pct = round(s.score.sleep_consistency_percentage);
    }
    if (s.score.respiratory_rate !== undefined) row.respiratory_rate = round1(s.score.respiratory_rate);
    if (stages) {
      row.sleep_light_min = milliToMin(stages.total_light_sleep_time_milli);
      row.sleep_deep_min = milliToMin(stages.total_slow_wave_sleep_time_milli);
      row.sleep_rem_min = milliToMin(stages.total_rem_sleep_time_milli);
      row.sleep_awake_min = milliToMin(stages.total_awake_time_milli);
      if (stages.sleep_cycle_count !== undefined) row.sleep_cycle_count = stages.sleep_cycle_count;
      if (stages.disturbance_count !== undefined) row.sleep_disturbance_count = stages.disturbance_count;
    }
    const need = s.score.sleep_needed;
    if (need) {
      const total = (need.baseline_milli ?? 0) +
        (need.need_from_sleep_debt_milli ?? 0) +
        (need.need_from_recent_strain_milli ?? 0) +
        (need.need_from_recent_nap_milli ?? 0);
      if (total > 0) row.sleep_need_min = milliToMin(total);
      row.sleep_debt_min = milliToMin(need.need_from_sleep_debt_milli);
    }
  }

  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}

// ── WHOOP workouts → cardio_sessions ────────────────────────────────────────
// WHOOP tracks every activity; we only ingest genuinely cardio sports into
// cardio_sessions. Strength/mobility (weightlifting, functional fitness, yoga,
// pilates) are owned by the Programs/Workouts flow, so they're skipped. Map by
// sport_name (stable, human-readable in v2), lower-cased.
type CardioKind = "run" | "bike" | "row" | "swim" | "walk" | "hike" | "stairs" | "elliptical" | "hiit" | "other";

const SPORT_TO_KIND: Record<string, CardioKind> = {
  running: "run",
  jogging: "run",
  trail_running: "run",
  cycling: "bike",
  bike: "bike",
  road_biking: "bike",
  mountain_biking: "bike",
  spinning: "bike",
  rowing: "row",
  swimming: "swim",
  open_water_swimming: "swim",
  walking: "walk",
  hiking: "hike",
  "hiking/rucking": "hike",
  rucking: "hike",
  stairs: "stairs",
  stair_climber: "stairs",
  elliptical: "elliptical",
  hiit: "hiit",
  "high_intensity_interval_training": "hiit",
};

// Sports that are explicitly NOT cardio — skip rather than dumping into 'other'.
const NON_CARDIO = new Set([
  "weightlifting",
  "powerlifting",
  "functional_fitness",
  "strength_trainer",
  "yoga",
  "pilates",
  "meditation",
  "stretching",
  "mobility",
]);

const normSport = (name: string) => name.trim().toLowerCase().replace(/\s+/g, "_");

// (CardioKind is declared above SPORT_TO_KIND.)
export interface CardioRow {
  external_id: string;
  date: string;
  kind: CardioKind;
  duration_min: number;
  distance_km: number;
  avg_hr: number;
  max_hr: number | null;
  calories: number;
  strain: number | null;
  altitude_gain_m: number | null;
}

// Map WHOOP workouts to cardio_sessions rows. Returns only cardio-type,
// scored workouts; unknown sports fall back to 'other' unless explicitly
// non-cardio (then skipped).
export function mapWorkouts(workouts: WhoopWorkout[]): CardioRow[] {
  const out: CardioRow[] = [];
  for (const w of workouts) {
    if (w.score_state !== "SCORED" || !w.score) continue;
    const key = w.sport_name ? normSport(w.sport_name) : "";
    if (key && NON_CARDIO.has(key)) continue;
    const kind: CardioKind = SPORT_TO_KIND[key] ?? "other";

    const durationMin = Math.max(0, Math.round(((new Date(w.end).getTime() - new Date(w.start).getTime()) / 60_000) * 10) / 10);
    out.push({
      external_id: w.id,
      date: isoDate(w.start),
      kind,
      duration_min: durationMin,
      distance_km: w.score.distance_meter !== undefined ? Math.round((w.score.distance_meter / 1000) * 100) / 100 : 0,
      avg_hr: round(w.score.average_heart_rate) ?? 0,
      max_hr: round(w.score.max_heart_rate),
      calories: kjToKcal(w.score.kilojoule) ?? 0,
      strain: round1(w.score.strain),
      altitude_gain_m: round1(w.score.altitude_gain_meter),
    });
  }
  return out;
}

export type { WhoopRecovery, WhoopCycle, WhoopSleep, WhoopWorkout };
