-- Grant service_role access to the financial + fitness schemas
--
-- Migrations 0022/0023 granted usage on the new schemas to `authenticated` and
-- `anon` only. Supabase auto-grants `service_role` on `public`, but not on
-- custom schemas -- so Edge Functions (which use SUPABASE_SERVICE_ROLE_KEY),
-- e.g. health-ingest writing into fitness.body_metrics, failed with
-- "permission denied for schema fitness". This grants service_role the same
-- access it has on public. service_role bypasses RLS by design; that's correct
-- for trusted server-side functions (the health-ingest function does its own
-- bearer-token auth before writing). Idempotent.

do $$
declare s text;
begin
  foreach s in array array['financial','fitness']
  loop
    execute format('grant usage on schema %I to service_role', s);
    execute format('grant all on all tables in schema %I to service_role', s);
    execute format('grant all on all sequences in schema %I to service_role', s);
    execute format('grant all on all functions in schema %I to service_role', s);
    execute format('alter default privileges in schema %I grant all on tables to service_role', s);
    execute format('alter default privileges in schema %I grant all on sequences to service_role', s);
  end loop;
end $$;
