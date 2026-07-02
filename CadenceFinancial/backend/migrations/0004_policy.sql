-- Cadence Financial — policy tables
--
-- Promotes the workbook's two policy blocks from hardcoded values to
-- owner-editable data:
--   allocation_policies -- Balance Sheet target min/base/max bands per asset class
--   risk_policies       -- Risk Dashboard green/amber thresholds per metric
--
-- The app falls back to generic built-in defaults when these tables are
-- empty, so this migration is safe to run before any policy rows exist.

do $$ begin
  create type asset_class as enum ('property','cash','shares','btc','super','collectibles');
exception when duplicate_object then null; end $$;
do $$ begin
  create type risk_direction as enum ('lower_better','higher_better');
exception when duplicate_object then null; end $$;

create table if not exists allocation_policies (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references auth.users(id) on delete cascade default auth.uid(),
  asset_class asset_class not null,
  target_min  numeric(6,4) not null default 0,
  target_base numeric(6,4) not null default 0,
  target_max  numeric(6,4) not null default 1,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz,
  unique (owner_id, asset_class)
);

create table if not exists risk_policies (
  id              uuid primary key default gen_random_uuid(),
  owner_id        uuid not null references auth.users(id) on delete cascade default auth.uid(),
  metric_key      text not null,
  green_threshold numeric(10,4) not null,
  amber_threshold numeric(10,4) not null,
  direction       risk_direction not null default 'lower_better',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  deleted_at      timestamptz,
  unique (owner_id, metric_key)
);

do $$
declare t text;
begin
  foreach t in array array['allocation_policies','risk_policies']
  loop
    execute format('drop trigger if exists trg_%1$s_updated on %1$s;', t);
    execute format('create trigger trg_%1$s_updated before update on %1$s
                    for each row execute function set_updated_at();', t);

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
