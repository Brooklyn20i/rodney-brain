-- ── 0012_add_workspace_id.sql ────────────────────────────────────────────────
-- Phase 1: add workspace_id (nullable) to every data table.
--
-- Column is nullable here so the migration is non-destructive and the app
-- continues to work before the backfill (0013) is run. 0013 backfills all
-- existing rows and then sets NOT NULL.
--
-- Run AFTER 0011_workspaces.sql.
-- Safe to re-run: uses ADD COLUMN IF NOT EXISTS.
-- ─────────────────────────────────────────────────────────────────────────────

-- Original 12 tables (from 0001_init.sql)
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

-- Additional tables added in later migrations (0006)
alter table public.project_phases   add column if not exists workspace_id uuid references public.workspaces(id) on delete restrict;
alter table public.raid_items       add column if not exists workspace_id uuid references public.workspaces(id) on delete restrict;
alter table public.stakeholders     add column if not exists workspace_id uuid references public.workspaces(id) on delete restrict;

-- Indexes for workspace-scoped queries (partial: only non-null rows benefit most)
create index if not exists idx_projects_workspace        on public.projects(workspace_id)        where deleted_at is null;
create index if not exists idx_people_workspace          on public.people(workspace_id)          where deleted_at is null;
create index if not exists idx_work_items_workspace      on public.work_items(workspace_id)      where deleted_at is null;
create index if not exists idx_decisions_workspace       on public.decisions(workspace_id)       where deleted_at is null;
create index if not exists idx_notes_workspace           on public.notes(workspace_id)           where deleted_at is null;
create index if not exists idx_activity_workspace        on public.activity(workspace_id);
