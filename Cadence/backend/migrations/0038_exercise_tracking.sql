-- Per-exercise tracking mode + timed-hold support.
--
-- Not every movement is weight × reps. Isometric holds (planks, dead hangs,
-- wall sits) are measured in time, and bodyweight movements (push-ups,
-- pull-ups) in reps alone. Before this, the logger forced everything into
-- weight × reps, so a plank read as "0 kg × N". This adds:
--   • exercises.tracking     — how the exercise is logged
--   • workout_sets.duration_seconds — the hold time for timed sets
-- Both are additive with safe defaults, so old rows and clients keep working
-- (running/rowing/riding still live in cardio_sessions, unchanged).

alter table fitness.exercises
  add column if not exists tracking text not null default 'weight_reps';

alter table fitness.workout_sets
  add column if not exists duration_seconds int not null default 0;

-- Backfill obvious timed holds so existing libraries are correct on upgrade.
update fitness.exercises set tracking = 'time'
  where tracking = 'weight_reps'
    and name ~* '(plank|wall ?sit|hollow|l-?sit|dead ?hang|hang ?hold|isometric)';

-- Backfill classic bodyweight-reps movements (never loaded with a weight here).
update fitness.exercises set tracking = 'bodyweight'
  where tracking = 'weight_reps'
    and name ~* '(push-?up|sit-?up|russian twist|hanging leg raise|nordic curl)';
