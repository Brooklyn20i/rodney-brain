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

## The unified super app

Cadence Work, Cadence Financial and Cadence Fitness were originally three
separate deployments (each its own Supabase project + Vercel project). They
are now merged into **one app, one login, one Supabase project** — a sidebar
domain switcher (Work / Financial / Fitness) instead of three separate URLs.
This was done because Supabase's free tier caps an org at 2 active projects,
and because "one app" was the actual goal, not just a shared database.

```
Supabase (ONE project — Cadence Work's) — three schemas, one auth:
  public.*      Work's tables (unchanged — workspace-aware, multi-tenant)
  financial.*   Financial's tables (owner_id only, single-user, unchanged data model)
  fitness.*     Fitness's tables (owner_id only, single-user, unchanged data model)
       ▲
  Cadence/web/  — ONE React app, ONE login
    src/               Work's own screens/lib (untouched)
    src/financial/     Financial's screens/lib, ported almost verbatim
    src/fitness/       Fitness's screens/lib, ported almost verbatim
```

**Why schemas, not one flat `public` schema or three renamed-table sets**:
Postgres schemas namespace table names for free — `financial.decisions` and
`fitness.agent_messages` can coexist with Work's own `public.decisions` and
`public.agent_messages` (all three domains happen to reuse those exact table
names) with zero renaming. See `Cadence/backend/migrations/0022_financial_schema.sql`
and `0023_fitness_schema.sql` — both are the original CadenceFinancial/
CadenceFitness migrations, ported near-verbatim, just wrapped in
`create schema if not exists <domain>; set search_path to <domain>, public;`
plus the grants PostgREST needs on a non-public schema. **After running
either migration, go to Supabase → Database → API Settings → "Exposed
schemas" and add `financial` / `fitness`** — PostgREST only serves `public`
by default.

**Auth is unified**: Financial's and Fitness's own login/signup/password
screens are gone — the single Login/SetPassword gate at the top of
`Cadence/web/src/App.tsx` covers all three domains, since they now share one
Supabase Auth. `src/financial/lib/store.tsx` and `src/fitness/lib/store.tsx`
are *data-only* contexts now (no `ready`/`configured`/`signIn`/`signOut` —
that's all Work's `useCadence()`); they just track the current user id to
stamp `owner_id` on writes, and every Supabase call is schema-qualified via
`supabase.schema('financial')` / `supabase.schema('fitness')`.

**Routing**: the sidebar domain switcher and each domain's own nav render
from `Cadence/web/src/components/Sidebar.tsx` (`WORK_NAV` / `FINANCIAL_NAV` /
`FITNESS_NAV`). Financial's and Fitness's screen ids are prefixed
(`financial:overview`, `fitness:dashboard`, …) in the shared `screen` state so
they can never collide with Work's own bare ids (both Work and Fitness
happen to have a `dashboard` and a `kobe` screen) — the active `domain` is
*derived* from that prefix in `App.tsx`, never tracked as separate state, so
it can't drift out of sync with what's on screen.

**Agents**: each domain keeps its own Kobe/agent-chat screen (Work's is the
rich tabbed hub; Financial's and Fitness's are simple message threads, using
`.agent-thread`/`.agent-msg*` CSS — deliberately NOT `.kobe-*`, which is
Work's own richer UI, so the two don't visually collide). `Cadence/agent/`
now holds an MCP bridge per domain: `cadence_bridge.py`/`cadence_supabase_mcp.py`
(Work, `public` schema), `cadence_fitness_bridge.py`/`cadence_fitness_mcp.py`
(Fitness, `fitness` schema) and `cadence_financial_bridge.py`/`cadence_financial_mcp.py`
(Financial, `financial` schema) — all against the same Supabase project, same
URL/anon key, differing only by the `Accept-Profile`/`Content-Profile` schema
header on every REST call. Each non-Work schema is reached by the agent through
a grant-gated access table: `fitness.fitness_agent_access` (migration 0023) and
`financial.financial_agent_access` (migration 0024), mirroring Work's
`public.cadence_agent_access`. So Kobe/Hermes has read/write across the whole
super app via one agent account (`rbalech+cadence-kobe@gmail.com`), one grant
per schema. The Hermes MCP servers are registered as `cadence`,
`cadence_fitness` and `cadence_financial` in `~/.hermes/config.yaml`.

**Moving real Financial data**: if you already had real entries in the
standalone Cadence Financial app's own Supabase project, that data does not
move automatically — `Cadence/backend/FINANCIAL_DATA_MERGE_RUNBOOK.md` is an
exact, careful runbook for pg_dump/restore-ing it into the new `financial`
schema. Written for you to run yourself (it needs your database passwords);
Fitness has no live data anywhere yet, so its schema just starts empty.

The old standalone `CadenceFinancial/` and `CadenceFitness/` directories are
kept in the repo (see their `SUPERSEDED.md`) as reference copies and as the
data-migration source — they are not built or deployed once the unified app
is live, and are safe to delete once you've verified the merge and (for
Financial) migrated your real data.

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
