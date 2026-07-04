# Migrating live Cadence Financial data into the unified Cadence project

This is the one part of the Work + Financial + Fitness merge that touches
**your real net-worth data**, so it is written as a runbook for you to run
yourself, not something Claude executes. Read it fully before running
anything. Back up first (Supabase → Database → Backups → take a manual
snapshot on the *old* Financial project) so you have a rollback point.

## When you need this

Only if you have already been using the standalone Cadence Financial app and
it holds real entries (properties, loans, monthly metrics, decisions, etc.)
in its own, separate Supabase project. If Financial has never had real data
entered, skip this — just run `0022_financial_schema.sql` on the unified
project and start fresh.

## Prerequisites

- `psql` installed locally (`brew install postgresql` on macOS covers it).
- The **old** Financial project's direct database connection string:
  Supabase dashboard → old Financial project → Project Settings → Database →
  Connection string → "URI" (use the **direct connection**, not the pooler —
  port 5432, host `db.<project-ref>.supabase.co`).
- The **new** unified project's (Cadence Work's) direct connection string,
  same place, in Work's project.
- `Cadence/backend/migrations/0022_financial_schema.sql` already run
  successfully against the new/unified project (creates the empty
  `financial` schema and tables that this data will land in).

## Step 1 — Dump the old project's data only

```bash
OLD_DB="postgresql://postgres:OLD_DB_PASSWORD@db.OLD-PROJECT-REF.supabase.co:5432/postgres"

pg_dump "$OLD_DB" \
  --schema=public \
  --data-only \
  --no-owner --no-privileges \
  --exclude-table=schema_migrations \
  --file=financial_data_public.sql
```

`--data-only` skips table/type definitions entirely (the new project already
has those from the migration) and only emits `COPY ...` / `INSERT ...`
statements for actual rows.

## Step 2 — Remap `public.` → `financial.` in the dump

The dump's statements reference `public.entities`, `public.properties`, etc.
Rewrite them to target the new `financial` schema instead — a plain text
substitution is safe here since `pg_dump --data-only` output is just COPY/
INSERT statements, no other `public.` text appears:

```bash
sed 's/public\./financial./g' financial_data_public.sql > financial_data_remapped.sql
```

Open `financial_data_remapped.sql` and spot-check a few lines — you should
see things like `COPY financial.entities (...) FROM stdin;` and
`COPY financial.monthly_metrics (...) FROM stdin;`.

## Step 3 — Restore into the unified project, with triggers/FKs suspended

Foreign keys (`properties → entities`, `loans → properties`,
`property_ledger → properties`, `agent_messages → decisions`, etc.) will
reject rows arriving out of dependency order if enforced strictly during
restore. `session_replication_role = replica` suspends trigger and FK
enforcement for just this session, then restores it — this is the standard,
safe way to bulk-load data that will be internally consistent once fully
loaded (which it is, since it's a straight dump of previously-valid rows):

```bash
NEW_DB="postgresql://postgres:NEW_DB_PASSWORD@db.NEW-PROJECT-REF.supabase.co:5432/postgres"

psql "$NEW_DB" -v ON_ERROR_STOP=1 <<'SQL'
SET session_replication_role = replica;
\i financial_data_remapped.sql
SET session_replication_role = origin;
SQL
```

If anything errors, `ON_ERROR_STOP=1` halts immediately — nothing partial
gets left in a confusing state beyond what already ran. Since this only
*adds* rows to freshly-created empty tables, the worst case is a partial
load you can clear with `truncate table financial.<x> cascade;` per table
and retry, not corruption of anything else.

## Step 4 — Fix the `owner_id` on every migrated row

The dump's `owner_id` values are the OLD project's auth user UID for you,
which is almost certainly a **different UUID** than your auth user in the
unified project (a fresh sign-up gets a new UID). Update every table to your
real, unified-project UID (find yours: Supabase → Authentication → Users →
copy the UID):

```sql
-- Run in the unified project's SQL Editor, once you know your real UID:
do $$
declare
  real_owner uuid := 'YOUR-UNIFIED-PROJECT-UID-HERE';
  t text;
begin
  foreach t in array array['entities','properties','loans','investment_holdings',
    'investment_transactions','monthly_metrics','evidence_items','decisions',
    'liquidity_buckets','agent_messages','allocation_policies','risk_policies',
    'goals','insurance_policies','estate_items','property_ledger']
  loop
    execute format('update financial.%I set owner_id = %L;', t, real_owner);
  end loop;
end $$;
```

## Step 5 — Verify

1. Sign in to the unified app, switch to the Financial domain.
2. Confirm Overview, Property Portfolio, Month Close etc. show your real
   historical numbers.
3. Cross-check a couple of specific figures (a known property value, a
   recent month's net worth) against what you remember from the old app.
4. Only once you're satisfied: in the *old* Financial Supabase project,
   either pause/delete the project or just stop pointing anything at it —
   don't delete it immediately, keep it as a cold backup for a few weeks.

## What this does NOT do

- It does not touch Fitness (no live Fitness data exists yet — its schema
  starts empty).
- It does not touch Cadence Work's own `public` schema tables at all.
- It does not delete anything from the old Financial project — that project
  is untouched and remains your rollback path until you're confident and
  choose to decommission it yourself.
