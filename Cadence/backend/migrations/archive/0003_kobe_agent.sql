-- ── 0003_kobe_agent.sql ───────────────────────────────────────────────────
-- Proper shared-access model for the dedicated Kobe/Cadence agent.
--
-- Purpose:
--   Let a separate agent user read/write Rodney-authorised Cadence rows without
--   using Rodney's password and without a service-role key in the agent.
--
-- Security model:
--   - Rodney remains the row owner (`owner_id`).
--   - A dedicated agent user receives access through `cadence_agent_access`.
--   - Access is revocable by setting `revoked_at`.
--   - Policies are dynamic; they do not hardcode Rodney/Kobe UUIDs.
--
-- Before/after running this migration:
--   1. Create the dedicated auth user through Supabase Auth UI/API:
--        email: kobe-agent@cadence.app
--      Do not create users by inserting passwords into SQL.
--   2. Run this migration.
--   3. Insert one active grant row using the helper block at the bottom, replacing
--      only the email addresses if needed.
--
-- Run in: Supabase SQL Editor for project uimjzehrykeebocphdna

begin;

-- ── Access grants ───────────────────────────────────────────────────────────
create table if not exists public.cadence_agent_access (
  id              uuid primary key default gen_random_uuid(),
  owner_user_id   uuid not null references auth.users(id) on delete cascade,
  agent_user_id   uuid not null references auth.users(id) on delete cascade,
  can_read        boolean not null default true,
  can_write       boolean not null default false,
  reason          text not null default '',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  revoked_at      timestamptz null,
  check (owner_user_id <> agent_user_id),
  check (can_read or can_write)
);

create unique index if not exists cadence_agent_access_one_active_grant
  on public.cadence_agent_access(owner_user_id, agent_user_id)
  where revoked_at is null;

create index if not exists cadence_agent_access_agent_idx
  on public.cadence_agent_access(agent_user_id)
  where revoked_at is null;

create index if not exists cadence_agent_access_owner_idx
  on public.cadence_agent_access(owner_user_id)
  where revoked_at is null;

-- Keep updated_at current if the project trigger exists.
do $$
begin
  if exists (select 1 from pg_proc where proname = 'set_updated_at') then
    drop trigger if exists set_cadence_agent_access_updated_at on public.cadence_agent_access;
    create trigger set_cadence_agent_access_updated_at
      before update on public.cadence_agent_access
      for each row execute function public.set_updated_at();
  end if;
end $$;

alter table public.cadence_agent_access enable row level security;

-- Owners can see/manage grants for their own workspace. Agents can see grants
-- issued to them, which lets the bridge discover the owner_user_id without
-- storing Rodney's UUID in chat or code.
drop policy if exists cadence_agent_access_select on public.cadence_agent_access;
create policy cadence_agent_access_select on public.cadence_agent_access
  for select using (
    owner_user_id = auth.uid()
    or agent_user_id = auth.uid()
  );

drop policy if exists cadence_agent_access_insert on public.cadence_agent_access;
create policy cadence_agent_access_insert on public.cadence_agent_access
  for insert with check (owner_user_id = auth.uid());

drop policy if exists cadence_agent_access_update on public.cadence_agent_access;
create policy cadence_agent_access_update on public.cadence_agent_access
  for update using (owner_user_id = auth.uid())
  with check (owner_user_id = auth.uid());

drop policy if exists cadence_agent_access_delete on public.cadence_agent_access;
create policy cadence_agent_access_delete on public.cadence_agent_access
  for delete using (owner_user_id = auth.uid());

-- Helper used by data-table policies. SECURITY DEFINER prevents recursive RLS
-- checks on `cadence_agent_access`, while the predicate itself remains narrow:
-- only active rows where the current authenticated user is the granted agent.
create or replace function public.cadence_can_access_owner(
  target_owner_id uuid,
  required_access text default 'read'
)
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select exists (
    select 1
    from public.cadence_agent_access a
    where a.owner_user_id = target_owner_id
      and a.agent_user_id = auth.uid()
      and a.revoked_at is null
      and case
        when required_access = 'write' then a.can_write
        else a.can_read or a.can_write
      end
  );
$$;

revoke all on function public.cadence_can_access_owner(uuid, text) from public;
grant execute on function public.cadence_can_access_owner(uuid, text) to authenticated;

-- ── RLS for Cadence data tables ─────────────────────────────────────────────
-- Every table still supports normal owner access. The agent can read/write rows
-- only for owners that granted active access.
do $$
declare
  t text;
begin
  foreach t in array array[
    'projects','milestones','project_updates','people','talking_points',
    'work_items','comments','decisions','notes','outbox','links','activity'
  ] loop
    execute format('alter table public.%I enable row level security', t);

    execute format('drop policy if exists %I on public.%I', t || '_select', t);
    execute format(
      'create policy %I on public.%I for select using (
         owner_id = auth.uid()
         or public.cadence_can_access_owner(owner_id, ''read'')
       )',
      t || '_select', t
    );

    execute format('drop policy if exists %I on public.%I', t || '_insert', t);
    execute format(
      'create policy %I on public.%I for insert with check (
         owner_id = auth.uid()
         or public.cadence_can_access_owner(owner_id, ''write'')
       )',
      t || '_insert', t
    );

    execute format('drop policy if exists %I on public.%I', t || '_update', t);
    execute format(
      'create policy %I on public.%I for update using (
         owner_id = auth.uid()
         or public.cadence_can_access_owner(owner_id, ''write'')
       ) with check (
         owner_id = auth.uid()
         or public.cadence_can_access_owner(owner_id, ''write'')
       )',
      t || '_update', t
    );

    execute format('drop policy if exists %I on public.%I', t || '_delete', t);
    execute format(
      'create policy %I on public.%I for delete using (
         owner_id = auth.uid()
         or public.cadence_can_access_owner(owner_id, ''write'')
       )',
      t || '_delete', t
    );
  end loop;
end $$;

commit;
