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

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

// Shared beta access code. Change it by redeploying this function. Share the
// value (or a cadence-agent.com/work?code=... link) with people you onboard.
const ACCESS_CODE = "CADENCE-FOUNDING";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  let p: Record<string, unknown>;
  try { p = await req.json(); } catch { return json({ error: "Invalid request." }); }

  const email = String(p.email ?? "").trim().toLowerCase();
  const password = String(p.password ?? "");
  const name = String(p.name ?? "").trim();
  const code = String(p.code ?? "").trim();

  if (code.toUpperCase() !== ACCESS_CODE) return json({ error: "That access code isn't valid — ask for an invite." });
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return json({ error: "Enter a valid email address." });
  if (password.length < 8) return json({ error: "Use at least 8 characters for your password." });
  if (!name) return json({ error: "Enter your name." });

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
    });
  }

  return json({ ok: true });
});
