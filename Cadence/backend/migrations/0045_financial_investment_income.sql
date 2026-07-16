-- Cadence Financial — first-class investment income/dividends
--
-- Additive/idempotent: dividends, distributions and interest are income rows,
-- not investment_transactions.side values. The existing buy/sell enum remains
-- unchanged.

set search_path to financial, public;

do $$ begin
  create type investment_income_kind as enum ('dividend','distribution','interest');
exception when duplicate_object then null; end $$;

create table if not exists investment_income (
  id              uuid primary key default gen_random_uuid(),
  owner_id        uuid not null references auth.users(id) on delete cascade default auth.uid(),
  entity_id       uuid references entities(id) on delete set null,
  holding_id      uuid references investment_holdings(id) on delete set null,
  payment_date    date not null,
  ticker          text not null,
  income_kind     investment_income_kind not null default 'dividend',
  currency        text not null default 'AUD' check (currency ~ '^[A-Z]{3}$'),
  gross_amount    numeric(14,2) not null default 0 check (gross_amount >= 0),
  withholding_tax numeric(14,2) not null default 0 check (withholding_tax >= 0),
  franking_credit numeric(14,2) not null default 0 check (franking_credit >= 0),
  net_amount      numeric(14,2) not null default 0 check (net_amount >= 0),
  amount_aud      numeric(14,2) not null default 0 check (amount_aud >= 0),
  source          text not null default '',
  external_ref    text not null default '',
  notes           text not null default '',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  deleted_at      timestamptz,
  constraint investment_income_ticker_nonblank check (btrim(ticker) <> ''),
  constraint investment_income_foreign_aud_positive check (currency = 'AUD' or amount_aud > 0),
  constraint investment_income_aud_matches_net check (currency <> 'AUD' or amount_aud = net_amount),
  check (withholding_tax <= gross_amount)
);

-- Column drift/idempotency safety if an early scratch version already created the table.
alter table investment_income add column if not exists entity_id uuid references entities(id) on delete set null;
alter table investment_income add column if not exists holding_id uuid references investment_holdings(id) on delete set null;
alter table investment_income add column if not exists payment_date date not null default current_date;
alter table investment_income add column if not exists ticker text not null default '';
alter table investment_income add column if not exists income_kind investment_income_kind not null default 'dividend';
alter table investment_income add column if not exists currency text not null default 'AUD';
alter table investment_income add column if not exists gross_amount numeric(14,2) not null default 0;
alter table investment_income add column if not exists withholding_tax numeric(14,2) not null default 0;
alter table investment_income add column if not exists franking_credit numeric(14,2) not null default 0;
alter table investment_income add column if not exists net_amount numeric(14,2) not null default 0;
alter table investment_income add column if not exists amount_aud numeric(14,2) not null default 0;
alter table investment_income add column if not exists source text not null default '';
alter table investment_income add column if not exists external_ref text not null default '';
alter table investment_income add column if not exists notes text not null default '';
alter table investment_income add column if not exists deleted_at timestamptz;

-- Add constraints idempotently for pre-existing scratch tables.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'investment_income_currency_check') then
    alter table investment_income add constraint investment_income_currency_check check (currency ~ '^[A-Z]{3}$');
  end if;
  if not exists (select 1 from pg_constraint where conname = 'investment_income_gross_nonnegative') then
    alter table investment_income add constraint investment_income_gross_nonnegative check (gross_amount >= 0);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'investment_income_withholding_nonnegative') then
    alter table investment_income add constraint investment_income_withholding_nonnegative check (withholding_tax >= 0);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'investment_income_franking_nonnegative') then
    alter table investment_income add constraint investment_income_franking_nonnegative check (franking_credit >= 0);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'investment_income_net_nonnegative') then
    alter table investment_income add constraint investment_income_net_nonnegative check (net_amount >= 0);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'investment_income_amount_aud_nonnegative') then
    alter table investment_income add constraint investment_income_amount_aud_nonnegative check (amount_aud >= 0);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'investment_income_ticker_nonblank') then
    alter table investment_income add constraint investment_income_ticker_nonblank check (btrim(ticker) <> '');
  end if;
  if not exists (select 1 from pg_constraint where conname = 'investment_income_foreign_aud_positive') then
    alter table investment_income add constraint investment_income_foreign_aud_positive check (currency = 'AUD' or amount_aud > 0);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'investment_income_aud_matches_net') then
    alter table investment_income add constraint investment_income_aud_matches_net check (currency <> 'AUD' or amount_aud = net_amount);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'investment_income_withholding_lte_gross') then
    alter table investment_income add constraint investment_income_withholding_lte_gross check (withholding_tax <= gross_amount);
  end if;
end $$;

