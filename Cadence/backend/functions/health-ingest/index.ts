// Cadence Fitness — Apple Health ingestion endpoint
//
// A PWA can't read Apple HealthKit directly (there's no web API for it), so
// the flow is: Apple Health → an Apple Shortcut automation → this endpoint.
// The Shortcut reads the day's numbers (weight, active energy, resting HR,
// HRV, sleep, steps) and POSTs them here; this function upserts them into
// body_metrics and recovery_metrics under Rodney's owner_id. Because both
// Whoop and Renpho already write into Apple Health, Health is the single hub
// and one Shortcut covers everything.
//
// Deploy:
//   supabase functions deploy health-ingest --project-ref YOUR-FITNESS-PROJECT-REF
//
// Required secrets (Supabase dashboard → Edge Functions → health-ingest → Secrets):
//   INGEST_TOKEN      a long random string; the Shortcut sends it as a Bearer
//                     token so no auth account or anon key lives on the phone
//   INGEST_OWNER_ID   Rodney's auth user UID (rows are written under this owner)
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are injected automatically.
//
// Request (POST, application/json):
//   {
//     "date": "2026-07-05",            // optional, defaults to today (UTC)
//     "weight_kg": 85.1,               // optional -> body_metrics
//     "body_fat_pct": 17.9,            // optional -> body_metrics
//     "active_energy_kcal": 650,       // optional -> recovery_metrics
//     "steps": 9000,                   // optional -> recovery_metrics
//     "resting_hr": 52,                // optional -> recovery_metrics
//     "hrv_ms": 80,                    // optional -> recovery_metrics
//     "sleep_hours": 7.3,              // optional -> recovery_metrics
//     "recovery_pct": 74               // optional -> recovery_metrics
//   }
// Only the fields present are written; upserts key on (owner_id, date) so
// re-running the Shortcut through the day just refreshes the row.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const num = (v: unknown): number | undefined =>
  v === null || v === undefined || v === "" || Number.isNaN(Number(v)) ? undefined : Number(v);

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "POST only" }), { status: 405, headers: cors });
  }

  const token = Deno.env.get("INGEST_TOKEN");
  const ownerId = Deno.env.get("INGEST_OWNER_ID");
  if (!token || !ownerId) {
    return new Response(JSON.stringify({ error: "Function not configured" }), { status: 500, headers: cors });
  }

  const auth = req.headers.get("authorization") || "";
  const presented = auth.replace(/^Bearer\s+/i, "").trim();
  if (presented !== token) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: cors });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), { status: 400, headers: cors });
  }

  const date = typeof body.date === "string" && body.date ? body.date : new Date().toISOString().slice(0, 10);
  // Fitness tables live in the `fitness` Postgres schema of the shared
  // Cadence Work Supabase project -- .schema('fitness') selects it for every
  // call below (see Cadence/AGENTS.md "The unified super app").
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  ).schema("fitness");

  const written: string[] = [];
  const errors: string[] = [];

  // ── body_metrics (weight / body fat) ──────────────────────────────────
  const weight = num(body.weight_kg);
  const bodyFat = num(body.body_fat_pct);
  if (weight !== undefined || bodyFat !== undefined) {
    const row: Record<string, unknown> = { owner_id: ownerId, date, source: "health" };
    if (weight !== undefined) row.weight_kg = weight;
    if (bodyFat !== undefined) row.body_fat_pct = bodyFat;
    const { error } = await supabase.from("body_metrics").upsert(row, { onConflict: "owner_id,date" });
    if (error) errors.push(`body_metrics: ${error.message}`);
    else written.push("body_metrics");
  }

  // ── recovery_metrics (energy, steps, HR, HRV, sleep, recovery) ────────
  const recovery: Record<string, unknown> = { owner_id: ownerId, date, source: "health" };
  const recoveryFields: [string, number | undefined][] = [
    ["active_energy_kcal", num(body.active_energy_kcal)],
    ["steps", num(body.steps)],
    ["resting_hr", num(body.resting_hr)],
    ["hrv_ms", num(body.hrv_ms)],
    ["sleep_hours", num(body.sleep_hours)],
    ["sleep_performance_pct", num(body.sleep_performance_pct)],
    ["recovery_pct", num(body.recovery_pct)],
    ["strain", num(body.strain)],
  ];
  let hasRecovery = false;
  for (const [k, v] of recoveryFields) {
    if (v !== undefined) {
      recovery[k] = v;
      hasRecovery = true;
    }
  }
  if (hasRecovery) {
    const { error } = await supabase.from("recovery_metrics").upsert(recovery, { onConflict: "owner_id,date" });
    if (error) errors.push(`recovery_metrics: ${error.message}`);
    else written.push("recovery_metrics");
  }

  const status = errors.length ? 207 : 200;
  return new Response(JSON.stringify({ date, written, errors }), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
});
