# Cadence — Agent & Operator Guide

> **LIVE SYSTEM**: Cadence is a Supabase-backed web PWA + MCP agent.
> The live boundary is described below. Do NOT operate against the legacy
> JSON/Streamlit prototype files in this directory.

---

## Architecture overview

```
Supabase (cloud Postgres + Auth + RLS + Realtime)
  ← single source of truth →
       ▲                  ▲                   ▲
  Web PWA            Agent (MCP)         Native app
  Cadence/web/     Cadence/agent/       Cadence/ (Swift, WIP)
```

---

## Live components — use these

| Path | Purpose |
|------|---------|
| `Cadence/web/` | React PWA — the primary human interface |
| `Cadence/agent/cadence_supabase_mcp.py` | **Live MCP server** — agent tool interface to Cadence |
| `Cadence/agent/cadence_bridge.py` | Supabase REST bridge used by the MCP server |
| `Cadence/backend/migrations/` | Postgres schema — all DB changes go here |

## Agent tooling (cadence_supabase_mcp.py)

The live MCP exposes the following tools:

- `probe` — sanity check, confirms grant + row counts
- `list_open_work_items` — all open work items
- `list_inbox` — untriaged inbox items
- `list_projects` — active projects
- `list_people` — people records
- `list_decisions` — decisions by status
- `list_overdue_items` — open items with past due date
- `list_waiting_items` — open waitingFor items
- `add_inbox_item` — add a work item for Rodney to triage
- `update_work_item` — update any field on a work item
- `triage_inbox_item` — file an inbox item (assign person/project/date)
- `add_decision` — log a new decision
- `update_decision` — resolve or defer a decision
- `complete_work_item` — mark done
- `log_activity` — write to the audit trail

## Agent credentials

Credentials are read from environment variables or macOS Keychain:
- `CADENCE_SUPABASE_URL` — public project URL
- `CADENCE_SUPABASE_ANON_KEY` — public anon key
- `CADENCE_AGENT_EMAIL` — dedicated agent account email
- `CADENCE_AGENT_PASSWORD` or macOS Keychain `cadence-agent-password`
- `CADENCE_OWNER_ID` (optional) — if multiple grants exist

The agent writes with Rodney's `owner_id` so all changes appear in Rodney's workspace.

---

## Legacy / archived — do NOT use for live operations

These files are retained for historical reference only.
They operate against a local JSON file, not Supabase.

| Path | Status |
|------|--------|
| `Cadence/cadence_core.py` | **LEGACY** — local JSON data model |
| `Cadence/cadence_mcp.py` | **LEGACY** — local JSON MCP interface |
| `Cadence/app.py` | **LEGACY** — Streamlit local app |
| `Cadence/cadence_data.seed.json` | **LEGACY** — seed data for local prototype |
| `Cadence/cadence-preview.html` | **LEGACY** — static preview |

The `Cadence/` Swift directory is the in-progress native iOS/iPadOS app. It is
not yet connected to Supabase. Do not treat it as a data source.

---

## Security model

- All Supabase tables have Row-Level Security (RLS). Every row is scoped to `owner_id`.
- `owner_id` is immutable after insert (trigger `trg_immutable_owner_id`).
- The activity table is append-only (trigger `trg_activity_append_only`).
- The agent login uses a dedicated non-owner account with an explicit grant in `cadence_agent_access`.
- Agent writes include Rodney's `owner_id` so they are visible in Rodney's workspace under Rodney's RLS scope.

---

## Data model (canonical — Supabase schema)

See `Cadence/backend/migrations/0001_init.sql` for the full schema.

Key tables: `work_items`, `projects`, `people`, `decisions`, `notes`, `outbox`, `activity`

Item types: `task | decision | followUp | waitingFor | risk | action`
Priority: `high | medium | low`
Decision status: `pending | decided | deferred`
Project status: `active | onHold | completed`
