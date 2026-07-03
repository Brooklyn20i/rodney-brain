-- Cadence Financial — property ledger (per-property monthly P&L)
--
-- One row per line item on a rent statement or cost bill. This is the
-- source of truth for property profit & loss:
--   income categories:  rent, other_income
--   expense categories: interest, insurance, strata, water, council_rates,
--                       land_tax, management_fees, repairs_maintenance,
--                       utilities, other_expense
--
-- amount is always stored positive; the category determines income vs
-- expense (see web/src/lib/propertyCalc.ts). Interest is an expense line
-- (entered from the loan statement) so the P&L reflects the real financing
-- cost; loan principal is deliberately NOT a ledger line -- it's a
-- balance-sheet transfer, so net cashflow here is an interest-only P&L.
--
-- Idempotent; same RLS/trigger pattern as the earlier migrations. No data
-- seeded -- rows are entered in-app and land in the private project.

create table if not exists property_ledger (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references auth.users(id) on delete cascade default auth.uid(),
  property_id uuid not null references properties(id) on delete cascade,
  period      text not null,               -- 'YYYY-MM'
  entry_date  date,                         -- optional actual date on the statement
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
