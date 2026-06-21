-- ═══════════════════════════════════════════════════════════════════════════
-- Cadence — Combined Migration 0008–0015
-- Paste this entire script into Supabase SQL Editor and click Run once.
-- Safe to re-run on a database that already has some of these applied.
-- ═══════════════════════════════════════════════════════════════════════════


-- ─── 0008: Immutable owner_id ────────────────────────────────────────────────

create or replace function _reject_owner_id_change()
returns trigger language plpgsql as $$
begin
  if NEW.owner_id is distinct from OLD.owner_id then
    raise exception 'owner_id is immutable after insert (table: %). '
      'Attempted change from % to %.', TG_TABLE_NAME, OLD.owner_id, NEW.owner_id;
  end if;
  return NEW;
end;
$$;

do $$
declare t text;
begin
  foreach t in array array[
    'projects','milestones','project_updates','people','talking_points',
    'work_items','comments','decisions','notes','outbox','links','activity'
  ] loop
    execute format(
      'drop trigger if exists trg_immutable_owner_id on %I; '
      'create trigger trg_immutable_owner_id '
      'before update on %I '
      'for each row execute function _reject_owner_id_change();',
      t, t
    );
  end loop;
end $$;


-- ─── 0011: Workspace tables ──────────────────────────────────────────────────

create table if not exists public.workspaces (
  id         uuid        primary key default gen_random_uuid(),
  name       text        not null,
  created_by uuid        not null references auth.users(id) on delete restrict,
  plan       text        not null default 'free',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

drop trigger if exists trg_workspaces_updated on public.workspaces;
create trigger trg_workspaces_updated
  before update on public.workspaces
  for each row execute function public.set_updated_at();

alter table public.workspaces enable row level security;

create table if not exists public.workspace_members (
  workspace_id uuid        not null references public.workspaces(id) on delete cascade,
  user_id      uuid        not null references auth.users(id) on delete cascade,
  role         text        not null default 'editor'
               check (role in ('admin', 'editor', 'viewer')),
  invited_by   uuid        references auth.users(id),
  joined_at    timestamptz not null default now(),
  primary key (workspace_id, user_id)
);

alter table public.workspace_members enable row level security;

drop policy if exists workspace_members_select on public.workspace_members;
create policy workspace_members_select on public.workspace_members
  for select using (
    exists (
      select 1 from public.workspace_members wm2
      where wm2.workspace_id = workspace_id and wm2.user_id = auth.uid()
    )
  );

drop policy if exists workspace_members_insert on public.workspace_members;
create policy workspace_members_insert on public.workspace_members
  for insert with check (
    exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = workspace_id and wm.user_id = auth.uid() and wm.role = 'admin'
    )
    or exists (
      select 1 from public.workspaces w
      where w.id = workspace_id and w.created_by = auth.uid()
    )
  );

drop policy if exists workspace_members_update on public.workspace_members;
create policy workspace_members_update on public.workspace_members
  for update using (
    exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = workspace_id and wm.user_id = auth.uid() and wm.role = 'admin'
    )
  );

drop policy if exists workspace_members_delete on public.workspace_members;
create policy workspace_members_delete on public.workspace_members
  for delete using (
    exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = workspace_id and wm.user_id = auth.uid() and wm.role = 'admin'
    )
    or user_id = auth.uid()
  );

-- workspaces policies (after workspace_members exists, since select policy references it)
drop policy if exists workspaces_select on public.workspaces;
create policy workspaces_select on public.workspaces
  for select using (
    exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = id and wm.user_id = auth.uid()
    )
  );

drop policy if exists workspaces_insert on public.workspaces;
create policy workspaces_insert on public.workspaces
  for insert with check (created_by = auth.uid());

drop policy if exists workspaces_update on public.workspaces;
create policy workspaces_update on public.workspaces
  for update using (created_by = auth.uid()) with check (created_by = auth.uid());

drop policy if exists workspaces_delete on public.workspaces;
create policy workspaces_delete on public.workspaces
  for delete using (false);

alter table public.workspaces        replica identity full;
alter table public.workspace_members replica identity full;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'workspaces'
  ) then
    alter publication supabase_realtime add table public.workspaces;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'workspace_members'
  ) then
    alter publication supabase_realtime add table public.workspace_members;
  end if;
end $$;


-- ─── 0012: Add workspace_id columns ──────────────────────────────────────────

