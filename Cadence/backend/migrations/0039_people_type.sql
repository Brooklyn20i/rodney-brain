-- Canonicalize meeting-group support in the primary migration chain.
--
-- The Meetings UI distinguishes individual people from recurring meeting groups
-- with people.type, but the original DDL lived in Cadence/migrations/ outside
-- the canonical backend/migrations replay path. Keep this additive and
-- idempotent so production can safely receive it if needed, while fresh replay
-- always produces the column the web app expects.

alter table public.people
  add column if not exists type text;

update public.people
  set type = 'person'
  where type is null;

alter table public.people
  alter column type set default 'person';

alter table public.people
  alter column type set not null;

comment on column public.people.type is
  'person | meeting_group — distinguishes recurring meeting groups from individual contacts';

alter table public.people
  drop constraint if exists people_type_check;

alter table public.people
  add constraint people_type_check
  check (type in ('person', 'meeting_group'));

create index if not exists idx_people_owner_type_live
  on public.people(owner_id, type)
  where deleted_at is null;
