# Cadence Foundation Gates

Operator-readable definition of the delivery gates from the foundation audit.
Priority = how much it protects prod. This document separates repo-enforced
controls from checklist/admin controls so we do not pretend documentation alone
protects production.

## P0 — must hold before any prod deploy

- **CI is green.** `Cadence web` workflow (typecheck · lint · smoke · unit ·
  build · E2E) passes on the PR.
- **Reproducible installs.** CI and Vercel both use `npm ci` against the
  committed `package-lock.json` — no drift between local, CI, and prod.
- **Least-privilege CI.** Workflow runs with `permissions: contents: read`; no
  token can write to the repo from a test run.
- **Safe rollback exists.** Change is Instant-Rollback-safe on Vercel, or the DB
  impact is documented with a reverse migration (see rollback runbook in
  `CLAUDE.md`).

## P1 — should hold; catch before merge

- **Migrations are additive/idempotent** and reversible; destructive changes are
  staged separately from the deploy that reads them.
- **No new secrets in git.** New env/secrets are set in Vercel/Supabase and
  documented in the PR, never committed.
- **Concurrency control.** Superseded PR runs cancel; push/main runs complete so
  a merge is never gated by a cancelled check.
- **Observability.** New failure paths surface in Sentry/Vercel logs — no silent
  catches.

## P2 — good hygiene

- **Failure artifacts retained.** Playwright traces/reports upload on E2E
  failure (7-day retention) for post-mortems.
- **Path-scoped triggers.** `Cadence/web/**`, `Cadence/backend/**`, and
  `Cadence/agent/**` all run the existing web gates until dedicated
  backend/agent gates exist.
- **PR checklist** drives per-change verification (tests, migrations, env,
  staging/prod, rollback, observability, screenshots).

## Still needs admin (not settable from this repo)

These require GitHub/Supabase org-admin and cannot be enforced by files alone:

- **Branch protection on `main`** — require the `Cadence web` status check to
  pass before merge, and require PRs (no direct pushes). Until enabled, CI is
  advisory: a red run can still deploy.
- **Deploy gating** — bind Vercel production deploys to the required check /
  protected branch.
- **Secret scanning & push protection** enabled on the repo.
- **Supabase migration review** — production migrations gated behind review,
  with least-privilege service keys rotated and scoped.
