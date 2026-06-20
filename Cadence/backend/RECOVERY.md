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
2. In the new project's SQL editor, replay migrations in order:
   ```
   0001_init.sql
   0002_policies.sql
   0003_agent_access.sql  (or 0003_kobe_agent.sql if that's what's applied)
   0004_realtime_and_color.sql
   0005_notes_folder.sql
   0006_projects_depth.sql
   0007_people_groups.sql
   0008_immutable_owner_id.sql
   0009_activity_append_only.sql
   0010_owner_validated_child_rows.sql
   0011_workspaces.sql
   0012_add_workspace_id.sql
   0013_backfill_workspace.sql
   0014_workspace_rls.sql
   ```
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
