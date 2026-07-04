-- Cadence Fitness — merged into the Cadence Work Supabase project
--
-- This ports CadenceFitness/backend/migrations/0001-0004 verbatim into a
-- dedicated `fitness` Postgres schema in the SAME project as Cadence Work,
-- for the same reason as 0022_financial_schema.sql: one Supabase project
-- instead of three, with schemas (not table renames) keeping every domain's
-- tables collision-free. Same data model, same RLS rule (owner_id =
-- auth.uid(), single-user, no workspace_id).
--
-- Run this ONCE in the Supabase SQL Editor of your Cadence Work project,
-- after 0022_financial_schema.sql. Idempotent; safe to re-run. After
-- running, go to Database -> API Settings -> "Exposed schemas" and add
-- `fitness` alongside `financial`.

create schema if not exists fitness;

grant usage on schema fitness to authenticated, anon;
alter default privileges in schema fitness grant all on tables to authenticated, anon;
alter default privileges in schema fitness grant all on sequences to authenticated, anon;

set search_path to fitness, public;

-- ═══════════════════════════════════════════════════════════════════════
-- 0001_init.sql — core schema
-- ═══════════════════════════════════════════════════════════════════════

do $$ begin
  create type muscle_group as enum (
    'chest','back','shoulders','biceps','triceps','quads','hamstrings',
    'glutes','calves','core','forearms','full_body','other'
  );
exception when duplicate_object then null; end $$;
do $$ begin
  create type program_status as enum ('draft','active','completed','archived');
exception when duplicate_object then null; end $$;
do $$ begin
  create type workout_status as enum ('in_progress','completed','skipped');
exception when duplicate_object then null; end $$;
do $$ begin
  create type cardio_kind as enum (
    'run','bike','row','swim','walk','hike','stairs','elliptical','hiit','other'
  );
exception when duplicate_object then null; end $$;
do $$ begin
  create type metric_source as enum ('manual','whoop','renpho','health','agent');
exception when duplicate_object then null; end $$;
do $$ begin
  create type meal_type as enum ('breakfast','lunch','dinner','snack','shake');
exception when duplicate_object then null; end $$;
do $$ begin
  create type nutrition_phase as enum ('cut','maintain','bulk');
exception when duplicate_object then null; end $$;

create or replace function set_updated_at() returns trigger as $$
begin new.updated_at = now(); return new; end;
$$ language plpgsql;

create table if not exists exercises (
  id                uuid primary key default gen_random_uuid(),
  owner_id          uuid not null references auth.users(id) on delete cascade default auth.uid(),
  name              text not null,
  muscle_group      muscle_group not null default 'other',
  secondary_muscles text not null default '',
  equipment         text not null default '',
  notes             text not null default '',
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  deleted_at        timestamptz
);

create table if not exists programs (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references auth.users(id) on delete cascade default auth.uid(),
  name        text not null,
  description text not null default '',
  weeks       int not null default 4,
  status      program_status not null default 'draft',
  start_date  date,
  notes       text not null default '',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz
);

