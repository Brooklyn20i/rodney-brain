<!-- Keep it short. Delete lines that don't apply. -->

## What & why

<!-- One or two sentences. Link the issue/audit finding if there is one. -->

## Foundation checklist

- [ ] **Tests** — CI (`Cadence web`) is green; added/updated tests for the change
- [ ] **Migrations** — none, or additive/idempotent and reversible (reverse migration noted below)
- [ ] **Env / secrets** — no new secrets, or documented and set in Vercel/Supabase (never committed)
- [ ] **Staging / prod verification** — verified on a Vercel preview; prod smoke plan noted
- [ ] **Rollback** — safe to Instant-Rollback (see rollback runbook); DB impact called out if any
- [ ] **Observability** — errors/logs surface in Sentry/Vercel; no new silent failure paths
- [ ] **Screenshots** — before/after attached for any UI change

## Rollback / migration notes

<!-- Reverse migration, feature flag, or "plain revert is safe". -->
