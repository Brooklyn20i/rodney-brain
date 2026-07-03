-- Cadence Fitness — Apple Health sync fields
--
-- Adds calories-burned + steps to the daily physiology row and a 'health'
-- metric source, so data pushed from Apple Health (which both Whoop and
-- Renpho already write into) lands in the same place as manual entry.
-- The health-ingest edge function (backend/functions/health-ingest) writes
-- these; the app computes the calories in-vs-out balance from them.
--
-- Run in the Supabase SQL Editor after 0001–0003. Safe to re-run.

-- Enum value add is idempotent; run it on its own (cannot be used in the same
-- transaction that adds it, but we only add columns below, not rows).
alter type metric_source add value if not exists 'health';

alter table recovery_metrics add column if not exists active_energy_kcal int;
alter table recovery_metrics add column if not exists steps int;
