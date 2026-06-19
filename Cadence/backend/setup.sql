-- Cadence — full setup. Paste this whole file into the Supabase SQL Editor and Run.
-- Rewrote to avoid $$ dollar-quoting (Safari copy-paste issue); uses named tags.

-- ── Enumerated types ──────────────────────────────────────────────────────────
DO $t1$ BEGIN CREATE TYPE item_type AS ENUM ('task','decision','followUp','waitingFor','risk','action'); EXCEPTION WHEN duplicate_object THEN NULL; END $t1$;
DO $t2$ BEGIN CREATE TYPE priority_level AS ENUM ('high','medium','low'); EXCEPTION WHEN duplicate_object THEN NULL; END $t2$;
DO $t3$ BEGIN CREATE TYPE project_status AS ENUM ('active','onHold','completed'); EXCEPTION WHEN duplicate_object THEN NULL; END $t3$;
DO $t4$ BEGIN CREATE TYPE decision_status AS ENUM ('pending','decided','deferred'); EXCEPTION WHEN duplicate_object THEN NULL; END $t4$;
DO $t5$ BEGIN CREATE TYPE health_status AS ENUM ('green','amber','red'); EXCEPTION WHEN duplicate_object THEN NULL; END $t5$;
DO $t6$ BEGIN CREATE TYPE email_status AS ENUM ('draft','queued','sent','cancelled'); EXCEPTION WHEN duplicate_object THEN NULL; END $t6$;
DO $t7$ BEGIN CREATE TYPE link_parent AS ENUM ('project','work_item'); EXCEPTION WHEN duplicate_object THEN NULL; END $t7$;

-- ── updated_at trigger function ───────────────────────────────────────────────
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger AS $fn$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$fn$ LANGUAGE plpgsql;

-- ── projects ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS projects (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid(),
  name        text NOT NULL,
  goal        text NOT NULL DEFAULT '',
  status      project_status NOT NULL DEFAULT 'active',
  health      health_status  NOT NULL DEFAULT 'green',
  owner       text NOT NULL DEFAULT '',
  target_date date,
  next_action text NOT NULL DEFAULT '',
  color       text NOT NULL DEFAULT '#1B5E9E',
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  deleted_at  timestamptz
);

