# Cadence — Claude Code working rules

## Deployment rule (non-negotiable)

**Whenever a feature or fix is complete, ship it to ALL platforms immediately.**

"All platforms" = merge to `main`. GitHub Pages serves the PWA from `docs/` on
`main`, which is the live app on iPhone, iPad, and PC. A change is not done
until it is on `main`.

Shipping workflow (current — GitHub Pages):
1. `cd Cadence/web && npm run build`
2. `rm -f ../../docs/assets/* && cp -r dist/assets/* ../../docs/assets/ && cp dist/index.html ../../docs/`
3. `git add -A && git commit && git push -u origin <branch>`
4. Open a PR (or use `mcp__github__create_pull_request`) and merge it to `main`
5. Confirm `origin/main` has the commit — that's when it's live on all devices

Never leave work on a feature branch and report it as "done."  
Never ask the user if they want to deploy — just do it.

## Phase 0.5 — Vercel setup (pending Rodney's action)

`Cadence/web/vercel.json` is already committed with the correct config.
Once Rodney creates a Vercel account and links the repo, the deploy workflow
changes to:

**Shipping workflow (Vercel — after Phase 0.5):**
1. Push branch → Vercel auto-deploys a preview URL (no manual build step)
2. Merge PR to `main` → Vercel deploys production automatically
3. The `docs/` copy step and the manual build are retired

Steps Rodney must take (one-time):
1. Go to vercel.com → Add New Project → import `brooklyn20i/rodney-brain`
2. Set **Root Directory** = `Cadence/web`
3. Framework will auto-detect as Vite
4. Add env vars: `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`
5. Deploy. Once the production URL is confirmed live, delete `docs/` and update
   this section's shipping workflow to the Vercel variant.

## Active development branch

`claude/cadence-ipad-mvp-02hdje` — all work goes here, then merges to `main`.

## Architecture in one line

React PWA (`Cadence/web/`) → built to `docs/` → served by GitHub Pages → installed on iPad/iPhone/PC as a PWA.  
Supabase is the backend. No separate deploy step beyond merging to `main`.

## Key files

| Path | What it is |
|------|-----------|
| `Cadence/web/src/` | React source (TypeScript + Vite) |
| `Cadence/web/src/lib/types.ts` | Canonical data model — source of truth |
| `Cadence/web/src/styles.css` | All styles (single file) |
| `Cadence/web/src/App.tsx` | Router, sidebar, auth |
| `Cadence/agent/cadence_supabase_mcp.py` | Live MCP server |
| `Cadence/backend/migrations/` | Postgres schema migrations |
| `Cadence/web/vercel.json` | Vercel deploy config (ready to use) |
| `docs/` | Built PWA — what GitHub Pages serves (retired once Vercel is live) |
| `Cadence/AGENTS.md` | Agent/operator guide |
