-- ── 0005_notes_folder.sql ──────────────────────────────────────────────────
-- Adds a folder/notebook name to each note so Notes can be organised into
-- collapsible folders. Empty string = uncategorised. Safe + idempotent.
--
-- Run in: https://supabase.com/dashboard/project/uimjzehrykeebocphdna/sql/new

alter table notes add column if not exists folder text not null default '';
