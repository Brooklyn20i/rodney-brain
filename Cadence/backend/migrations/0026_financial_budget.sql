-- 0026_financial_budget.sql
-- Cadence Financial — macro budget / cashflow plan.
--
-- A forward-looking recurring budget: income streams in (salary, rent, interest,
-- dividends…) minus recurring payments out (mortgage, credit cards, rent, bills…)
-- = free cash. Distinct from monthly_metrics (which record what actually happened)
-- and the Free Cash Engine (which reads those actuals) — this is the plan.
--
-- One row per recurring line. Frequency is stored per line (weekly / fortnightly /
-- monthly / quarterly / annual); the app normalises everything to a monthly view.
-- Follows the same owner-scoped RLS + granted-agent access as every other
-- financial table (see 0022 and 0024).

set search_path to financial, public;

create table if not exists budget_lines (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references auth.users(id) on delete cascade default auth.uid(),
  -- 'income' streams add to free cash; 'expense' payments subtract from it.
  kind        text not null default 'expense' check (kind in ('income', 'expense')),
  -- Grouping label for the summary (e.g. 'salary', 'mortgage', 'credit_card').
  -- Free text so the app can add categories without a migration; the UI offers
  -- a preset list per kind.
  category    text not null default 'other_expense',
  label       text not null default '',
  amount      numeric(14,2) not null default 0,
  frequency   text not null default 'monthly'
                check (frequency in ('weekly', 'fortnightly', 'monthly', 'quarterly', 'annual')),
  active      boolean not null default true,
  sort_order  integer not null default 0,
  notes       text not null default '',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz
);

-- updated_at trigger (set_updated_at defined in 0022).
drop trigger if exists trg_budget_lines_updated on budget_lines;
create trigger trg_budget_lines_updated before update on budget_lines
  for each row execute function set_updated_at();

-- RLS: owner_id = auth.uid() OR the granted agent (mirrors 0024). The
-- financial_can_access_owner() helper already exists from 0024.
alter table budget_lines enable row level security;

drop policy if exists budget_lines_select on budget_lines;
create policy budget_lines_select on budget_lines
  for select using (
    owner_id = auth.uid()
    or financial.financial_can_access_owner(owner_id, 'read')
  );

drop policy if exists budget_lines_insert on budget_lines;
create policy budget_lines_insert on budget_lines
  for insert with check (
    owner_id = auth.uid()
    or financial.financial_can_access_owner(owner_id, 'write')
  );

drop policy if exists budget_lines_update on budget_lines;
create policy budget_lines_update on budget_lines
  for update using (
    owner_id = auth.uid()
    or financial.financial_can_access_owner(owner_id, 'write')
  ) with check (
    owner_id = auth.uid()
    or financial.financial_can_access_owner(owner_id, 'write')
  );

drop policy if exists budget_lines_delete on budget_lines;
create policy budget_lines_delete on budget_lines
  for delete using (
    owner_id = auth.uid()
    or financial.financial_can_access_owner(owner_id, 'write')
  );

-- PostgREST needs explicit grants on a non-public schema (0022 set default
-- privileges, but be explicit for this table). service_role usage on the
-- schema is granted by 0025.
grant all on table budget_lines to authenticated, anon;
grant all on table budget_lines to service_role;

create index if not exists idx_budget_lines_owner on budget_lines(owner_id) where deleted_at is null;

reset search_path;
