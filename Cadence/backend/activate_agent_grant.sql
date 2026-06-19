-- Cadence — activate a dedicated agent grant
--
-- Run after migrations/0003_agent_access.sql.
-- Replace the two placeholder emails in the CTE. Do not commit real secrets.
-- The agent signs in as its own Supabase Auth user with the public anon key.

with config as (
  select
    '<OWNER_AUTH_EMAIL>'::text as owner_email,
    '<AGENT_AUTH_EMAIL>'::text as agent_email
), users as (
  select
    owner_user.id as owner_id,
    agent_user.id as agent_user_id
  from config
  join auth.users owner_user on lower(owner_user.email) = lower(config.owner_email)
  join auth.users agent_user on lower(agent_user.email) = lower(config.agent_email)
)
insert into public.cadence_agent_access (owner_id, agent_user_id, can_write, note)
select owner_id, agent_user_id, true, 'Kobe/Hermes delegated Cadence access'
from users
on conflict (owner_id, agent_user_id)
do update set can_write = excluded.can_write,
              note = excluded.note,
              revoked_at = null;

-- Verify: should return one active grant.
select owner_id, agent_user_id, can_write, created_at, revoked_at
from public.cadence_agent_access
where revoked_at is null;
