-- Cadence Fitness — native WHOOP API integration
--
-- Adds server-side WHOOP OAuth so recovery / strain / sleep flow straight from
-- the WHOOP developer API into fitness.recovery_metrics, instead of routing
-- through Apple Health. Renpho (weight / body fat) stays on the Apple Health →
-- health-ingest path; this migration does not touch body_metrics.
--
-- Three tables, all in the `fitness` schema:
--   whoop_connection    per-owner connection *status* — safe for the owner to
--                       read (drives the Sync screen). No token material here.
--   whoop_oauth_token   access + rotating refresh token. LOCKED DOWN: revoked
--                       from anon/authenticated so only Edge Functions
--                       (service_role, which bypasses RLS) ever read it.
--   whoop_oauth_state   short-lived CSRF state → owner map for the OAuth
--                       round-trip. Service-role only, same lockdown.
--
-- service_role already has full access to the fitness schema (migration 0025),
-- and its default privileges cover tables created here. The `authenticated`
-- /`anon` default-privilege grant from 0023 *also* covers new tables, so the
-- two secret tables are explicitly revoked below.
--
-- Run ONCE in the Supabase SQL Editor after 0037. Idempotent; safe to re-run.

set search_path to fitness, public;

-- ── connection status (owner-readable) ─────────────────────────────────────
create table if not exists whoop_connection (
  owner_id         uuid primary key references auth.users(id) on delete cascade,
  whoop_user_id    text,
  scopes           text not null default '',
  connected_at     timestamptz not null default now(),
  last_sync_at     timestamptz,
  last_sync_status text,                 -- 'ok' | 'error' | null (never run)
  last_sync_error  text not null default '',
  synced_from      date,                 -- earliest day this connection has pulled
  updated_at       timestamptz not null default now()
);

drop trigger if exists trg_whoop_connection_updated on whoop_connection;
create trigger trg_whoop_connection_updated before update on whoop_connection
  for each row execute function set_updated_at();

alter table whoop_connection enable row level security;

-- The owner may see their own connection status and disconnect (delete). All
-- writes/upserts of status happen from Edge Functions via service_role, so
-- there is deliberately no insert/update policy for authenticated users.
drop policy if exists whoop_connection_select on whoop_connection;
create policy whoop_connection_select on whoop_connection
  for select using (owner_id = auth.uid());

drop policy if exists whoop_connection_delete on whoop_connection;
create policy whoop_connection_delete on whoop_connection
  for delete using (owner_id = auth.uid());

-- ── oauth tokens (service-role only) ───────────────────────────────────────
create table if not exists whoop_oauth_token (
  owner_id      uuid primary key references auth.users(id) on delete cascade,
  access_token  text not null,
  refresh_token text not null,
  expires_at    timestamptz not null,   -- when the access token dies
  scopes        text not null default '',
  updated_at    timestamptz not null default now()
);

drop trigger if exists trg_whoop_oauth_token_updated on whoop_oauth_token;
create trigger trg_whoop_oauth_token_updated before update on whoop_oauth_token
  for each row execute function set_updated_at();

alter table whoop_oauth_token enable row level security;
-- Belt and braces: RLS on with no policies already denies authenticated/anon,
-- but revoke the table grants too so the raw token bytes are never reachable
-- with an anon/user JWT even if a policy is added later by mistake.
revoke all on whoop_oauth_token from anon, authenticated;

-- ── oauth state (service-role only) ────────────────────────────────────────
create table if not exists whoop_oauth_state (
  state       text primary key,
  owner_id    uuid not null references auth.users(id) on delete cascade,
  redirect_to text not null default '',   -- app URL to bounce back to after callback
  created_at  timestamptz not null default now()
);

alter table whoop_oauth_state enable row level security;
revoke all on whoop_oauth_state from anon, authenticated;

create index if not exists idx_whoop_oauth_state_created on whoop_oauth_state(created_at);

-- ── realtime: let the Sync screen react the instant a sync finishes ────────
do $$ begin
  alter publication supabase_realtime add table fitness.whoop_connection;
exception when duplicate_object then null; end $$;

reset search_path;
