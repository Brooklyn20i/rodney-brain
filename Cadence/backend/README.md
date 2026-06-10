# Cadence backend (Supabase / Postgres)

The single source of truth for Cadence. All clients (native app, web app, agent)
read and write here; the server handles sync.

## Files
- `migrations/0001_init.sql` — schema: tables, enums, triggers, indexes.
- `migrations/0002_policies.sql` — Row-Level Security (each user sees only their rows).

## Phase 1 — stand it up (≈10 minutes, done together)

1. Create a free account at https://supabase.com and a new **project**
   (pick a strong database password; choose the region closest to you).
2. In the project, open **SQL Editor** → paste the contents of
   `0001_init.sql`, run it → then `0002_policies.sql`, run it.
3. Open **Project Settings → API** and copy:
   - **Project URL** (e.g. `https://xxxx.supabase.co`)
   - **anon public key** — safe to ship in the web/native clients.
   - **service_role key** — SECRET; used only by the agent. Never commit it.
4. Under **Authentication → Providers**, enable **Email** (magic-link is simplest).

That's it — the backend is live. The web app then points at the Project URL +
anon key, you log in with your email, and sync just works across every device.

## Notes
- `owner_id` defaults to `auth.uid()`, so clients don't set it; RLS enforces it.
- Keys: only the **anon** key goes in client code. The **service_role** key stays
  in the agent's environment (and out of git).
- Migrations are plain SQL; later changes are added as `0003_*.sql`, etc.
