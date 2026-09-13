-- Cadence Life scoped agent-access assertions.
--
-- CI/local only: run after canonical migration replay against an ephemeral
-- database. Never apply to production. Fails closed unless explicitly enabled.

\set ON_ERROR_STOP on

\if :{?CADENCE_CI_LIFE_AGENT_ASSERTIONS}
\else
\echo 'Refusing to run: pass -v CADENCE_CI_LIFE_AGENT_ASSERTIONS=1 against an ephemeral CI/local database.'
\quit 3
\endif

begin;

insert into auth.users (id, email) values
  ('aa000000-0000-4000-8000-000000000001', 'life-owner-a@test'),
  ('aa000000-0000-4000-8000-000000000002', 'life-owner-b@test'),
  ('aa000000-0000-4000-8000-000000000003', 'life-stranger@test'),
  ('aa000000-0000-4000-8000-000000000004', 'life-ungranted-owner@test'),
  ('aa000000-0000-4000-8000-00000000000a', 'life-agent-rw@test'),
  ('aa000000-0000-4000-8000-00000000000b', 'life-agent-ro@test'),
  ('aa000000-0000-4000-8000-00000000000c', 'life-agent-revoked@test'),
  ('aa000000-0000-4000-8000-00000000000d', 'life-agent-work-only@test')
on conflict (email) do nothing;

insert into life.life_items (id, owner_id, title, status, category) values
  ('ab000000-0000-4000-8000-000000000001', 'aa000000-0000-4000-8000-000000000001', 'Owner A admin', 'open', 'admin'),
  ('ab000000-0000-4000-8000-000000000002', 'aa000000-0000-4000-8000-000000000002', 'Owner B admin', 'open', 'admin');

insert into life.obligations (id, owner_id, name, category, cadence_months, next_due, lead_days) values
  ('ac000000-0000-4000-8000-000000000001', 'aa000000-0000-4000-8000-000000000001', 'Owner A renewal', 'bills', 1, '2026-01-31', 14),
  ('ac000000-0000-4000-8000-000000000002', 'aa000000-0000-4000-8000-000000000001', 'Read only renewal', 'bills', 1, '2026-02-28', 14),
  ('ac000000-0000-4000-8000-000000000003', 'aa000000-0000-4000-8000-000000000001', 'Revoked renewal', 'bills', 1, '2026-03-31', 14),
  ('ac000000-0000-4000-8000-000000000004', 'aa000000-0000-4000-8000-000000000001', 'Revocation renewal', 'bills', 1, '2026-04-30', 14);

insert into life.life_agent_access (owner_id, agent_user_id, can_read, can_write, reason, revoked_at) values
  ('aa000000-0000-4000-8000-000000000001', 'aa000000-0000-4000-8000-00000000000a', true, true, 'rw fixture', null),
  ('aa000000-0000-4000-8000-000000000002', 'aa000000-0000-4000-8000-00000000000a', true, true, 'rw fixture second owner', null),
  ('aa000000-0000-4000-8000-000000000001', 'aa000000-0000-4000-8000-00000000000b', true, false, 'ro fixture', null),
  ('aa000000-0000-4000-8000-000000000001', 'aa000000-0000-4000-8000-00000000000c', true, true, 'revoked fixture', now());

-- Work-domain grants must not confer Life-domain access.
insert into public.cadence_agent_access (owner_id, agent_user_id, can_write, revoked_at) values
  ('aa000000-0000-4000-8000-000000000001', 'aa000000-0000-4000-8000-00000000000d', true, null)
on conflict (owner_id, agent_user_id) do nothing;

