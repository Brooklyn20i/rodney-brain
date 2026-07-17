-- Cadence Financial — watches collection-control register
--
-- Additive/idempotent. Creates a dedicated owner-scoped watches register in the
-- financial schema. No private owner watch data is seeded here.

set search_path to financial, public;

do $$ begin
  create type watch_collection_role as enum ('permanent','rotation','exit_trade','future');
exception when duplicate_object then null; end $$;

do $$ begin
  create type watch_ownership_status as enum ('owned','candidate','traded','sold');
exception when duplicate_object then null; end $$;

do $$ begin
  create type watch_full_set_status as enum ('full','partial','none','unknown');
exception when duplicate_object then null; end $$;

create table if not exists watches (
  id                 uuid primary key default gen_random_uuid(),
  owner_id           uuid not null references auth.users(id) on delete cascade default auth.uid(),
  brand              text not null,
  model              text not null,
  reference          text not null default '',
  nickname           text not null default '',
  year               integer,
  collection_role    watch_collection_role not null default 'rotation',
  ownership_status   watch_ownership_status not null default 'owned',
  currency           text not null default 'AUD' check (currency = 'AUD'),
  purchase_price     numeric(14,2) check (purchase_price is null or purchase_price >= 0),
  purchase_date      date,
  current_value      numeric(14,2) check (current_value is null or current_value >= 0),
  value_as_of        date,
  valuation_source   text not null default '',
  insurance_value    numeric(14,2) check (insurance_value is null or insurance_value >= 0),
  full_set_status    watch_full_set_status not null default 'unknown',
  accessories        text not null default '',
  material           text not null default '',
  dial               text not null default '',
  service_history    text not null default '',
  provenance         text not null default '',
  insurance_notes    text not null default '',
  storage_location   text not null default '',
  security_notes     text not null default '',
  notes              text not null default '',
  sentimental        boolean not null default false,
  external_ref       text not null default '',
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  deleted_at         timestamptz,
  constraint watches_brand_nonblank check (btrim(brand) <> ''),
  constraint watches_model_nonblank check (btrim(model) <> ''),
  constraint watches_year_reasonable check (year is null or (year between 1800 and extract(year from now())::int + 1))
);

-- Column drift/idempotency safety if an early scratch version already created the table.
alter table watches add column if not exists brand text not null default '';
alter table watches add column if not exists model text not null default '';
alter table watches add column if not exists reference text not null default '';
alter table watches add column if not exists nickname text not null default '';
alter table watches add column if not exists year integer;
alter table watches add column if not exists collection_role watch_collection_role not null default 'rotation';

-- Rename/copy any early scratch `category` column into the final first-class name.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'financial' and table_name = 'watches' and column_name = 'category'
  ) then
    execute 'update watches set collection_role = category::text::watch_collection_role where category is not null';
  end if;
exception when undefined_column or undefined_object then null;
end $$;

alter table watches add column if not exists ownership_status watch_ownership_status not null default 'owned';
alter table watches add column if not exists currency text not null default 'AUD';
alter table watches add column if not exists purchase_price numeric(14,2);
alter table watches add column if not exists purchase_date date;
alter table watches add column if not exists current_value numeric(14,2);
alter table watches add column if not exists value_as_of date;
alter table watches add column if not exists valuation_source text not null default '';
alter table watches add column if not exists insurance_value numeric(14,2);
alter table watches add column if not exists full_set_status watch_full_set_status not null default 'unknown';
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'financial' and table_name = 'watches' and column_name = 'box_papers_status'
  ) then
    execute 'update watches set full_set_status = box_papers_status::text::watch_full_set_status where full_set_status = ''unknown''';
  end if;
