# Superseded by the unified Cadence app

This standalone app's functionality has been merged into `Cadence/web/src/financial/`,
running inside the unified Cadence super-app on Cadence's own Supabase project
(schema `financial`) instead of a separate project. See
`Cadence/AGENTS.md` → "The unified super app" and
`Cadence/backend/FINANCIAL_DATA_MERGE_RUNBOOK.md`.

This directory is kept in place (not deleted) as a reference copy and as the
source for the live-data migration runbook above — it is not built or
deployed anymore once the unified app is live. Once your real data has been
migrated into the unified project and verified, it's safe to delete this
directory and decommission its standalone Supabase/Vercel projects.
