-- Scalability (applied live via MCP 2026-07-06).
--
-- Index every owner_id / workspace_id column that lacked a leading index.
-- These are the columns RLS filters on for EVERY query in this multi-tenant app
-- (owner_id = (select auth.uid()), plus workspace scoping on the Work schema).
-- Without an index, each query does a sequential scan across ALL tenants' rows,
-- so query time grows with total rows, not per-user rows — the classic
-- multi-tenant scale wall. The big tables (work_items, workouts, budget_lines,
-- …) were already indexed by earlier migrations; this catches the ~31 that were
-- missed (entities, loans, goals, projects, notes, people, decisions,
-- milestones, project_updates, program_days, saved_meals, and the workspace_id
-- columns on comments/links/milestones/etc.).
--
-- Targeted to the RLS predicate columns only — NOT blanket FK indexing (the
-- advisor rightly warns against indexing every FK). Single-column btree is the
-- 80/20: the planner index-scans the owner_id equality, then filters
-- deleted_at / orders by created_at from the heap.

do $$
declare
  r record;
  idxname text;
begin
  for r in
    with cols as (
      select c.table_schema as schema, c.table_name as tbl, c.column_name as col
      from information_schema.columns c
      where c.table_schema in ('public','financial','fitness')
        and c.column_name in ('owner_id','workspace_id')
    ),
    indexed as (
      select n.nspname as schema, t.relname as tbl, a.attname as col
      from pg_index ix
      join pg_class t on t.oid = ix.indrelid
      join pg_namespace n on n.oid = t.relnamespace
      join pg_attribute a on a.attrelid = t.oid and a.attnum = ix.indkey[0]
      where n.nspname in ('public','financial','fitness')
    )
    select cols.schema, cols.tbl, cols.col
    from cols
    where not exists (
      select 1 from indexed i
      where i.schema = cols.schema and i.tbl = cols.tbl and i.col = cols.col
    )
  loop
    idxname := left(r.tbl || '_' || r.col || '_idx', 63);
    execute format('create index if not exists %I on %I.%I (%I)', idxname, r.schema, r.tbl, r.col);
  end loop;
end $$;