alter table public.projects         add column if not exists workspace_id uuid references public.workspaces(id) on delete restrict;
alter table public.milestones       add column if not exists workspace_id uuid references public.workspaces(id) on delete restrict;
alter table public.project_updates  add column if not exists workspace_id uuid references public.workspaces(id) on delete restrict;
alter table public.people           add column if not exists workspace_id uuid references public.workspaces(id) on delete restrict;
alter table public.talking_points   add column if not exists workspace_id uuid references public.workspaces(id) on delete restrict;
alter table public.work_items       add column if not exists workspace_id uuid references public.workspaces(id) on delete restrict;
alter table public.comments         add column if not exists workspace_id uuid references public.workspaces(id) on delete restrict;
alter table public.decisions        add column if not exists workspace_id uuid references public.workspaces(id) on delete restrict;
alter table public.notes            add column if not exists workspace_id uuid references public.workspaces(id) on delete restrict;
alter table public.outbox           add column if not exists workspace_id uuid references public.workspaces(id) on delete restrict;
alter table public.links            add column if not exists workspace_id uuid references public.workspaces(id) on delete restrict;
alter table public.activity         add column if not exists workspace_id uuid references public.workspaces(id) on delete restrict;
alter table public.project_phases   add column if not exists workspace_id uuid references public.workspaces(id) on delete restrict;
alter table public.raid_items       add column if not exists workspace_id uuid references public.workspaces(id) on delete restrict;
alter table public.stakeholders     add column if not exists workspace_id uuid references public.workspaces(id) on delete restrict;

create index if not exists idx_projects_workspace   on public.projects(workspace_id)   where deleted_at is null;
create index if not exists idx_people_workspace     on public.people(workspace_id)     where deleted_at is null;
create index if not exists idx_work_items_workspace on public.work_items(workspace_id) where deleted_at is null;
create index if not exists idx_decisions_workspace  on public.decisions(workspace_id)  where deleted_at is null;
create index if not exists idx_notes_workspace      on public.notes(workspace_id)      where deleted_at is null;
create index if not exists idx_activity_workspace   on public.activity(workspace_id);


-- ─── 0013: Backfill workspace ────────────────────────────────────────────────
-- Temporarily disable the activity append-only trigger if it already exists
-- (0009 may have been applied in a prior session).

do $$ begin
  if exists (select 1 from pg_trigger where tgname = 'trg_activity_append_only') then
    alter table activity disable trigger trg_activity_append_only;
  end if;
end $$;

do $$
declare
  rodney_uid uuid;
  kobe_uid   uuid;
  ws_id      uuid;
begin
  select id into rodney_uid from auth.users where email = 'rbalech@gmail.com';
  if rodney_uid is null then
    raise exception 'User rbalech@gmail.com not found in auth.users.';
  end if;

  select id into kobe_uid from auth.users where email = 'kobe-agent@cadence.app';

  select id into ws_id
  from public.workspaces
  where created_by = rodney_uid and deleted_at is null
  limit 1;

  if ws_id is null then
    insert into public.workspaces (name, created_by)
    values ('Rodney''s Workspace', rodney_uid)
    returning id into ws_id;
  end if;

  insert into public.workspace_members (workspace_id, user_id, role)
  values (ws_id, rodney_uid, 'admin')
  on conflict (workspace_id, user_id) do nothing;

  if kobe_uid is not null then
    insert into public.workspace_members (workspace_id, user_id, role, invited_by)
    values (ws_id, kobe_uid, 'editor', rodney_uid)
    on conflict (workspace_id, user_id) do nothing;
  end if;

  update public.projects        set workspace_id = ws_id where owner_id = rodney_uid and workspace_id is null;
  update public.milestones      set workspace_id = ws_id where owner_id = rodney_uid and workspace_id is null;
  update public.project_updates set workspace_id = ws_id where owner_id = rodney_uid and workspace_id is null;
  update public.project_phases  set workspace_id = ws_id where owner_id = rodney_uid and workspace_id is null;
  update public.raid_items      set workspace_id = ws_id where owner_id = rodney_uid and workspace_id is null;
  update public.stakeholders    set workspace_id = ws_id where owner_id = rodney_uid and workspace_id is null;
  update public.people          set workspace_id = ws_id where owner_id = rodney_uid and workspace_id is null;
  update public.talking_points  set workspace_id = ws_id where owner_id = rodney_uid and workspace_id is null;
  update public.work_items      set workspace_id = ws_id where owner_id = rodney_uid and workspace_id is null;
  update public.comments        set workspace_id = ws_id where owner_id = rodney_uid and workspace_id is null;
  update public.decisions       set workspace_id = ws_id where owner_id = rodney_uid and workspace_id is null;
  update public.notes           set workspace_id = ws_id where owner_id = rodney_uid and workspace_id is null;
  update public.outbox          set workspace_id = ws_id where owner_id = rodney_uid and workspace_id is null;
  update public.links           set workspace_id = ws_id where owner_id = rodney_uid and workspace_id is null;
  update public.activity        set workspace_id = ws_id where owner_id = rodney_uid and workspace_id is null;

  raise notice 'Backfill complete. workspace_id = %', ws_id;
