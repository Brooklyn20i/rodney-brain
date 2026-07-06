// Cadence — gated self-serve signup.
//
// Scales onboarding without depending on Supabase's rate-limited built-in
// mailer or a working confirm-email redirect. A new user submits name/email/
// password + a shared access code; this function (service role) creates the
// account already email-confirmed, so they can sign in immediately — no
// confirmation email, no broken localhost link, no per-hour send cap.
//
// Trade-off: emails aren't verified here. That's fine for a controlled beta
// behind an access code; add real verification (Resend + Supabase SMTP) before
// a fully public launch.
//
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are injected automatically.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Only reflect CORS for our own origins (defence-in-depth: a browser on some
// other site can't drive this endpoint). This does NOT stop scripted abuse —
// curl ignores CORS — so the real anti-abuse control is still needed: rate
// limiting per IP + rotating the access code. See TODO below.
const ALLOWED_ORIGINS = [
  "https://cadence-agent.com",
  "https://www.cadence-agent.com",
  "http://localhost:4173",
  "http://localhost:5173",
];
const corsFor = (origin: string | null) => ({
  "Access-Control-Allow-Origin": origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0],
  "Vary": "Origin",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
});
const json = (body: unknown, cors: Record<string, string>, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

// Shared beta access code. Change it by redeploying this function. Share the
// value (or a cadence-agent.com/work?code=... link) with people you onboard.
const ACCESS_CODE = "CADENCE-FOUNDING";

// TODO before public (un-gated) launch: rate-limit by IP (e.g. a small
// signup_attempts table or an edge KV) and rotate ACCESS_CODE. CORS below is
// defence-in-depth only — it does not stop scripted signups.

serve(async (req) => {
  const cors = corsFor(req.headers.get("origin"));
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "POST only" }, cors, 405);

  let p: Record<string, unknown>;
  try { p = await req.json(); } catch { return json({ error: "Invalid request." }, cors); }

  const email = String(p.email ?? "").trim().toLowerCase();
  const password = String(p.password ?? "");
  const name = String(p.name ?? "").trim();
  const code = String(p.code ?? "").trim();

  if (code.toUpperCase() !== ACCESS_CODE) return json({ error: "That access code isn't valid — ask for an invite." }, cors);
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return json({ error: "Enter a valid email address." }, cors);
  if (password.length < 8) return json({ error: "Use at least 8 characters for your password." }, cors);
  if (!name) return json({ error: "Enter your name." }, cors);

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  const { error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { name },
  });

  if (error) {
    const already = /registered|already|exists|duplicate/i.test(error.message);
    return json({
      error: already
        ? "That email already has an account — sign in instead."
        : "Could not create the account. Please try again.",
    }, cors);
  }

  return json({ ok: true }, cors);
});
