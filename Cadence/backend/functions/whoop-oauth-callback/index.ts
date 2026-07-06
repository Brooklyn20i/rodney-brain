// Cadence Fitness — WHOOP OAuth redirect handler
//
// WHOOP redirects the user's browser here (GET) after they approve access, with
// ?code=…&state=…. We validate the state (CSRF + owner lookup), exchange the
// code for tokens, store them, mark the connection live, then bounce the
// browser back into the app. Public endpoint — the WHOOP redirect carries no
// Supabase JWT, so DEPLOY WITH JWT VERIFICATION OFF:
//   supabase functions deploy whoop-oauth-callback --no-verify-jwt
//
// Required secrets: WHOOP_CLIENT_ID, WHOOP_CLIENT_SECRET, WHOOP_REDIRECT_URI,
//   WHOOP_APP_RETURN_URL (fallback app URL to return to if none was passed in).

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { exchangeCode, saveToken, serviceClient, whoopGetAll, WHOOP_SCOPES } from "../_shared/whoop.ts";

// Bounce back into the app with a status the Sync screen can read off the URL.
function redirect(to: string, params: Record<string, string>): Response {
  const url = new URL(to);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return new Response(null, { status: 302, headers: { Location: url.toString() } });
}

serve(async (req) => {
  const reqUrl = new URL(req.url);
  const code = reqUrl.searchParams.get("code");
  const state = reqUrl.searchParams.get("state");
  const oauthError = reqUrl.searchParams.get("error");

  const fallback = Deno.env.get("WHOOP_APP_RETURN_URL") || "https://cadence-agent.com/fitness/sync";
  const svc = serviceClient();

  // Resolve the state first so we know where to send the user back to.
  let returnTo = fallback;
  let ownerId: string | null = null;
  if (state) {
    const { data: st } = await svc
      .from("whoop_oauth_state")
      .select("owner_id, redirect_to, created_at")
      .eq("state", state)
      .maybeSingle();
    if (st) {
      ownerId = st.owner_id;
      if (st.redirect_to) returnTo = st.redirect_to;
      // One-time use.
      await svc.from("whoop_oauth_state").delete().eq("state", state);
      // Reject stale states (>10 min) to bound the CSRF window.
      const ageMs = Date.now() - new Date(st.created_at).getTime();
      if (ageMs > 10 * 60 * 1000) ownerId = null;
    }
  }

  if (oauthError) return redirect(returnTo, { whoop: "error", reason: oauthError.slice(0, 80) });
  if (!code || !state) return redirect(returnTo, { whoop: "error", reason: "missing_code_or_state" });
  if (!ownerId) return redirect(returnTo, { whoop: "error", reason: "invalid_or_expired_state" });

  try {
    const tok = await exchangeCode(code);
    await saveToken(svc, ownerId, tok);

    // Fetch the WHOOP user id for display / support; non-fatal if it fails.
    let whoopUserId: string | null = null;
    try {
      const accessToken = tok.access_token;
      const resp = await fetch("https://api.prod.whoop.com/developer/v2/user/profile/basic", {
        headers: { authorization: `Bearer ${accessToken}` },
      });
      if (resp.ok) {
        const profile = await resp.json();
        if (profile?.user_id !== undefined) whoopUserId = String(profile.user_id);
      }
    } catch {
      // ignore — profile is cosmetic
    }

    const { error: connErr } = await svc.from("whoop_connection").upsert(
      {
        owner_id: ownerId,
        whoop_user_id: whoopUserId,
        scopes: tok.scope ?? WHOOP_SCOPES.join(" "),
        connected_at: new Date().toISOString(),
        last_sync_status: null,
        last_sync_error: "",
      },
      { onConflict: "owner_id" },
    );
    if (connErr) throw new Error(connErr.message);

    // Kick an initial sync so the user sees data immediately, without blocking
    // the redirect on it. Fire-and-forget to the sync function.
    try {
      const syncUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/whoop-sync`;
      fetch(syncUrl, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
        },
        body: JSON.stringify({ owner_id: ownerId, days: 30 }),
      }).catch(() => {});
    } catch {
      // best-effort
    }

    return redirect(returnTo, { whoop: "connected" });
  } catch (e) {
    console.error("whoop callback error", e);
    return redirect(returnTo, { whoop: "error", reason: "token_exchange_failed" });
  }
});
