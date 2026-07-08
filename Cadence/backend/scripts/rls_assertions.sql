-- Cadence RLS negative / security assertions.
--
-- CI-only: this is intentionally not a numbered migration and is never applied
-- to production. It runs after replay_migrations.sh against the ephemeral
-- GitHub Actions Postgres service and fails the build on the first violated
-- security invariant.

\set ON_ERROR_STOP on

\if :{?CADENCE_CI_RLS_ASSERTIONS}
\else
\echo 'Refusing to run: pass -v CADENCE_CI_RLS_ASSERTIONS=1 against an ephemeral CI/local database.'
\quit 3
\endif

begin;

-- Supabase/PostgREST grants baseline privileges to API roles. The replay shim
-- creates those roles only, so grant DML here to ensure these assertions test
-- RLS predicates rather than missing table privileges. These grants are inside
-- the transaction and are rolled back with the fixtures below.
grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on all tables in schema public to anon, authenticated;

-- ── Fixtures, inserted as postgres so RLS does not hide setup rows ───────────
insert into auth.users (id, email) values
  ('a0000000-0000-4000-8000-000000000001', 'owner-a@test'),
  ('c0000000-0000-4000-8000-000000000003', 'stranger-c@test'),
  ('d0000000-0000-4000-8000-00000000000a', 'agent-rw@test'),
  ('d0000000-0000-4000-8000-00000000000b', 'agent-ro@test'),
  ('d0000000-0000-4000-8000-00000000000c', 'agent-rev@test'),
  ('e0000000-0000-4000-8000-000000000001', 'ws1-editor@test'),
  ('e0000000-0000-4000-8000-000000000002', 'ws1-viewer@test'),
  ('e0000000-0000-4000-8000-000000000003', 'ws2-member@test')
on conflict (email) do nothing;

insert into public.projects (id, owner_id, name, goal) values
  ('a1111111-0000-4000-8000-000000000001',
   'a0000000-0000-4000-8000-000000000001', 'A secret project', 'isolation');

insert into public.activity (owner_id, actor, action, detail) values
  ('a0000000-0000-4000-8000-000000000001', 'seed', 'rls_assert_seed', 'append-only target');

insert into public.cadence_agent_access (owner_id, agent_user_id, can_write, revoked_at) values
  ('a0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-00000000000a', true,  null),
  ('a0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-00000000000b', false, null),
  ('a0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-00000000000c', true,  now())
on conflict (owner_id, agent_user_id) do nothing;

insert into public.workspaces (id, name, created_by) values
  ('b1111111-0000-4000-8000-000000000001', 'WS1', 'e0000000-0000-4000-8000-000000000001'),
  ('b2222222-0000-4000-8000-000000000002', 'WS2', 'e0000000-0000-4000-8000-000000000003');

insert into public.workspace_members (workspace_id, user_id, role) values
  ('b1111111-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000001', 'editor'),
  ('b1111111-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000002', 'viewer'),
  ('b2222222-0000-4000-8000-000000000002', 'e0000000-0000-4000-8000-000000000003', 'admin');

insert into public.projects (id, owner_id, name, goal, workspace_id) values
  ('c1111111-0000-4000-8000-000000000001',
   'e0000000-0000-4000-8000-000000000001', 'WS1 project', 'ws-isolation',
   'b1111111-0000-4000-8000-000000000001');

