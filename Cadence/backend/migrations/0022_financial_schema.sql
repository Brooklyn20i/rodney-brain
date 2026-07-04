-- Cadence Financial — merged into the Cadence Work Supabase project
--
-- This ports CadenceFinancial/backend/migrations/0001-0007 verbatim into a
-- dedicated `financial` Postgres schema in the SAME project as Cadence Work,
-- so the unified app can run one Supabase project instead of three. Nothing
-- about the Financial data model changes: same tables, same columns, same
-- RLS rule (owner_id = auth.uid(), single-user, no workspace_id) -- it just
-- lives in `financial.*` instead of a separate project's `public.*`, which
-- Postgres schemas make trivially collision-free against Work's own
-- `public.*` tables (e.g. `financial.decisions` and `public.decisions` are
-- different tables; `financial.agent_messages` and `public.agent_messages`
-- likewise).
--
-- Run this ONCE in the Supabase SQL Editor of your Cadence Work project.
-- Idempotent; safe to re-run. After running, go to Database -> API Settings
-- -> "Exposed schemas" and add `financial` -- PostgREST only serves `public`
-- by default, so the app's `supabase.schema('financial').from(...)` calls
-- will 404 until you expose it there.
--
-- If you have REAL data in a separate, already-live Cadence Financial
-- Supabase project, this migration alone does not move it -- see
-- Cadence/AGENTS.md "Merging Financial's live data" for the pg_dump/restore
-- runbook to run yourself afterwards.

create schema if not exists financial;

-- PostgREST/the dashboard need explicit grants on any non-public schema;
-- Supabase only auto-grants `public`. RLS below still restricts every row to
-- its owner -- these grants just get requests past the initial permission
-- check, exactly like `public` already works by default.
grant usage on schema financial to authenticated, anon;
alter default privileges in schema financial grant all on tables to authenticated, anon;
alter default privileges in schema financial grant all on sequences to authenticated, anon;

set search_path to financial, public;

-- ═══════════════════════════════════════════════════════════════════════
-- 0001_init.sql — core schema
-- ═══════════════════════════════════════════════════════════════════════

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
  amount_aud numeric(14,2) not null default 0,
  notes      text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

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

create index if not exists idx_properties_owner   on properties(owner_id) where deleted_at is null;
create index if not exists idx_loans_property      on loans(property_id);
create index if not exists idx_holdings_owner      on investment_holdings(owner_id) where deleted_at is null;
create index if not exists idx_transactions_date   on investment_transactions(owner_id, date);
create index if not exists idx_monthly_period      on monthly_metrics(owner_id, period);
create index if not exists idx_evidence_period     on evidence_items(owner_id, period);
create index if not exists idx_decisions_status    on decisions(owner_id, approval_status);

-- ═══════════════════════════════════════════════════════════════════════
-- 0002_amount_aud.sql — backfill (already included as a column above for
-- fresh installs; this update is a no-op on a brand-new schema but kept for
-- parity with the original migration sequence)
-- ═══════════════════════════════════════════════════════════════════════

update investment_transactions
  set amount_aud = amount
  where amount_aud = 0;

-- ═══════════════════════════════════════════════════════════════════════
-- 0003_agent_messages.sql
-- ═══════════════════════════════════════════════════════════════════════

do $$ begin
  create type message_sender_type as enum ('user','agent','system');
exception when duplicate_object then null; end $$;
do $$ begin
  create type message_status as enum ('unread','processed');
exception when duplicate_object then null; end $$;