create table if not exists program_days (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid not null references auth.users(id) on delete cascade default auth.uid(),
  program_id uuid not null references programs(id) on delete cascade,
  day_order  int not null default 1,
  name       text not null,
  focus      text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists program_exercises (
  id             uuid primary key default gen_random_uuid(),
  owner_id       uuid not null references auth.users(id) on delete cascade default auth.uid(),
  program_day_id uuid not null references program_days(id) on delete cascade,
  exercise_id    uuid not null references exercises(id) on delete cascade,
  ex_order       int not null default 1,
  target_sets    int not null default 3,
  rep_min        int not null default 8,
  rep_max        int not null default 12,
  target_rpe     numeric(3,1),
  rest_seconds   int not null default 120,
  notes          text not null default '',
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  deleted_at     timestamptz
);

create table if not exists workouts (
  id             uuid primary key default gen_random_uuid(),
  owner_id       uuid not null references auth.users(id) on delete cascade default auth.uid(),
  date           date not null default current_date,
  program_id     uuid references programs(id) on delete set null,
  program_day_id uuid references program_days(id) on delete set null,
  week_number    int,
  name           text not null default '',
  status         workout_status not null default 'in_progress',
  started_at     timestamptz,
  completed_at   timestamptz,
  notes          text not null default '',
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  deleted_at     timestamptz
);

create table if not exists workout_sets (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references auth.users(id) on delete cascade default auth.uid(),
  workout_id  uuid not null references workouts(id) on delete cascade,
  exercise_id uuid not null references exercises(id) on delete cascade,
  set_number  int not null default 1,
  weight_kg   numeric(6,2) not null default 0,
  reps        int not null default 0,
  rpe         numeric(3,1),
  is_warmup   boolean not null default false,
  done        boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz
);

create table if not exists cardio_sessions (
  id           uuid primary key default gen_random_uuid(),
  owner_id     uuid not null references auth.users(id) on delete cascade default auth.uid(),
  date         date not null default current_date,
  kind         cardio_kind not null default 'run',
  duration_min numeric(6,1) not null default 0,
  distance_km  numeric(6,2) not null default 0,
  avg_hr       int not null default 0,
  calories     int not null default 0,
  notes        text not null default '',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  deleted_at   timestamptz
);

create table if not exists sauna_sessions (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid not null references auth.users(id) on delete cascade default auth.uid(),
  date          date not null default current_date,
  duration_min  numeric(5,1) not null default 0,
  temperature_c numeric(4,0) not null default 0,
  rounds        int not null default 1,
  notes         text not null default '',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz
);

create table if not exists body_metrics (
  id             uuid primary key default gen_random_uuid(),
  owner_id       uuid not null references auth.users(id) on delete cascade default auth.uid(),
  date           date not null default current_date,
  weight_kg      numeric(5,2) not null default 0,
  body_fat_pct   numeric(4,1),
  muscle_mass_kg numeric(5,2),
  source         metric_source not null default 'manual',
  notes          text not null default '',
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  deleted_at     timestamptz,
  unique (owner_id, date)
);

create table if not exists recovery_metrics (
  id                    uuid primary key default gen_random_uuid(),
  owner_id              uuid not null references auth.users(id) on delete cascade default auth.uid(),
  date                  date not null default current_date,
  recovery_pct          int,
  strain                numeric(4,1),
  resting_hr            int,
  hrv_ms                int,
  sleep_hours           numeric(4,2),
  sleep_performance_pct int,
  active_energy_kcal    int,
  steps                 int,
  source                metric_source not null default 'manual',
  notes                 text not null default '',
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  deleted_at            timestamptz,
  unique (owner_id, date)
);

create table if not exists nutrition_logs (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid not null references auth.users(id) on delete cascade default auth.uid(),
  date       date not null default current_date,
  meal       meal_type not null default 'snack',
  name       text not null,
  calories   int not null default 0,
  protein_g  numeric(6,1) not null default 0,
  carbs_g    numeric(6,1) not null default 0,
  fat_g      numeric(6,1) not null default 0,
  notes      text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists saved_meals (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid not null references auth.users(id) on delete cascade default auth.uid(),
  name       text not null,
  meal       meal_type not null default 'snack',
  calories   int not null default 0,
  protein_g  numeric(6,1) not null default 0,
  carbs_g    numeric(6,1) not null default 0,
  fat_g      numeric(6,1) not null default 0,
  notes      text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists nutrition_targets (
  id             uuid primary key default gen_random_uuid(),
  owner_id       uuid not null references auth.users(id) on delete cascade default auth.uid(),
  effective_from date not null default current_date,
  phase          nutrition_phase not null default 'maintain',
  calories       int not null default 0,
  protein_g      numeric(6,1) not null default 0,
  carbs_g        numeric(6,1) not null default 0,
  fat_g          numeric(6,1) not null default 0,
  notes          text not null default '',
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  deleted_at     timestamptz
);

do $$
declare t text;
begin
  foreach t in array array['exercises','programs','program_days','program_exercises',
    'workouts','workout_sets','cardio_sessions','sauna_sessions','body_metrics',
    'recovery_metrics','nutrition_logs','saved_meals','nutrition_targets']
  loop
    execute format('drop trigger if exists trg_%1$s_updated on %1$s;', t);
    execute format('create trigger trg_%1$s_updated before update on %1$s
                    for each row execute function set_updated_at();', t);
  end loop;
end $$;

do $$
declare t text;
begin
  foreach t in array array['exercises','programs','program_days','program_exercises',
    'workouts','workout_sets','cardio_sessions','sauna_sessions','body_metrics',
    'recovery_metrics','nutrition_logs','saved_meals','nutrition_targets']
  loop
    execute format('alter table %s enable row level security;', t);

    execute format('drop policy if exists %1$s_select on %1$s;', t);
    execute format('create policy %1$s_select on %1$s
                    for select using (owner_id = auth.uid());', t);

    execute format('drop policy if exists %1$s_insert on %1$s;', t);
    execute format('create policy %1$s_insert on %1$s
                    for insert with check (owner_id = auth.uid());', t);

    execute format('drop policy if exists %1$s_update on %1$s;', t);
    execute format('create policy %1$s_update on %1$s
                    for update using (owner_id = auth.uid())
                    with check (owner_id = auth.uid());', t);

    execute format('drop policy if exists %1$s_delete on %1$s;', t);
    execute format('create policy %1$s_delete on %1$s
                    for delete using (owner_id = auth.uid());', t);
  end loop;
end $$;

create index if not exists idx_exercises_owner       on exercises(owner_id) where deleted_at is null;
create index if not exists idx_programs_status       on programs(owner_id, status) where deleted_at is null;
create index if not exists idx_program_days_program  on program_days(program_id);
create index if not exists idx_program_ex_day        on program_exercises(program_day_id);
create index if not exists idx_workouts_date         on workouts(owner_id, date desc) where deleted_at is null;
create index if not exists idx_workout_sets_workout  on workout_sets(workout_id);
create index if not exists idx_workout_sets_exercise on workout_sets(owner_id, exercise_id) where deleted_at is null;
create index if not exists idx_cardio_date           on cardio_sessions(owner_id, date desc) where deleted_at is null;
create index if not exists idx_sauna_date            on sauna_sessions(owner_id, date desc) where deleted_at is null;
create index if not exists idx_body_date             on body_metrics(owner_id, date desc) where deleted_at is null;
create index if not exists idx_recovery_date         on recovery_metrics(owner_id, date desc) where deleted_at is null;
create index if not exists idx_nutrition_date        on nutrition_logs(owner_id, date desc) where deleted_at is null;
create index if not exists idx_targets_from          on nutrition_targets(owner_id, effective_from desc) where deleted_at is null;

-- ═══════════════════════════════════════════════════════════════════════
-- 0002_agent_messages.sql
-- ═══════════════════════════════════════════════════════════════════════

do $$ begin
  create type message_sender_type as enum ('user','agent','system');
exception when duplicate_object then null; end $$;
do $$ begin
  create type message_status as enum ('unread','processed');
exception when duplicate_object then null; end $$;

create table if not exists agent_messages (
  id                uuid primary key default gen_random_uuid(),
  owner_id          uuid not null references auth.users(id) on delete cascade default auth.uid(),
  sender_type       message_sender_type not null default 'user',
  sender_label      text not null default 'Rodney',
  body              text not null,
  status            message_status not null default 'unread',
  linked_workout_id uuid references workouts(id) on delete set null,
  linked_date       date,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  deleted_at        timestamptz
);

drop trigger if exists trg_agent_messages_updated on agent_messages;
create trigger trg_agent_messages_updated before update on agent_messages
  for each row execute function set_updated_at();

alter table agent_messages enable row level security;

drop policy if exists agent_messages_select on agent_messages;
create policy agent_messages_select on agent_messages
  for select using (owner_id = auth.uid());

drop policy if exists agent_messages_insert on agent_messages;
create policy agent_messages_insert on agent_messages
  for insert with check (owner_id = auth.uid());

drop policy if exists agent_messages_update on agent_messages;
create policy agent_messages_update on agent_messages
  for update using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

drop policy if exists agent_messages_delete on agent_messages;
create policy agent_messages_delete on agent_messages
  for delete using (owner_id = auth.uid());

create index if not exists idx_agent_messages_owner on agent_messages(owner_id, created_at desc) where deleted_at is null;

-- ═══════════════════════════════════════════════════════════════════════
-- 0003_agent_access.sql
-- ═══════════════════════════════════════════════════════════════════════

create table if not exists fitness_agent_access (
  id              uuid primary key default gen_random_uuid(),
  owner_user_id   uuid not null references auth.users(id) on delete cascade,
  agent_user_id   uuid not null references auth.users(id) on delete cascade,
  can_read        boolean not null default true,
  can_write       boolean not null default false,
  reason          text not null default '',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  revoked_at      timestamptz null,
  check (owner_user_id <> agent_user_id),
  check (can_read or can_write)
);

create unique index if not exists fitness_agent_access_one_active_grant
  on fitness_agent_access(owner_user_id, agent_user_id)
  where revoked_at is null;

create index if not exists fitness_agent_access_agent_idx
  on fitness_agent_access(agent_user_id)
  where revoked_at is null;

drop trigger if exists trg_fitness_agent_access_updated on fitness_agent_access;
create trigger trg_fitness_agent_access_updated
  before update on fitness_agent_access
  for each row execute function set_updated_at();

alter table fitness_agent_access enable row level security;

drop policy if exists fitness_agent_access_select on fitness_agent_access;
create policy fitness_agent_access_select on fitness_agent_access
  for select using (
    owner_user_id = auth.uid()
    or agent_user_id = auth.uid()
  );

drop policy if exists fitness_agent_access_insert on fitness_agent_access;
create policy fitness_agent_access_insert on fitness_agent_access
  for insert with check (owner_user_id = auth.uid());

drop policy if exists fitness_agent_access_update on fitness_agent_access;
create policy fitness_agent_access_update on fitness_agent_access
  for update using (owner_user_id = auth.uid())
  with check (owner_user_id = auth.uid());

drop policy if exists fitness_agent_access_delete on fitness_agent_access;
create policy fitness_agent_access_delete on fitness_agent_access
  for delete using (owner_user_id = auth.uid());

create or replace function fitness_can_access_owner(
  target_owner_id uuid,
  required_access text default 'read'
)
returns boolean
language sql
stable
security definer
set search_path = fitness, public, auth
as $$
  select exists (
    select 1
    from fitness_agent_access a
    where a.owner_user_id = target_owner_id
      and a.agent_user_id = auth.uid()
      and a.revoked_at is null
      and case
        when required_access = 'write' then a.can_write
        else a.can_read or a.can_write
      end
  );
$$;

revoke all on function fitness_can_access_owner(uuid, text) from public;
grant execute on function fitness_can_access_owner(uuid, text) to authenticated;

do $$
declare
  t text;
begin
  foreach t in array array[
    'exercises','programs','program_days','program_exercises','workouts',
    'workout_sets','cardio_sessions','sauna_sessions','body_metrics',
    'recovery_metrics','nutrition_logs','saved_meals','nutrition_targets',
    'agent_messages'
  ] loop
    execute format('drop policy if exists %I on fitness.%I', t || '_select', t);
    execute format(
      'create policy %I on fitness.%I for select using (
         owner_id = auth.uid()
         or fitness.fitness_can_access_owner(owner_id, ''read'')
       )',
      t || '_select', t
    );

    execute format('drop policy if exists %I on fitness.%I', t || '_insert', t);
    execute format(
      'create policy %I on fitness.%I for insert with check (
         owner_id = auth.uid()
         or fitness.fitness_can_access_owner(owner_id, ''write'')
       )',
      t || '_insert', t
    );

    execute format('drop policy if exists %I on fitness.%I', t || '_update', t);
    execute format(
      'create policy %I on fitness.%I for update using (
         owner_id = auth.uid()
         or fitness.fitness_can_access_owner(owner_id, ''write'')
       ) with check (
         owner_id = auth.uid()
         or fitness.fitness_can_access_owner(owner_id, ''write'')
       )',
      t || '_update', t
    );

    execute format('drop policy if exists %I on fitness.%I', t || '_delete', t);
    execute format(
      'create policy %I on fitness.%I for delete using (
         owner_id = auth.uid()
         or fitness.fitness_can_access_owner(owner_id, ''write'')
       )',
      t || '_delete', t
    );
  end loop;
end $$;

-- ═══════════════════════════════════════════════════════════════════════
-- 0004_health_sync.sql — active_energy_kcal/steps + 'health' source are
-- already included in the table/enum definitions above for a fresh install.
-- ═══════════════════════════════════════════════════════════════════════

-- ── realtime ─────────────────────────────────────────────────────────────
do $$
declare t text;
begin
  foreach t in array array['exercises','programs','program_days','program_exercises',
    'workouts','workout_sets','cardio_sessions','sauna_sessions','body_metrics',
    'recovery_metrics','nutrition_logs','saved_meals','nutrition_targets',
    'agent_messages']
  loop
    begin
      execute format('alter publication supabase_realtime add table fitness.%I;', t);
    exception when duplicate_object then null;
    end;
  end loop;
end $$;

reset search_path;
