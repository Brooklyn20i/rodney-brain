# Cadence — Disaster Recovery Runbook

**Last updated:** 2026-06-20  
**Owner:** Rodney  
**Purpose:** Step-by-step guide to restore Cadence data after a catastrophic event (accidental table drop, corrupted rows, botched migration).

---

## 1. When to use this runbook

- A migration was applied incorrectly and corrupted or lost rows
- A bulk delete or update was run against the wrong rows
- The Supabase project was accidentally deleted
- You need to clone production to a staging project for safe testing

---

## 2. Prerequisites

- **Supabase Pro plan** — required for Point-in-Time Recovery (PITR). Free plan only has daily backups.
- Access to the Supabase dashboard for project `uimjzehrykeebocphdna`
- The migration files in `Cadence/backend/migrations/` (tagged in git)

---

## 3. Identify the last known good state

### Step 0 — identify the live deploy

Before touching data or rolling anything back, capture which web deploy is actually live:

```bash
curl -s https://cadence-agent.com/api/health
```

The probe returns the running short `commit`, branch/ref, Vercel environment and region. Cross-reference that commit with GitHub, Vercel deployments and Sentry's `release` field to identify whether the incident started with the current deploy or with a backend/data change.

### Option A — PITR (Supabase Pro)
1. Go to Supabase Dashboard → **Database** → **Backups**
2. Choose **Point in Time Recovery**
3. Pick a timestamp *before* the incident. If unsure, pick 15 minutes before you noticed the problem.
4. Note the timestamp — you'll use it in step 4.

### Option B — Daily snapshot (Free plan)
1. Go to Supabase Dashboard → **Database** → **Backups**
2. Choose the most recent daily snapshot that predates the incident.
3. Note it is a full snapshot (not PITR), so you lose everything since that backup.

### Verify the timestamp is safe
Run this query on the production DB to check row counts at the last known good time:
```sql
-- Check recent activity to find where things went wrong
SELECT created_at, actor, action, detail
FROM activity
ORDER BY created_at DESC
LIMIT 50;
```

---

## 4. Restore to a scratch Supabase project

**Never restore directly into production.** Always restore to a fresh project first, verify, then decide whether to promote or selectively extract rows.

1. Create a **new Supabase project** (free tier is fine for recovery)
2. In the new project's SQL editor, replay the canonical files in `Cadence/backend/migrations/` in lexical order.
   - Use only top-level files matching `0001_*.sql` through the latest numbered migration.
   - Do **not** apply files under `Cadence/backend/migrations/archive/`; they are retained only for history.
   - `0003_agent_access.sql` is the canonical agent-access migration. The archived `0003_kobe_agent.sql` used a legacy column shape and is not part of replay.
3. Use the Supabase PITR restore UI to restore the backup into this scratch project
4. Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in your `.env.local` to the scratch project
5. Run the app locally and verify data looks correct

---

## 5. Verify data integrity

Run these queries on the restored project:

```sql
-- Row counts (compare against known baselines)
SELECT
  (SELECT COUNT(*) FROM projects  WHERE deleted_at IS NULL) AS projects,
  (SELECT COUNT(*) FROM people    WHERE deleted_at IS NULL) AS people,
  (SELECT COUNT(*) FROM work_items WHERE deleted_at IS NULL) AS work_items,
  (SELECT COUNT(*) FROM notes     WHERE deleted_at IS NULL) AS notes,
  (SELECT COUNT(*) FROM decisions WHERE deleted_at IS NULL) AS decisions,
  (SELECT COUNT(*) FROM activity) AS activity_rows;

-- All data is workspace-scoped (post Phase 1)
SELECT COUNT(*) FROM work_items WHERE workspace_id IS NULL;
-- Should be 0 after 0013_backfill_workspace.sql is applied

-- Workspace is present
SELECT id, name, created_by FROM workspaces;
-- Should show Rodney's workspace

-- Spot-check a recent work item
SELECT title, type, done, created_at
FROM work_items
WHERE deleted_at IS NULL
ORDER BY created_at DESC
LIMIT 5;
```

---

## 6. Selective row extraction (if only some rows are lost)

If only a subset of rows needs recovery (e.g. a specific project's tasks), use
`pg_dump` on the restored project to export just those rows, then import into
production:

```bash
# Export specific rows from scratch DB
pg_dump \
  --host=<scratch-host>.supabase.co \
  --username=postgres \
  --dbname=postgres \
  --table=work_items \
  --where="project_id = '<the-project-uuid>'" \
  --data-only \
  --file=recovery_work_items.sql

# Review recovery_work_items.sql before importing!
# Then import into production:
psql \
  --host=<prod-host>.supabase.co \
  --username=postgres \
  --dbname=postgres \
  --file=recovery_work_items.sql
```

---

## 7. Promote scratch project to production (full restore only)

Only do this if the incident destroyed the entire production project and you need a full replacement.

1. In the scratch project, go to **Project Settings** → **General**
2. Note the new `Project URL` and `anon key`
3. Update Vercel (or `.env`) env vars to point to the scratch project
4. Verify the live app works against the scratch project
5. Contact Supabase support to transfer the custom domain if applicable

---

## 8. After recovery

- Run all migrations again in order (idempotent `IF NOT EXISTS` guards make this safe)
- Re-run `0013_backfill_workspace.sql` if workspace backfill was lost
- Confirm Kobe agent auth user is still in `workspace_members`
- Announce any data loss window to the team
- Upgrade Supabase plan back to Pro and re-enable PITR

---

## 9. Contacts

| Who | For |
|-----|-----|
| Supabase support (support.supabase.com) | PITR restore, project recovery |
| Rodney | Final approval before promoting recovery to production |
