-- 0009_activity_append_only.sql
-- P1 fix: make the activity table append-only (insert + select only).
--
-- Issue (2026-06-20 security review):
--   The activity table is intended as a tamper-evident audit trail. However,
--   the RLS policies created in 0002_policies.sql and the agent-access
--   migration grant UPDATE and DELETE on activity to both the owner and any
--   write-authorised agent. This means Rodney or an agent could silently erase
--   or alter audit entries, defeating the purpose of the log.
--
-- Fix:
--   1. Drop any existing UPDATE / DELETE RLS policies on activity — they must
--      not exist even in a permissive sense, because RLS and triggers operate
--      at different layers and a missing policy does not alone block the op.
--   2. Install a BEFORE UPDATE OR DELETE trigger that unconditionally raises an
--      exception. Triggers fire below the RLS layer, so this cannot be bypassed
--      by any grant, policy, or client SDK trick short of a service-role
--      super-user connection (which is never used for normal agent operations
--      per the comment in 0002_policies.sql).
--
-- Safe to re-run: DROP POLICY IF EXISTS / DROP TRIGGER IF EXISTS guards.

-- Drop any existing permissive update/delete policies on activity
do $$ declare pol text; begin
  for pol in
    select policyname from pg_policies
    where tablename = 'activity' and cmd in ('UPDATE','DELETE')
  loop
    execute format('drop policy if exists %I on activity', pol);
  end loop;
end $$;

-- Trigger function that rejects any attempt to UPDATE or DELETE an activity row
create or replace function _activity_append_only()
returns trigger language plpgsql as $$
begin
  raise exception
    'activity rows are append-only. '
    'Use insert to log; existing entries cannot be modified or deleted.';
end;
$$;

drop trigger if exists trg_activity_append_only on activity;
create trigger trg_activity_append_only
  before update or delete on activity
  for each row execute function _activity_append_only();
