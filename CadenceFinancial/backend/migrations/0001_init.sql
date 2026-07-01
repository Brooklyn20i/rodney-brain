-- Cadence Financial — initial schema
-- Single-user app (no multi-tenant workspace layer, unlike Cadence). Every
-- row belongs to owner_id and Row-Level Security guarantees a logged-in
-- user can only ever read/write their own rows. Safe to re-run: guarded
-- with IF NOT EXISTS.
--
-- Conventions on every table:
--   id          uuid primary key
--   owner_id    uuid -> auth.users(id), defaults to the logged-in user
--   created_at  timestamptz, server-set
--   updated_at  timestamptz, server-maintained by trigger
--   deleted_at  timestamptz, soft delete (null = live)
--
-- Derived figures (free cash generated, all-in surplus, net worth bridge
-- movements, target-band flags) are intentionally NOT columns here -- the
-- client computes them from these raw rows (see src/lib/financeCalc.ts) so
-- they can never drift from their inputs.

do $$ begin
  create type entity_kind as enum ('personal','joint','investment_vehicle');
exception when duplicate_object then null; end $$;
do $$ begin
  create type evidence_grade as enum (
    'screenshot','statement','broker','tax','market_repriced',
    'stale_carry_forward','assumption','user_stated_scenario'
  );
exception when duplicate_object then null; end $$;
do $$ begin
  create type evidence_status as enum ('received','partial','missing','accepted');
exception when duplicate_object then null; end $$;
do $$ begin
  create type decision_approval_status as enum ('open','clarified','approved','blocked','implemented');
exception when duplicate_object then null; end $$;
do $$ begin
  create type owner_lens as enum ('kobe','warren','dan','mckinsey','rodney');
exception when duplicate_object then null; end $$;
do $$ begin
  create type loan_rate_type as enum ('fixed','variable');
exception when duplicate_object then null; end $$;
do $$ begin
  create type investment_side as enum ('buy','sell');
exception when duplicate_object then null; end $$;

create or replace function set_updated_at() returns trigger as $$
begin new.updated_at = now(); return new; end;
$$ language plpgsql;

