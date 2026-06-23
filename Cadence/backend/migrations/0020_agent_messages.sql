-- Cadence — first-class agent_messages table
--
-- Replaces the notes-folder hack (__kobe_inbox__ / __kobe_reply__) with a
-- purpose-built table for in-app chat between Rodney and AI agents (Kobe et al).
--
-- Design decisions:
--   - owner_id-scoped via cadence_can_access() RLS (same as all other tables)
--   - No workspace_id: agent chat is personal, not workspace-shared
--   - deleted_at for soft-delete (consistent with store.remove())
--   - status tracks the read/processing lifecycle for the agent polling loop
--   - linked_* columns allow messages to reference existing Cadence entities

create table if not exists public.agent_messages (
  id                  uuid        primary key default gen_random_uuid(),
  owner_id            uuid        not null references auth.users(id) on delete cascade,
  sender_type         text        not null check (sender_type in ('user', 'agent', 'system')),
  sender_id           uuid        null,
  recipient_type      text        not null check (recipient_type in ('user', 'agent', 'workspace')) default 'agent',
  recipient_key       text        null,                         -- e.g. 'agent:kobe'
  body                text        not null,
  status              text        not null default 'unread'
                                  check (status in ('unread', 'processing', 'processed', 'failed')),
  linked_work_item_id uuid        null references public.work_items(id) on delete set null,
  linked_project_id   uuid        null references public.projects(id) on delete set null,
  linked_person_id    uuid        null references public.people(id) on delete set null,
  linked_note_id      uuid        null references public.notes(id) on delete set null,
  metadata            jsonb       not null default '{}',
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  processed_at        timestamptz null,
  deleted_at          timestamptz null
);

-- Indexes
create index if not exists idx_agent_messages_owner
  on public.agent_messages(owner_id)
  where deleted_at is null;

create index if not exists idx_agent_messages_owner_status
  on public.agent_messages(owner_id, status)
  where deleted_at is null;

create index if not exists idx_agent_messages_created
  on public.agent_messages(owner_id, created_at desc);

-- updated_at trigger (reuses the set_updated_at() function from 0001_init.sql)
drop trigger if exists trg_agent_messages_updated on public.agent_messages;
create trigger trg_agent_messages_updated
  before update on public.agent_messages
  for each row execute function set_updated_at();

-- Row-Level Security
alter table public.agent_messages enable row level security;

drop policy if exists agent_messages_select on public.agent_messages;
create policy agent_messages_select on public.agent_messages
  for select using (cadence_can_access(owner_id, false));

drop policy if exists agent_messages_insert on public.agent_messages;
create policy agent_messages_insert on public.agent_messages
  for insert with check (cadence_can_access(owner_id, true));

drop policy if exists agent_messages_update on public.agent_messages;
create policy agent_messages_update on public.agent_messages
  for update using (cadence_can_access(owner_id, true))
  with check (cadence_can_access(owner_id, true));

drop policy if exists agent_messages_delete on public.agent_messages;
create policy agent_messages_delete on public.agent_messages
  for delete using (cadence_can_access(owner_id, true));

-- Realtime (required for instant chat delivery to the browser)
alter publication supabase_realtime add table public.agent_messages;
