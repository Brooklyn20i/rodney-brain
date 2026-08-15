-- Distinguish realised property P&L from future scheduled obligations.
-- Existing rows remain actual by default. Rows explicitly recorded as scheduled
-- with no payment action are backfilled to scheduled so they cannot distort
-- actual P&L history or trailing averages.

set search_path to financial, public;

alter table property_ledger
  add column if not exists status text not null default 'actual';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'property_ledger_status_check'
      and conrelid = 'financial.property_ledger'::regclass
  ) then
    alter table property_ledger
      add constraint property_ledger_status_check
      check (status in ('actual', 'scheduled'));
  end if;
end $$;

update property_ledger
set status = 'scheduled'
where deleted_at is null
  and status = 'actual'
  and notes ilike '%Scheduled by instalment due date/payment timing%'
  and notes ilike '%No payment or external action taken%';

create index if not exists idx_property_ledger_scheduled
  on property_ledger(owner_id, property_id, entry_date)
  where deleted_at is null and status = 'scheduled';

comment on column property_ledger.status is
  'actual = confirmed realised P&L; scheduled = future obligation excluded from actual P&L/history until confirmed';