end $$;

-- Re-enable trigger if we disabled it
do $$ begin
  if exists (select 1 from pg_trigger where tgname = 'trg_activity_append_only') then
    alter table activity enable trigger trg_activity_append_only;
  end if;
end $$;

-- Lock workspace_id to NOT NULL (safe: backfill just set all rows)
alter table public.projects         alter column workspace_id set not null;
alter table public.milestones       alter column workspace_id set not null;
alter table public.project_updates  alter column workspace_id set not null;
alter table public.project_phases   alter column workspace_id set not null;
alter table public.raid_items       alter column workspace_id set not null;
alter table public.stakeholders     alter column workspace_id set not null;
alter table public.people           alter column workspace_id set not null;
alter table public.talking_points   alter column workspace_id set not null;
alter table public.work_items       alter column workspace_id set not null;
alter table public.comments         alter column workspace_id set not null;
alter table public.decisions        alter column workspace_id set not null;
alter table public.notes            alter column workspace_id set not null;
alter table public.outbox           alter column workspace_id set not null;
alter table public.links            alter column workspace_id set not null;
alter table public.activity         alter column workspace_id set not null;


-- ─── 0009: Activity append-only ──────────────────────────────────────────────

do $$ declare pol text; begin
  for pol in
    select policyname from pg_policies
    where tablename = 'activity' and cmd in ('UPDATE','DELETE')
  loop
    execute format('drop policy if exists %I on activity', pol);
  end loop;
end $$;

create or replace function _activity_append_only()
returns trigger language plpgsql as $$
begin
  raise exception
    'activity rows are append-only. '
    'Use insert to log; existing entries cannot be modified or deleted.';
end;
$$;

drop trigger if exists trg_activity_append_only on activity;
create trigger trg_activity_append_only
  before update or delete on activity
  for each row execute function _activity_append_only();


-- ─── 0010: Owner-validated child rows ────────────────────────────────────────

create or replace function _validate_work_item_owner()
returns trigger language plpgsql as $$
begin
  if NEW.project_id is not null then
    if not exists (
      select 1 from projects where id = NEW.project_id and owner_id = NEW.owner_id
    ) then
      raise exception
        'work_item owner_id (%) does not match project owner_id for project %',
        NEW.owner_id, NEW.project_id;
    end if;
  end if;
  if NEW.person_id is not null then
    if not exists (
      select 1 from people where id = NEW.person_id and owner_id = NEW.owner_id
    ) then
      raise exception
        'work_item owner_id (%) does not match person owner_id for person %',
        NEW.owner_id, NEW.person_id;
    end if;
  end if;
  return NEW;
end;
$$;

drop trigger if exists trg_work_item_owner_check on work_items;
create trigger trg_work_item_owner_check
  before insert or update on work_items
  for each row execute function _validate_work_item_owner();

create or replace function _validate_milestone_owner()
returns trigger language plpgsql as $$
begin
  if NEW.project_id is not null then
    if not exists (
      select 1 from projects where id = NEW.project_id and owner_id = NEW.owner_id
    ) then
      raise exception
        'milestone owner_id (%) does not match project owner_id for project %',
        NEW.owner_id, NEW.project_id;
    end if;
  end if;
  return NEW;
end;
$$;

drop trigger if exists trg_milestone_owner_check on milestones;
create trigger trg_milestone_owner_check
  before insert or update on milestones
  for each row execute function _validate_milestone_owner();


-- ─── 0014: Workspace RLS ─────────────────────────────────────────────────────

create or replace function public.cadence_workspace_access(
  wid           uuid,
  required_role text default 'viewer'
)
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select exists (
    select 1
    from public.workspace_members wm
    where wm.workspace_id = wid
      and wm.user_id = auth.uid()
      and case
        when required_role = 'admin'  then wm.role = 'admin'
        when required_role = 'editor' then wm.role in ('admin', 'editor')
        else true
      end
  )
$$;

