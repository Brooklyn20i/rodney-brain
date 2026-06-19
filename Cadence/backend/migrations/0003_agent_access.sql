-- Cadence — delegated agent access without sharing Rodney's password
--
-- Purpose:
--   Let a dedicated agent auth user operate on an owner's Cadence rows through
--   normal Supabase auth + anon key, without exposing the owner's password and
--   without putting a service_role key in local agent tooling.
--
-- Activation:
--   1. Create the agent as a normal Supabase Auth user.
--   2. Insert one row into cadence_agent_access(owner_id, agent_user_id, can_write).
--   3. Revoke by setting revoked_at, or delete the grant.

create table if not exists cadence_agent_access (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid not null references auth.users(id) on delete cascade,
  agent_user_id uuid not null references auth.users(id) on delete cascade,
  can_write     boolean not null default true,
  note          text not null default '',
  created_at    timestamptz not null default now(),
  revoked_at    timestamptz,
  unique(owner_id, agent_user_id)
);

create index if not exists idx_cadence_agent_access_agent
  on cadence_agent_access(agent_user_id, owner_id)
  where revoked_at is null;

alter table cadence_agent_access enable row level security;

drop policy if exists cadence_agent_access_select on cadence_agent_access;
create policy cadence_agent_access_select on cadence_agent_access
  for select using (owner_id = auth.uid() or agent_user_id = auth.uid());

drop policy if exists cadence_agent_access_insert on cadence_agent_access;
create policy cadence_agent_access_insert on cadence_agent_access
  for insert with check (owner_id = auth.uid());

drop policy if exists cadence_agent_access_update on cadence_agent_access;
create policy cadence_agent_access_update on cadence_agent_access
  for update using (owner_id = auth.uid()) with check (owner_id = auth.uid());

drop policy if exists cadence_agent_access_delete on cadence_agent_access;
create policy cadence_agent_access_delete on cadence_agent_access
  for delete using (owner_id = auth.uid());

create or replace function cadence_can_access(row_owner uuid, require_write boolean default false)
returns boolean
language sql
stable
security definer
set search_path = public
as $fn$
  select auth.uid() is not null
    and (
      row_owner = auth.uid()
      or exists (
        select 1
        from public.cadence_agent_access a
        where a.owner_id = row_owner
          and a.agent_user_id = auth.uid()
          and a.revoked_at is null
          and (not require_write or a.can_write)
      )
    );
$fn$;

grant execute on function cadence_can_access(uuid, boolean) to authenticated;

do $policies$
declare t text;
begin
  foreach t in array array['projects','milestones','project_updates','people',
    'talking_points','work_items','comments','decisions','notes','outbox',
    'links','activity']
  loop
    execute format('alter table %I enable row level security;', t);

    execute format('drop policy if exists %1$I_select on %1$I;', t);
    execute format('create policy %1$I_select on %1$I for select using (cadence_can_access(owner_id, false));', t);

    execute format('drop policy if exists %1$I_insert on %1$I;', t);
    execute format('create policy %1$I_insert on %1$I for insert with check (cadence_can_access(owner_id, true));', t);

    execute format('drop policy if exists %1$I_update on %1$I;', t);
    execute format('create policy %1$I_update on %1$I for update using (cadence_can_access(owner_id, true)) with check (cadence_can_access(owner_id, true));', t);

    execute format('drop policy if exists %1$I_delete on %1$I;', t);
    execute format('create policy %1$I_delete on %1$I for delete using (cadence_can_access(owner_id, true));', t);
  end loop;
end $policies$;
