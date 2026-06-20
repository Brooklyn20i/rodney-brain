# Kobe Agent Brief — Cadence

**Last updated:** 2026-06-20  
**Read this before touching any data.**

---

## What Cadence is

Cadence is Rodney's executive productivity system — tasks, projects, people (1:1s and meeting groups), decisions, notes, and a weekly review. It runs as a React PWA (live on iPhone, iPad, PC via GitHub Pages) backed by Supabase (Postgres + Auth + RLS + Realtime).

You (Kobe) are the AI agent with delegated write access to Rodney's workspace via the `cadence_agent_access` grant. You read and write on behalf of Rodney using the MCP tools in `cadence_supabase_mcp.py`.

---

## Current state (as of this brief)

The MVP is live and Rodney uses it daily. Recent work:

- **Meetings**: Full structured 1:1 modal with agenda items, action items, carry-forward, deferred topics, push to tasks. Meeting groups for multi-person sessions.
- **Tasks hub**: Master view of all open work items with grouping/filtering.
- **Inbox**: Triage queue for unprocessed captures (items with `inboxed: true`).
- **Decisions**: Two-model view (canonical `decisions` table + `work_items` of type decision) with a convert button.
- **Notes**: Rich editor with folders, debounced autosave, save-status indicator.
- **Weekly Review**: Checklist that persists across refreshes.
- **Search**: Global search with clickable results that navigate to the right screen.
- **Phase 0 hardening** (just shipped):
  - 48 unit tests (Vitest) covering core libs
  - ESLint + Prettier, zero warnings/errors
  - TypeScript strict unused-variable checking
  - Vite code-splitting (single 970KB bundle → 13 focused chunks, faster loads)
  - Sentry wired up (activates when `VITE_SENTRY_DSN` env var is set)
  - CI runs `typecheck → lint → smoke → unit → build` on every PR

---

## Where we're going (the enterprise roadmap)

Rodney wants to move from solo MVP to **team use now, SaaS potential later**. Sequenced plan:

### Phase 0 — Safety net ✅ DONE
Tests, lint, CI, code-splitting, Sentry. Ships first so refactoring is safe.

### Phase 0.5 — Infrastructure (next)
Move frontend from GitHub Pages → **Vercel**.
- Auto-deploys from git (no more manual `docs/` copy)
- Per-PR preview URLs
- Staging + production environments
- Retire the `docs/` directory once Vercel is live

Requires Rodney to: create a Vercel account, link the repo, add env vars.

### Phase 1 — Multi-tenant workspace layer (the crux)
Add `workspaces` and `workspace_members` tables. Add `workspace_id` to all 12 data tables. Rewrite RLS from `owner_id = auth.uid()` to workspace-membership checks. Backfill Rodney's existing data into a default workspace.

**This must happen before teammates onboard** — retrofitting after real team data exists is painful. The staging environment (from Phase 0.5) is used to rehearse the migration first.

### Phase 2 — Team collaboration
Invite flow, member management, role enforcement (viewer/editor/admin), multi-user audit trail.

### Phase 3 — Performance & polish
Offline reliability (service-worker queue for writes on flaky networks), accessibility pass, further bundle optimisation.

### Phase 4 — SaaS (decision-gated)
Stripe billing, self-serve signup, marketing site, SOC2 readiness. Only invest here if the team use proves the product worth selling.

---

## What you can do right now to help Rodney

Your MCP tools (`list_open_work_items`, `add_inbox_item`, `triage_inbox_item`, `complete_work_item`, `add_decision`, `update_work_item`, etc.) all work against Rodney's current single-owner workspace. Use them freely — they will continue to work through the multi-tenancy migration because the backfill preserves all existing data.

**Good uses of your access:**
- Capture things Rodney dictates or asks you to log
- Triage inbox items (assign person/project/due date)
- Mark actions done after Rodney confirms them
- Log decisions as they're made
- Check what's overdue or waiting

**Don't do:**
- Don't delete records (use `done: true` or `status: completed` instead)
- Don't create projects or people without Rodney explicitly asking
- Don't bypass RLS or use the service-role key — the anon key + agent grant is correct

---

## Key technical facts

| Thing | Value |
|-------|-------|
| Data model source of truth | `Cadence/web/src/lib/types.ts` |
| Schema migrations | `Cadence/backend/migrations/0001–0010_*.sql` |
| Agent MCP server | `Cadence/agent/cadence_supabase_mcp.py` |
| Bridge library | `Cadence/agent/cadence_bridge.py` |
| Agent credentials | `CADENCE_SUPABASE_URL`, `CADENCE_SUPABASE_ANON_KEY`, `CADENCE_AGENT_EMAIL`, password from macOS Keychain |
| Live app URL | GitHub Pages from `main` branch `docs/` (moving to Vercel soon) |
| Dev branch | `claude/cadence-ipad-mvp-02hdje` |

---

## Migrations pending (not yet applied to Supabase)

These are written and committed but need to be pasted into the Supabase SQL editor:

- `0008_immutable_owner_id.sql` — prevents `owner_id` mutation (P0 security)
- `0009_activity_append_only.sql` — makes audit trail tamper-proof
- `0010_owner_validated_child_rows.sql` — validates cross-table owner consistency

**Rodney needs to run these manually.** Until then, the app works but without these integrity guards.
