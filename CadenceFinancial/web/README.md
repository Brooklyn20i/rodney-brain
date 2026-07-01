# Cadence Financial — web app

React + TypeScript + Vite, talking to a dedicated Supabase project (auth +
Postgres + realtime). A monthly financial control room: separates operating
progress (cash saved, debt reduced, capital deployed) from market movement,
grades every number by evidence quality, and produces a monthly PDF
assessment. See `../AGENTS.md` for full setup and the data-privacy rules.

## Run locally (demo mode, no backend needed)

```bash
cd CadenceFinancial/web
npm install
VITE_DEMO=1 npm run dev     # http://localhost:5173, fictional seed data
```

## Run against your real (private) Supabase project

```bash
cp .env.example .env        # fill VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY
npm install
npm run dev
```

## Test / build

```bash
npm run test:all            # typecheck + lint + unit tests
npm run build                # type-checks then builds to dist/
```

## Architecture

- `src/lib/types.ts` — canonical data model (mirrors the Postgres schema).
- `src/lib/financeCalc.ts` — the operating-vs-market calculation engine,
  ported from the tested Python prototype's `core.py`.
- `src/lib/store.tsx` — `CadenceFinancialProvider` / `useCadenceFinancial()`:
  auth, data loading, realtime, insert/update/remove. Falls back to
  fictional demo data when `VITE_DEMO=1`.
- `src/lib/pdf.tsx` — the Monthly PDF Assessment (`@react-pdf/renderer`).
- `src/lib/legacyImport.ts` + `scripts/import-legacy-csv.ts` — maps the old
  Wealth Dashboard CSV export format onto this schema.
- `src/screens/` — one file per screen: Month Close, Free Cash Engine, Net
  Worth Bridge, Debt & Offset Control, Investment Deployment, Asset
  Allocation, Evidence Register, Needs Rodney.

This is a management-grade personal finance tool, not regulated financial
advice — it has no authority to place trades, move money, pay bills,
refinance loans, or contact third parties.
