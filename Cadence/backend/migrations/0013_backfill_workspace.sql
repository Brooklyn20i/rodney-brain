-- ── 0013_backfill_workspace.sql ──────────────────────────────────────────────
-- Phase 1: create Rodney's workspace, backfill all existing rows, then lock
-- the column to NOT NULL so no future rows can be workspace-less.
--
-- Prerequisites:
--   - 0011_workspaces.sql applied (workspaces + workspace_members tables exist)
--   - 0012_add_workspace_id.sql applied (workspace_id column exists on all tables)
--   - Rodney's auth user exists (email: rbalech@gmail.com)
--
-- Run AFTER 0012. Review the SELECT statements before committing:
--   SELECT id, email FROM auth.users WHERE email IN ('rbalech@gmail.com', 'kobe-agent@cadence.app');
--
-- Safe to re-run: INSERT uses ON CONFLICT DO NOTHING; UPDATE of already-set
-- rows is idempotent. ALTER COLUMN … SET NOT NULL will fail harmlessly if
-- workspace_id is already NOT NULL.
-- ─────────────────────────────────────────────────────────────────────────────

do $$
declare
  rodney_uid uuid;
  kobe_uid   uuid;
  ws_id      uuid;
begin

  -- ── Locate users ────────────────────────────────────────────────────────────
  select id into rodney_uid from auth.users where email = 'rbalech@gmail.com';
  if rodney_uid is null then
    raise exception
      'User rbalech@gmail.com not found in auth.users. '
      'Rodney must have logged in at least once before this migration runs.';
  end if;

  select id into kobe_uid from auth.users where email = 'kobe-agent@cadence.app';
  -- Kobe is optional — skip if not created yet.

  -- ── Create Rodney's workspace ────────────────────────────────────────────────
  -- Idempotent: if a workspace already owned by Rodney exists, reuse it.
  select id into ws_id
  from public.workspaces
  where created_by = rodney_uid and deleted_at is null
  limit 1;

  if ws_id is null then
    insert into public.workspaces (name, created_by)
    values ('Rodney''s Workspace', rodney_uid)
    returning id into ws_id;
  end if;

  -- ── Add Rodney as admin ──────────────────────────────────────────────────────
  insert into public.workspace_members (workspace_id, user_id, role)
  values (ws_id, rodney_uid, 'admin')
  on conflict (workspace_id, user_id) do nothing;

  -- ── Add Kobe agent as editor (if the agent account exists) ─────────────────
  if kobe_uid is not null then
    insert into public.workspace_members (workspace_id, user_id, role, invited_by)
    values (ws_id, kobe_uid, 'editor', rodney_uid)
    on conflict (workspace_id, user_id) do nothing;
  end if;

  -- ── Backfill workspace_id on all data tables ────────────────────────────────
  -- Only rows owned by Rodney; other owners (if any) are left null and must be
  -- backfilled separately when their workspaces are created.
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

-- ── Verify before locking NOT NULL ───────────────────────────────────────────
-- Run this SELECT and confirm the count is 0 before uncommenting the ALTER TABLE
-- statements below:
--
--   SELECT 'projects' AS t, COUNT(*) FROM projects WHERE workspace_id IS NULL
--   UNION ALL SELECT 'work_items', COUNT(*) FROM work_items WHERE workspace_id IS NULL
--   UNION ALL SELECT 'people',     COUNT(*) FROM people     WHERE workspace_id IS NULL
--   UNION ALL SELECT 'notes',      COUNT(*) FROM notes      WHERE workspace_id IS NULL
--   UNION ALL SELECT 'decisions',  COUNT(*) FROM decisions  WHERE workspace_id IS NULL
--   UNION ALL SELECT 'activity',   COUNT(*) FROM activity   WHERE workspace_id IS NULL;
--
-- If all counts are 0, uncomment and run the block below:

/*
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
*/