create or replace function pg_temp.as_user(sub uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', sub::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  set local role authenticated;
end $$;

create or replace function pg_temp.reset_user() returns void language plpgsql as $$
begin
  reset role;
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claim.role', '', true);
end $$;

create or replace function pg_temp.assert_visible_count(sub uuid, q text, expected bigint, label text) returns void language plpgsql as $$
declare n bigint;
begin
  perform pg_temp.as_user(sub);
  execute q into n;
  perform pg_temp.reset_user();
  if n <> expected then raise exception 'FAIL[%]: expected % rows, got %', label, expected, n; end if;
end $$;

create or replace function pg_temp.assert_rowcount(sub uuid, stmt text, expected bigint, label text) returns void language plpgsql as $$
declare n bigint;
begin
  perform pg_temp.as_user(sub);
  execute stmt;
  get diagnostics n = row_count;
  perform pg_temp.reset_user();
  if n <> expected then raise exception 'FAIL[%]: expected % rows affected, got %', label, expected, n; end if;
end $$;

create or replace function pg_temp.assert_blocked(sub uuid, stmt text, expected_sqlstate text, label text) returns void language plpgsql as $$
declare actual_sqlstate text := null;
begin
  perform pg_temp.as_user(sub);
  begin
    execute stmt;
  exception when others then
    actual_sqlstate := sqlstate;
  end;
  perform pg_temp.reset_user();
  if actual_sqlstate is null then
    raise exception 'FAIL[%]: statement was NOT blocked', label;
  end if;
  if expected_sqlstate is not null and actual_sqlstate <> expected_sqlstate then
    raise exception 'FAIL[%]: expected SQLSTATE %, got %', label, expected_sqlstate, actual_sqlstate;
  end if;
end $$;

-- Grant table: owner manages; agent reads own grant only; agent cannot self-grant/escalate.
select pg_temp.assert_visible_count('aa000000-0000-4000-8000-000000000001', $$select count(*) from life.life_agent_access where owner_id='aa000000-0000-4000-8000-000000000001'$$, 3, 'owner-sees-own-grants');
select pg_temp.assert_visible_count('aa000000-0000-4000-8000-00000000000a', $$select count(*) from life.life_agent_access where agent_user_id='aa000000-0000-4000-8000-00000000000a' and revoked_at is null$$, 2, 'agent-sees-own-grants');
select pg_temp.assert_visible_count('aa000000-0000-4000-8000-000000000003', $$select count(*) from life.life_agent_access$$, 0, 'stranger-sees-no-grants');
select pg_temp.assert_blocked('aa000000-0000-4000-8000-00000000000a', $$insert into life.life_agent_access(owner_id,agent_user_id,can_read,can_write) values('aa000000-0000-4000-8000-000000000004','aa000000-0000-4000-8000-00000000000a',true,true)$$, '42501', 'agent-cannot-self-grant-target-owner');
select pg_temp.assert_rowcount('aa000000-0000-4000-8000-00000000000b', $$update life.life_agent_access set can_write=true where owner_id='aa000000-0000-4000-8000-000000000001' and agent_user_id='aa000000-0000-4000-8000-00000000000b'$$, 0, 'agent-ro-cannot-escalate-grant');
select pg_temp.assert_rowcount('aa000000-0000-4000-8000-000000000001', $$update life.life_agent_access set can_write=true where owner_id='aa000000-0000-4000-8000-000000000001' and agent_user_id='aa000000-0000-4000-8000-00000000000b'$$, 1, 'owner-can-manage-grant');
select pg_temp.assert_rowcount('aa000000-0000-4000-8000-000000000001', $$update life.life_agent_access set can_write=false where owner_id='aa000000-0000-4000-8000-000000000001' and agent_user_id='aa000000-0000-4000-8000-00000000000b'$$, 1, 'owner-can-restore-readonly-grant');
select pg_temp.assert_blocked('aa000000-0000-4000-8000-000000000001', $$update life.life_agent_access set agent_user_id='aa000000-0000-4000-8000-00000000000c' where owner_id='aa000000-0000-4000-8000-000000000001' and agent_user_id='aa000000-0000-4000-8000-00000000000b'$$, '42501', 'owner-cannot-reassign-grant-principal');

-- Life data isolation and grant lifecycle.
select pg_temp.assert_visible_count('aa000000-0000-4000-8000-000000000001', $$select count(*) from life.life_items where owner_id='aa000000-0000-4000-8000-000000000001'$$, 1, 'owner-sees-own-life');
select pg_temp.assert_visible_count('aa000000-0000-4000-8000-000000000003', $$select count(*) from life.life_items where owner_id='aa000000-0000-4000-8000-000000000001'$$, 0, 'stranger-excluded');
select pg_temp.assert_visible_count('aa000000-0000-4000-8000-00000000000d', $$select count(*) from life.life_items where owner_id='aa000000-0000-4000-8000-000000000001'$$, 0, 'work-grant-does-not-reuse-life');
select pg_temp.assert_visible_count('aa000000-0000-4000-8000-00000000000a', $$select count(*) from life.life_items where owner_id='aa000000-0000-4000-8000-000000000001'$$, 1, 'agent-rw-can-read-life');
select pg_temp.assert_rowcount('aa000000-0000-4000-8000-00000000000a', $$insert into life.life_items(owner_id,title,status,category) values('aa000000-0000-4000-8000-000000000001','agent inserted','open','admin')$$, 1, 'agent-rw-can-insert-life');
select pg_temp.assert_blocked('aa000000-0000-4000-8000-00000000000b', $$insert into life.life_items(owner_id,title,status,category) values('aa000000-0000-4000-8000-000000000001','ro inserted','open','admin')$$, '42501', 'agent-ro-cannot-insert-life');
select pg_temp.assert_rowcount('aa000000-0000-4000-8000-00000000000b', $$update life.life_items set notes='ro edit' where owner_id='aa000000-0000-4000-8000-000000000001'$$, 0, 'agent-ro-cannot-update-life');
select pg_temp.assert_visible_count('aa000000-0000-4000-8000-00000000000c', $$select count(*) from life.life_items where owner_id='aa000000-0000-4000-8000-000000000001'$$, 0, 'revoked-agent-blind');

-- Canonical owner_id remains immutable even when one agent has writable grants to both owners.
select pg_temp.assert_blocked('aa000000-0000-4000-8000-00000000000a', $$update life.life_items set owner_id='aa000000-0000-4000-8000-000000000002' where id='ab000000-0000-4000-8000-000000000001'$$, '42501', 'agent-cannot-reparent-life-item');
select pg_temp.assert_blocked('aa000000-0000-4000-8000-00000000000a', $$update life.obligations set owner_id='aa000000-0000-4000-8000-000000000002' where id='ac000000-0000-4000-8000-000000000001'$$, '42501', 'agent-cannot-reparent-obligation');

-- History rows are still forged only by the atomic completion RPC, not direct DML.
select pg_temp.assert_blocked('aa000000-0000-4000-8000-00000000000a', $$insert into life.life_items(owner_id,title,status,category,due_date,obligation_id,completed_at) values('aa000000-0000-4000-8000-000000000001','forged history','done','bills','2026-01-31','ac000000-0000-4000-8000-000000000001',now())$$, '42501', 'agent-cannot-forge-history');

-- Completion RPC: owner OR writable grant may complete; it operates on ob.owner_id and is idempotent.
do $$
declare first_result jsonb; retry_result jsonb;
begin
  perform pg_temp.as_user('aa000000-0000-4000-8000-00000000000a');
  first_result := life.complete_obligation('ac000000-0000-4000-8000-000000000001', '2026-01-31', '2026-02-01');
  retry_result := life.complete_obligation('ac000000-0000-4000-8000-000000000001', '2026-01-31', '2026-02-01');
  perform pg_temp.reset_user();

  if first_result->'history'->>'owner_id' <> 'aa000000-0000-4000-8000-000000000001' then
    raise exception 'FAIL[rpc-owner-stamp]: history owner_id was %', first_result->'history'->>'owner_id';
  end if;
  if retry_result->'history'->>'id' <> first_result->'history'->>'id' then
    raise exception 'FAIL[rpc-idempotent]: retry returned different history row';
  end if;
  if (select count(*) from life.life_items where obligation_id='ac000000-0000-4000-8000-000000000001') <> 1 then
    raise exception 'FAIL[rpc-idempotent-count]: retry duplicated history';
  end if;
  if (select next_due from life.obligations where id='ac000000-0000-4000-8000-000000000001') <> '2026-02-28'::date then
    raise exception 'FAIL[rpc-next-due]: unexpected next_due';
  end if;
end $$;

select pg_temp.assert_rowcount('aa000000-0000-4000-8000-00000000000a', $$update life.life_items set title='mutated history' where obligation_id='ac000000-0000-4000-8000-000000000001'$$, 0, 'agent-cannot-update-history');
select pg_temp.assert_rowcount('aa000000-0000-4000-8000-00000000000a', $$delete from life.life_items where obligation_id='ac000000-0000-4000-8000-000000000001'$$, 0, 'agent-cannot-delete-history');
select pg_temp.assert_blocked('aa000000-0000-4000-8000-00000000000b', $$select life.complete_obligation('ac000000-0000-4000-8000-000000000002', '2026-02-28', '2026-03-01')$$, '42501', 'read-only-agent-cannot-complete');
select pg_temp.assert_blocked('aa000000-0000-4000-8000-00000000000c', $$select life.complete_obligation('ac000000-0000-4000-8000-000000000003', '2026-03-31', '2026-04-01')$$, '42501', 'revoked-agent-cannot-complete');

-- Actual grant revocation must immediately remove read/write/RPC access.
select pg_temp.assert_rowcount('aa000000-0000-4000-8000-000000000001', $$update life.life_agent_access set revoked_at=now() where owner_id='aa000000-0000-4000-8000-000000000001' and agent_user_id='aa000000-0000-4000-8000-00000000000a' and revoked_at is null$$, 1, 'owner-revokes-active-rw-grant');
select pg_temp.assert_visible_count('aa000000-0000-4000-8000-00000000000a', $$select count(*) from life.life_items where owner_id='aa000000-0000-4000-8000-000000000001'$$, 0, 'revoked-active-agent-loses-read');
select pg_temp.assert_blocked('aa000000-0000-4000-8000-00000000000a', $$insert into life.life_items(owner_id,title,status,category) values('aa000000-0000-4000-8000-000000000001','post revoke write','open','admin')$$, '42501', 'revoked-active-agent-loses-write');
select pg_temp.assert_blocked('aa000000-0000-4000-8000-00000000000a', $$select life.complete_obligation('ac000000-0000-4000-8000-000000000004', '2026-04-30', '2026-05-01')$$, '42501', 'revoked-active-agent-loses-rpc');

rollback;

\echo 'Life agent access assertions: PASS'
