-- 0027_financial_budget_v2.sql
-- Cadence Financial — budget upgrades: multi-currency, a per-month model over
-- the Australian financial year, and owner-extensible categories.
--
-- 1. budget_lines gains a currency, an optional month window (start/end), and a
--    one_off frequency so month-specific items (a bonus, a quarterly bill) can
--    land in the right month.
-- 2. budget_categories: owner-added categories that extend the built-in
--    dropdown lists — better classification for future reporting.
-- 3. budget_fx_rates: the owner's currency→AUD conversion rates (AUD is the
--    base, implicitly 1). Rodney is paid in EUR but saves/rents in AUD, so the
--    monthly free-cash maths must convert everything to one base currency.

set search_path to financial, public;

-- ── 1. budget_lines: currency + month window + one_off ──────────────────────
alter table budget_lines add column if not exists currency    text not null default 'AUD';
alter table budget_lines add column if not exists start_month  text; -- 'YYYY-MM' inclusive; null = no start bound
alter table budget_lines add column if not exists end_month    text; -- 'YYYY-MM' inclusive; null = no end bound

alter table budget_lines drop constraint if exists budget_lines_frequency_check;
alter table budget_lines add constraint budget_lines_frequency_check
  check (frequency in ('weekly', 'fortnightly', 'monthly', 'quarterly', 'annual', 'one_off'));

-- ── 2. budget_categories (extensible dropdowns) ─────────────────────────────
create table if not exists budget_categories (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references auth.users(id) on delete cascade default auth.uid(),
  kind        text not null check (kind in ('income', 'expense')),
  key         text not null,   -- slug stored on budget_lines.category
  label       text not null,
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz,
  unique (owner_id, kind, key)
);

-- ── 3. budget_fx_rates (currency → AUD; AUD base implicit = 1) ───────────────
create table if not exists budget_fx_rates (
  id           uuid primary key default gen_random_uuid(),
  owner_id     uuid not null references auth.users(id) on delete cascade default auth.uid(),
  currency     text not null,               -- 'EUR', 'USD', 'GBP', ...
  rate_to_aud  numeric(14,6) not null default 1,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  deleted_at   timestamptz,
  unique (owner_id, currency)
);

-- updated_at triggers (set_updated_at from 0022)
do $$
declare t text;
begin
  foreach t in array array['budget_categories', 'budget_fx_rates']
  loop
    execute format('drop trigger if exists trg_%1$s_updated on %1$s;', t);
    execute format('create trigger trg_%1$s_updated before update on %1$s
                    for each row execute function set_updated_at();', t);
  end loop;
end $$;

-- RLS: owner + granted agent (mirrors every other financial table, 0024)
do $$
declare t text;
begin
  foreach t in array array['budget_categories', 'budget_fx_rates']
  loop
    execute format('alter table %s enable row level security;', t);

    execute format('drop policy if exists %1$s_select on %1$s;', t);
    execute format('create policy %1$s_select on %1$s for select using (
                      owner_id = auth.uid() or financial.financial_can_access_owner(owner_id, ''read'')
                    );', t);

    execute format('drop policy if exists %1$s_insert on %1$s;', t);
    execute format('create policy %1$s_insert on %1$s for insert with check (
                      owner_id = auth.uid() or financial.financial_can_access_owner(owner_id, ''write'')
                    );', t);

    execute format('drop policy if exists %1$s_update on %1$s;', t);
    execute format('create policy %1$s_update on %1$s for update using (
                      owner_id = auth.uid() or financial.financial_can_access_owner(owner_id, ''write'')
                    ) with check (
                      owner_id = auth.uid() or financial.financial_can_access_owner(owner_id, ''write'')
                    );', t);

    execute format('drop policy if exists %1$s_delete on %1$s;', t);
    execute format('create policy %1$s_delete on %1$s for delete using (
                      owner_id = auth.uid() or financial.financial_can_access_owner(owner_id, ''write'')
                    );', t);

    execute format('grant all on table %s to authenticated, anon;', t);
    execute format('grant all on table %s to service_role;', t);
  end loop;
end $$;

create index if not exists idx_budget_categories_owner on budget_categories(owner_id) where deleted_at is null;
create index if not exists idx_budget_fx_rates_owner   on budget_fx_rates(owner_id) where deleted_at is null;

reset search_path;
