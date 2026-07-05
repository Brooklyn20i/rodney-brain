-- 0031_tighten_waitlist_admin_update.sql
-- Security advisor: rls_policy_always_true. waitlist_admin_update had
-- WITH CHECK (true); make it admin-only to match its USING clause.
-- Applied to the live project (uimjzehrykeebocphdna) via MCP 2026-07-05.
drop policy if exists waitlist_admin_update on public.waitlist;
create policy waitlist_admin_update on public.waitlist
  for update to authenticated
  using (exists (select 1 from public.workspace_members m where m.user_id = auth.uid() and m.role = 'admin'))
  with check (exists (select 1 from public.workspace_members m where m.user_id = auth.uid() and m.role = 'admin'));
