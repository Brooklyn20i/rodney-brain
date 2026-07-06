-- Cadence Fitness — capture WHOOP's full recovery/sleep physiology + workouts
--
-- Builds on 0038 (WHOOP OAuth + sync). The first cut stored a subset of what
-- WHOOP scores; this widens recovery_metrics to the full set (SpO2, skin temp,
-- respiratory rate, sleep-stage breakdown, efficiency/consistency, sleep
-- need/debt, day avg/max HR) and lets WHOOP *workouts* land in cardio_sessions.
-- All additive + nullable, so existing rows and the manual flows are untouched.
--
-- Run ONCE in the Supabase SQL Editor after 0038. Idempotent.

set search_path to fitness, public;

-- ── recovery_metrics: the rest of what WHOOP scores each night/day ─────────
alter table recovery_metrics
  add column if not exists spo2_percentage        numeric(4,1),  -- recovery.score.spo2_percentage
  add column if not exists skin_temp_celsius       numeric(4,1),  -- recovery.score.skin_temp_celsius
  add column if not exists respiratory_rate        numeric(4,1),  -- sleep.score.respiratory_rate
  add column if not exists sleep_efficiency_pct    int,           -- sleep.score.sleep_efficiency_percentage
  add column if not exists sleep_consistency_pct   int,           -- sleep.score.sleep_consistency_percentage
  add column if not exists sleep_light_min         int,           -- stage_summary light sleep
  add column if not exists sleep_deep_min          int,           -- stage_summary slow-wave (deep)
  add column if not exists sleep_rem_min           int,           -- stage_summary REM
  add column if not exists sleep_awake_min         int,           -- stage_summary awake
  add column if not exists sleep_cycle_count       int,           -- stage_summary sleep_cycle_count
  add column if not exists sleep_disturbance_count int,           -- stage_summary disturbance_count
  add column if not exists sleep_need_min          int,           -- sleep_needed total (baseline+debt+strain)
  add column if not exists sleep_debt_min          int,           -- sleep_needed.need_from_sleep_debt_milli
  add column if not exists day_avg_hr              int,           -- cycle.score.average_heart_rate
  add column if not exists day_max_hr              int;           -- cycle.score.max_heart_rate

comment on column recovery_metrics.spo2_percentage is 'Blood oxygen saturation during sleep (WHOOP).';
comment on column recovery_metrics.skin_temp_celsius is 'Skin temperature during sleep (WHOOP); deviation from baseline flags stress/illness.';
comment on column recovery_metrics.respiratory_rate is 'Breaths per minute during sleep (WHOOP).';
comment on column recovery_metrics.sleep_need_min is 'WHOOP total sleep need for the night, minutes.';
comment on column recovery_metrics.sleep_debt_min is 'Portion of sleep need coming from accumulated sleep debt, minutes.';

-- ── cardio_sessions: receive WHOOP workouts (cardio sports only) ───────────
-- source + external_id make WHOOP imports idempotent and distinguishable from
-- manually-logged sessions. strain/max_hr/altitude add the WHOOP-specific
-- numbers the manual form never captured.
alter table cardio_sessions
  add column if not exists source          metric_source not null default 'manual',
  add column if not exists external_id     text,          -- WHOOP workout UUID
  add column if not exists strain          numeric(4,1),  -- workout.score.strain
  add column if not exists max_hr          int,           -- workout.score.max_heart_rate
  add column if not exists altitude_gain_m numeric(6,1);  -- workout.score.altitude_gain_meter

comment on column cardio_sessions.external_id is 'Upstream id (e.g. WHOOP workout UUID) for idempotent sync; null for manual entries.';

-- One row per WHOOP workout: upserts key on (owner_id, external_id). Partial so
-- manual sessions (external_id null) are never constrained.
create unique index if not exists uq_cardio_external
  on cardio_sessions(owner_id, external_id)
  where external_id is not null and deleted_at is null;

reset search_path;
