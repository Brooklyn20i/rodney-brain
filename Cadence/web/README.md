# Cadence web app

React + TypeScript + Vite PWA, talking to Supabase (auth + Postgres + realtime),
deployed on Vercel. One app, three domains — **Work**, **Wealth** (financial),
**Health** (fitness) — plus a marketing site at the root. Installed as a PWA on
iPhone/iPad/desktop. See `Cadence/AGENTS.md` for the deeper architecture and the
agent (Kobe) integration; `../../CLAUDE.md` for the deploy + rollback runbook.

## Run locally
```bash
cd Cadence/web
cp .env.example .env      # fill VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY
npm install
npm run dev               # http://localhost:5173  (app shells: /work.html, /financial.html, /health.html)
```
Demo mode (no backend, seeded data): `VITE_DEMO=1 VITE_E2E=1 npm run dev`.

## Test & build
```bash
npm run test:all          # typecheck + lint (0 warnings) + smoke + 280 unit tests
npm run test:e2e          # Playwright e2e (21 tests, in-memory provider)
npm run build             # tsc -b then vite build → dist/
```
CI (`.github/workflows/cadence-web.yml`) runs all of the above on push/PR.

## Layout
- Three Postgres schemas: `public` (Work), `financial` (Wealth), `fitness` (Health).
  Each domain is a mirror: `screens/`, `components/bits.tsx`, `lib/store.tsx`,
  `lib/*Calc.ts` (pure, tested), `lib/__tests__/`.
- `src/App.tsx` — router, domain switching, per-domain theming. Screens are
  `React.lazy`-loaded; the domain data providers mount once at the root.
- `src/lib/store.tsx` — Work store: auth, workspace provisioning, optimistic
  writes, an offline queue (`offlineQueue.ts`), realtime. The domain stores
  (`financial/lib/store.tsx`, `fitness/lib/store.tsx`) share write-safety helpers
  in `src/lib/supabaseWrite.ts` + scaffolding in `src/lib/domainStore.ts`.
- `src/lib/*Calc.ts` / `selectors.ts` — pure functions (integer-cents money math,
  weight/recovery trends, task selectors). Derived figures are computed, never
  stored. This is where the business logic and most tests live.
- `src/styles.css` — single token-driven stylesheet; per-domain theming is a
  CSS-variable swap.
- `backend/migrations/` — the Postgres schema (RLS on every table, owner-scoped;
  agent grants via `cadence_agent_access`). `backend/functions/` — Deno edge
  functions (signup, health-ingest, food-vision, ace-chat).

Data is server-authoritative with client-side optimistic updates: each device
holds an in-memory copy kept fresh by Supabase realtime, and RLS enforces that a
user only ever sees their own rows.