create or replace function validate_investment_income_owner_links()
returns trigger
language plpgsql
set search_path = financial, public
as $$
begin
  if tg_op = 'UPDATE' and new.owner_id is distinct from old.owner_id then
    raise exception 'investment_income.owner_id cannot be changed' using errcode = '23514';
  end if;

  if new.entity_id is not null and not exists (
    select 1 from entities e
    where e.id = new.entity_id and e.owner_id = new.owner_id and e.deleted_at is null
  ) then
    raise exception 'investment_income.entity_id must belong to owner_id' using errcode = '23514';
  end if;

  if new.holding_id is not null and not exists (
    select 1 from investment_holdings h
    where h.id = new.holding_id and h.owner_id = new.owner_id and h.deleted_at is null
  ) then
    raise exception 'investment_income.holding_id must belong to owner_id' using errcode = '23514';
  end if;

  if new.entity_id is not null and new.holding_id is not null and exists (
    select 1 from investment_holdings h
    where h.id = new.holding_id and h.entity_id is not null and h.entity_id <> new.entity_id
  ) then
    raise exception 'investment_income entity and holding links are inconsistent' using errcode = '23514';
  end if;

  return new;
end $$;

drop trigger if exists trg_investment_income_owner_links on investment_income;
create trigger trg_investment_income_owner_links
  before insert or update on investment_income
  for each row execute function validate_investment_income_owner_links();

create or replace function protect_entity_owner_with_investment_income()
returns trigger
language plpgsql
set search_path = financial, public
as $$
begin
  if new.owner_id is distinct from old.owner_id and exists (
    select 1 from investment_income i
    where i.entity_id = old.id and i.owner_id is distinct from new.owner_id
  ) then
    raise exception 'entities.owner_id cannot change while referenced by investment_income' using errcode = '23514';
  end if;
  return new;
end $$;

drop trigger if exists trg_entity_income_owner_guard on entities;
create trigger trg_entity_income_owner_guard
  before update of owner_id on entities
  for each row execute function protect_entity_owner_with_investment_income();

create or replace function protect_holding_links_with_investment_income()
returns trigger
language plpgsql
set search_path = financial, public
as $$
begin
  if new.owner_id is distinct from old.owner_id and exists (
    select 1 from investment_income i
    where i.holding_id = old.id and i.owner_id is distinct from new.owner_id
  ) then
    raise exception 'investment_holdings.owner_id cannot change while referenced by investment_income' using errcode = '23514';
  end if;

  if new.entity_id is distinct from old.entity_id and new.entity_id is not null and exists (
    select 1 from investment_income i
    where i.holding_id = old.id and i.entity_id is not null and i.entity_id <> new.entity_id
  ) then
    raise exception 'investment_holdings.entity_id conflicts with linked investment_income' using errcode = '23514';
  end if;

  return new;
end $$;

drop trigger if exists trg_holding_income_link_guard on investment_holdings;
create trigger trg_holding_income_link_guard
  before update of owner_id, entity_id on investment_holdings
  for each row execute function protect_holding_links_with_investment_income();

drop trigger if exists trg_investment_income_updated on investment_income;
create trigger trg_investment_income_updated before update on investment_income
  for each row execute function set_updated_at();

alter table investment_income enable row level security;

drop policy if exists investment_income_select on investment_income;
create policy investment_income_select on investment_income for select using (
  owner_id = auth.uid()
  or financial.financial_can_access_owner(owner_id, 'read')
);

drop policy if exists investment_income_insert on investment_income;
create policy investment_income_insert on investment_income for insert with check (
  owner_id = auth.uid()
  or financial.financial_can_access_owner(owner_id, 'write')
);

drop policy if exists investment_income_update on investment_income;
create policy investment_income_update on investment_income for update using (
  owner_id = auth.uid()
  or financial.financial_can_access_owner(owner_id, 'write')
) with check (
  owner_id = auth.uid()
  or financial.financial_can_access_owner(owner_id, 'write')
);

drop policy if exists investment_income_delete on investment_income;
create policy investment_income_delete on investment_income for delete using (
  owner_id = auth.uid()
  or financial.financial_can_access_owner(owner_id, 'write')
);

create index if not exists idx_investment_income_owner_date
  on investment_income(owner_id, payment_date desc)
  where deleted_at is null;

create index if not exists idx_investment_income_owner_ticker
  on investment_income(owner_id, ticker, payment_date desc)
  where deleted_at is null;

create unique index if not exists investment_income_owner_external_ref_unique
  on investment_income(owner_id, external_ref)
  where deleted_at is null and nullif(btrim(external_ref), '') is not null;

do $$ begin
  alter publication supabase_realtime add table financial.investment_income;
exception when duplicate_object then null;
end $$;

grant all on table investment_income to authenticated, anon;

reset search_path;
