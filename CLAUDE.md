# Cadence — Claude Code working rules

## Deployment rule (non-negotiable)

**Whenever a feature or fix is complete, ship it to ALL platforms immediately.**

"All platforms" = merge to `main`. GitHub Pages serves the PWA from `docs/` on
`main`, which is the live app on iPhone, iPad, and PC. A change is not done
until it is on `main`.

Shipping workflow:
1. `cd Cadence/web && npm run build`
2. `rm -f ../../docs/assets/* && cp -r dist/assets/* ../../docs/assets/ && cp dist/index.html ../../docs/`
3. `git add -A && git commit && git push -u origin <branch>`
4. Open a PR (or use `mcp__github__create_pull_request`) and merge it to `main`
5. Confirm `origin/main` has the commit — that's when it's live on all devices

Never leave work on a feature branch and report it as "done."  
Never ask the user if they want to deploy — just do it.

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
| `docs/` | Built PWA — what GitHub Pages serves |
| `Cadence/AGENTS.md` | Agent/operator guide |
