-- Cadence Financial — agent access (Kobe/Hermes) for the unified project
--
-- Migration 0022 gave the `financial` schema single-user RLS: every policy is
-- `owner_id = auth.uid()`, so only Rodney's own login can see his rows. That
-- blocks the Kobe/Hermes agent (a separate auth user) entirely — unlike Work
-- (`public.cadence_agent_access`) and Fitness (`fitness.fitness_agent_access`),
-- which both have a grant-gated agent path.
--
-- This adds the same least-privilege, revocable, auditable mechanism to the
-- `financial` schema: a `financial_agent_access` grant table + a
-- `financial_can_access_owner()` SECURITY DEFINER check, and rewrites every
-- financial table policy to `owner_id = auth.uid() OR <granted agent>`. Rodney's
-- own access is unchanged (still the first clause); this only ADDS access for a
-- user who holds an active grant. Idempotent; safe to re-run.

set search_path to financial, public;

-- ── grant table ────────────────────────────────────────────────────────────
create table if not exists financial_agent_access (
  id              uuid primary key default gen_random_uuid(),
  owner_user_id   uuid not null references auth.users(id) on delete cascade,
  agent_user_id   uuid not null references auth.users(id) on delete cascade,
  can_read        boolean not null default true,
  can_write       boolean not null default false,
  reason          text not null default '',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  revoked_at      timestamptz null,
  check (owner_user_id <> agent_user_id),
  check (can_read or can_write)
);

create unique index if not exists financial_agent_access_one_active_grant
  on financial_agent_access(owner_user_id, agent_user_id)
  where revoked_at is null;

create index if not exists financial_agent_access_agent_idx
  on financial_agent_access(agent_user_id)
  where revoked_at is null;

drop trigger if exists trg_financial_agent_access_updated on financial_agent_access;
create trigger trg_financial_agent_access_updated
  before update on financial_agent_access
  for each row execute function set_updated_at();

alter table financial_agent_access enable row level security;

drop policy if exists financial_agent_access_select on financial_agent_access;
create policy financial_agent_access_select on financial_agent_access
  for select using (owner_user_id = auth.uid() or agent_user_id = auth.uid());

drop policy if exists financial_agent_access_insert on financial_agent_access;
create policy financial_agent_access_insert on financial_agent_access
  for insert with check (owner_user_id = auth.uid());

drop policy if exists financial_agent_access_update on financial_agent_access;
create policy financial_agent_access_update on financial_agent_access
  for update using (owner_user_id = auth.uid())
  with check (owner_user_id = auth.uid());

drop policy if exists financial_agent_access_delete on financial_agent_access;
create policy financial_agent_access_delete on financial_agent_access
  for delete using (owner_user_id = auth.uid());

-- ── access check (SECURITY DEFINER, authenticated only) ──────────────────────
create or replace function financial_can_access_owner(
  target_owner_id uuid,
  required_access text default 'read'
)
returns boolean
language sql
stable
security definer
set search_path = financial, public, auth
as $$
  select exists (
    select 1
    from financial_agent_access a
    where a.owner_user_id = target_owner_id
      and a.agent_user_id = auth.uid()
      and a.revoked_at is null
      and case
        when required_access = 'write' then a.can_write
        else a.can_read or a.can_write
      end
  );
$$;

revoke all on function financial_can_access_owner(uuid, text) from public;
grant execute on function financial_can_access_owner(uuid, text) to authenticated;

-- ── rewrite every financial data table's policies to allow the granted agent ──
do $$
declare
  t text;
begin
  foreach t in array array[
    'entities','properties','loans','investment_holdings','investment_transactions',
    'monthly_metrics','evidence_items','decisions','liquidity_buckets',
    'allocation_policies','risk_policies','goals','insurance_policies',
    'estate_items','property_ledger','agent_messages'
  ] loop
    execute format('drop policy if exists %I on financial.%I', t || '_select', t);
    execute format(
      'create policy %I on financial.%I for select using (
         owner_id = auth.uid()
         or financial.financial_can_access_owner(owner_id, ''read'')
       )', t || '_select', t);

    execute format('drop policy if exists %I on financial.%I', t || '_insert', t);
    execute format(
      'create policy %I on financial.%I for insert with check (
         owner_id = auth.uid()
         or financial.financial_can_access_owner(owner_id, ''write'')
       )', t || '_insert', t);

    execute format('drop policy if exists %I on financial.%I', t || '_update', t);
    execute format(
      'create policy %I on financial.%I for update using (
         owner_id = auth.uid()
         or financial.financial_can_access_owner(owner_id, ''write'')
       ) with check (
         owner_id = auth.uid()
         or financial.financial_can_access_owner(owner_id, ''write'')
       )', t || '_update', t);

    execute format('drop policy if exists %I on financial.%I', t || '_delete', t);
    execute format(
      'create policy %I on financial.%I for delete using (
         owner_id = auth.uid()
         or financial.financial_can_access_owner(owner_id, ''write'')
       )', t || '_delete', t);
  end loop;
end $$;

reset search_path;