exception when undefined_column or undefined_object then null;
end $$;
alter table watches add column if not exists accessories text not null default '';
alter table watches add column if not exists material text not null default '';
alter table watches add column if not exists dial text not null default '';
alter table watches add column if not exists service_history text not null default '';
alter table watches add column if not exists provenance text not null default '';
alter table watches add column if not exists insurance_notes text not null default '';
alter table watches add column if not exists storage_location text not null default '';
alter table watches add column if not exists security_notes text not null default '';
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'financial' and table_name = 'watches' and column_name = 'storage_notes'
  ) then
    execute 'update watches set storage_location = storage_notes where storage_location = '''' and storage_notes is not null';
  end if;
exception when undefined_column then null;
end $$;
alter table watches add column if not exists notes text not null default '';
alter table watches add column if not exists sentimental boolean not null default false;
alter table watches add column if not exists external_ref text not null default '';
alter table watches add column if not exists deleted_at timestamptz;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'watches_brand_nonblank') then
    alter table watches add constraint watches_brand_nonblank check (btrim(brand) <> '');
  end if;
  if not exists (select 1 from pg_constraint where conname = 'watches_model_nonblank') then
    alter table watches add constraint watches_model_nonblank check (btrim(model) <> '');
  end if;
  if not exists (select 1 from pg_constraint where conname = 'watches_currency_check') then
    alter table watches add constraint watches_currency_check check (currency = 'AUD');
  end if;
  if not exists (select 1 from pg_constraint where conname = 'watches_purchase_price_nonnegative') then
    alter table watches add constraint watches_purchase_price_nonnegative check (purchase_price is null or purchase_price >= 0);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'watches_current_value_nonnegative') then
    alter table watches add constraint watches_current_value_nonnegative check (current_value is null or current_value >= 0);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'watches_insurance_value_nonnegative') then
    alter table watches add constraint watches_insurance_value_nonnegative check (insurance_value is null or insurance_value >= 0);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'watches_year_reasonable') then
    alter table watches add constraint watches_year_reasonable check (year is null or (year between 1800 and extract(year from now())::int + 1));
  end if;
end $$;

create or replace function watches_immutable_owner_id()
returns trigger
language plpgsql
set search_path = financial, public
as $$
begin
  if tg_op = 'UPDATE' and new.owner_id is distinct from old.owner_id then
    raise exception 'watches.owner_id cannot be changed' using errcode = '23514';
  end if;
  return new;
end $$;

drop trigger if exists trg_watches_immutable_owner_id on watches;
create trigger trg_watches_immutable_owner_id
  before update of owner_id on watches
  for each row execute function watches_immutable_owner_id();

drop trigger if exists trg_watches_updated on watches;
create trigger trg_watches_updated before update on watches
  for each row execute function set_updated_at();

alter table watches enable row level security;

drop policy if exists watches_select on watches;
create policy watches_select on watches for select using (
  owner_id = auth.uid()
  or financial.financial_can_access_owner(owner_id, 'read')
);

drop policy if exists watches_insert on watches;
create policy watches_insert on watches for insert with check (
  owner_id = auth.uid()
  or financial.financial_can_access_owner(owner_id, 'write')
);

drop policy if exists watches_update on watches;
create policy watches_update on watches for update using (
  owner_id = auth.uid()
  or financial.financial_can_access_owner(owner_id, 'write')
) with check (
  owner_id = auth.uid()
  or financial.financial_can_access_owner(owner_id, 'write')
);

drop policy if exists watches_delete on watches;
create policy watches_delete on watches for delete using (
  owner_id = auth.uid()
  or financial.financial_can_access_owner(owner_id, 'write')
);

create index if not exists idx_watches_owner_role_status
  on watches(owner_id, collection_role, ownership_status, brand, model)
  where deleted_at is null;

create index if not exists idx_watches_owner_owned_value
  on watches(owner_id, current_value desc)
  where deleted_at is null and ownership_status = 'owned' and collection_role <> 'future';

create unique index if not exists watches_owner_external_ref_unique
  on watches(owner_id, external_ref)
  where deleted_at is null and nullif(btrim(external_ref), '') is not null;

do $$ begin
  alter publication supabase_realtime add table financial.watches;
exception when duplicate_object then null; end $$;

grant all on table watches to authenticated, anon;

reset search_path;
