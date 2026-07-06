-- Performance hardening (applied live via MCP 2026-07-06).
--
-- Wrap auth.uid()/auth.jwt()/auth.role() in every RLS policy expression as
-- (select auth.*()) so Postgres evaluates them ONCE per query (an initplan)
-- instead of re-running them per row. This is a semantically-identical
-- transform — same value, same access decision — so RLS isolation is unchanged
-- (verified: an owner still sees only their own rows; a stranger sees zero).
-- Done via ALTER POLICY so each policy's command/roles/other clauses are
-- preserved. Clears the auth_rls_initplan advisor across 156 policies in
-- public + financial + fitness.
--
-- Skipped deliberately (documented in the QA backlog, not applied):
--  * Blanket FK indexes — the advisor itself warns against indexing every FK;
--    add selectively on hot read paths instead.
--  * Merging the overlapping *_all + per-action policies on public
--    project_phases / raid_items / stakeholders — risk > benefit on 3 low-
--    traffic tables; revisit if they grow.
--  * Leaked-password protection — a Supabase Auth setting, needs the dashboard
--    or a fresh management token.

do $$
declare
  p record;
  nq text;
  nc text;
  stmt text;
begin
  for p in
    select schemaname, tablename, policyname, qual, with_check
    from pg_policies
    where schemaname in ('public','financial','fitness')
      and (
        (qual is not null and qual ~ 'auth\.(uid|jwt|role)\(\)' and qual !~ 'select auth\.')
        or (with_check is not null and with_check ~ 'auth\.(uid|jwt|role)\(\)' and with_check !~ 'select auth\.')
      )
  loop
    nq := p.qual;
    nc := p.with_check;
    if nq is not null then
      nq := replace(nq, 'auth.uid()', '(select auth.uid())');
      nq := replace(nq, 'auth.jwt()', '(select auth.jwt())');
      nq := replace(nq, 'auth.role()', '(select auth.role())');
    end if;
    if nc is not null then
      nc := replace(nc, 'auth.uid()', '(select auth.uid())');
      nc := replace(nc, 'auth.jwt()', '(select auth.jwt())');
      nc := replace(nc, 'auth.role()', '(select auth.role())');
    end if;
    stmt := format('alter policy %I on %I.%I', p.policyname, p.schemaname, p.tablename);
    if nq is not null then stmt := stmt || format(' using (%s)', nq); end if;
    if nc is not null then stmt := stmt || format(' with check (%s)', nc); end if;
    execute stmt;
  end loop;
end $$;
