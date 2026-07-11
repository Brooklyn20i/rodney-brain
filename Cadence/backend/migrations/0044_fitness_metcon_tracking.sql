-- Correct obvious MetCon / conditioning programme slots so they log as linked
-- cardio_sessions outcomes, not fake kg/reps workout_sets.
--
-- Additive/idempotent: only updates modality target metadata on matching
-- exercise/programme definitions. Logged workout history is not rewritten.

update fitness.exercises
set
  tracking = 'cardio_interval',
  updated_at = now()
where deleted_at is null
  and tracking not like 'cardio_%'
  and name ~* '\m(metcon|conditioning|amrap|emom|chipper)\M';

update fitness.program_exercises pe
set
  tracking_type = 'cardio_interval',
  cardio_kind = 'hiit'::fitness.cardio_kind,
  target_sets = 1,
  rep_min = 0,
  rep_max = 0,
  target_rpe = null,
  rest_seconds = 0,
  target_duration_min = coalesce(
    pe.target_duration_min,
    case
      when coalesce(pe.notes, '') ~* '\m18[- ]?min' then 18
      when coalesce(pe.notes, '') ~* '\m20[- ]?min' then 20
      when coalesce(pe.notes, '') ~* '\m21[- ]?min' then 21
      when coalesce(pe.notes, '') ~* '\m24[- ]?min' then 24
      when coalesce(pe.notes, '') ~* '\m25[- ]?min' then 25
      else 20
    end
  ),
  target_distance_km = coalesce(pe.target_distance_km, 0),
  interval_notes = case
    when nullif(pe.interval_notes, '') is not null then pe.interval_notes
    else 'MetCon score: enter rounds/reps or time cap result, plus peak HR if available.'
  end,
  updated_at = now()
from fitness.exercises e
where pe.exercise_id = e.id
  and pe.deleted_at is null
  and (
    e.name ~* '\m(metcon|conditioning|amrap|emom|chipper)\M'
    or coalesce(pe.notes, '') ~* '\m(metcon|conditioning|amrap|emom|chipper)\M'
  );
