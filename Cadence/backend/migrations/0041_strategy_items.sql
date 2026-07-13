-- 0041_strategy_items.sql
-- Cadence Financial — the wealth-strategy execution plan lives IN the
-- Financial domain, not in Cadence Work. Rodney's feedback: personal wealth
-- tasks clogged the Work task list; they belong under a Strategy section in
-- Wealth. This table holds the dated action plan (one-off actions, trust
-- tranches, monthly buy orders, calendar/review dates) that the strategy
-- document prescribes and the automated reviews read and tick.

set search_path to financial, public;

create table if not exists strategy_items (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references auth.users(id) on delete cascade default auth.uid(),
  section     text not null default 'now'
              check (section in ('now','tranche','monthly','calendar')),
  title       text not null,
  detail      text not null default '',
  due_date    date,
  done        boolean not null default false,
  done_at     timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz
);

create index if not exists strategy_items_owner_idx on strategy_items(owner_id) where deleted_at is null;
create index if not exists strategy_items_due_idx on strategy_items(due_date) where deleted_at is null;

drop trigger if exists trg_strategy_items_updated on strategy_items;
create trigger trg_strategy_items_updated
  before update on strategy_items
  for each row execute function set_updated_at();

alter table strategy_items enable row level security;

drop policy if exists strategy_items_select on strategy_items;
create policy strategy_items_select on strategy_items for select using (
  owner_id = auth.uid() or financial.financial_can_access_owner(owner_id, 'read'));

drop policy if exists strategy_items_insert on strategy_items;
create policy strategy_items_insert on strategy_items for insert with check (
  owner_id = auth.uid() or financial.financial_can_access_owner(owner_id, 'write'));

drop policy if exists strategy_items_update on strategy_items;
create policy strategy_items_update on strategy_items for update using (
  owner_id = auth.uid() or financial.financial_can_access_owner(owner_id, 'write')
) with check (
  owner_id = auth.uid() or financial.financial_can_access_owner(owner_id, 'write'));

drop policy if exists strategy_items_delete on strategy_items;
create policy strategy_items_delete on strategy_items for delete using (
  owner_id = auth.uid() or financial.financial_can_access_owner(owner_id, 'write'));

grant select, insert, update, delete on strategy_items to authenticated;

reset search_path;
