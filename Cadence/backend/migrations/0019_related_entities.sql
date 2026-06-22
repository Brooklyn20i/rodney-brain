-- Adds a JSONB array of related entities to work_items so one task can link
-- to multiple people, projects, and meeting notes without extra join tables.
-- Each entry: { "type": "person"|"project"|"note", "id": "uuid", "name": "text" }
--
-- Backward compat: person_id and project_id remain the primary denormalized
-- fields; related_entities stores the full list including the primary entity.
-- The app reads related_entities when present; old rows without it continue
-- to use person_id / project_id as before.

alter table public.work_items
  add column if not exists related_entities jsonb not null default '[]'::jsonb;
