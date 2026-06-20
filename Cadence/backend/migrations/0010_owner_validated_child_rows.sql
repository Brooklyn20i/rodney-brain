-- 0010_owner_validated_child_rows.sql
-- P0/P1 fix: validate same-owner parent-child relationships at write time.
--
-- Issue (2026-06-20 security review):
--   Child tables (milestones, work_items, etc.) carry their own owner_id and
--   foreign keys that reference parent rows by id alone — NOT by (id, owner_id).
--   This means a client could create a child row owned by user A that references
--   a parent row owned by user B. The FK is satisfied (the parent id exists) but
--   the cross-tenant reference creates a data-integrity violation and could be
--   exploited to leak or corrupt rows across workspace boundaries.
--
--   Adding composite FK constraints (parent_id, parent_owner_id) would require
--   adding owner_id to all parent unique indexes and a coordinated schema change
--   that risks downtime on live tables. The trigger approach below provides the
--   same safety guarantee without touching the existing schema.
--
-- Fix:
--   BEFORE INSERT OR UPDATE triggers on the two highest-risk child tables:
--     - work_items  → projects (via project_id) and people (via person_id)
--     - milestones  → projects (via project_id)
--   Each trigger verifies that when a FK column is non-null, the referenced
--   parent row exists AND shares the same owner_id as the child row being
--   written. The write is rejected with a descriptive error if the check fails.
--
-- Safe to re-run: CREATE OR REPLACE for functions, DROP IF EXISTS for triggers.

-- ── work_items → projects / people ─────────────────────────────────────────

create or replace function _validate_work_item_owner()
returns trigger language plpgsql as $$
begin
  -- Validate project ownership
  if NEW.project_id is not null then
    if not exists (
      select 1 from projects where id = NEW.project_id and owner_id = NEW.owner_id
    ) then
      raise exception
        'work_item owner_id (%) does not match project owner_id for project %',
        NEW.owner_id, NEW.project_id;
    end if;
  end if;

  -- Validate person ownership
  if NEW.person_id is not null then
    if not exists (
      select 1 from people where id = NEW.person_id and owner_id = NEW.owner_id
    ) then
      raise exception
        'work_item owner_id (%) does not match person owner_id for person %',
        NEW.owner_id, NEW.person_id;
    end if;
  end if;

  return NEW;
end;
$$;

drop trigger if exists trg_work_item_owner_check on work_items;
create trigger trg_work_item_owner_check
  before insert or update on work_items
  for each row execute function _validate_work_item_owner();

-- ── milestones → projects ───────────────────────────────────────────────────

create or replace function _validate_milestone_owner()
returns trigger language plpgsql as $$
begin
  if NEW.project_id is not null then
    if not exists (
      select 1 from projects where id = NEW.project_id and owner_id = NEW.owner_id
    ) then
      raise exception
        'milestone owner_id (%) does not match project owner_id for project %',
        NEW.owner_id, NEW.project_id;
    end if;
  end if;

  return NEW;
end;
$$;

drop trigger if exists trg_milestone_owner_check on milestones;
create trigger trg_milestone_owner_check
  before insert or update on milestones
  for each row execute function _validate_milestone_owner();