create table if not exists agent_messages (
  id                 uuid primary key default gen_random_uuid(),
  owner_id           uuid not null references auth.users(id) on delete cascade default auth.uid(),
  sender_type        message_sender_type not null default 'user',
  sender_label       text not null default 'Rodney',
  body               text not null,
  status             message_status not null default 'unread',
  linked_decision_id uuid references decisions(id) on delete set null,
  linked_period      text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  deleted_at         timestamptz
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
-- 0004_policy.sql
-- ═══════════════════════════════════════════════════════════════════════

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

-- ═══════════════════════════════════════════════════════════════════════
-- 0005_phase_b.sql — goals, insurance, estate
-- ═══════════════════════════════════════════════════════════════════════

create table if not exists goals (
  id                  uuid primary key default gen_random_uuid(),
  owner_id            uuid not null references auth.users(id) on delete cascade default auth.uid(),
  label               text not null default '',
  target_net_worth    numeric(14,2) not null default 0,
  target_date         date,
  assumed_growth_rate numeric(6,4) not null default 0,
  notes               text not null default '',
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  deleted_at          timestamptz
);

create table if not exists insurance_policies (
  id             uuid primary key default gen_random_uuid(),
  owner_id       uuid not null references auth.users(id) on delete cascade default auth.uid(),
  category       text not null default 'other'
                 check (category in ('life','tpd','income_protection','trauma','health',
                                     'home_contents','landlord','motor','liability','other')),
  insurer        text not null default '',
  policy_label   text not null default '',
  cover_amount   numeric(14,2) not null default 0,
  premium_annual numeric(12,2) not null default 0,
  renewal_date   date,
  status         text not null default 'active'
                 check (status in ('active','lapsed','under_review')),
  notes          text not null default '',
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  deleted_at     timestamptz
);

create table if not exists estate_items (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid not null references auth.users(id) on delete cascade default auth.uid(),
  item_key      text not null default 'other',
  label         text not null default '',
  status        text not null default 'missing'
                check (status in ('missing','in_progress','executed','review_due')),
  last_reviewed date,
  notes         text not null default '',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz
);

do $$
declare t text;
begin
  foreach t in array array['goals','insurance_policies','estate_items']
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

-- ═══════════════════════════════════════════════════════════════════════
-- 0006_property_ledger.sql
-- ═══════════════════════════════════════════════════════════════════════

create table if not exists property_ledger (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references auth.users(id) on delete cascade default auth.uid(),
  property_id uuid not null references properties(id) on delete cascade,
  period      text not null,
  entry_date  date,
  category    text not null default 'other_expense'
              check (category in ('rent','other_income','interest','insurance','strata',
                                  'water','council_rates','land_tax','management_fees',
                                  'repairs_maintenance','utilities','other_expense')),
  amount      numeric(14,2) not null default 0,
  grade       text not null default 'statement',
  source      text not null default '',
  notes       text not null default '',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz
);

create index if not exists idx_property_ledger_owner
  on property_ledger(owner_id, property_id, period) where deleted_at is null;

do $$
declare t text := 'property_ledger';
begin
  execute format('drop trigger if exists trg_%1$s_updated on %1$s;', t);
  execute format('create trigger trg_%1$s_updated before update on %1$s
                  for each row execute function set_updated_at();', t);

  execute format('alter table %s enable row level security;', t);

  execute format('drop policy if exists %1$s_select on %1$s;', t);
  execute format('create policy %1$s_select on %1$s for select using (owner_id = auth.uid());', t);

  execute format('drop policy if exists %1$s_insert on %1$s;', t);
  execute format('create policy %1$s_insert on %1$s for insert with check (owner_id = auth.uid());', t);

  execute format('drop policy if exists %1$s_update on %1$s;', t);
  execute format('create policy %1$s_update on %1$s for update using (owner_id = auth.uid()) with check (owner_id = auth.uid());', t);

  execute format('drop policy if exists %1$s_delete on %1$s;', t);
  execute format('create policy %1$s_delete on %1$s for delete using (owner_id = auth.uid());', t);
end $$;

-- ═══════════════════════════════════════════════════════════════════════
-- 0007_property_details.sql
-- ═══════════════════════════════════════════════════════════════════════

alter table properties add column if not exists purchase_price      numeric(14,2);
alter table properties add column if not exists purchase_date       date;
alter table properties add column if not exists cash_invested       numeric(14,2);
alter table properties add column if not exists land_value          numeric(14,2);
alter table properties add column if not exists depreciation_annual numeric(12,2);
alter table properties add column if not exists property_type       text
  check (property_type is null or property_type in
         ('house','townhouse','unit','land','commercial','other'));
alter table properties add column if not exists bedrooms            integer;
alter table properties add column if not exists bathrooms           integer;
alter table properties add column if not exists car_spaces          integer;
alter table properties add column if not exists land_size_sqm       numeric(10,2);
alter table properties add column if not exists ownership_share     numeric(6,4);
alter table properties add column if not exists weekly_rent         numeric(12,2);
alter table properties add column if not exists lease_start         date;
alter table properties add column if not exists lease_end           date;
alter table properties add column if not exists tenant              text;

-- ── realtime ─────────────────────────────────────────────────────────────
do $$
declare t text;
begin
  foreach t in array array['entities','properties','loans','investment_holdings',
    'investment_transactions','monthly_metrics','evidence_items','decisions',
    'liquidity_buckets','agent_messages','allocation_policies','risk_policies',
    'goals','insurance_policies','estate_items','property_ledger']
  loop
    begin
      execute format('alter publication supabase_realtime add table financial.%I;', t);
    exception when duplicate_object then null;
    end;
  end loop;
end $$;

reset search_path;
