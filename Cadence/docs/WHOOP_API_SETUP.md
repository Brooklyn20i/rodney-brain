# WHOOP direct-API integration — setup runbook

Native server-side WHOOP integration for Cadence Fitness. Recovery, strain,
HRV, SpO₂, skin temp, respiratory rate and the full sleep-stage breakdown pull
from the WHOOP developer API straight into `fitness.recovery_metrics` (source
`whoop`), and cardio **workouts** land in `fitness.cardio_sessions` — no phone,
no Apple Shortcut.

**Renpho stays on Apple Health.** Renpho has no public API, so weight and body
fat still flow Renpho → Apple Health → the `health-ingest` function. This
integration does not touch `body_metrics`.

Everything in the repo is built and deployed; the steps below are the parts
only you can do (they involve WHOOP account + Supabase secrets). No secret ever
goes into git.

---

## What's in the repo

| Piece | Path |
|-------|------|
| DB migrations | `Cadence/backend/migrations/0038_whoop_integration.sql`, `0039_whoop_rich_metrics.sql` |
| Shared WHOOP client | `Cadence/backend/functions/_shared/whoop.ts` |
| `whoop-oauth-start` | starts the connect flow (returns the authorize URL) |
| `whoop-oauth-callback` | WHOOP redirect handler → exchanges code, stores tokens |
| `whoop-sync` | pulls recovery/strain/sleep; cron + "Sync now" |
| `whoop-disconnect` | tears down tokens + connection |
| Sync screen UI | `Cadence/web/src/fitness/screens/Sync.tsx` (WHOOP card) |

Data model:
- `fitness.whoop_connection` — per-owner **status** (owner can read it; drives the UI).
- `fitness.whoop_oauth_token` — access + rotating refresh token. **Service-role only** (revoked from anon/authenticated).
- `fitness.whoop_oauth_state` — short-lived CSRF state. Service-role only.

---

## 1 · Run the migrations

Supabase → SQL Editor → run **`0038_whoop_integration.sql`** then
**`0039_whoop_rich_metrics.sql`**, in order (both idempotent). 0038 adds the
OAuth/token tables; 0039 widens `recovery_metrics` to WHOOP's full physiology
and lets workouts land in `cardio_sessions`. The `fitness` schema is already
exposed; no API-settings change needed.

## 2 · Register a WHOOP developer app

1. Go to **developer.whoop.com** → sign in with your WHOOP account → **Developer Dashboard** → create a team → **Create new app**.
2. **Redirect URI** — set it to the callback function URL, exactly:
   ```
   https://<YOUR-PROJECT-REF>.supabase.co/functions/v1/whoop-oauth-callback
   ```
3. **Scopes** — enable: `offline`, `read:recovery`, `read:cycles`, `read:sleep`, `read:workout`, `read:profile`.
4. Copy the **Client ID** and **Client Secret**.

> If you connected under 0038's smaller scope set (no `read:workout`), you'll
> need to **Disconnect and reconnect** once so WHOOP re-issues a token that
> includes workout access.

## 3 · Set the Edge Function secrets

Supabase → Edge Functions → **Secrets** (project-wide), add:

| Secret | Value |
|--------|-------|
| `WHOOP_CLIENT_ID` | from the WHOOP app |
| `WHOOP_CLIENT_SECRET` | from the WHOOP app |
| `WHOOP_REDIRECT_URI` | the exact callback URL from step 2 |
| `WHOOP_APP_RETURN_URL` | where to bounce the user back to, e.g. `https://cadence-agent.com/fitness/sync` |

`SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` are injected
automatically — do not add them.

## 4 · Deploy the functions

From `Cadence/backend` (or wherever you point the Supabase CLI at these
functions). The **callback must skip JWT verification** — WHOOP's browser
redirect carries no Supabase JWT:

```bash
supabase functions deploy whoop-oauth-start   --project-ref <REF>
supabase functions deploy whoop-oauth-callback --project-ref <REF> --no-verify-jwt
supabase functions deploy whoop-sync          --project-ref <REF>
supabase functions deploy whoop-disconnect    --project-ref <REF>
```

`whoop-sync` keeps JWT verification on: the cron caller presents the
service-role key (a valid JWT) and the "Sync now" button presents the user's
JWT.

## 5 · Connect

Open the app → **Fitness → Sync → WHOOP (direct API) → Connect WHOOP**. Approve
on WHOOP; you'll land back on the Sync screen and an initial 30-day pull runs
automatically. Recovery/strain/sleep appear on the Recovery screen with source
`whoop`.

## 6 · Schedule the hourly sync

Keep data fresh without opening the app. WHOOP recommends refreshing tokens
about hourly, and `whoop-sync` rotates the refresh token every run, so hourly
is the right cadence.

