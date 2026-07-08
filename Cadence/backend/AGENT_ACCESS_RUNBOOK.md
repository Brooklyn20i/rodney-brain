# Cadence agent access runbook

This runbook gives Kobe/Hermes proper access to Rodney's Cadence work data without using Rodney's personal login and without giving the agent a Supabase service-role key.

## Access model

- Rodney remains the owner of the workspace rows: `owner_id = Rodney auth user id`.
- Kobe uses a dedicated auth user: `kobe-agent@cadence.app`.
- Access is granted through `public.cadence_agent_access`.
- Row-level security remains enabled on every Cadence data table.
- Kobe can read/write only rows whose `owner_id` has an active grant to the Kobe auth user.
- Revoke access by setting `revoked_at = now()` on the active grant.

This is intentionally broader than a single task list: the grant covers all Cadence operating data tables so Kobe can work with the same cockpit Rodney uses:

- `projects`
- `milestones`
- `project_updates`
- `people`
- `talking_points`
- `work_items`
- `comments`
- `decisions`
- `notes`
- `outbox`
- `links`
- `activity`

## What this does not grant

This does not grant access to:

- Rodney's personal email password
- Supabase service-role key
- GitHub tokens
- other apps/accounts outside Cadence
- database administration outside the policies in this migration

## Activation steps

### 1. Create the dedicated Kobe auth user

In Supabase Dashboard:

1. Open Authentication → Users.
2. Add/create user:
   - Email: `kobe-agent@cadence.app`
   - Password: generate a strong password locally.
   - Confirm email: yes / auto-confirm.
3. Do not paste the password into chat, git, docs, or logs.
4. Store it locally in macOS Keychain on the Kobe machine:

```bash
security add-generic-password \
  -s cadence-agent-password \
  -a kobe-agent@cadence.app \
  -w '<enter-password-locally>' \
  -U
```

### 2. Apply the migration

Run:

```sql
Cadence/backend/migrations/0003_agent_access.sql
```

This creates:

- `public.cadence_agent_access`
- helper function `public.cadence_can_access(row_owner, require_write)`
- dynamic RLS policies for all Cadence operating tables

### 3. Insert the active grant

After the Kobe auth user exists and the migration has run, run:

```sql
Cadence/backend/activate_kobe_agent_grant.sql
```

It grants:

- owner: `rbalech@gmail.com`
- agent: `kobe-agent@cadence.app`
- read: true
- write: true

The grant is idempotent and safe to re-run.

### 4. Verify from Kobe/Hermes

The local bridge should be configured with:

- `CADENCE_SUPABASE_URL`
- `CADENCE_SUPABASE_ANON_KEY`
- `CADENCE_AGENT_EMAIL=kobe-agent@cadence.app`

The password should come only from Keychain service `cadence-agent-password`.

Run:

```bash
cd Cadence/agent
python3 cadence_bridge.py status
python3 cadence_bridge.py probe
```

Expected probe result:

- `ok: true`
- `active_grants >= 1`
- `writable_grants >= 1`
- non-error visible counts for core tables

### 5. Register/refresh MCP tools

Kobe's local Hermes config should register the Cadence MCP server. From this repo:

```bash
hermes mcp add cadence \
  --command python3 \
  --env CADENCE_SUPABASE_URL='<project-url>' CADENCE_SUPABASE_ANON_KEY='<anon-key>' CADENCE_AGENT_EMAIL='kobe-agent@cadence.app' \
  --args /absolute/path/to/Cadence/agent/cadence_supabase_mcp.py

hermes mcp list
hermes gateway restart
```

The password remains in Keychain; do not put it in MCP env.

The `cadence` MCP server should expose tools such as:

- `probe`
- `list_open_work_items`
- `list_inbox`
- `list_projects`
- `list_people`
- `list_decisions`
- `add_inbox_item`
- `complete_work_item`
- `add_activity`

## Revocation

To revoke Kobe access without deleting the user:

```sql
update public.cadence_agent_access
set revoked_at = now()
where agent_user_id = (select id from auth.users where email = 'kobe-agent@cadence.app')
  and owner_id = (select id from auth.users where email = 'rbalech@gmail.com')
  and revoked_at is null;
```

## Verification query

```sql
select
  owner_user.email as owner_email,
  agent_user.email as agent_email,
  a.can_write,
  a.revoked_at,
  a.created_at
from public.cadence_agent_access a
join auth.users owner_user on owner_user.id = a.owner_id
join auth.users agent_user on agent_user.id = a.agent_user_id
order by a.created_at desc;
```
