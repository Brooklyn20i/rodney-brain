# Cadence Fitness — Agent & Operator Guide

> Rodney's personal fitness super app — training programs in cycles, guided
> gym sessions, cardio & sauna, Whoop recovery, Renpho weight, calories &
> macros, with Kobe wired in as coach. Separate product from Cadence Work and
> Cadence Financial. Own Supabase project, own Vercel project. Do **not**
> share infrastructure with `Cadence/` or `CadenceFinancial/`.

---

## Sensitivity

This app holds personal health data (weight, body fat, recovery, sleep).
**Nothing real ever goes into this git repo** — not in seed data, not in
fixtures, not in commit messages. Every number in `web/src/lib/demoData.ts`
is fictional placeholder data, following the same pattern as Cadence
Financial. Real figures live only in the private Supabase project below,
entered via the app or by Kobe — never pasted into a file that gets
committed.

---

## Architecture

```
Supabase (cadence-fitness project — SEPARATE from the other Cadence projects)
  ← single source of truth →
       ▲                        ▲
  Web PWA (CadenceFitness/web/) Kobe (Hermes env, via CadenceFitness/agent/ MCP)
```

### URL / base path

The app canonically lives under the **/fitness/** base path, mirroring how
Cadence Financial hangs off `/financial/`: `vite.config.ts` sets
`base: '/fitness/'`, its own `vercel.json` maps `/fitness/*` back onto the
filesystem, and `manifest.json` scopes the PWA to `/fitness/`. Its bare
`.vercel.app` root URL still loads the app too.

To serve it at **cadence-agent.com/fitness**, add a proxy rewrite to the
*main* Cadence project's `Cadence/web/vercel.json` once the Fitness Vercel
project exists (copy the `/financial` pattern, substituting the Fitness
deployment's domain):

```json
{ "source": "/fitness", "destination": "https://YOUR-FITNESS-DEPLOYMENT.vercel.app/fitness" },
{ "source": "/fitness/:path*", "destination": "https://YOUR-FITNESS-DEPLOYMENT.vercel.app/fitness/:path*" }
```

(Place them above the `/(.*)` SPA fallback, like the `/financial` rewrites.)

Single-user app: no multi-tenant workspace layer. RLS scopes every row to
`owner_id = auth.uid()`, plus a revocable agent grant (below).

---

## One-time setup (Rodney's action — I can't do this part)

1. **Create a new Supabase project** dedicated to Cadence Fitness (do not
   reuse the other Cadence projects).
2. In the Supabase SQL Editor, run in order:
   `backend/migrations/0001_init.sql`, `0002_agent_messages.sql`,
   `0003_agent_access.sql`, `0004_health_sync.sql`.
3. In `web/`, `cp .env.example .env` and fill in `VITE_SUPABASE_URL` +
   `VITE_SUPABASE_ANON_KEY` from Supabase → Project Settings → API.
4. `npm install && npm run dev`, sign up with your own email once so your
   auth user exists (Supabase → Authentication → Users → copy the UID).
5. **Create a new Vercel project** importing this repo, with:
   - Root Directory = `CadenceFitness/web`
   - Env vars = the same `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`
6. Add the `/fitness` proxy rewrites to `Cadence/web/vercel.json` (see
   above) so the app is reachable at cadence-agent.com/fitness.
7. In the app: Exercises → "Add the starter library", then build your 5-day
   program under Programs and set it active.

## Demo mode

Set `VITE_DEMO=1` locally to see the app fully populated with fictional data
(a 5-day split mid-cycle, 3 weeks of sessions, Whoop/Renpho history, meals)
and no Supabase connection required. Never set this flag in a deployed
environment — it bypasses auth entirely.

---

## Data model (canonical — Postgres schema)

See `backend/migrations/0001_init.sql` for the full schema and
`web/src/lib/types.ts` for the TypeScript mirror (source of truth for both).

Key tables:

- **Training**: `exercises` (library), `programs` (blocks run in N-week
  cycles), `program_days`, `program_exercises` (slots with set/rep/RPE/rest
  targets), `workouts` (logged sessions), `workout_sets`.
- **Conditioning**: `cardio_sessions`, `sauna_sessions`.
- **Body**: `body_metrics` (Renpho weight/body-fat, one row per day),
  `recovery_metrics` (Whoop recovery/strain/sleep/HRV/RHR, one row per day).
- **Nutrition**: `nutrition_logs` (entries per meal), `saved_meals`
  (one-tap favourites), `nutrition_targets` (phased cut/maintain/bulk
  targets — the newest row on or before a day applies).
- **Agent**: `agent_messages` (Kobe channel), `fitness_agent_access`
  (the grant table).

Derived figures (e1RM via Epley, PRs, weekly hard-set volume per muscle,
7-day weight trend, calorie adherence, cycle/week position) are **never
stored** — they're computed from the raw rows in
`web/src/lib/fitnessCalc.ts` so they can't drift from their inputs.

---

## Kobe integration

Same two-part pattern as Cadence Work:

1. **Chat channel** — `agent_messages` (migration `0002`) backs the Kobe
   screen in the app; realtime pushes agent replies into the UI instantly.
2. **Scoped data access** — migration `0003_agent_access.sql` creates
   `fitness_agent_access` + `fitness_can_access_owner()` and rewrites every
   table's RLS to `owner OR granted agent`, mirroring
   `Cadence/backend/AGENT_ACCESS_RUNBOOK.md`. To wire Kobe up (done in his
   Hermes environment, not in this repo):
   1. Create a dedicated agent auth user (e.g.
      `kobe-fitness-agent@cadence.app`) in Supabase Auth; store its password
      in macOS Keychain under service `cadence-fitness-agent-password`,
      account = the agent email.
   2. Insert one active grant row in `fitness_agent_access`
      (owner = Rodney's UID, agent = the agent's UID, `can_write = true`).
   3. Export `CADENCE_FITNESS_SUPABASE_URL`, `CADENCE_FITNESS_SUPABASE_ANON_KEY`,
      `CADENCE_FITNESS_AGENT_EMAIL` and verify:
      `python3 CadenceFitness/agent/cadence_fitness_bridge.py probe`
   4. Register the MCP server in Hermes:
      `hermes mcp add cadence-fitness -- python3 .../cadence_fitness_mcp.py`

MCP tools Kobe gets: `probe`, `get_active_program`, `list_recent_workouts`,
`get_workout`, `get_exercise_history`, `get_daily_brief`, `get_week_summary`,
`log_body_metric`, `log_recovery_metric`, `log_nutrition`, `log_cardio`,
`log_sauna`, `log_completed_workout`, `list_agent_messages`,
`send_agent_message`, `mark_agent_message_processed`. That's enough for a
morning brief ("recovery 45%, swap legs for a spin?"), logging by message
("log sauna 20 min"), and cycle-aware programming suggestions.

## Apple Health, Whoop & Renpho sync

A PWA can't read Apple HealthKit directly — iOS exposes no web API for it.
The practical path uses **Apple Health as the hub**: Renpho already writes
your weight into Health, and Whoop writes recovery, sleep, HRV and workouts
into Health, so a single Apple **Shortcut** can push everything to Cadence
Fitness. The schema is source-aware (`metric_source =
manual|whoop|renpho|health|agent`, one row per day, upsert on
`(owner_id, date)`), so re-running through the day just refreshes the row.

**Ingestion endpoint** — `backend/functions/health-ingest/index.ts` is a
Supabase Edge Function that takes a Bearer token and a JSON body of the day's
numbers and upserts them into `body_metrics` (weight, body fat) and
`recovery_metrics` (active energy / calories out, steps, resting HR, HRV,
sleep, recovery). No auth account or Supabase key ever lives on the phone —
just the ingest token. Deploy and configure:

```bash
supabase functions deploy health-ingest --project-ref YOUR-FITNESS-PROJECT-REF
# Then in Supabase → Edge Functions → health-ingest → Secrets, set:
#   INGEST_TOKEN     a long random string
#   INGEST_OWNER_ID  your auth user UID (step 4 above)
```

**Apple Shortcut recipe** (build once on the iPhone, then automate it):

1. New Shortcut → add **Get Health Sample** / **Get Numbers from Health**
   actions for the values you want: Body Mass, Body Fat %, Active Energy
   (today's total), Steps, Resting Heart Rate, Heart Rate Variability, Sleep.
2. Add **Text** → a JSON object with those variables, e.g.
   `{"weight_kg":<Body Mass>,"active_energy_kcal":<Active Energy>,"steps":<Steps>,"resting_hr":<Resting HR>,"hrv_ms":<HRV>,"sleep_hours":<Sleep>}`.
3. Add **Get Contents of URL** → your function URL
   (`https://YOUR-FITNESS-PROJECT-REF.functions.supabase.co/health-ingest`),
   Method **POST**, Request Body **JSON** (the Text above), Header
   `Authorization: Bearer YOUR-INGEST-TOKEN`.
4. In the Shortcuts **Automation** tab, run it on a daily schedule (e.g.
   7am and after workouts). Values land in the app instantly via realtime.

The Recovery and Body screens also keep a manual form as a fallback, and Kobe
can log the same fields over MCP. A native Whoop-API cron (server-side OAuth)
remains an option if you'd rather not route through Health, but Health covers
weight, calories burned and recovery in one Shortcut with no extra API keys.

## Authority boundary

This is a personal training log and planning tool, not medical advice. It
must never imply authority to diagnose, prescribe, or contact gyms, coaches
or health providers on Rodney's behalf. Stated on the login screen.