**Option A — Supabase Dashboard (simplest):** Edge Functions → `whoop-sync` →
**Schedules** → new schedule → cron `0 * * * *` (hourly). The dashboard invokes
it with the service role, which triggers an all-owners sync.

**Option B — pg_cron + pg_net (SQL):** in the SQL Editor (needs the `pg_cron`
and `pg_net` extensions enabled under Database → Extensions). Store the service
role key in Vault rather than pasting it inline:

```sql
-- one-time: stash the service key + function URL in Vault
select vault.create_secret('<SERVICE_ROLE_KEY>', 'whoop_sync_key');
select vault.create_secret('https://<REF>.supabase.co/functions/v1/whoop-sync', 'whoop_sync_url');

select cron.schedule('whoop-hourly-sync', '0 * * * *', $$
  select net.http_post(
    url     := (select decrypted_secret from vault.decrypted_secrets where name = 'whoop_sync_url'),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'whoop_sync_key')
    ),
    body    := '{}'::jsonb
  );
$$);
```

---

## How the sync maps WHOOP → Cadence

### `recovery_metrics` — one row per day, keyed on `(owner_id, date)`

Merged from the recovery, cycle and sleep collections and dated to the day you
wake:

| Cadence column | WHOOP source |
|----------------|--------------|
| `recovery_pct` | recovery `score.recovery_score` |
| `resting_hr` | recovery `score.resting_heart_rate` |
| `hrv_ms` | recovery `score.hrv_rmssd_milli` |
| `spo2_percentage` | recovery `score.spo2_percentage` |
| `skin_temp_celsius` | recovery `score.skin_temp_celsius` |
| `strain` | cycle `score.strain` |
| `active_energy_kcal` | cycle `score.kilojoule` ÷ 4.184 |
| `day_avg_hr` / `day_max_hr` | cycle `score.average_/max_heart_rate` |
| `sleep_hours` | sleep in-bed − awake time |
| `sleep_performance_pct` | sleep `score.sleep_performance_percentage` |
| `sleep_efficiency_pct` / `sleep_consistency_pct` | sleep `score.*_percentage` |
| `respiratory_rate` | sleep `score.respiratory_rate` |
| `sleep_light_/deep_/rem_/awake_min` | sleep `stage_summary.*` (÷ 60000) |
| `sleep_cycle_count` / `sleep_disturbance_count` | sleep `stage_summary.*` |
| `sleep_need_min` / `sleep_debt_min` | sleep `sleep_needed.*` |

Only fields WHOOP actually scored are written, so a day that already has Apple
Health values (e.g. `steps`, which WHOOP doesn't provide) keeps them. Re-running
is safe — it refreshes the same day's row.

### `cardio_sessions` — one row per WHOOP workout, keyed on `(owner_id, external_id)`

Cardio-type sports only (running, cycling, rowing, swimming, walking, hiking,
stairs, elliptical, HIIT). Strength/mobility (weightlifting, functional fitness,
yoga, pilates…) are **skipped** — the Programs/Workouts flow owns those. Mapped
by WHOOP `sport_name`; unrecognised cardio falls to kind `other`.

| Cadence column | WHOOP source |
|----------------|--------------|
| `kind` | `sport_name` → cardio kind |
| `duration_min` | `end − start` |
| `distance_km` | `score.distance_meter` ÷ 1000 |
| `avg_hr` / `max_hr` | `score.average_/max_heart_rate` |
| `calories` | `score.kilojoule` ÷ 4.184 |
| `strain` | `score.strain` |
| `altitude_gain_m` | `score.altitude_gain_meter` |
| `external_id` | WHOOP workout `id` (idempotency key) |

WHOOP workouts appear on the **Cardio** screen alongside anything you log
manually; the `external_id` unique index means re-syncing updates the same row
rather than duplicating it.

## Token security

The WHOOP access + refresh tokens live in `fitness.whoop_oauth_token`, which has
RLS on with no policies **and** table grants revoked from `anon`/`authenticated`
— only Edge Functions (service role, which bypasses RLS) can read them. The
browser only ever sees the status row in `fitness.whoop_connection`. WHOOP uses
**rotating refresh tokens**: every refresh returns a new refresh token and
invalidates the old one, so the sync function always persists the newest one.

## Troubleshooting

- **`invalid_or_expired_state`** on the callback — the connect link is older than 10 minutes, or a different browser/device finished the flow. Click Connect again.
- **`WHOOP token refresh failed`** in the sync error — the stored refresh token was invalidated (e.g. a second flow ran, or access was revoked in the WHOOP app). Disconnect and reconnect.
- **`Missing required secret`** — one of the step-3 secrets isn't set on the functions.
- **Nothing appears after connecting** — WHOOP generates recovery only after a scored sleep; brand-new accounts may have no scored days yet. Try **Sync now** the next morning.
