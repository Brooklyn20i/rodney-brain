-- Least privilege (applied live via MCP 2026-07-06).
--
-- Two conflicting 0003 migration files both CREATE TABLE IF NOT EXISTS
-- cadence_agent_access; the live database has the more permissive variant
-- (owner_id / can_write DEFAULT TRUE — verified against information_schema).
-- Flip the default so a future user granting an agent gets READ-ONLY access
-- unless they explicitly opt into write. The single existing grant
-- (Rodney -> Kobe, can_write=true) is unchanged.
--
-- Follow-up recorded in the QA backlog: retire the superseded 0003 variant so
-- the migration chain has one canonical definition of this security table.

alter table public.cadence_agent_access alter column can_write set default false;
