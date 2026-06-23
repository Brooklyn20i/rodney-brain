-- Cadence — agent_control_events table
--
-- Event queue that Kobe uses to track which Cadence entities it has reviewed,
-- acted on, or escalated. Provides idempotent processing (no double-runs),
-- status lifecycle (pending → processing → processed/failed/ignored), and
-- a payload field for agent state notes without touching work_items schema.
--
-- Kobe workflow:
--   cadence_agent_sweep.py detects changed items → inserts rows here
--   Kobe claims rows (status=processing, claimed_at=now)
--   Kobe acts → updates Cadence → marks rows processed/failed
--   Morning/evening reviews read activity from this table

create table if not exists public.agent_control_events (
  id               uuid        primary key default gen_random_uuid(),
  owner_id         uuid        not null references auth.users(id) on delete cascade default auth.uid(),
  agent_key        text        not null default 'agent:kobe',
  entity_type      text        not null,
  -- work_item | project | person | decision | note | activity
  entity_id        uuid        not null,
  event_type       text        not null,
  -- created | updated | due | overdue | blocked | needs_review | needs_rodney | stale
  priority         text        not null default 'medium'
                               check (priority in ('high', 'medium', 'low')),
  status           text        not null default 'pending'
                               check (status in ('pending', 'processing', 'processed', 'failed', 'ignored')),
  idempotency_key  text        not null,
  payload          jsonb       not null default '{}',
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  claimed_at       timestamptz null,
  processed_at     timestamptz null,
  failed_at        timestamptz null,
  error            text        null,
  deleted_at       timestamptz null
);

-- Idempotency: one event per (owner, agent, key) — prevents double-processing
create unique index if not exists agent_control_events_idempotency_idx
  on public.agent_control_events(owner_id, agent_key, idempotency_key)
  where deleted_at is null;

create index if not exists idx_ace_owner_status
  on public.agent_control_events(owner_id, status)
  where deleted_at is null;

create index if not exists idx_ace_entity
  on public.agent_control_events(entity_type, entity_id)
  where deleted_at is null;

create index if not exists idx_ace_created
  on public.agent_control_events(owner_id, created_at desc);

drop trigger if exists trg_agent_control_events_updated on public.agent_control_events;
create trigger trg_agent_control_events_updated
  before update on public.agent_control_events
  for each row execute function set_updated_at();

alter table public.agent_control_events enable row level security;

drop policy if exists ace_select on public.agent_control_events;
create policy ace_select on public.agent_control_events
  for select using (cadence_can_access(owner_id, false));

drop policy if exists ace_insert on public.agent_control_events;
create policy ace_insert on public.agent_control_events
  for insert with check (cadence_can_access(owner_id, true));

drop policy if exists ace_update on public.agent_control_events;
create policy ace_update on public.agent_control_events
  for update using  (cadence_can_access(owner_id, true))
  with check (cadence_can_access(owner_id, true));

drop policy if exists ace_delete on public.agent_control_events;
create policy ace_delete on public.agent_control_events
  for delete using (cadence_can_access(owner_id, true));

alter publication supabase_realtime add table public.agent_control_events;
