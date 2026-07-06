// Cadence Fitness — disconnect WHOOP
//
// Called by the Sync screen with the signed-in user's JWT. Removes both the
// connection status row and the stored tokens for that user. The token table is
// service-role only, so this has to run server-side (the client can delete its
// own whoop_connection via RLS, but never the token).
//
// Deploy:
//   supabase functions deploy whoop-disconnect
//
// Request (POST, Authorization: Bearer <user access token>). Response: { ok }.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { serviceClient } from "../_shared/whoop.ts";

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

  const jwt = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
  if (!jwt) return json({ error: "Unauthorized" }, 401);
  const authClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!);
  const { data: userData, error: userErr } = await authClient.auth.getUser(jwt);
  if (userErr || !userData?.user) return json({ error: "Unauthorized" }, 401);
  const ownerId = userData.user.id;

  const svc = serviceClient();
  const { error: tErr } = await svc.from("whoop_oauth_token").delete().eq("owner_id", ownerId);
  const { error: cErr } = await svc.from("whoop_connection").delete().eq("owner_id", ownerId);
  const err = tErr || cErr;
  if (err) return json({ error: err.message }, 500);
  return json({ ok: true });
});
