-- Link cardio sessions to a gym workout.
--
-- A run/row/ride done as part of a workout is logged in fitness.cardio_sessions
-- (so it counts as cardio everywhere — week totals, the Cardio screen, the
-- dashboard) and pointed back at the workout it was done in. This lets the
-- Workout screen show cardio inside the active session and clean it up if the
-- session is discarded, while a completed workout's deletion leaves the cardio
-- history intact (ON DELETE SET NULL).

alter table fitness.cardio_sessions
  add column if not exists workout_id uuid
  references fitness.workouts(id) on delete set null;

create index if not exists cardio_sessions_workout_id_idx
  on fitness.cardio_sessions(workout_id);