create or replace function pg_temp.assert_visible_count(
  sub uuid,
  q text,
  expected bigint,
  label text
) returns void language plpgsql as $$
declare n bigint;
begin
  perform set_config('request.jwt.claim.sub', sub::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  set local role authenticated;
  execute q into n;
  reset role;

  if n <> expected then
    raise exception 'FAIL[%]: expected % rows, got %', label, expected, n;
  end if;
end $$;

create or replace function pg_temp.assert_blocked(
  sub uuid,
  stmt text,
  label text
) returns void language plpgsql as $$
declare blocked boolean := false;
begin
  perform set_config('request.jwt.claim.sub', sub::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  set local role authenticated;

  begin
    execute stmt;
  exception when others then
    blocked := true;
  end;

  reset role;

  if not blocked then
    raise exception 'FAIL[%]: statement was NOT blocked', label;
  end if;
end $$;

create or replace function pg_temp.assert_rowcount(
  sub uuid,
  stmt text,
  expected bigint,
  label text
) returns void language plpgsql as $$
declare n bigint;
begin
  perform set_config('request.jwt.claim.sub', sub::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  set local role authenticated;
  execute stmt;
  get diagnostics n = row_count;
  reset role;

  if n <> expected then
    raise exception 'FAIL[%]: expected % rows affected, got %', label, expected, n;
  end if;
end $$;

-- ── Owner and workspace isolation ────────────────────────────────────────────
select pg_temp.assert_visible_count(
  'a0000000-0000-4000-8000-000000000001',
  $$select count(*) from public.projects where id = 'a1111111-0000-4000-8000-000000000001'$$,
  1,
  'owner-A-sees-own'
);

select pg_temp.assert_visible_count(
  'c0000000-0000-4000-8000-000000000003',
  $$select count(*) from public.projects where owner_id = 'a0000000-0000-4000-8000-000000000001'$$,
  0,
  'stranger-cannot-read-A'
);

select pg_temp.assert_rowcount(
  'c0000000-0000-4000-8000-000000000003',
  $$update public.projects set name = 'hijacked' where owner_id = 'a0000000-0000-4000-8000-000000000001'$$,
  0,
  'stranger-update-0-rows'
);

select pg_temp.assert_rowcount(
  'c0000000-0000-4000-8000-000000000003',
  $$delete from public.projects where owner_id = 'a0000000-0000-4000-8000-000000000001'$$,
  0,
  'stranger-delete-0-rows'
);

select pg_temp.assert_blocked(
  'c0000000-0000-4000-8000-000000000003',
  $$insert into public.projects (owner_id, name, goal)
    values ('a0000000-0000-4000-8000-000000000001', 'forged', 'x')$$,
  'stranger-cannot-insert-as-A'
);

select pg_temp.assert_visible_count(
  'e0000000-0000-4000-8000-000000000003',
  $$select count(*) from public.projects where workspace_id = 'b1111111-0000-4000-8000-000000000001'$$,
  0,
  'ws2-cannot-read-ws1'
);

select pg_temp.assert_visible_count(
  'e0000000-0000-4000-8000-000000000002',
  $$select count(*) from public.projects where workspace_id = 'b1111111-0000-4000-8000-000000000001'$$,
  1,
  'ws1-viewer-can-read'
);

select pg_temp.assert_blocked(
  'e0000000-0000-4000-8000-000000000002',
  $$insert into public.projects (owner_id, name, goal, workspace_id)
    values ('e0000000-0000-4000-8000-000000000001', 'viewer-write', 'x',
            'b1111111-0000-4000-8000-000000000001')$$,
  'ws1-viewer-cannot-insert'
);

-- ── Agent grant behavior ────────────────────────────────────────────────────
do $$
begin
  if (select column_default from information_schema.columns
      where table_schema = 'public'
        and table_name = 'cadence_agent_access'
        and column_name = 'can_write') not ilike '%false%' then
    raise exception 'FAIL[agent-default]: can_write default is not false';
  end if;
end $$;

select pg_temp.assert_visible_count(
  'd0000000-0000-4000-8000-00000000000b',
  $$select count(*) from public.projects where owner_id = 'a0000000-0000-4000-8000-000000000001'$$,
  1,
  'agent-ro-can-read'
);

select pg_temp.assert_blocked(
  'd0000000-0000-4000-8000-00000000000b',
  $$insert into public.projects (owner_id, name, goal)
    values ('a0000000-0000-4000-8000-000000000001', 'ro-write', 'x')$$,
  'agent-ro-cannot-insert'
);

select pg_temp.assert_rowcount(
  'd0000000-0000-4000-8000-00000000000b',
  $$update public.projects set name = 'ro' where owner_id = 'a0000000-0000-4000-8000-000000000001'$$,
  0,
  'agent-ro-update-0-rows'
);

select pg_temp.assert_visible_count(
  'd0000000-0000-4000-8000-00000000000c',
  $$select count(*) from public.projects where owner_id = 'a0000000-0000-4000-8000-000000000001'$$,
  0,
  'agent-revoked-blind'
);

select pg_temp.assert_blocked(
  'd0000000-0000-4000-8000-00000000000a',
  $$update public.projects set owner_id = 'd0000000-0000-4000-8000-00000000000a'
    where id = 'a1111111-0000-4000-8000-000000000001'$$,
  'agent-rw-cannot-steal-owner'
);

-- ── Same-owner child-row guard ───────────────────────────────────────────────
select pg_temp.assert_blocked(
  'a0000000-0000-4000-8000-000000000001',
  $$insert into public.work_items (owner_id, project_id, title, type)
    values ('a0000000-0000-4000-8000-000000000001',
            'c1111111-0000-4000-8000-000000000001', 'cross-owner child', 'task')$$,
  'work-item-cross-owner-project-blocked'
);

-- ── Append-only activity ────────────────────────────────────────────────────
-- Later workspace RLS migrations may recreate permissive-looking UPDATE/DELETE
-- policies on activity as part of generic policy rewriting. The hard guarantee
-- is the append-only trigger below, which must block tampering even for a
-- table-owner/superuser-style connection.
do $$
declare blocked boolean := false;
begin
  begin
    update public.activity set detail = 'tamper' where action = 'rls_assert_seed';
  exception when others then
    blocked := true;
  end;

  if not blocked then
    raise exception 'FAIL[activity-update]: trigger did not block UPDATE';
  end if;
end $$;

do $$
declare blocked boolean := false;
begin
  begin
    delete from public.activity where action = 'rls_assert_seed';
  exception when others then
    blocked := true;
  end;

  if not blocked then
    raise exception 'FAIL[activity-delete]: trigger did not block DELETE';
  end if;
end $$;

rollback;

\echo 'RLS negative / security assertions: PASS'
