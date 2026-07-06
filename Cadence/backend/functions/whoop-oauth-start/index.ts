// Cadence Fitness — begin the WHOOP OAuth connect flow
//
// Called by the Sync screen with the signed-in user's JWT. Verifies the user,
// mints a CSRF `state` bound to their owner_id, and returns the WHOOP authorize
// URL for the app to redirect to. WHOOP then bounces the user to
// whoop-oauth-callback with the code + state.
//
// Deploy:
//   supabase functions deploy whoop-oauth-start
//
// Required secrets (Supabase dashboard → Edge Functions):
//   WHOOP_CLIENT_ID, WHOOP_CLIENT_SECRET, WHOOP_REDIRECT_URI
// SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY are injected.
//
// Request (POST, application/json, Authorization: Bearer <user access token>):
//   { "redirect_to": "https://cadence-agent.com/fitness/sync" }  // optional
// Response 200: { "url": "https://api.prod.whoop.com/oauth/oauth2/auth?..." }

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { WHOOP_AUTH_URL, WHOOP_SCOPES, whoopConfig, serviceClient } from "../_shared/whoop.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  // Identify the caller from their JWT (anon client just to verify the token).
  const jwt = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
  if (!jwt) return json({ error: "Unauthorized" }, 401);
  const authClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!);
  const { data: userData, error: userErr } = await authClient.auth.getUser(jwt);
  if (userErr || !userData?.user) return json({ error: "Unauthorized" }, 401);
  const ownerId = userData.user.id;

  let redirectTo = "";
  try {
    const body = await req.json();
    if (typeof body?.redirect_to === "string") redirectTo = body.redirect_to.slice(0, 500);
  } catch {
    // body is optional
  }

  let cfg: ReturnType<typeof whoopConfig>;
  try {
    cfg = whoopConfig();
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "WHOOP not configured" }, 500);
  }

  const state = crypto.randomUUID();
  const svc = serviceClient();

  // Store state → owner. Clear any stale states for this owner first so the
  // table can't accumulate abandoned attempts.
  await svc.from("whoop_oauth_state").delete().eq("owner_id", ownerId);
  const { error: stErr } = await svc
    .from("whoop_oauth_state")
    .insert({ state, owner_id: ownerId, redirect_to: redirectTo });
  if (stErr) return json({ error: `Could not start OAuth: ${stErr.message}` }, 500);

  const qs = new URLSearchParams({
    response_type: "code",
    client_id: cfg.clientId,
    redirect_uri: cfg.redirectUri,
    scope: WHOOP_SCOPES.join(" "),
    state,
  });
  return json({ url: `${WHOOP_AUTH_URL}?${qs}` });
});
