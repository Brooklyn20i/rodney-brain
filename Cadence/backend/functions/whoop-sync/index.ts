// Cadence Fitness — pull recovery / strain / sleep from WHOOP
//
// Two callers:
//   1. Cron (hourly) — invoked with the service-role key as the bearer, no body
//      (or {}). Syncs every connected owner.
//   2. "Sync now" in the app — invoked with the signed-in user's JWT. Syncs
//      just that user. Optional body { "days": 14 }.
//   3. The OAuth callback kicks an initial {owner_id, days:30} with the service
//      key so a fresh connection fills in immediately.
//
// For each owner: ensure a fresh access token (refresh + rotate if needed),
// pull the last N days of recovery, cycles (strain/energy) and sleep, merge to
// one row per day, and upsert into fitness.recovery_metrics with source
// 'whoop'. Only non-null WHOOP fields are written, so days that already carry
// Apple-Health values (e.g. steps) keep them.
//
// Deploy:
//   supabase functions deploy whoop-sync
// Required secrets: WHOOP_CLIENT_ID, WHOOP_CLIENT_SECRET, WHOOP_REDIRECT_URI.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  getValidAccessToken,
  mapWorkouts,
  mergeDaily,
  serviceClient,
  whoopGetAll,
  type WhoopCycle,
  type WhoopRecovery,
  type WhoopSleep,
  type WhoopWorkout,
} from "../_shared/whoop.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

const clampDays = (d: unknown) => {
  const n = Number(d);
  if (!Number.isFinite(n)) return 14;
  return Math.min(180, Math.max(1, Math.round(n)));
};

// Sync one owner; returns a small result summary. Never throws — records the
// failure on the connection row so the UI can show it.
async function syncOwner(svc: ReturnType<typeof serviceClient>, ownerId: string, days: number) {
  const start = new Date(Date.now() - days * 86_400_000).toISOString();
  try {
    const accessToken = await getValidAccessToken(svc, ownerId);

    const [recoveries, cycles, sleeps, workouts] = await Promise.all([
      whoopGetAll<WhoopRecovery>(accessToken, "/v2/recovery", { start }),
      whoopGetAll<WhoopCycle>(accessToken, "/v2/cycle", { start }),
      whoopGetAll<WhoopSleep>(accessToken, "/v2/activity/sleep", { start }),
      whoopGetAll<WhoopWorkout>(accessToken, "/v2/activity/workout", { start }),
    ]);

    const daily = mergeDaily(recoveries, cycles, sleeps);

    let written = 0;
    for (const d of daily) {
      // Build a row with only the fields WHOOP actually scored for this day, so
      // a partial upsert never nulls out values from another source.
      const row: Record<string, unknown> = { owner_id: ownerId, date: d.date, source: "whoop" };
      for (const k of [
        "recovery_pct",
        "strain",
        "resting_hr",
        "hrv_ms",
        "spo2_percentage",
        "skin_temp_celsius",
        "sleep_hours",
        "sleep_performance_pct",
        "sleep_efficiency_pct",
        "sleep_consistency_pct",
        "respiratory_rate",
        "sleep_light_min",
        "sleep_deep_min",
        "sleep_rem_min",
        "sleep_awake_min",
        "sleep_cycle_count",
        "sleep_disturbance_count",
        "sleep_need_min",
        "sleep_debt_min",
        "active_energy_kcal",
        "day_avg_hr",
        "day_max_hr",
      ] as const) {
        if (d[k] !== null && d[k] !== undefined) row[k] = d[k];
      }
      // Skip days that produced nothing but the key columns.
      if (Object.keys(row).length <= 3) continue;
      const { error } = await svc
        .from("recovery_metrics")
        .upsert(row, { onConflict: "owner_id,date" });
      if (error) throw new Error(`recovery_metrics upsert: ${error.message}`);
      written++;
    }

    // Cardio workouts → cardio_sessions, idempotent on (owner_id, external_id).
    let workoutsWritten = 0;
    const cardio = mapWorkouts(workouts);
    for (const c of cardio) {
      const { error } = await svc
        .from("cardio_sessions")
        .upsert({ owner_id: ownerId, source: "whoop", ...c }, { onConflict: "owner_id,external_id" });
      if (error) throw new Error(`cardio_sessions upsert: ${error.message}`);
      workoutsWritten++;
    }

    await svc.from("whoop_connection").upsert(
      {
        owner_id: ownerId,
        last_sync_at: new Date().toISOString(),
        last_sync_status: "ok",
        last_sync_error: "",
        synced_from: start.slice(0, 10),
      },
      { onConflict: "owner_id" },
    );
    return { owner_id: ownerId, ok: true, days_written: written, workouts_written: workoutsWritten };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await svc.from("whoop_connection").upsert(
      {
        owner_id: ownerId,
        last_sync_at: new Date().toISOString(),
        last_sync_status: "error",
        last_sync_error: message.slice(0, 500),
      },
      { onConflict: "owner_id" },
    );
    return { owner_id: ownerId, ok: false, error: message };
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const bearer = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
  if (!bearer) return json({ error: "Unauthorized" }, 401);

  let body: { owner_id?: string; days?: number } = {};
  try {
    body = await req.json();
  } catch {
    // empty body is fine (cron)
  }
  const days = clampDays(body.days ?? 14);
  const svc = serviceClient();

  // Service-role caller (cron / callback kick): may target one owner or all.
  if (bearer === serviceKey) {
    if (body.owner_id) {
      const result = await syncOwner(svc, body.owner_id, days);
      return json({ mode: "service", results: [result] });
    }
    const { data: conns, error } = await svc.from("whoop_connection").select("owner_id");
    if (error) return json({ error: `list connections: ${error.message}` }, 500);
    const results = [];
    for (const c of conns ?? []) results.push(await syncOwner(svc, c.owner_id as string, days));
    return json({ mode: "service", count: results.length, results });
  }

  // Otherwise treat the bearer as a user JWT — sync only that user.
  const authClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!);
  const { data: userData, error: userErr } = await authClient.auth.getUser(bearer);
  if (userErr || !userData?.user) return json({ error: "Unauthorized" }, 401);

  const result = await syncOwner(svc, userData.user.id, days);
  return json({ mode: "user", results: [result] }, result.ok ? 200 : 502);
});
