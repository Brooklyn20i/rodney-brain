-- Cadence Life — the fourth domain: personal admin as its own system.
--
-- Work manages work; Financial and Health are systems of record. Life is the
-- obligations register for everything personal — tax dates, bills, renewals
-- (rego, insurance, passport), travel and one-off admin — kept in its own
-- `life` Postgres schema so personal items can never appear in a work view.
-- Same pattern as 0022 (financial) / 0023 (fitness): one Supabase project,
-- schema-per-domain, owner-only RLS.
--
-- Run ONCE in the Supabase SQL Editor, after 0048. Idempotent; safe to
-- re-run. Afterwards add `life` to Database -> API Settings -> "Exposed
-- schemas" alongside `financial` and `fitness`.

create schema if not exists life;

grant usage on schema life to authenticated, anon;
alter default privileges in schema life grant all on tables to authenticated, anon;
alter default privileges in schema life grant all on sequences to authenticated, anon;

set search_path to life, public;

create or replace function life.set_updated_at() returns trigger as $$
begin new.updated_at = now(); return new; end;
$$ language plpgsql;

-- One-off personal admin: captured, triaged into a category + due date, done.
-- Items ticked off an obligation cycle also land here (obligation_id set), so
-- the obligations register keeps a clean history without generated rows.
create table if not exists life_items (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid not null references auth.users(id) on delete cascade default auth.uid(),
  title         text not null,
  notes         text not null default '',
  status        text not null default 'inbox',   -- 'inbox' | 'open' | 'waiting' | 'done'
  category      text not null default 'admin',   -- 'tax' | 'bills' | 'travel' | 'home' | 'vehicles' | 'health' | 'family' | 'admin'
  due_date      date,
  obligation_id uuid,                            -- set when this row logs one cycle of an obligation
  completed_at  timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz
);

-- Recurring obligations and renewals: things that come back (BAS, rego,
-- insurance, passport). The register stores the NEXT due date and the cycle;
-- ticking one off rolls next_due forward and logs a history life_item.
create table if not exists obligations (
  id             uuid primary key default gen_random_uuid(),
  owner_id       uuid not null references auth.users(id) on delete cascade default auth.uid(),
  name           text not null,
  category       text not null default 'admin',
  cadence_months int not null default 12,        -- 1 monthly, 3 quarterly, 12 annual, 120 passport…
  next_due       date not null,
  lead_days      int not null default 14,        -- surface on the dashboard this far out
  amount         numeric(12,2),                  -- typical cost, optional
  notes          text not null default '',
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  deleted_at     timestamptz
);

do $$
declare t text;
begin
  foreach t in array array['life_items','obligations']
  loop
    execute format('drop trigger if exists trg_%1$s_updated on %1$s;', t);
    execute format('create trigger trg_%1$s_updated before update on %1$s
                    for each row execute function life.set_updated_at();', t);

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

create index if not exists idx_life_items_status on life_items(owner_id, status) where deleted_at is null;
create index if not exists idx_life_items_due    on life_items(owner_id, due_date) where deleted_at is null;
create index if not exists idx_obligations_due   on obligations(owner_id, next_due) where deleted_at is null;

do $$
declare t text;
begin
  foreach t in array array['life_items','obligations']
  loop
    begin
      execute format('alter publication supabase_realtime add table life.%I;', t);
    exception when duplicate_object then null;
    end;
  end loop;
end $$;

reset search_path;
