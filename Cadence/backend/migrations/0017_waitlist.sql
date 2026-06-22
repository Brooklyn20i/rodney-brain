-- Migration 0017: waitlist table for self-serve sign-up requests

create table if not exists public.waitlist (
  id          uuid        primary key default gen_random_uuid(),
  email       text        not null unique,
  name        text,
  created_at  timestamptz not null default now(),
  status      text        not null default 'pending'
                check (status in ('pending', 'approved', 'rejected'))
);

alter table public.waitlist enable row level security;

-- Anyone (anon or authenticated) can add themselves
create policy "waitlist_public_insert"
  on public.waitlist
  for insert
  to anon, authenticated
  with check (true);

-- No select policy = only service role can read the list (admin use only)
