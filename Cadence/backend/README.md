# Cadence backend (Supabase / Postgres)

Cadence's durable source of truth. The web app and approved agent tooling read/write these tables through Supabase Auth and Row-Level Security.

## Files

- `migrations/0001_init.sql` — schema: tables, enums, triggers, indexes.
- `migrations/0002_policies.sql` — owner-only Row-Level Security.
- `migrations/0003_agent_access.sql` — delegated agent access without owner password sharing.
- `activate_agent_grant.sql` — template to grant one agent auth user access to one owner account.

## Stand up

1. Create a Supabase project.
2. Run the migrations in order:
   - `migrations/0001_init.sql`
   - `migrations/0002_policies.sql`
   - `migrations/0003_agent_access.sql`
3. In **Project Settings → API**, copy only the browser-safe values for the web app:
   - Project URL
   - anon public key
4. In **Authentication → Providers**, enable Email/password.
5. Put only `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` into the web build environment.

## Agent access model

Do not share Rodney's password with the agent. Do not use a Supabase `service_role` key for normal agent work.

Use a dedicated Supabase Auth user for the agent, then run `activate_agent_grant.sql` with the owner's auth email and the agent auth email. The grant is stored in `cadence_agent_access` and can be revoked by setting `revoked_at = now()` or deleting the row.

The agent then operates through normal authenticated RLS using the anon key plus its own password stored locally in Keychain or another secret manager.

## Notes

- `owner_id` defaults to `auth.uid()`, so normal clients do not set it.
- Delegated inserts may set `owner_id` to the owner account only when an active write grant exists.
- The browser bundle must never contain passwords, refresh tokens, or service-role keys.
- Migrations are plain SQL; later changes are added as `0004_*.sql`, etc.
