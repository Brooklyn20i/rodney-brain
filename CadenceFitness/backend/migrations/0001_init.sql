-- Cadence Fitness — initial schema
-- Single-user app (no multi-tenant workspace layer, like Cadence Financial).
-- Every row belongs to owner_id and Row-Level Security guarantees a logged-in
-- user can only ever read/write their own rows. Safe to re-run: guarded with
-- IF NOT EXISTS.
--
-- Conventions on every table:
--   id          uuid primary key
--   owner_id    uuid -> auth.users(id), defaults to the logged-in user
--   created_at  timestamptz, server-set
--   updated_at  timestamptz, server-maintained by trigger
--   deleted_at  timestamptz, soft delete (null = live)
--
-- Derived figures (e1RM, PRs, weekly volume, weight trend, calorie adherence,
-- cycle week) are intentionally NOT columns here -- the client computes them
-- from these raw rows (see web/src/lib/fitnessCalc.ts) so they can never
-- drift from their inputs.

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
  create type metric_source as enum ('manual','whoop','renpho','agent');
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

-- ── exercises (library) ──────────────────────────────────────────────────
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

-- ── programs (training cycles) ───────────────────────────────────────────
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

-- ── program_days ─────────────────────────────────────────────────────────
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

-- ── program_exercises (slots with targets) ───────────────────────────────
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

-- ── workouts (logged sessions) ───────────────────────────────────────────
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

-- ── workout_sets ─────────────────────────────────────────────────────────
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

-- ── cardio_sessions ──────────────────────────────────────────────────────
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

-- ── sauna_sessions ───────────────────────────────────────────────────────
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

-- ── body_metrics (Renpho / manual scale data, one row per day) ───────────
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

-- ── recovery_metrics (Whoop / manual, one row per day) ───────────────────
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
  source                metric_source not null default 'manual',
  notes                 text not null default '',
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  deleted_at            timestamptz,
  unique (owner_id, date)
);

-- ── nutrition_logs ───────────────────────────────────────────────────────
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

-- ── saved_meals (favourites for one-tap logging) ─────────────────────────
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

-- ── nutrition_targets (phased calorie/macro targets) ─────────────────────
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

-- ── updated_at triggers ──────────────────────────────────────────────────
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

-- ── Row-Level Security ───────────────────────────────────────────────────
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

-- ── realtime ─────────────────────────────────────────────────────────────
-- The web app subscribes to postgres_changes on every table so Kobe's writes
-- (via the agent grant) appear live.
do $$
declare t text;
begin
  foreach t in array array['exercises','programs','program_days','program_exercises',
    'workouts','workout_sets','cardio_sessions','sauna_sessions','body_metrics',
    'recovery_metrics','nutrition_logs','saved_meals','nutrition_targets']
  loop
    begin
      execute format('alter publication supabase_realtime add table %s;', t);
    exception when duplicate_object then null;
    end;
  end loop;
end $$;

-- ── indexes ──────────────────────────────────────────────────────────────
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
