#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
MIGRATIONS_DIR="$ROOT/Cadence/backend/migrations"

: "${PGHOST:=localhost}"
: "${PGPORT:=5432}"
: "${PGDATABASE:=postgres}"
: "${PGUSER:=postgres}"

psql_cmd=(psql -v ON_ERROR_STOP=1 --no-psqlrc)

echo "Preparing Supabase-compatible replay shim on $PGHOST:$PGPORT/$PGDATABASE"
"${psql_cmd[@]}" <<'SQL'
create extension if not exists pgcrypto;

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin bypassrls;
  end if;
end $$;

create schema if not exists auth;
create table if not exists auth.users (
  id uuid primary key default gen_random_uuid(),
  email text unique,
  created_at timestamptz not null default now()
);

create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;

create or replace function auth.jwt()
returns jsonb
language sql
stable
as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb);
$$;

create or replace function auth.role()
returns text
language sql
stable
as $$
  select coalesce(nullif(current_setting('request.jwt.claim.role', true), ''), 'anon');
$$;

do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
end $$;
SQL

echo "Replaying canonical Cadence migrations"
while IFS= read -r migration; do
  migration_name="$(basename "$migration")"

  if [[ "$migration_name" == "0013_backfill_workspace.sql" ]]; then
    echo ">> seeding data-bearing workspace backfill fixture before $migration_name"
    "${psql_cmd[@]}" <<'SQL'
insert into auth.users (id, email)
values
  ('11111111-1111-4111-8111-111111111111', 'rbalech@gmail.com'),
  ('22222222-2222-4222-8222-222222222222', 'kobe-agent@cadence.app')
on conflict (email) do nothing;

insert into public.projects (owner_id, name, goal)
values ('11111111-1111-4111-8111-111111111111', 'Replay fixture project', 'prove workspace backfill');

insert into public.people (owner_id, name)
values ('11111111-1111-4111-8111-111111111111', 'Replay Fixture Person');

insert into public.activity (owner_id, actor, action, detail)
values ('11111111-1111-4111-8111-111111111111', 'agent:kobe', 'replay_fixture', 'prove 0013 can stamp append-only activity rows');
SQL
  fi

  echo ">> ${migration#$ROOT/}"
  "${psql_cmd[@]}" -f "$migration"
done < <(find "$MIGRATIONS_DIR" -maxdepth 1 -type f -name '[0-9][0-9][0-9][0-9]_*.sql' | sort)

echo "Running replay assertions"
"${psql_cmd[@]}" <<'SQL'
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'people' and column_name = 'type'
  ) then
    raise exception 'Expected public.people.type to exist after replay';
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'cadence_agent_access' and column_name = 'owner_user_id'
  ) then
    raise exception 'Replay produced legacy public.cadence_agent_access.owner_user_id column';
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'cadence_agent_access' and column_name = 'owner_id'
  ) then
    raise exception 'Expected public.cadence_agent_access.owner_id to exist after replay';
  end if;

  if exists (select 1 from public.activity where action = 'replay_fixture' and workspace_id is null) then
    raise exception 'Expected 0013 to backfill workspace_id onto pre-existing activity rows';
  end if;

  if exists (select 1 from public.projects where name = 'Replay fixture project' and workspace_id is null) then
    raise exception 'Expected 0013 to backfill workspace_id onto pre-existing project rows';
  end if;
end $$;
SQL

echo "Migration replay completed successfully"
