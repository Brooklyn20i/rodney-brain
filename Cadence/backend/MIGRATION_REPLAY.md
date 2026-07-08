# Cadence migration replay and release lane

Cadence production currently uses Supabase. The canonical schema source is:

```text
Cadence/backend/migrations/[0-9][0-9][0-9][0-9]_*.sql
```

Files under `Cadence/backend/migrations/archive/` are retained for audit/history only and are not part of replay.

## What this controls

This repo now has a CI replay gate inside the required GitHub check:

```text
Cadence web / Typecheck · Lint · Test · Build
```

That check starts a clean Postgres 17 service, installs a small Supabase-compatible auth/realtime shim, seeds a minimal Rodney/Kobe/data fixture before the workspace backfill migration, then replays every canonical migration in lexical order. If a migration cannot be applied to a clean database — including the data-bearing workspace backfill path — the required PR check fails before merge.

## Why this matters

Before this control, Cadence had several replay risks:

- duplicate `0003` agent-access migrations with incompatible column shapes;
- a workspace backfill migration that aborted on a fresh database without Rodney's auth user;
- `people.type` required by the Meetings UI but stored in an orphan migration outside the canonical chain;
- an old combined migration file that duplicated 0008-0015 and created ambiguity about the source of truth;
- no CI proof that a clean database could be rebuilt from repository migrations.

## Local/CI command

Requires `psql` and a reachable Postgres database.

```bash
PGHOST=localhost \
PGPORT=5432 \
PGDATABASE=postgres \
PGUSER=postgres \
PGPASSWORD=postgres \
bash Cadence/backend/scripts/replay_migrations.sh
```

On GitHub Actions this is run automatically against a `postgres:17` service.

## Production rule

This replay job proves repository migrations against a clean database. It does **not** apply anything to production.

Production migration application remains an owner/admin gate unless a properly scoped Supabase management lane is later authorised.

## Staging lane status

Persistent Supabase staging still requires an owner/admin decision because it may need an additional Supabase project or paid-tier capacity. Until that gate is crossed, CI ephemeral Postgres replay is the safe non-destructive release lane for migration correctness.
