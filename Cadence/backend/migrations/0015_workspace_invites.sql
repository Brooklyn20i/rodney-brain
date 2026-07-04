-- ── 0015_workspace_invites.sql ──────────────────────────────────────────────
-- Phase 2: team invite flow.
--
-- Adds:
--   1. `email` column on workspace_members — stored at invite acceptance so
--      the member list can show emails without a client-side join to auth.users.
--   2. `workspace_invites` table — one row per invite link (the UUID is the
--      token embedded in the link). Invites expire after 7 days.
--   3. `accept_workspace_invite(token)` RPC — SECURITY DEFINER so it can read
--      auth.users to get the acceptor's email. Validates token, inserts member,
--      marks invite used. Returns JSON {ok, workspace_id} or {error}.
--
-- Run AFTER 0014_workspace_rls.sql.
-- Safe to re-run: uses IF NOT EXISTS / OR REPLACE.
-- ─────────────────────────────────────────────────────────────────────────────

begin;

-- ── 1. Add email to workspace_members ────────────────────────────────────────
alter table public.workspace_members
  add column if not exists email text not null default '';

-- ── 2. workspace_invites ──────────────────────────────────────────────────────
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

-- Workspace admins can see invites for their workspace (to list pending ones).
-- Invite ids are bearer tokens, so never expose them publicly; invite
-- acceptance is handled by accept_workspace_invite(token), not direct SELECT.
drop policy if exists workspace_invites_select on public.workspace_invites;
create policy workspace_invites_select on public.workspace_invites
  for select using (
    public.cadence_workspace_access(workspace_id, 'admin')
  );

-- Only workspace admins (or workspace creators) can create invites.
drop policy if exists workspace_invites_insert on public.workspace_invites;
create policy workspace_invites_insert on public.workspace_invites
  for insert with check (
    invited_by = auth.uid()
    and public.cadence_workspace_access(workspace_id, 'admin')
  );

-- Inviter can revoke (delete) their own pending invites.
drop policy if exists workspace_invites_delete on public.workspace_invites;
create policy workspace_invites_delete on public.workspace_invites
  for delete using (
    invited_by = auth.uid()
    and accepted_at is null
  );

-- ── 3. accept_workspace_invite RPC ───────────────────────────────────────────
create or replace function public.accept_workspace_invite(token uuid)
returns json
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  inv  public.workspace_invites%rowtype;
  user_email text;
begin
  -- Must be authenticated.
  if auth.uid() is null then
    return json_build_object('error', 'Not authenticated');
  end if;

  -- Find a valid, unexpired, unused invite.
  select * into inv
  from public.workspace_invites
  where id = token
    and expires_at > now()
    and accepted_at is null;

  if not found then
    return json_build_object('error', 'Invite link is invalid, expired, or already used');
  end if;

  -- Get the caller's email (requires SECURITY DEFINER to read auth.users).
  select email into user_email
  from auth.users
  where id = auth.uid();

  -- Add the caller to the workspace (upsert in case they were already a member).
  insert into public.workspace_members (workspace_id, user_id, role, invited_by, email)
  values (inv.workspace_id, auth.uid(), inv.role, inv.invited_by, coalesce(user_email, ''))
  on conflict (workspace_id, user_id) do update
    set role  = excluded.role,
        email = excluded.email;

  -- Mark the invite as accepted.
  update public.workspace_invites
  set accepted_at = now(), accepted_by = auth.uid()
  where id = token;

  return json_build_object('ok', true, 'workspace_id', inv.workspace_id);
end;
$$;

revoke all on function public.accept_workspace_invite(uuid) from public;
grant execute on function public.accept_workspace_invite(uuid) to authenticated;

commit;
