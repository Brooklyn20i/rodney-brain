-- Migration 0009: Meeting Groups
-- Run this in Supabase → SQL Editor before using the Meetings screen.

ALTER TABLE people ADD COLUMN IF NOT EXISTS type text DEFAULT 'person';
COMMENT ON COLUMN people.type IS 'person | meeting_group — distinguishes recurring meeting groups from individual contacts';
