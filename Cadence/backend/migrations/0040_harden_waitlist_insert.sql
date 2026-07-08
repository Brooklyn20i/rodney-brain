-- 0040_harden_waitlist_insert.sql
--
-- The waitlist is the only intentionally anonymous write surface. Keep that
-- path open for legitimate early-access requests, but stop anonymous clients
-- from self-approving or sending unbounded payloads.

begin;

alter table public.waitlist enable row level security;

drop policy if exists waitlist_public_insert on public.waitlist;
create policy waitlist_public_insert
  on public.waitlist
  for insert
  to anon, authenticated
  with check (
    status = 'pending'
    and char_length(email) between 3 and 254
    and email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'
    and (name is null or char_length(name) <= 100)
  );

commit;
