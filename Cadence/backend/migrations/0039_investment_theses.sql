-- 0039_investment_theses.sql
-- Cadence Financial — per-asset investment thesis + conviction rating + review cadence.
--
-- Every asset (property, holding, cash bucket) or sleeve can carry a written
-- thesis: WHY it's owned, the return-DRIVER it expresses (the field that turns
-- the whole table into a correlation audit — if five theses share one driver the
-- "diversified" book is really one bet), a conviction RATING that maps to an
-- action (core/hold/trim/exit), a falsifiable KILL criterion written while calm,
-- and a review cadence (property 2x/yr, other assets 4x/yr) with an auto-computed
-- next_review_date so overdue reviews surface. Structural holdings (a family home,
-- locked super) are flagged is_structural so they're not graded as investments.

set search_path to financial, public;

create table if not exists investment_theses (
  id                     uuid primary key default gen_random_uuid(),
  owner_id               uuid not null references auth.users(id) on delete cascade default auth.uid(),
  target_kind            text not null default 'holding'
                         check (target_kind in ('property','holding','bucket','sleeve')),
  target_id              uuid,            -- null for a sleeve-level thesis
  target_label           text not null default '',
  driver                 text not null default '',   -- return-driver tag (correlation audit key)
  role                   text not null default '',   -- what job it does in the portfolio
  thesis                 text not null default '',    -- why I own it
  kill_criteria          text not null default '',    -- what would make me sell
  conviction             text not null default 'hold'
                         check (conviction in ('core','hold','trim','exit')),
  status                 text not null default 'intact'
                         check (status in ('intact','watch','broken')),
  conviction_score       integer,          -- optional 1-10
  is_structural          boolean not null default false,  -- family/locked, not an investment
  review_frequency_months integer not null default 3,      -- property=6, others=3
  last_reviewed          date,
  next_review_date       date,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  deleted_at             timestamptz
);

create index if not exists investment_theses_owner_idx on investment_theses(owner_id) where deleted_at is null;
create index if not exists investment_theses_target_idx on investment_theses(target_kind, target_id);

drop trigger if exists trg_investment_theses_updated on investment_theses;
create trigger trg_investment_theses_updated
  before update on investment_theses
  for each row execute function set_updated_at();

alter table investment_theses enable row level security;

drop policy if exists investment_theses_select on investment_theses;
create policy investment_theses_select on investment_theses for select using (
  owner_id = auth.uid() or financial.financial_can_access_owner(owner_id, 'read'));

drop policy if exists investment_theses_insert on investment_theses;
create policy investment_theses_insert on investment_theses for insert with check (
  owner_id = auth.uid() or financial.financial_can_access_owner(owner_id, 'write'));

drop policy if exists investment_theses_update on investment_theses;
create policy investment_theses_update on investment_theses for update using (
  owner_id = auth.uid() or financial.financial_can_access_owner(owner_id, 'write')
) with check (
  owner_id = auth.uid() or financial.financial_can_access_owner(owner_id, 'write'));

drop policy if exists investment_theses_delete on investment_theses;
create policy investment_theses_delete on investment_theses for delete using (
  owner_id = auth.uid() or financial.financial_can_access_owner(owner_id, 'write'));

grant select, insert, update, delete on investment_theses to authenticated;

reset search_path;
