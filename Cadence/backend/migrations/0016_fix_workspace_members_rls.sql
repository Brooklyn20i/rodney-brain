-- ── 0016_fix_workspace_members_rls.sql ──────────────────────────────────────
-- Fixes infinite recursion in workspace_members RLS policies.
--
-- Root cause: the SELECT, INSERT, UPDATE, and DELETE policies on
-- workspace_members all contained plain subqueries back into workspace_members.
-- A plain subquery re-triggers the policy, causing Postgres to recurse forever.
--
-- Fix: replace every self-referencing subquery with cadence_workspace_access(),
-- which is a SECURITY DEFINER function that queries workspace_members directly
-- (bypassing RLS) and therefore breaks the recursion chain.
--
-- The workspace creator branch on INSERT is kept as a plain subquery into
-- workspaces (a different table — no recursion risk) so the very first member
-- can still be added when no admin exists yet.
--
-- Safe to re-run: all policies use DROP IF EXISTS before CREATE.
-- Run in: Supabase SQL Editor
-- ─────────────────────────────────────────────────────────────────────────────

begin;

-- SELECT: any member of the workspace can see the member list.
drop policy if exists workspace_members_select on public.workspace_members;
create policy workspace_members_select on public.workspace_members
  for select using (
    public.cadence_workspace_access(workspace_id, 'viewer')
  );

-- INSERT: an existing admin may add members; the workspace creator may add the
-- very first member (including themselves) before any admin row exists.
drop policy if exists workspace_members_insert on public.workspace_members;
create policy workspace_members_insert on public.workspace_members
  for insert with check (
    public.cadence_workspace_access(workspace_id, 'admin')
    or exists (
      select 1 from public.workspaces w
      where w.id = workspace_id and w.created_by = auth.uid()
    )
  );

-- UPDATE: only admins may change roles.
drop policy if exists workspace_members_update on public.workspace_members;
create policy workspace_members_update on public.workspace_members
  for update using (
    public.cadence_workspace_access(workspace_id, 'admin')
  );

-- DELETE: admins may remove others; any member may remove themselves.
drop policy if exists workspace_members_delete on public.workspace_members;
create policy workspace_members_delete on public.workspace_members
  for delete using (
    public.cadence_workspace_access(workspace_id, 'admin')
    or user_id = auth.uid()
  );

commit;
