-- Cadence Fitness — agent_messages
--
-- App-side half of the Kobe integration: a message channel Rodney and Kobe
-- (running in his separate Hermes environment) can read and post to. This
-- migration only creates the table + owner RLS; agent access to it (and to
-- the data tables) comes from 0003_agent_access.sql.

do $$ begin
  create type message_sender_type as enum ('user','agent','system');
exception when duplicate_object then null; end $$;
do $$ begin
  create type message_status as enum ('unread','processed');
exception when duplicate_object then null; end $$;

create table if not exists agent_messages (
  id                uuid primary key default gen_random_uuid(),
  owner_id          uuid not null references auth.users(id) on delete cascade default auth.uid(),
  sender_type       message_sender_type not null default 'user',
  sender_label      text not null default 'Rodney',
  body              text not null,
  status            message_status not null default 'unread',
  linked_workout_id uuid references workouts(id) on delete set null,
  linked_date       date,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  deleted_at        timestamptz
);

drop trigger if exists trg_agent_messages_updated on agent_messages;
create trigger trg_agent_messages_updated before update on agent_messages
  for each row execute function set_updated_at();

alter table agent_messages enable row level security;

drop policy if exists agent_messages_select on agent_messages;
create policy agent_messages_select on agent_messages
  for select using (owner_id = auth.uid());

drop policy if exists agent_messages_insert on agent_messages;
create policy agent_messages_insert on agent_messages
  for insert with check (owner_id = auth.uid());

drop policy if exists agent_messages_update on agent_messages;
create policy agent_messages_update on agent_messages
  for update using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

drop policy if exists agent_messages_delete on agent_messages;
create policy agent_messages_delete on agent_messages
  for delete using (owner_id = auth.uid());

do $$ begin
  execute 'alter publication supabase_realtime add table agent_messages';
exception when duplicate_object then null; end $$;

create index if not exists idx_agent_messages_owner on agent_messages(owner_id, created_at desc) where deleted_at is null;
