-- Cadence — initial schema (Phase 0)
-- One canonical data model, normalised from cadence_core.py into real tables.
-- Target: Supabase (Postgres). Safe to re-run: guarded with IF NOT EXISTS.
--
-- Conventions on every table:
--   id          uuid primary key
--   owner_id    uuid  -> auth.users(id), defaults to the logged-in user
--   created_at  timestamptz, server-set
--   updated_at  timestamptz, server-maintained by trigger
--   deleted_at  timestamptz, soft delete (null = live)
-- Row-Level Security (policies.sql) restricts every row to its owner.

-- ── Enumerated types (the controlled vocabularies) ─────────────────────────
do $$ begin
  create type item_type      as enum ('task','decision','followUp','waitingFor','risk','action');
exception when duplicate_object then null; end $$;
do $$ begin
  create type priority_level as enum ('high','medium','low');
exception when duplicate_object then null; end $$;
do $$ begin
  create type project_status as enum ('active','onHold','completed');
exception when duplicate_object then null; end $$;
do $$ begin
  create type decision_status as enum ('pending','decided','deferred');
exception when duplicate_object then null; end $$;
do $$ begin
  create type health_status  as enum ('green','amber','red');
exception when duplicate_object then null; end $$;
do $$ begin
  create type email_status   as enum ('draft','queued','sent','cancelled');
exception when duplicate_object then null; end $$;
do $$ begin
  create type link_parent    as enum ('project','work_item');
exception when duplicate_object then null; end $$;

-- ── updated_at trigger ─────────────────────────────────────────────────────
create or replace function set_updated_at() returns trigger as $$
begin new.updated_at = now(); return new; end;
$$ language plpgsql;

-- ── projects ───────────────────────────────────────────────────────────────
create table if not exists projects (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references auth.users(id) on delete cascade default auth.uid(),
  name        text not null,
  goal        text not null default '',
  status      project_status not null default 'active',
  health      health_status  not null default 'green',
  owner       text not null default '',
  target_date date,
  next_action text not null default '',
  color       text not null default '#1B5E9E',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz
);

create table if not exists milestones (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid not null references auth.users(id) on delete cascade default auth.uid(),
  project_id uuid not null references projects(id) on delete cascade,
  title      text not null,
  due_date   date,
  done       boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists project_updates (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid not null references auth.users(id) on delete cascade default auth.uid(),
  project_id uuid not null references projects(id) on delete cascade,
  text       text not null,
  health     health_status,
  author     text not null default 'you',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

-- ── people ───────────────────────────────────────────────────────────────--
create table if not exists people (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid not null references auth.users(id) on delete cascade default auth.uid(),
  name       text not null,
  role       text not null default '',
  email      text not null default '',
  notes      text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists talking_points (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid not null references auth.users(id) on delete cascade default auth.uid(),
  person_id  uuid not null references people(id) on delete cascade,
  text       text not null,
  done       boolean not null default false,
  author     text not null default 'you',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

-- ── work_items ─────────────────────────────────────────────────────────────
create table if not exists work_items (
  id           uuid primary key default gen_random_uuid(),
  owner_id     uuid not null references auth.users(id) on delete cascade default auth.uid(),
  title        text not null,
  type         item_type not null default 'task',
  priority     priority_level not null default 'medium',
  due_date     date,
  project_id   uuid references projects(id) on delete set null,
  person_id    uuid references people(id)   on delete set null,
  notes        text not null default '',
  done         boolean not null default false,
  inboxed      boolean not null default true,
  source       text not null default 'you',
  completed_at timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  deleted_at   timestamptz
);

create table if not exists comments (
  id           uuid primary key default gen_random_uuid(),
  owner_id     uuid not null references auth.users(id) on delete cascade default auth.uid(),
  work_item_id uuid not null references work_items(id) on delete cascade,
  text         text not null,
  author       text not null default 'you',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  deleted_at   timestamptz
);

-- ── decisions ──────────────────────────────────────────────────────────────
create table if not exists decisions (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid not null references auth.users(id) on delete cascade default auth.uid(),
  title      text not null,
  status     decision_status not null default 'pending',
  due_date   date,
  context    text not null default '',
  outcome    text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

-- ── notes (outliner) ─────────────────────────────────────────────────────--
create table if not exists notes (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid not null references auth.users(id) on delete cascade default auth.uid(),
  title      text not null default '',
  body       text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

-- ── outbox (email staged for the agent to send) ────────────────────────────
create table if not exists outbox (
  id                  uuid primary key default gen_random_uuid(),
  owner_id            uuid not null references auth.users(id) on delete cascade default auth.uid(),
  "to"               text not null,
  cc                  text not null default '',
  subject             text not null default '',
  body                text not null default '',
  status              email_status not null default 'queued',
  related_project_id  uuid references projects(id) on delete set null,
  related_work_item_id uuid references work_items(id) on delete set null,
  created_by          text not null default 'you',
  sent_at             timestamptz,
  sent_via            text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  deleted_at          timestamptz
);

-- ── links (Drive files / URLs attached to a project or work item) ───────────
create table if not exists links (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references auth.users(id) on delete cascade default auth.uid(),
  parent_type link_parent not null,
  parent_id   uuid not null,
  url         text not null,
  title       text not null default '',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz
);

-- ── activity (audit trail) ─────────────────────────────────────────────────
create table if not exists activity (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid not null references auth.users(id) on delete cascade default auth.uid(),
  actor      text not null,
  action     text not null,
  detail     text not null default '',
  created_at timestamptz not null default now()
);

-- ── updated_at triggers ────────────────────────────────────────────────────
do $$
declare t text;
begin
  foreach t in array array['projects','milestones','project_updates','people',
    'talking_points','work_items','comments','decisions','notes','outbox','links']
  loop
    execute format('drop trigger if exists trg_%1$s_updated on %1$s;', t);
    execute format('create trigger trg_%1$s_updated before update on %1$s
                    for each row execute function set_updated_at();', t);
  end loop;
end $$;

-- ── indexes (owner + common filters) ───────────────────────────────────────
create index if not exists idx_work_items_owner   on work_items(owner_id) where deleted_at is null;
create index if not exists idx_work_items_project  on work_items(project_id);
create index if not exists idx_work_items_person   on work_items(person_id);
create index if not exists idx_milestones_project  on milestones(project_id);
create index if not exists idx_updates_project     on project_updates(project_id);
create index if not exists idx_comments_item       on comments(work_item_id);
create index if not exists idx_talking_person      on talking_points(person_id);
create index if not exists idx_links_parent        on links(parent_type, parent_id);
create index if not exists idx_activity_owner      on activity(owner_id, created_at desc);
