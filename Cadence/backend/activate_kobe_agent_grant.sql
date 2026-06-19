-- Activate Kobe/Hermes access to Rodney's Cadence workspace.
--
-- Prerequisites:
--   1. The dedicated auth user `kobe-agent@cadence.app` exists in Supabase Auth.
--   2. `migrations/0003_kobe_agent.sql` has been applied.
--
-- Safe to re-run. Does not contain passwords or secrets.

insert into public.cadence_agent_access (
  owner_user_id,
  agent_user_id,
  can_read,
  can_write,
  reason
)
select
  owner_user.id,
  agent_user.id,
  true,
  true,
  'Dedicated Kobe agent access to Rodney Cadence workspace'
from auth.users owner_user
join auth.users agent_user on agent_user.email = 'kobe-agent@cadence.app'
where owner_user.email = 'rbalech@gmail.com'
on conflict (owner_user_id, agent_user_id) where revoked_at is null
do update set
  can_read = excluded.can_read,
  can_write = excluded.can_write,
  reason = excluded.reason,
  revoked_at = null,
  updated_at = now();

-- Verification output.
select
  owner_user.email as owner_email,
  agent_user.email as agent_email,
  a.can_read,
  a.can_write,
  a.revoked_at,
  a.created_at,
  a.updated_at
from public.cadence_agent_access a
join auth.users owner_user on owner_user.id = a.owner_user_id
join auth.users agent_user on agent_user.id = a.agent_user_id
where owner_user.email = 'rbalech@gmail.com'
  and agent_user.email = 'kobe-agent@cadence.app'
order by a.created_at desc;
