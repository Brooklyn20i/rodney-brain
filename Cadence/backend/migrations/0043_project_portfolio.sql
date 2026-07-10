-- Portfolio as a real column instead of hard-coded name regexes.
--
-- The web app's project grouping historically matched literal project names
-- (promace / itppm / tendering …) in lib/selectors.ts to derive a portfolio.
-- That breaks silently when a project is renamed. This adds a nullable
-- free-text portfolio label; the app prefers the column and falls back to the
-- legacy regexes only while it is null, so pre-migration clients and existing
-- rows keep working unchanged. Additive and idempotent.

alter table public.projects
  add column if not exists portfolio text;

comment on column public.projects.portfolio is
  'Free-text portfolio/grouping label (e.g. "RAPID Portfolio", "Strategic"). Null = derive from legacy name heuristics.';
