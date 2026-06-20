-- 0008_immutable_owner_id.sql
-- P0 fix: prevent owner_id mutation on all owner-scoped tables.
--
-- Issue (2026-06-20 security review):
--   owner_id is writable via UPDATE with no restriction. A grant-aware agent
--   operating under cadence_can_access_owner() write access could issue an
--   UPDATE that changes owner_id to its own user ID, effectively stealing rows
--   out of Rodney's workspace while still passing the RLS check at the time the
--   write occurs (because RLS is evaluated against the *old* owner_id).
--
-- Fix:
--   A BEFORE UPDATE trigger rejects any attempt to change owner_id on any of
--   the twelve owner-scoped tables. The trigger fires server-side before the
--   row is written, so no RLS policy bypass or client-side workaround can
--   circumvent it.
--
-- Safe to re-run: uses CREATE OR REPLACE for the function and DROP IF EXISTS
-- before each trigger.

create or replace function _reject_owner_id_change()
returns trigger language plpgsql as $$
begin
  if NEW.owner_id is distinct from OLD.owner_id then
    raise exception 'owner_id is immutable after insert (table: %). '
      'Attempted change from % to %.', TG_TABLE_NAME, OLD.owner_id, NEW.owner_id;
  end if;
  return NEW;
end;
$$;

-- Apply to all owner-scoped tables
do $$
declare t text;
begin
  foreach t in array array[
    'projects','milestones','project_updates','people','talking_points',
    'work_items','comments','decisions','notes','outbox','links','activity'
  ] loop
    execute format(
      'drop trigger if exists trg_immutable_owner_id on %I; '
      'create trigger trg_immutable_owner_id '
      'before update on %I '
      'for each row execute function _reject_owner_id_change();',
      t, t
    );
  end loop;
end $$;
