-- Cadence Financial — Phase B: goals, insurance register, estate checklist
--
-- Closes the top gaps from the July 2026 assessment:
--   goals              -- the owner's stated objective; runway math is computed
--                         in-app from actual trailing performance, never stored
--   insurance_policies -- protection register (management-grade record only)
--   estate_items       -- estate-readiness checklist (status only; documents
--                         live with the lawyer)
--
-- Idempotent; same RLS/trigger pattern as 0004_policy.sql. No data is seeded
-- here -- rows are entered in-app and land straight in this private project.

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
