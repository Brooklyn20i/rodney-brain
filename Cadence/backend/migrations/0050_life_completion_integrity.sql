-- Life release prerequisite after 0049. No data deletion or ownership grants.
-- Atomic, idempotent renewal completion and owner-matched history links.
-- Migration intentionally fails on inconsistent existing data rather than
-- silently repairing or discarding someone's history.
begin;

revoke all on schema life from anon;
revoke all on all tables in schema life from anon;
revoke all on all sequences in schema life from anon;
alter default privileges in schema life revoke all on tables from anon;
alter default privileges in schema life revoke all on sequences from anon;
grant usage on schema life to authenticated;
grant select, insert, update, delete on life.life_items, life.obligations to authenticated;

-- Re-runnable constraints; existing rows are checked, not normalised.
do $$ begin
 if not exists(select 1 from pg_constraint where conrelid='life.obligations'::regclass and conname='obligations_owner_key') then
  alter table life.obligations add constraint obligations_owner_key unique(id,owner_id);
 end if;
 if not exists(select 1 from pg_constraint where conrelid='life.life_items'::regclass and conname='life_items_obligation_owner_fkey') then
  alter table life.life_items add constraint life_items_obligation_owner_fkey foreign key(obligation_id,owner_id) references life.obligations(id,owner_id);
 end if;
 if not exists(select 1 from pg_constraint where conrelid='life.obligations'::regclass and conname='obligations_valid_fields') then
  alter table life.obligations add constraint obligations_valid_fields check (
   length(btrim(name)) > 0 and cadence_months between 1 and 1200 and lead_days between 0 and 3660
   and next_due between date '0001-01-01' and date '9999-12-31'
   and (amount is null or (amount >= 0 and amount <> 'NaN'::numeric))
   and category in ('tax','bills','travel','home','vehicles','health','family','admin'));
 end if;
 if not exists(select 1 from pg_constraint where conrelid='life.life_items'::regclass and conname='life_items_valid_fields') then
  alter table life.life_items add constraint life_items_valid_fields check (
   length(btrim(title)) > 0 and status in ('inbox','open','waiting','done')
   and category in ('tax','bills','travel','home','vehicles','health','family','admin')
   and ((status='done' and completed_at is not null) or (status<>'done' and completed_at is null))
   and (due_date is null or due_date between date '0001-01-01' and date '9999-12-31')
   and (obligation_id is null or (due_date is not null and status='done')));
 end if;
end $$;
-- Include soft-deleted history: deleting a display row never permits the same
-- cycle to be recorded twice or silently advances another cycle on retry.
create unique index if not exists life_obligation_cycle_unique
 on life.life_items(owner_id,obligation_id,due_date) where obligation_id is not null;

-- Restrictive rules survive re-running the older base migration.
-- Only this owner-checked atomic RPC writes renewal history.
drop policy if exists life_history_insert_guard on life.life_items;
create policy life_history_insert_guard on life.life_items as restrictive
 for insert to authenticated with check (obligation_id is null);
drop policy if exists life_history_update_guard on life.life_items;
create policy life_history_update_guard on life.life_items as restrictive
 for update to authenticated using (obligation_id is null) with check (obligation_id is null);
drop policy if exists life_history_delete_guard on life.life_items;
create policy life_history_delete_guard on life.life_items as restrictive
 for delete to authenticated using (obligation_id is null);

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
 -- Row lock serialises two devices. This narrowly-scoped DEFINER function
 -- explicitly checks auth.uid on every read/write; clients cannot mutate
 -- cycle history directly. The fixed search_path prevents object shadowing.
 select * into ob from life.obligations
 where id=p_obligation_id and owner_id=auth.uid() and deleted_at is null for update;
 if not found then raise exception 'Obligation unavailable' using errcode='42501'; end if;
 select * into hist from life.life_items
 where owner_id=auth.uid() and obligation_id=ob.id and due_date=p_expected_due;
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
 values(auth.uid(),ob.name,ob.notes,'done',ob.category,p_expected_due,ob.id,now()) returning * into hist;
 update life.obligations set next_due=next_date where id=ob.id and owner_id=auth.uid() returning * into ob;
 return jsonb_build_object('obligation',to_jsonb(ob),'history',to_jsonb(hist));
end $$;
revoke all on function life.complete_obligation(uuid,date,date) from public, anon;
grant execute on function life.complete_obligation(uuid,date,date) to authenticated;
comment on function life.complete_obligation(uuid,date,date) is
 'Owner-only atomic renewal completion. expected_due is the idempotency key; today is the caller local date.';
notify pgrst, 'reload schema';
commit;
