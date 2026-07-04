// Cadence Fitness — photo → calories/macros estimation
//
// The Nutrition screen sends a photo of a meal; this function asks Claude
// (vision) to identify it and estimate calories + macros, and returns a
// draft nutrition_log entry for the user to review and save. Nothing is
// written to the database here — the app inserts the row only after the
// user confirms, so a bad estimate never lands silently.
//
// Deploy:
//   supabase functions deploy food-vision
//
// Required secrets (Supabase dashboard → Edge Functions → food-vision):
//   ANTHROPIC_API_KEY   an Anthropic API key (vision-capable model access)
// SUPABASE_URL and SUPABASE_ANON_KEY are injected automatically and are used
// to verify the caller's JWT — only signed-in Cadence users can call this.
//
// Request (POST, application/json, Authorization: Bearer <user access token>):
//   {
//     "image_base64": "<base64 JPEG/PNG/WebP, no data: prefix>",
//     "media_type": "image/jpeg",
//     "hint": "optional free text, e.g. 'the bowl is about 400g'"
//   }
// Response 200:
//   { "name": "...", "calories": 620, "protein_g": 42, "carbs_g": 55,
//     "fat_g": 22, "confidence": "medium", "notes": "..." }

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

const SYSTEM = `You are a nutrition estimator inside a personal fitness app.
The user photographs a meal; you identify it and estimate its nutrition as eaten (the whole visible portion).
Be realistic, not optimistic: restaurant and home-cooked meals usually contain more oil than they appear to.
Respond with ONLY a JSON object, no markdown fences, with exactly these keys:
{"name": string (short dish name, e.g. "Chicken burrito bowl"),
 "calories": integer,
 "protein_g": integer,
 "carbs_g": integer,
 "fat_g": integer,
 "confidence": "low" | "medium" | "high",
 "notes": string (one short sentence on what drove the estimate or what's uncertain)}`;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) return json({ error: "Vision is not configured (ANTHROPIC_API_KEY missing)" }, 500);

  // Only signed-in users may spend vision tokens.
  const authHeader = req.headers.get("authorization") || "";
  const jwt = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!jwt) return json({ error: "Unauthorized" }, 401);
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!);
  const { data: userData, error: userErr } = await supabase.auth.getUser(jwt);
  if (userErr || !userData?.user) return json({ error: "Unauthorized" }, 401);

  let body: { image_base64?: string; media_type?: string; hint?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }
  const image = (body.image_base64 || "").trim();
  const mediaType = body.media_type || "image/jpeg";
  if (!image) return json({ error: "image_base64 required" }, 400);
  if (!/^image\/(jpeg|png|webp|gif)$/.test(mediaType)) return json({ error: "Unsupported media_type" }, 400);
  // ~6MB of base64 ≈ 4.5MB image; the app downscales well below this.
  if (image.length > 6_000_000) return json({ error: "Image too large" }, 413);

  const userContent: unknown[] = [
    { type: "image", source: { type: "base64", media_type: mediaType, data: image } },
    { type: "text", text: body.hint ? `Estimate this meal. Hint from the user: ${body.hint}` : "Estimate this meal." },
  ];

  const resp = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-sonnet-5",
      max_tokens: 400,
      system: SYSTEM,
      messages: [{ role: "user", content: userContent }],
    }),
  });

  if (!resp.ok) {
    const detail = await resp.text().catch(() => "");
    console.error("anthropic error", resp.status, detail.slice(0, 500));
    return json({ error: `Vision request failed (${resp.status})` }, 502);
  }

  const data = await resp.json();
  const text: string = data?.content?.[0]?.text ?? "";
  // The model is instructed to return bare JSON; strip fences defensively.
  const cleaned = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
  let est: Record<string, unknown>;
  try {
    est = JSON.parse(cleaned);
  } catch {
    console.error("unparseable estimate", text.slice(0, 300));
    return json({ error: "Could not read an estimate from the photo — try again or enter it manually" }, 502);
  }

  const toInt = (v: unknown) => Math.max(0, Math.round(Number(v) || 0));
  return json({
    name: typeof est.name === "string" && est.name.trim() ? est.name.trim().slice(0, 120) : "Meal from photo",
    calories: toInt(est.calories),
    protein_g: toInt(est.protein_g),
    carbs_g: toInt(est.carbs_g),
    fat_g: toInt(est.fat_g),
    confidence: est.confidence === "high" || est.confidence === "low" ? est.confidence : "medium",
    notes: typeof est.notes === "string" ? est.notes.slice(0, 300) : "",
  });
});
