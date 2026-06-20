-- ── 0014_workspace_rls.sql ───────────────────────────────────────────────────
-- Phase 1: add workspace membership as a data-access path alongside the
-- existing owner/agent access.
--
-- Strategy (Phase 1 transition — NOT the final state):
--   Keep cadence_can_access() (owner + agent access from 0003_agent_access.sql)
--   AND add workspace membership access. This lets the app work correctly both
--   before and after the backfill (0013) is run, and keeps the Kobe agent
--   operational via its existing grant during the transition.
--
--   Phase 2 will remove the cadence_can_access() fallback and require workspace
--   membership exclusively. Do not skip to Phase 2 without first verifying
--   every user has a workspace and the agent is a workspace_member.
--
-- Run AFTER 0013_backfill_workspace.sql (or at least after 0012).
-- Safe to re-run: all policies use DROP IF EXISTS before CREATE.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Workspace-access helper ──────────────────────────────────────────────────
-- Returns true if the current authenticated user is a member of the given
-- workspace at or above the required role level.
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
        else true  -- 'viewer': any role suffices
      end
  )
$$;

revoke all on function public.cadence_workspace_access(uuid, text) from public;
grant execute on function public.cadence_workspace_access(uuid, text) to authenticated;

-- ── Rewrite RLS on all data tables ──────────────────────────────────────────
-- New predicate: original owner/agent access OR workspace membership.
-- NULL workspace_id (pre-backfill) falls back to owner/agent access only.
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
