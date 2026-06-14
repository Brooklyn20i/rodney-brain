# Cadence backend (Supabase / Postgres)

The single source of truth for Cadence. All clients (native app, web app, agent)
read and write here; the server handles sync.

## Files
- `migrations/0001_init.sql` — schema: tables, enums, triggers, indexes.
- `migrations/0002_policies.sql` — Row-Level Security (each user sees only their rows).
- `migrations/0003_kobe_agent.sql` — dedicated Kobe agent access via membership grant and dynamic RLS.
- `activate_kobe_agent_grant.sql` — idempotent grant activation for Rodney → Kobe access after the auth user exists.
- `AGENT_ACCESS_RUNBOOK.md` — activation, verification, and revocation steps for Kobe/Hermes access.

## Phase 1 — stand it up (≈10 minutes, done together)

1. Create a free account at https://supabase.com and a new **project**
   (pick a strong database password; choose the region closest to you).
2. In the project, open **SQL Editor** → paste the contents of
   `0001_init.sql`, run it → then `0002_policies.sql`, run it.
3. Open **Project Settings → API** and copy:
   - **Project URL** (e.g. `https://xxxx.supabase.co`)
   - **anon public key** — safe to ship in the web/native clients and to use for the dedicated Kobe login.
4. Under **Authentication → Providers**, enable **Email**.
5. For Kobe/Hermes access, follow `AGENT_ACCESS_RUNBOOK.md`; do not give the agent a service-role key.

That's it — the backend is live. The web app then points at the Project URL +
anon key, you log in with your email, and sync just works across every device.

## Notes
- `owner_id` defaults to `auth.uid()` for normal clients; the Kobe bridge explicitly sets Rodney's owner id from the active access grant so new rows appear in Rodney's workspace.
- Keys: only the **anon** key goes in client/agent login config. Do not use a service-role key for normal Kobe/Hermes operations.
- Migrations are plain SQL; later changes are added as `0004_*.sql`, etc.
