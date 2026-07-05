-- 0029_provision_workspace.sql
-- First-login provisioning for self-serve signups.
--
-- A brand-new user has no workspace, and work_items.workspace_id is NOT NULL,
-- so they can't create anything. A direct client insert into `workspaces` is
-- also blocked (the `authenticated` role lacks a column-level INSERT grant on
-- workspaces.created_by, so PostgREST drops it, created_by lands NULL, and the
-- `created_by = auth.uid()` policy fails). This SECURITY DEFINER function does
-- the provisioning server-side: atomic, idempotent, one call on first login.
--
-- Applied to the live project (uimjzehrykeebocphdna) via MCP on 2026-07-05.

create or replace function public.provision_workspace(ws_name text default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  wid uuid;
  uemail text;
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;

  select workspace_id into wid from public.workspace_members where user_id = uid limit 1;
  if wid is not null then
    return wid;
  end if;

  select email into uemail from auth.users where id = uid;

  insert into public.workspaces (name, created_by)
  values (coalesce(nullif(btrim(ws_name), ''), 'My Cadence'), uid)
  returning id into wid;

  insert into public.workspace_members (workspace_id, user_id, role, email)
  values (wid, uid, 'admin', coalesce(uemail, ''));

  return wid;
end;
$$;

revoke all on function public.provision_workspace(text) from public, anon;
grant execute on function public.provision_workspace(text) to authenticated;
