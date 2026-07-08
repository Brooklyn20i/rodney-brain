# Cadence — Claude Code working rules

## Deployment rule (non-negotiable)

**Whenever a feature or fix is complete, ship it to ALL platforms immediately.**

"All platforms" = merge to `main`. Vercel auto-deploys from `main` to production.
A change is not done until it is on `main`.

**Shipping workflow (Vercel — active):**
1. Push branch → Vercel auto-deploys a preview URL (no manual build step needed)
2. Merge PR to `main` → Vercel deploys production automatically
3. Confirm deploy is green in Vercel dashboard — that's when it's live on all devices

Never leave work on a feature branch and report it as "done."
Never ask the user if they want to deploy — just do it.
Never manually build or copy to `docs/` — Vercel handles everything.

## Active development branch

`claude/cadence-ipad-mvp-02hdje` — all work goes here, then merges to `main`.

## Live URLs

| Environment | URL |
|-------------|-----|
| Production | https://cadence-agent.com |
| Vercel dashboard | https://vercel.com/cadenceagent/web |

## Rollback runbook (2am edition)

Prod is broken and you need it back NOW:
0. **Identify the live deploy:** `curl -s https://cadence-agent.com/api/health` and note the running `commit`/`env`/`region`. Cross-reference that commit with Vercel deployments and Sentry's `release` field before rolling back.
1. **Fastest (UI):** Vercel dashboard → project `web` → Deployments → find the last known-good production deploy → **⋯ → Promote to Production** (aka Instant Rollback). Live in ~seconds, no rebuild.
2. **CLI:** `npx vercel rollback` (lists recent deploys) or `npx vercel rollback <deployment-url> --scope cadenceagent`.
3. **Then fix forward:** revert the bad commit on `main` (`git revert <sha>` → push) so the next deploy is clean — don't leave prod pinned to an old promote.
- **DB migrations do NOT auto-roll-back with a Vercel rollback.** If the bad deploy shipped a migration, assess the DB separately (most migrations here are additive/idempotent; a bad one needs its own reverse migration).
- CI gate is advisory until branch protection is enabled — a red CI run can still deploy. Enable required status check `Cadence web` on `main` in GitHub settings to make CI blocking.

## Architecture in one line

React PWA (`Cadence/web/`) → Vercel builds and deploys on push → installed on iPad/iPhone/PC as a PWA.
Supabase is the backend. No separate build step — push to `main` = live.

## Key files

| Path | What it is |
|------|-----------|
| `Cadence/web/src/` | React source (TypeScript + Vite) |
| `Cadence/web/src/lib/types.ts` | Canonical data model — source of truth |
| `Cadence/web/src/styles.css` | All styles (single file) |
| `Cadence/web/src/App.tsx` | Router, sidebar, auth |
| `Cadence/agent/cadence_supabase_mcp.py` | Live MCP server |
| `Cadence/backend/migrations/` | Postgres schema migrations |
| `Cadence/web/vercel.json` | Vercel deploy config |
| `Cadence/AGENTS.md` | Agent/operator guide |
