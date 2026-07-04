-- Migration 0028: lock down workspace invite token listing
--
-- Earlier invite migrations allowed SELECT on workspace_invites with `using (true)`
-- so an authenticated/public client could list invite UUIDs. The invite id is
-- itself the bearer token, so listing rows exposes join links. Keep acceptance
-- through accept_workspace_invite(token), but only workspace admins may list
-- pending invites in the app.

begin;

alter table public.workspace_invites enable row level security;

drop policy if exists workspace_invites_select on public.workspace_invites;
create policy workspace_invites_select on public.workspace_invites
  for select
  to authenticated
  using (public.cadence_workspace_access(workspace_id, 'admin'));

commit;
