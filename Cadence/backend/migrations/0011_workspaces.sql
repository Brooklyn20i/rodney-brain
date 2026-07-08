-- ── 0011_workspaces.sql ─────────────────────────────────────────────────────
-- Phase 1: introduce workspace (multi-tenant) layer.
--
-- Creates the two control tables that all future data is scoped to:
--   workspaces        — one row per team / company
--   workspace_members — who belongs to which workspace and at what role
--
-- Run on STAGING first, verify, then run on production.
-- Safe to re-run: guarded with IF NOT EXISTS.
-- Run in: Supabase SQL Editor
-- ─────────────────────────────────────────────────────────────────────────────

begin;

-- ── workspaces ───────────────────────────────────────────────────────────────
create table if not exists public.workspaces (
  id         uuid        primary key default gen_random_uuid(),
  name       text        not null,
  created_by uuid        not null references auth.users(id) on delete restrict,
  plan       text        not null default 'free',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

do $$ begin
  if not exists (select 1 from pg_proc where proname = 'set_updated_at') then
    raise exception 'set_updated_at function must exist (run 0001_init.sql first)';
  end if;
end $$;

drop trigger if exists trg_workspaces_updated on public.workspaces;
create trigger trg_workspaces_updated
  before update on public.workspaces
  for each row execute function public.set_updated_at();

alter table public.workspaces enable row level security;

-- ── workspace_members ────────────────────────────────────────────────────────
-- Create before workspace policies: workspaces_select references this table, and
-- a clean replay fails if the policy is created before the relation exists.
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

-- Members see their workspaces; workspace creators can manage them.
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

-- Soft-delete only; hard delete blocked (use deleted_at).
drop policy if exists workspaces_delete on public.workspaces;
create policy workspaces_delete on public.workspaces
  for delete using (false);

-- Members can see others in the same workspace.
drop policy if exists workspace_members_select on public.workspace_members;
create policy workspace_members_select on public.workspace_members
  for select using (
    exists (
      select 1 from public.workspace_members wm2
      where wm2.workspace_id = workspace_id and wm2.user_id = auth.uid()
    )
  );

-- Only admins can add members (enforced in app layer for now; DB enforces via role check in Phase 2).
drop policy if exists workspace_members_insert on public.workspace_members;
create policy workspace_members_insert on public.workspace_members
  for insert with check (
    exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = workspace_id
        and wm.user_id = auth.uid()
        and wm.role = 'admin'
    )
    or
    -- Allow the workspace creator to add the first members (including themselves).
    exists (
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
    or user_id = auth.uid() -- members can remove themselves
  );

-- ── Realtime ─────────────────────────────────────────────────────────────────
alter table public.workspaces       replica identity full;
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

commit;