revoke all on function public.cadence_workspace_access(uuid, text) from public;
grant execute on function public.cadence_workspace_access(uuid, text) to authenticated;

do $$
declare t text;
begin
  foreach t in array array[
    'projects', 'milestones', 'project_updates', 'project_phases',
    'raid_items', 'stakeholders',
    'people', 'talking_points',
    'work_items', 'comments',
    'decisions', 'notes', 'outbox', 'links', 'activity'
  ] loop
    execute format('alter table public.%I enable row level security;', t);

    execute format('drop policy if exists %I on public.%I;', t || '_select', t);
    execute format(
      'create policy %I on public.%I for select using (
         cadence_can_access(owner_id, false)
         or (workspace_id is not null and cadence_workspace_access(workspace_id, ''viewer''))
       );',
      t || '_select', t
    );

    execute format('drop policy if exists %I on public.%I;', t || '_insert', t);
    execute format(
      'create policy %I on public.%I for insert with check (
         cadence_can_access(owner_id, true)
         or (workspace_id is not null and cadence_workspace_access(workspace_id, ''editor''))
       );',
      t || '_insert', t
    );

    execute format('drop policy if exists %I on public.%I;', t || '_update', t);
    execute format(
      'create policy %I on public.%I for update using (
         cadence_can_access(owner_id, true)
         or (workspace_id is not null and cadence_workspace_access(workspace_id, ''editor''))
       ) with check (
         cadence_can_access(owner_id, true)
         or (workspace_id is not null and cadence_workspace_access(workspace_id, ''editor''))
       );',
      t || '_update', t
    );

    execute format('drop policy if exists %I on public.%I;', t || '_delete', t);
    execute format(
      'create policy %I on public.%I for delete using (
         cadence_can_access(owner_id, true)
         or (workspace_id is not null and cadence_workspace_access(workspace_id, ''admin''))
       );',
      t || '_delete', t
    );
  end loop;
end $$;


-- ─── 0015: Workspace invites ──────────────────────────────────────────────────

alter table public.workspace_members
  add column if not exists email text not null default '';

create table if not exists public.workspace_invites (
  id           uuid        primary key default gen_random_uuid(),
  workspace_id uuid        not null references public.workspaces(id) on delete cascade,
  invited_by   uuid        not null references auth.users(id) on delete cascade,
  role         text        not null default 'editor'
               check (role in ('admin', 'editor', 'viewer')),
  expires_at   timestamptz not null default now() + interval '7 days',
  accepted_at  timestamptz,
  accepted_by  uuid        references auth.users(id),
  created_at   timestamptz not null default now()
);

alter table public.workspace_invites enable row level security;

drop policy if exists workspace_invites_select on public.workspace_invites;
create policy workspace_invites_select on public.workspace_invites
  for select using (true);

drop policy if exists workspace_invites_insert on public.workspace_invites;
create policy workspace_invites_insert on public.workspace_invites
  for insert with check (
    invited_by = auth.uid()
    and public.cadence_workspace_access(workspace_id, 'admin')
  );

drop policy if exists workspace_invites_delete on public.workspace_invites;
create policy workspace_invites_delete on public.workspace_invites
  for delete using (
    invited_by = auth.uid()
    and accepted_at is null
  );

create or replace function public.accept_workspace_invite(token uuid)
returns json
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  inv        public.workspace_invites%rowtype;
  user_email text;
begin
  if auth.uid() is null then
    return json_build_object('error', 'Not authenticated');
  end if;

  select * into inv
  from public.workspace_invites
  where id = token
    and expires_at > now()
    and accepted_at is null;

  if not found then
    return json_build_object('error', 'Invite link is invalid, expired, or already used');
  end if;

  select email into user_email from auth.users where id = auth.uid();

  insert into public.workspace_members (workspace_id, user_id, role, invited_by, email)
  values (inv.workspace_id, auth.uid(), inv.role, inv.invited_by, coalesce(user_email, ''))
  on conflict (workspace_id, user_id) do update
    set role  = excluded.role,
        email = excluded.email;

  update public.workspace_invites
  set accepted_at = now(), accepted_by = auth.uid()
  where id = token;

  return json_build_object('ok', true, 'workspace_id', inv.workspace_id);
end;
$$;

revoke all on function public.accept_workspace_invite(uuid) from public;
grant execute on function public.accept_workspace_invite(uuid) to authenticated;

-- ─── Done ────────────────────────────────────────────────────────────────────
select 'Migrations 0008–0015 applied successfully.' as result;
