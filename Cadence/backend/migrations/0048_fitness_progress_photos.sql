-- Progress photos for diet tracking.
--
-- One row per photo; the image itself lives in a PRIVATE Supabase Storage
-- bucket ('progress-photos'), path `<owner_id>/<photo_id>.jpg`, and the row
-- carries the path plus context (date, pose, the weight on that day). Photos
-- are the first binary payloads in Cadence — everything else is table rows —
-- so this migration also creates the bucket and its owner-scoped policies.
--
-- Run ONCE in the Supabase SQL Editor, after 0047. Idempotent; safe to re-run.

set search_path to fitness, public;

create table if not exists progress_photos (
  id           uuid primary key default gen_random_uuid(),
  owner_id     uuid not null references auth.users(id) on delete cascade default auth.uid(),
  photo_date   date not null default current_date,
  pose         text not null default 'front',           -- 'front' | 'side' | 'back'
  storage_path text not null,                           -- '<owner_id>/<photo_id>.jpg' in bucket progress-photos
  weight_kg    numeric(5,2),                            -- weight at capture time (snapshot; trend edits don't rewrite it)
  notes        text not null default '',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  deleted_at   timestamptz
);

drop trigger if exists trg_progress_photos_updated on progress_photos;
create trigger trg_progress_photos_updated before update on progress_photos
  for each row execute function set_updated_at();

alter table progress_photos enable row level security;

-- Same owner-or-granted-agent policies as every other fitness table (0023).
drop policy if exists progress_photos_select on progress_photos;
create policy progress_photos_select on progress_photos
  for select using (
    owner_id = auth.uid()
    or fitness.fitness_can_access_owner(owner_id, 'read')
  );

drop policy if exists progress_photos_insert on progress_photos;
create policy progress_photos_insert on progress_photos
  for insert with check (
    owner_id = auth.uid()
    or fitness.fitness_can_access_owner(owner_id, 'write')
  );

drop policy if exists progress_photos_update on progress_photos;
create policy progress_photos_update on progress_photos
  for update using (
    owner_id = auth.uid()
    or fitness.fitness_can_access_owner(owner_id, 'write')
  ) with check (
    owner_id = auth.uid()
    or fitness.fitness_can_access_owner(owner_id, 'write')
  );

drop policy if exists progress_photos_delete on progress_photos;
create policy progress_photos_delete on progress_photos
  for delete using (
    owner_id = auth.uid()
    or fitness.fitness_can_access_owner(owner_id, 'write')
  );

create index if not exists idx_progress_photos_date
  on progress_photos(owner_id, photo_date desc) where deleted_at is null;

do $$ begin
  execute 'alter publication supabase_realtime add table fitness.progress_photos';
exception when duplicate_object then null;
end $$;

-- ── Storage bucket + policies ────────────────────────────────────────────
-- Private bucket; every object path starts with the uploader's user id, and
-- the policies only allow access inside your own folder. The app renders
-- photos through short-lived signed URLs.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('progress-photos', 'progress-photos', false, 10485760, array['image/jpeg', 'image/png', 'image/webp', 'image/heic'])
on conflict (id) do nothing;

drop policy if exists "progress_photos_storage_select" on storage.objects;
create policy "progress_photos_storage_select" on storage.objects
  for select using (
    bucket_id = 'progress-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "progress_photos_storage_insert" on storage.objects;
create policy "progress_photos_storage_insert" on storage.objects
  for insert with check (
    bucket_id = 'progress-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "progress_photos_storage_update" on storage.objects;
create policy "progress_photos_storage_update" on storage.objects
  for update using (
    bucket_id = 'progress-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "progress_photos_storage_delete" on storage.objects;
create policy "progress_photos_storage_delete" on storage.objects
  for delete using (
    bucket_id = 'progress-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

reset search_path;
