-- ── 0004_realtime_and_color.sql ───────────────────────────────────────────
-- Two fixes bundled:
--   1. Make cross-device sync reliable for EVERY table by ensuring they are all
--      members of the `supabase_realtime` publication and emit full row data.
--      (New tables are NOT added to realtime automatically — this is the root
--       cause of "changes don't sync across devices".)
--   2. Add a per-person `color` so avatars can be customised.
--
-- Safe + idempotent. Run in:
--   https://supabase.com/dashboard/project/uimjzehrykeebocphdna/editor

-- ── 1. Per-person avatar colour ────────────────────────────────────────────
alter table people add column if not exists color text not null default '#1B5E9E';

-- ── 2. Realtime on all app tables ──────────────────────────────────────────
do $$
declare t text;
begin
  foreach t in array array[
    'projects','milestones','project_updates','people','talking_points',
    'work_items','comments','decisions','notes','outbox','links','activity'
  ] loop
    -- Emit complete OLD/NEW rows on update/delete (needed for realtime payloads)
    execute format('alter table %I replica identity full;', t);

    -- Add to the realtime publication only if not already a member
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table %I;', t);
    end if;
  end loop;

  raise notice 'Realtime enabled on all tables + people.color added.';
end $$;