CREATE TABLE IF NOT EXISTS milestones (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id   uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title      text NOT NULL,
  due_date   date,
  done       boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE TABLE IF NOT EXISTS project_updates (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id   uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  text       text NOT NULL,
  health     health_status,
  author     text NOT NULL DEFAULT 'you',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

-- ── people ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS people (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id   uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid(),
  name       text NOT NULL,
  role       text NOT NULL DEFAULT '',
  email      text NOT NULL DEFAULT '',
  notes      text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE TABLE IF NOT EXISTS talking_points (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id   uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid(),
  person_id  uuid NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  text       text NOT NULL,
  done       boolean NOT NULL DEFAULT false,
  author     text NOT NULL DEFAULT 'you',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

-- ── work_items ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS work_items (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid(),
  title        text NOT NULL,
  type         item_type NOT NULL DEFAULT 'task',
  priority     priority_level NOT NULL DEFAULT 'medium',
  due_date     date,
  project_id   uuid REFERENCES projects(id) ON DELETE SET NULL,
  person_id    uuid REFERENCES people(id)   ON DELETE SET NULL,
  notes        text NOT NULL DEFAULT '',
  done         boolean NOT NULL DEFAULT false,
  inboxed      boolean NOT NULL DEFAULT true,
  source       text NOT NULL DEFAULT 'you',
  completed_at timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  deleted_at   timestamptz
);

CREATE TABLE IF NOT EXISTS comments (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid(),
  work_item_id uuid NOT NULL REFERENCES work_items(id) ON DELETE CASCADE,
  text         text NOT NULL,
  author       text NOT NULL DEFAULT 'you',
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  deleted_at   timestamptz
);

-- ── decisions ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS decisions (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id   uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid(),
  title      text NOT NULL,
  status     decision_status NOT NULL DEFAULT 'pending',
  due_date   date,
  context    text NOT NULL DEFAULT '',
  outcome    text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

-- ── notes ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS notes (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id   uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid(),
  title      text NOT NULL DEFAULT '',
  body       text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

-- ── outbox ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS outbox (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id             uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid(),
  "to"                 text NOT NULL,
  cc                   text NOT NULL DEFAULT '',
  subject              text NOT NULL DEFAULT '',
  body                 text NOT NULL DEFAULT '',
  status               email_status NOT NULL DEFAULT 'queued',
  related_project_id   uuid REFERENCES projects(id)   ON DELETE SET NULL,
  related_work_item_id uuid REFERENCES work_items(id) ON DELETE SET NULL,
  created_by           text NOT NULL DEFAULT 'you',
  sent_at              timestamptz,
  sent_via             text,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  deleted_at           timestamptz
);

-- ── links ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS links (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid(),
  parent_type link_parent NOT NULL,
  parent_id   uuid NOT NULL,
  url         text NOT NULL,
  title       text NOT NULL DEFAULT '',
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  deleted_at  timestamptz
);

-- ── activity ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS activity (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id   uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid(),
  actor      text NOT NULL,
  action     text NOT NULL,
  detail     text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ── updated_at triggers (one per table) ──────────────────────────────────────
DROP TRIGGER IF EXISTS trg_projects_updated        ON projects;        CREATE TRIGGER trg_projects_updated        BEFORE UPDATE ON projects        FOR EACH ROW EXECUTE FUNCTION set_updated_at();
DROP TRIGGER IF EXISTS trg_milestones_updated      ON milestones;      CREATE TRIGGER trg_milestones_updated      BEFORE UPDATE ON milestones      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
DROP TRIGGER IF EXISTS trg_project_updates_updated ON project_updates; CREATE TRIGGER trg_project_updates_updated BEFORE UPDATE ON project_updates FOR EACH ROW EXECUTE FUNCTION set_updated_at();
DROP TRIGGER IF EXISTS trg_people_updated          ON people;          CREATE TRIGGER trg_people_updated          BEFORE UPDATE ON people          FOR EACH ROW EXECUTE FUNCTION set_updated_at();
DROP TRIGGER IF EXISTS trg_talking_points_updated  ON talking_points;  CREATE TRIGGER trg_talking_points_updated  BEFORE UPDATE ON talking_points  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
DROP TRIGGER IF EXISTS trg_work_items_updated      ON work_items;      CREATE TRIGGER trg_work_items_updated      BEFORE UPDATE ON work_items      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
DROP TRIGGER IF EXISTS trg_comments_updated        ON comments;        CREATE TRIGGER trg_comments_updated        BEFORE UPDATE ON comments        FOR EACH ROW EXECUTE FUNCTION set_updated_at();
DROP TRIGGER IF EXISTS trg_decisions_updated       ON decisions;       CREATE TRIGGER trg_decisions_updated       BEFORE UPDATE ON decisions       FOR EACH ROW EXECUTE FUNCTION set_updated_at();
DROP TRIGGER IF EXISTS trg_notes_updated           ON notes;           CREATE TRIGGER trg_notes_updated           BEFORE UPDATE ON notes           FOR EACH ROW EXECUTE FUNCTION set_updated_at();
DROP TRIGGER IF EXISTS trg_outbox_updated          ON outbox;          CREATE TRIGGER trg_outbox_updated          BEFORE UPDATE ON outbox          FOR EACH ROW EXECUTE FUNCTION set_updated_at();
DROP TRIGGER IF EXISTS trg_links_updated           ON links;           CREATE TRIGGER trg_links_updated           BEFORE UPDATE ON links           FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ── indexes ───────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_work_items_owner   ON work_items(owner_id)  WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_work_items_project ON work_items(project_id);
CREATE INDEX IF NOT EXISTS idx_work_items_person  ON work_items(person_id);
CREATE INDEX IF NOT EXISTS idx_milestones_project ON milestones(project_id);
CREATE INDEX IF NOT EXISTS idx_updates_project    ON project_updates(project_id);
CREATE INDEX IF NOT EXISTS idx_comments_item      ON comments(work_item_id);
CREATE INDEX IF NOT EXISTS idx_talking_person     ON talking_points(person_id);
CREATE INDEX IF NOT EXISTS idx_links_parent       ON links(parent_type, parent_id);
CREATE INDEX IF NOT EXISTS idx_activity_owner     ON activity(owner_id, created_at DESC);

-- ── Row-Level Security — enable on every table ────────────────────────────────
ALTER TABLE projects        ENABLE ROW LEVEL SECURITY;
ALTER TABLE milestones      ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_updates ENABLE ROW LEVEL SECURITY;
ALTER TABLE people          ENABLE ROW LEVEL SECURITY;
ALTER TABLE talking_points  ENABLE ROW LEVEL SECURITY;
ALTER TABLE work_items      ENABLE ROW LEVEL SECURITY;
ALTER TABLE comments        ENABLE ROW LEVEL SECURITY;
ALTER TABLE decisions       ENABLE ROW LEVEL SECURITY;
ALTER TABLE notes           ENABLE ROW LEVEL SECURITY;
ALTER TABLE outbox          ENABLE ROW LEVEL SECURITY;
ALTER TABLE links           ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity        ENABLE ROW LEVEL SECURITY;

-- ── RLS policies — projects ───────────────────────────────────────────────────
DROP POLICY IF EXISTS projects_select ON projects; CREATE POLICY projects_select ON projects FOR SELECT USING (owner_id = auth.uid());
DROP POLICY IF EXISTS projects_insert ON projects; CREATE POLICY projects_insert ON projects FOR INSERT WITH CHECK (owner_id = auth.uid());
DROP POLICY IF EXISTS projects_update ON projects; CREATE POLICY projects_update ON projects FOR UPDATE USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
DROP POLICY IF EXISTS projects_delete ON projects; CREATE POLICY projects_delete ON projects FOR DELETE USING (owner_id = auth.uid());

-- ── RLS policies — milestones ─────────────────────────────────────────────────
DROP POLICY IF EXISTS milestones_select ON milestones; CREATE POLICY milestones_select ON milestones FOR SELECT USING (owner_id = auth.uid());
DROP POLICY IF EXISTS milestones_insert ON milestones; CREATE POLICY milestones_insert ON milestones FOR INSERT WITH CHECK (owner_id = auth.uid());
DROP POLICY IF EXISTS milestones_update ON milestones; CREATE POLICY milestones_update ON milestones FOR UPDATE USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
DROP POLICY IF EXISTS milestones_delete ON milestones; CREATE POLICY milestones_delete ON milestones FOR DELETE USING (owner_id = auth.uid());

-- ── RLS policies — project_updates ───────────────────────────────────────────
DROP POLICY IF EXISTS project_updates_select ON project_updates; CREATE POLICY project_updates_select ON project_updates FOR SELECT USING (owner_id = auth.uid());
DROP POLICY IF EXISTS project_updates_insert ON project_updates; CREATE POLICY project_updates_insert ON project_updates FOR INSERT WITH CHECK (owner_id = auth.uid());
DROP POLICY IF EXISTS project_updates_update ON project_updates; CREATE POLICY project_updates_update ON project_updates FOR UPDATE USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
DROP POLICY IF EXISTS project_updates_delete ON project_updates; CREATE POLICY project_updates_delete ON project_updates FOR DELETE USING (owner_id = auth.uid());

-- ── RLS policies — people ─────────────────────────────────────────────────────
DROP POLICY IF EXISTS people_select ON people; CREATE POLICY people_select ON people FOR SELECT USING (owner_id = auth.uid());
DROP POLICY IF EXISTS people_insert ON people; CREATE POLICY people_insert ON people FOR INSERT WITH CHECK (owner_id = auth.uid());
DROP POLICY IF EXISTS people_update ON people; CREATE POLICY people_update ON people FOR UPDATE USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
DROP POLICY IF EXISTS people_delete ON people; CREATE POLICY people_delete ON people FOR DELETE USING (owner_id = auth.uid());

-- ── RLS policies — talking_points ─────────────────────────────────────────────
DROP POLICY IF EXISTS talking_points_select ON talking_points; CREATE POLICY talking_points_select ON talking_points FOR SELECT USING (owner_id = auth.uid());
DROP POLICY IF EXISTS talking_points_insert ON talking_points; CREATE POLICY talking_points_insert ON talking_points FOR INSERT WITH CHECK (owner_id = auth.uid());
DROP POLICY IF EXISTS talking_points_update ON talking_points; CREATE POLICY talking_points_update ON talking_points FOR UPDATE USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
DROP POLICY IF EXISTS talking_points_delete ON talking_points; CREATE POLICY talking_points_delete ON talking_points FOR DELETE USING (owner_id = auth.uid());

-- ── RLS policies — work_items ─────────────────────────────────────────────────
DROP POLICY IF EXISTS work_items_select ON work_items; CREATE POLICY work_items_select ON work_items FOR SELECT USING (owner_id = auth.uid());
DROP POLICY IF EXISTS work_items_insert ON work_items; CREATE POLICY work_items_insert ON work_items FOR INSERT WITH CHECK (owner_id = auth.uid());
DROP POLICY IF EXISTS work_items_update ON work_items; CREATE POLICY work_items_update ON work_items FOR UPDATE USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
DROP POLICY IF EXISTS work_items_delete ON work_items; CREATE POLICY work_items_delete ON work_items FOR DELETE USING (owner_id = auth.uid());

-- ── RLS policies — comments ───────────────────────────────────────────────────
DROP POLICY IF EXISTS comments_select ON comments; CREATE POLICY comments_select ON comments FOR SELECT USING (owner_id = auth.uid());
DROP POLICY IF EXISTS comments_insert ON comments; CREATE POLICY comments_insert ON comments FOR INSERT WITH CHECK (owner_id = auth.uid());
DROP POLICY IF EXISTS comments_update ON comments; CREATE POLICY comments_update ON comments FOR UPDATE USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
DROP POLICY IF EXISTS comments_delete ON comments; CREATE POLICY comments_delete ON comments FOR DELETE USING (owner_id = auth.uid());

-- ── RLS policies — decisions ──────────────────────────────────────────────────
DROP POLICY IF EXISTS decisions_select ON decisions; CREATE POLICY decisions_select ON decisions FOR SELECT USING (owner_id = auth.uid());
DROP POLICY IF EXISTS decisions_insert ON decisions; CREATE POLICY decisions_insert ON decisions FOR INSERT WITH CHECK (owner_id = auth.uid());
DROP POLICY IF EXISTS decisions_update ON decisions; CREATE POLICY decisions_update ON decisions FOR UPDATE USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
DROP POLICY IF EXISTS decisions_delete ON decisions; CREATE POLICY decisions_delete ON decisions FOR DELETE USING (owner_id = auth.uid());

-- ── RLS policies — notes ──────────────────────────────────────────────────────
DROP POLICY IF EXISTS notes_select ON notes; CREATE POLICY notes_select ON notes FOR SELECT USING (owner_id = auth.uid());
DROP POLICY IF EXISTS notes_insert ON notes; CREATE POLICY notes_insert ON notes FOR INSERT WITH CHECK (owner_id = auth.uid());
DROP POLICY IF EXISTS notes_update ON notes; CREATE POLICY notes_update ON notes FOR UPDATE USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
DROP POLICY IF EXISTS notes_delete ON notes; CREATE POLICY notes_delete ON notes FOR DELETE USING (owner_id = auth.uid());

-- ── RLS policies — outbox ─────────────────────────────────────────────────────
DROP POLICY IF EXISTS outbox_select ON outbox; CREATE POLICY outbox_select ON outbox FOR SELECT USING (owner_id = auth.uid());
DROP POLICY IF EXISTS outbox_insert ON outbox; CREATE POLICY outbox_insert ON outbox FOR INSERT WITH CHECK (owner_id = auth.uid());
DROP POLICY IF EXISTS outbox_update ON outbox; CREATE POLICY outbox_update ON outbox FOR UPDATE USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
DROP POLICY IF EXISTS outbox_delete ON outbox; CREATE POLICY outbox_delete ON outbox FOR DELETE USING (owner_id = auth.uid());

-- ── RLS policies — links ──────────────────────────────────────────────────────
DROP POLICY IF EXISTS links_select ON links; CREATE POLICY links_select ON links FOR SELECT USING (owner_id = auth.uid());
DROP POLICY IF EXISTS links_insert ON links; CREATE POLICY links_insert ON links FOR INSERT WITH CHECK (owner_id = auth.uid());
DROP POLICY IF EXISTS links_update ON links; CREATE POLICY links_update ON links FOR UPDATE USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
DROP POLICY IF EXISTS links_delete ON links; CREATE POLICY links_delete ON links FOR DELETE USING (owner_id = auth.uid());

-- ── RLS policies — activity ───────────────────────────────────────────────────
DROP POLICY IF EXISTS activity_select ON activity; CREATE POLICY activity_select ON activity FOR SELECT USING (owner_id = auth.uid());
DROP POLICY IF EXISTS activity_insert ON activity; CREATE POLICY activity_insert ON activity FOR INSERT WITH CHECK (owner_id = auth.uid());
DROP POLICY IF EXISTS activity_update ON activity; CREATE POLICY activity_update ON activity FOR UPDATE USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
DROP POLICY IF EXISTS activity_delete ON activity; CREATE POLICY activity_delete ON activity FOR DELETE USING (owner_id = auth.uid());

-- ── Delegated agent access ───────────────────────────────────────────────────────
-- Cadence — delegated agent access without sharing Rodney's password
--
-- Purpose:
--   Let a dedicated agent auth user operate on an owner's Cadence rows through
--   normal Supabase auth + anon key, without exposing the owner's password and
--   without putting a service_role key in local agent tooling.
--
-- Activation:
--   1. Create the agent as a normal Supabase Auth user.
--   2. Insert one row into cadence_agent_access(owner_id, agent_user_id, can_write).
--   3. Revoke by setting revoked_at, or delete the grant.

create table if not exists cadence_agent_access (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid not null references auth.users(id) on delete cascade,
  agent_user_id uuid not null references auth.users(id) on delete cascade,
  can_write     boolean not null default true,
  note          text not null default '',
  created_at    timestamptz not null default now(),
  revoked_at    timestamptz,
  unique(owner_id, agent_user_id)
);

create index if not exists idx_cadence_agent_access_agent
  on cadence_agent_access(agent_user_id, owner_id)
  where revoked_at is null;

alter table cadence_agent_access enable row level security;

drop policy if exists cadence_agent_access_select on cadence_agent_access;
create policy cadence_agent_access_select on cadence_agent_access
  for select using (owner_id = auth.uid() or agent_user_id = auth.uid());

drop policy if exists cadence_agent_access_insert on cadence_agent_access;
create policy cadence_agent_access_insert on cadence_agent_access
  for insert with check (owner_id = auth.uid());

drop policy if exists cadence_agent_access_update on cadence_agent_access;
create policy cadence_agent_access_update on cadence_agent_access
  for update using (owner_id = auth.uid()) with check (owner_id = auth.uid());

drop policy if exists cadence_agent_access_delete on cadence_agent_access;
create policy cadence_agent_access_delete on cadence_agent_access
  for delete using (owner_id = auth.uid());

create or replace function cadence_can_access(row_owner uuid, require_write boolean default false)
returns boolean
language sql
stable
security definer
set search_path = public
as $fn$
  select auth.uid() is not null
    and (
      row_owner = auth.uid()
      or exists (
        select 1
        from public.cadence_agent_access a
        where a.owner_id = row_owner
          and a.agent_user_id = auth.uid()
          and a.revoked_at is null
          and (not require_write or a.can_write)
      )
    );
$fn$;

grant execute on function cadence_can_access(uuid, boolean) to authenticated;

do $policies$
declare t text;
begin
  foreach t in array array['projects','milestones','project_updates','people',
    'talking_points','work_items','comments','decisions','notes','outbox',
    'links','activity']
  loop
    execute format('alter table %I enable row level security;', t);

    execute format('drop policy if exists %1$I_select on %1$I;', t);
    execute format('create policy %1$I_select on %1$I for select using (cadence_can_access(owner_id, false));', t);

    execute format('drop policy if exists %1$I_insert on %1$I;', t);
    execute format('create policy %1$I_insert on %1$I for insert with check (cadence_can_access(owner_id, true));', t);

    execute format('drop policy if exists %1$I_update on %1$I;', t);
    execute format('create policy %1$I_update on %1$I for update using (cadence_can_access(owner_id, true)) with check (cadence_can_access(owner_id, true));', t);

    execute format('drop policy if exists %1$I_delete on %1$I;', t);
    execute format('create policy %1$I_delete on %1$I for delete using (cadence_can_access(owner_id, true));', t);
  end loop;
end $policies$;
