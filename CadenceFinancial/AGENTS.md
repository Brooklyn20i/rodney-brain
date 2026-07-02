# Cadence Financial — Agent & Operator Guide

> A private monthly financial control room for Rodney — separate product
> from the Cadence task app. Own Supabase project, own Vercel project. Do
> **not** share infrastructure with `Cadence/`.

---

## Sensitivity

This app holds real net-worth data. **Nothing real ever goes into this git
repo** — not in seed data, not in fixtures, not in commit messages. Every
number, name and address committed to `CadenceFinancial/` is fictional
placeholder data (see `web/src/lib/demoData.ts`), following the same
pattern as `Cadence/demo-seed.sql`. Real figures live only in the private
Supabase project below, entered via the app itself or the local import
script — never pasted into a file that gets committed.

If `Brooklyn20i/rodney-brain` is ever public, treat that as a hard blocker
on adding any real data anywhere in this directory.

---

## Architecture

```
Supabase (cadence-financial project — SEPARATE from Cadence's project)
  ← single source of truth →
       ▲
  Web PWA (CadenceFinancial/web/)
```

Single-user app: no multi-tenant workspace layer (unlike Cadence). RLS
scopes every row to `owner_id = auth.uid()`.

---

## One-time setup (Rodney's action — I can't do this part)

1. **Create a new Supabase project** dedicated to Cadence Financial (do not
   reuse the Cadence task-app project — see the sensitivity note above).
2. In the Supabase SQL Editor, run `backend/migrations/0001_init.sql`.
3. In `web/`, `cp .env.example .env` and fill in `VITE_SUPABASE_URL` +
   `VITE_SUPABASE_ANON_KEY` from Supabase → Project Settings → API.
4. `npm install && npm run dev`, sign up with your own email once so your
   auth user exists (Supabase → Authentication → Users → copy the UID).
5. **Create a new Vercel project** importing this repo, with:
   - Root Directory = `CadenceFinancial/web`
   - Env vars = the same `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`
   - **Enable Vercel's password/deployment protection** before the first
     deploy — this app must not be reachable by an unauthenticated public
     URL (see the brief's "do not expose publicly" requirement). Supabase
     auth is a second layer, not a substitute for this.
6. Import your real historical data with the legacy CSV importer (below) —
   run it locally, never commit its inputs or a filled-in `.env`.

## Importing your real data

```bash
cd CadenceFinancial/web
export CADENCE_FINANCIAL_SUPABASE_URL=...
export CADENCE_FINANCIAL_SUPABASE_SERVICE_KEY=...   # service_role key, bypasses RLS for the bulk import
export CADENCE_FINANCIAL_OWNER_ID=...               # your auth user UID from step 4 above

# Dry run first (prints counts, writes nothing):
npm run import-legacy-csv -- --data-dir /path/to/your/real/csvs

# Apply once it looks right:
npm run import-legacy-csv -- --data-dir /path/to/your/real/csvs --apply
```

Supports either the new prototype's `monthly_metrics.csv` format (preferred,
1:1 mapping) or the old Wealth Cockpit's `monthly_tracking.csv` +
`investment_buys.csv` pair, plus `evidence_register.csv`,
`property_register.csv`, `loan_offset_register.csv`,
`share_transactions.csv`, `listed_share_snapshot.csv`,
`liquidity_buckets.csv` and `decision_log.csv` — any subset may be present.
See `web/src/lib/legacyImport.ts` for the exact column mapping and
`web/scripts/import-legacy-csv.ts` for the CLI. Loan→property linkage is by
address string match — review before trusting it.

`share_transactions.csv` rows in a foreign currency need an **`Amount AUD`**
column (the AUD-equivalent at purchase date) for an accurate multi-currency
total — without it, foreign-currency amounts fall back to their native
figure unconverted, which understates or overstates the "buys captured"
aggregate. AUD-currency rows don't need it. There's no single "current" FX
rate that can correct this after the fact; it has to be supplied per
transaction.

---

## Demo mode

Set `VITE_DEMO=1` locally to see the app fully populated with fictional
data and no Supabase connection required (`web/src/lib/demoData.ts`). Never
set this flag in a deployed environment — it bypasses auth entirely.

---

## Data model (canonical — Postgres schema)

See `backend/migrations/0001_init.sql` for the full schema and
`web/src/lib/types.ts` for the TypeScript mirror (source of truth for both).

Key tables: `entities`, `properties`, `loans`, `investment_holdings`,
`investment_transactions`, `monthly_metrics`, `evidence_items`, `decisions`,
`liquidity_buckets`.

Derived figures (free cash generated, all-in surplus, net worth bridge
movements, asset-allocation target-band flags) are **never stored** — they
are computed from the raw rows above in `web/src/lib/financeCalc.ts`, ported
line-for-line from the already-tested Python prototype
(`cadence_financial/core.py`), so they can't drift from their inputs.

Evidence grade: `screenshot | statement | broker | tax | market_repriced |
stale_carry_forward | assumption | user_stated_scenario`.

Decision approval status: `open | clarified | approved | blocked |
implemented`. Owner lens (label only, no automation): `kobe | warren | dan |
mckinsey | rodney`.

---

## Kobe integration

`agent_messages` (migration `0003_agent_messages.sql`) is a message channel
between Rodney and his agents (Kobe/Warren/Dan, running in his separate
Hermes environment) — mirrors the pattern Cadence's own `agent_messages`
table already uses. The **Kobe** screen in the app is the human-facing half
of this; it reads and writes that table directly.

This app does **not** run or connect to Kobe itself. For Kobe's side to
actually read/post here, set up a scoped grant on this Supabase project —
mirror `Cadence/backend/AGENT_ACCESS_RUNBOOK.md`: a dedicated non-owner
Supabase auth account for the agent, with row access limited to this
`owner_id` (an RLS policy analogous to Cadence's `cadence_agent_access`
table). That grant is Kobe-environment configuration, done outside this repo.

## Authority boundary

This is a management-grade operating tool, not regulated financial advice.
It must never imply authority to place trades, move money, pay bills,
refinance loans, make tax/legal decisions, or contact banks, brokers,
accountants, lawyers or other third parties. Shown as a persistent banner
in the app (`web/src/components/AuthorityBanner.tsx`) and in every PDF
export.
