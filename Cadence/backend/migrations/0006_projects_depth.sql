-- ── 0006_projects_depth.sql ────────────────────────────────────────────────
-- Large-project management + strategy linkage. Safe + idempotent.
-- Run in: https://supabase.com/dashboard/project/uimjzehrykeebocphdna/sql/new

-- ── Strategy linkage on projects (a Project IS an initiative) ───────────────
alter table projects add column if not exists pillar_id text not null default '';
alter table projects add column if not exists kpi_ids   jsonb not null default '[]'::jsonb;

-- ── Phases / workstreams ────────────────────────────────────────────────────
create table if not exists project_phases (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid not null references auth.users(id) on delete cascade default auth.uid(),
  project_id uuid not null references projects(id) on delete cascade,
  name       text not null,
  start_date date,
  end_date   date,
  sort       int  not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
alter table milestones add column if not exists phase_id uuid references project_phases(id) on delete set null;
alter table work_items add column if not exists phase_id uuid references project_phases(id) on delete set null;

-- ── RAID (Risks, Assumptions, Issues, Dependencies) ─────────────────────────
create table if not exists raid_items (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid not null references auth.users(id) on delete cascade default auth.uid(),
  project_id uuid not null references projects(id) on delete cascade,
  kind       text not null default 'risk',     -- risk | assumption | issue | dependency
  text       text not null,
  owner      text not null default '',
  severity   text not null default 'medium',   -- high | medium | low
  status     text not null default 'open',      -- open | closed
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

-- ── Stakeholders / RACI ─────────────────────────────────────────────────────
create table if not exists stakeholders (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid not null references auth.users(id) on delete cascade default auth.uid(),
  project_id uuid not null references projects(id) on delete cascade,
  person_id  uuid references people(id) on delete set null,
  name       text not null default '',
  raci       text not null default 'I',         -- R | A | C | I
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

-- ── updated_at triggers, RLS, and realtime for the new tables ───────────────
do $$
declare t text;
begin
  foreach t in array array['project_phases','raid_items','stakeholders'] loop
    execute format('drop trigger if exists trg_%1$s_updated on %1$s;', t);
    execute format('create trigger trg_%1$s_updated before update on %1$s for each row execute function set_updated_at();', t);

    execute format('alter table %I enable row level security;', t);
    execute format('drop policy if exists %1$s_select on %1$s;', t);
    execute format('create policy %1$s_select on %1$s for select using (owner_id = auth.uid());', t);
    execute format('drop policy if exists %1$s_insert on %1$s;', t);
    execute format('create policy %1$s_insert on %1$s for insert with check (owner_id = auth.uid());', t);
    execute format('drop policy if exists %1$s_update on %1$s;', t);
    execute format('create policy %1$s_update on %1$s for update using (owner_id = auth.uid()) with check (owner_id = auth.uid());', t);
    execute format('drop policy if exists %1$s_delete on %1$s;', t);
    execute format('create policy %1$s_delete on %1$s for delete using (owner_id = auth.uid());', t);

    execute format('alter table %I replica identity full;', t);
    if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename=t) then
      execute format('alter publication supabase_realtime add table %I;', t);
    end if;
  end loop;
  raise notice 'Projects depth schema ready.';
end $$;