-- ── entities ─────────────────────────────────────────────────────────────
create table if not exists entities (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid not null references auth.users(id) on delete cascade default auth.uid(),
  name       text not null,
  kind       entity_kind not null default 'personal',
  notes      text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

-- ── properties ───────────────────────────────────────────────────────────
create table if not exists properties (
  id               uuid primary key default gen_random_uuid(),
  owner_id         uuid not null references auth.users(id) on delete cascade default auth.uid(),
  entity_id        uuid references entities(id) on delete set null,
  address          text not null,
  value            numeric(14,2) not null default 0,
  valuation_basis  text not null default '',
  evidence_status  text not null default '',
  role             text not null default '',
  annual_rent      numeric(14,2) not null default 0,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  deleted_at       timestamptz
);

-- ── loans ────────────────────────────────────────────────────────────────
create table if not exists loans (
  id                 uuid primary key default gen_random_uuid(),
  owner_id           uuid not null references auth.users(id) on delete cascade default auth.uid(),
  property_id        uuid not null references properties(id) on delete cascade,
  balance            numeric(14,2) not null default 0,
  offset_balance     numeric(14,2) not null default 0,
  rate               numeric(6,4) not null default 0,
  monthly_repayment  numeric(12,2) not null default 0,
  rate_type          loan_rate_type not null default 'variable',
  review_date        date,
  notes              text not null default '',
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  deleted_at         timestamptz
);

-- ── investment_holdings ──────────────────────────────────────────────────
create table if not exists investment_holdings (
  id           uuid primary key default gen_random_uuid(),
  owner_id     uuid not null references auth.users(id) on delete cascade default auth.uid(),
  entity_id    uuid references entities(id) on delete set null,
  ticker       text not null,
  market       text not null default '',
  currency     text not null default 'AUD',
  units        numeric(18,8) not null default 0,
  native_value numeric(14,2) not null default 0,
  cost_basis   numeric(14,2) not null default 0,
  as_of_date   date not null default current_date,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  deleted_at   timestamptz
);

-- ── investment_transactions ──────────────────────────────────────────────
create table if not exists investment_transactions (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid not null references auth.users(id) on delete cascade default auth.uid(),
  date       date not null,
  ticker     text not null,
  side       investment_side not null default 'buy',
  currency   text not null default 'AUD',
  units      numeric(18,8) not null default 0,
  price      numeric(14,4) not null default 0,
  amount     numeric(14,2) not null default 0,
  notes      text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

-- ── monthly_metrics (one row per calendar month, period = 'YYYY-MM') ────────
create table if not exists monthly_metrics (
  id                 uuid primary key default gen_random_uuid(),
  owner_id           uuid not null references auth.users(id) on delete cascade default auth.uid(),
  period             text not null,
  cash_saved         numeric(14,2) not null default 0,
  share_buys         numeric(14,2) not null default 0,
  btc_buys           numeric(14,2) not null default 0,
  debt_reduction     numeric(14,2) not null default 0,
  net_worth          numeric(14,2) not null default 0,
  cash_offsets       numeric(14,2) not null default 0,
  total_debt         numeric(14,2) not null default 0,
  net_debt           numeric(14,2) not null default 0,
  shares             numeric(14,2) not null default 0,
  btc_crypto         numeric(14,2) not null default 0,
  super_balance      numeric(14,2) not null default 0,
  total_assets       numeric(14,2) not null default 0,
  property_value     numeric(14,2) not null default 0,
  property_equity    numeric(14,2) not null default 0,
  collectibles_value numeric(14,2) not null default 0,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  deleted_at         timestamptz,
  unique (owner_id, period)
);

-- ── evidence_items ───────────────────────────────────────────────────────
create table if not exists evidence_items (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid not null references auth.users(id) on delete cascade default auth.uid(),
  item       text not null,
  period     text not null,
  grade      evidence_grade not null default 'assumption',
  status     evidence_status not null default 'accepted',
  source     text not null default '',
  notes      text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

-- ── decisions ("Needs Rodney") ───────────────────────────────────────────
create table if not exists decisions (
  id                    uuid primary key default gen_random_uuid(),
  owner_id              uuid not null references auth.users(id) on delete cascade default auth.uid(),
  decision_area         text not null,
  question              text not null default '',
  options               text not null default '',
  recommended_position  text not null default '',
  approval_status       decision_approval_status not null default 'open',
  owner_lens            owner_lens not null default 'rodney',
  decision_date         date,
  evidence_link         text not null default '',
  follow_up_action      text not null default '',
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  deleted_at            timestamptz
);

-- ── liquidity_buckets ────────────────────────────────────────────────────
create table if not exists liquidity_buckets (
  id                 uuid primary key default gen_random_uuid(),
  owner_id           uuid not null references auth.users(id) on delete cascade default auth.uid(),
  label              text not null,
  amount             numeric(14,2) not null default 0,
  protected_minimum  numeric(14,2) not null default 0,
  purpose            text not null default '',
  note               text not null default '',
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  deleted_at         timestamptz
);

-- ── updated_at triggers ────────────────────────────────────────────────────
do $$
declare t text;
begin
  foreach t in array array['entities','properties','loans','investment_holdings',
    'investment_transactions','monthly_metrics','evidence_items','decisions',
    'liquidity_buckets']
  loop
    execute format('drop trigger if exists trg_%1$s_updated on %1$s;', t);
    execute format('create trigger trg_%1$s_updated before update on %1$s
                    for each row execute function set_updated_at();', t);
  end loop;
end $$;

-- ── Row-Level Security ──────────────────────────────────────────────────
do $$
declare t text;
begin
  foreach t in array array['entities','properties','loans','investment_holdings',
    'investment_transactions','monthly_metrics','evidence_items','decisions',
    'liquidity_buckets']
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

-- ── indexes ──────────────────────────────────────────────────────────────
create index if not exists idx_properties_owner   on properties(owner_id) where deleted_at is null;
create index if not exists idx_loans_property      on loans(property_id);
create index if not exists idx_holdings_owner      on investment_holdings(owner_id) where deleted_at is null;
create index if not exists idx_transactions_date   on investment_transactions(owner_id, date);
create index if not exists idx_monthly_period      on monthly_metrics(owner_id, period);
create index if not exists idx_evidence_period     on evidence_items(owner_id, period);
create index if not exists idx_decisions_status    on decisions(owner_id, approval_status);
