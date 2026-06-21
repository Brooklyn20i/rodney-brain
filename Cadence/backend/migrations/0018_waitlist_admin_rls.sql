-- Migration 0018: allow workspace admins to read and manage the waitlist

-- Workspace admins can read all waitlist entries
create policy "waitlist_admin_select"
  on public.waitlist
  for select
  to authenticated
  using (
    exists (
      select 1 from public.workspace_members
      where user_id = auth.uid() and role = 'admin'
    )
  );

-- Workspace admins can update status (approve / reject)
create policy "waitlist_admin_update"
  on public.waitlist
  for update
  to authenticated
  using (
    exists (
      select 1 from public.workspace_members
      where user_id = auth.uid() and role = 'admin'
    )
  )
  with check (true);
