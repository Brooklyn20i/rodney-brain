-- Cadence Life — explicit scoped agent access for Kobe/Hermes.
--
-- Life is owner-scoped personal admin data. Work-domain grants must not imply
-- Life access, so this migration adds a separate Life grant table and rewrites
-- Life table policies to allow only the owner or an explicitly granted agent.
-- Idempotent; no production grants are inserted by this file.

begin;

set search_path to life, public;

-- ── grant table ────────────────────────────────────────────────────────────
create table if not exists life_agent_access (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid not null references auth.users(id) on delete cascade,
  agent_user_id uuid not null references auth.users(id) on delete cascade,
  can_read      boolean not null default true,
  can_write     boolean not null default false,
  reason        text not null default '',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  revoked_at    timestamptz,
  check (owner_id <> agent_user_id),
  check (can_read or can_write)
);

create unique index if not exists life_agent_access_one_active_grant
  on life_agent_access(owner_id, agent_user_id)
  where revoked_at is null;

create index if not exists life_agent_access_agent_idx
  on life_agent_access(agent_user_id)
  where revoked_at is null;

drop trigger if exists trg_life_agent_access_updated on life_agent_access;
create trigger trg_life_agent_access_updated
  before update on life_agent_access
  for each row execute function life.set_updated_at();

create or replace function life.reject_life_agent_principal_change()
returns trigger
language plpgsql
set search_path = pg_catalog, life
as $$
begin
  if new.owner_id is distinct from old.owner_id
     or new.agent_user_id is distinct from old.agent_user_id then
    raise exception 'life_agent_access owner_id and agent_user_id are immutable after insert.'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_life_agent_access_immutable_principals on life_agent_access;
create trigger trg_life_agent_access_immutable_principals
  before update on life_agent_access
  for each row execute function life.reject_life_agent_principal_change();

alter table life_agent_access enable row level security;

drop policy if exists life_agent_access_select on life_agent_access;
create policy life_agent_access_select on life_agent_access
  for select using (owner_id = auth.uid() or agent_user_id = auth.uid());

drop policy if exists life_agent_access_insert on life_agent_access;
create policy life_agent_access_insert on life_agent_access
  for insert with check (owner_id = auth.uid());

drop policy if exists life_agent_access_update on life_agent_access;
create policy life_agent_access_update on life_agent_access
  for update using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

drop policy if exists life_agent_access_delete on life_agent_access;
create policy life_agent_access_delete on life_agent_access
  for delete using (owner_id = auth.uid());

-- ── access check (authenticated only; no Work grant reuse) ─────────────────
create or replace function life.life_can_access_owner(
  target_owner_id uuid,
  required_access text default 'read'
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, life, auth
as $$
  select auth.uid() is not null
    and (
      target_owner_id = auth.uid()
      or exists (
        select 1
        from life.life_agent_access a
        where a.owner_id = target_owner_id
          and a.agent_user_id = auth.uid()
          and a.revoked_at is null
          and case
            when required_access = 'write' then a.can_write
            when required_access = 'read' then a.can_read or a.can_write
            else false
          end
      )
    );
$$;

revoke all on function life.life_can_access_owner(uuid, text) from public, anon;
grant execute on function life.life_can_access_owner(uuid, text) to authenticated;

grant usage on schema life to authenticated;
grant select, insert, update, delete on life.life_items, life.obligations, life.life_agent_access to authenticated;
revoke all on life.life_agent_access from anon;

-- ── immutable owner guard for Life rows ────────────────────────────────────
create or replace function life.reject_owner_id_change()
returns trigger
language plpgsql
set search_path = pg_catalog, life
as $$
begin
  if new.owner_id is distinct from old.owner_id then
    raise exception 'owner_id is immutable after insert (table: %). Attempted change from % to %.',
      tg_table_name, old.owner_id, new.owner_id
      using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_life_items_immutable_owner_id on life.life_items;
create trigger trg_life_items_immutable_owner_id
  before update on life.life_items
  for each row execute function life.reject_owner_id_change();

drop trigger if exists trg_obligations_immutable_owner_id on life.obligations;
create trigger trg_obligations_immutable_owner_id
  before update on life.obligations
  for each row execute function life.reject_owner_id_change();

-- ── Life data policies: owner OR active explicit Life grant ────────────────
do $$
declare t text;
begin
  foreach t in array array['life_items','obligations'] loop
    execute format('drop policy if exists %1$I_select on life.%1$I;', t);
    execute format(
      'create policy %1$I_select on life.%1$I for select using (
         life.life_can_access_owner(owner_id, ''read'')
       );', t);

    execute format('drop policy if exists %1$I_insert on life.%1$I;', t);
    execute format(
      'create policy %1$I_insert on life.%1$I for insert with check (
         life.life_can_access_owner(owner_id, ''write'')
       );', t);

    execute format('drop policy if exists %1$I_update on life.%1$I;', t);
    execute format(
      'create policy %1$I_update on life.%1$I for update using (
         life.life_can_access_owner(owner_id, ''write'')
       ) with check (
         life.life_can_access_owner(owner_id, ''write'')
       );', t);

    execute format('drop policy if exists %1$I_delete on life.%1$I;', t);
    execute format(
      'create policy %1$I_delete on life.%1$I for delete using (
         life.life_can_access_owner(owner_id, ''write'')
       );', t);
  end loop;
end $$;

-- ── completion RPC: owner OR active writable Life grant ────────────────────
create or replace function life.complete_obligation(
 p_obligation_id uuid, p_expected_due date, p_today date
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, life
as $$
declare
 ob life.obligations%rowtype;
 hist life.life_items%rowtype;
 next_date date;
begin
 if auth.uid() is null then raise exception 'Authentication required' using errcode='42501'; end if;
 if p_expected_due is null or p_today is null
    or p_expected_due not between date '0001-01-01' and date '9999-12-31'
    or p_today not between date '0001-01-01' and date '9999-12-31' then
  raise exception 'Valid local calendar dates required' using errcode='22023';
 end if;

 select * into ob from life.obligations
 where id=p_obligation_id
   and deleted_at is null
   and life.life_can_access_owner(owner_id, 'write')
 for update;
 if not found then raise exception 'Obligation unavailable' using errcode='42501'; end if;

 select * into hist from life.life_items
 where owner_id=ob.owner_id and obligation_id=ob.id and due_date=p_expected_due;
 if found then
  return jsonb_build_object('obligation',to_jsonb(ob),'history',to_jsonb(hist));
 end if;

 if ob.next_due <> p_expected_due then
  raise exception 'Obligation date changed; refresh before completing' using errcode='40001';
 end if;
 next_date := (ob.next_due + make_interval(months=>ob.cadence_months))::date;
 while next_date <= p_today loop
  next_date := (next_date + make_interval(months=>ob.cadence_months))::date;
 end loop;
 if next_date > date '9999-12-31' then raise exception 'Next renewal exceeds supported dates' using errcode='22023'; end if;

 insert into life.life_items(owner_id,title,notes,status,category,due_date,obligation_id,completed_at)
 values(ob.owner_id,ob.name,ob.notes,'done',ob.category,p_expected_due,ob.id,now()) returning * into hist;
 update life.obligations set next_due=next_date where id=ob.id and owner_id=ob.owner_id returning * into ob;
 return jsonb_build_object('obligation',to_jsonb(ob),'history',to_jsonb(hist));
end $$;
revoke all on function life.complete_obligation(uuid,date,date) from public, anon;
grant execute on function life.complete_obligation(uuid,date,date) to authenticated;
comment on function life.complete_obligation(uuid,date,date) is
 'Owner-or-writable-Life-agent atomic renewal completion. expected_due is the idempotency key; today is the caller local date.';

notify pgrst, 'reload schema';
reset search_path;
commit;
