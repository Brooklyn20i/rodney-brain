-- Modality-aware programme/workout tracking.
--
-- Add first-class programme slot targets for cardio/duration/interval work so
-- runs/rides/rows no longer become fake workout_sets. This is additive and safe:
-- existing strength slots keep their set/rep fields, obvious cardio exercise
-- names are backfilled to cardio tracking, and existing logged rows are not
-- rewritten or deleted.

alter table fitness.program_exercises
  add column if not exists tracking_type text,
  add column if not exists cardio_kind fitness.cardio_kind,
  add column if not exists target_duration_min numeric(6,1),
  add column if not exists target_distance_km numeric(6,2),
  add column if not exists target_calories int,
  add column if not exists target_avg_hr int,
  add column if not exists target_pace text not null default '',
  add column if not exists target_incline text not null default '',
  add column if not exists interval_notes text not null default '';

-- Ensure the exercise library column can carry the new modality vocabulary.
alter table fitness.exercises
  alter column tracking set default 'strength_weighted';

-- Normalise old strength vocabulary without changing semantics.
update fitness.exercises set tracking = 'strength_weighted' where tracking = 'weight_reps';
update fitness.exercises set tracking = 'strength_bodyweight' where tracking = 'bodyweight';
update fitness.exercises set tracking = 'timed_hold' where tracking = 'time';

-- Backfill obvious cardio library entries if Rodney/agent previously created
-- them as exercises. Keep Barbell Row / Walking Lunge safe by using anchored or
-- machine/contextual names.
update fitness.exercises set tracking = 'cardio_interval'
  where name ~* '(progressive|interval|hiit|fartlek|tempo|threshold)'
    and name !~* '(walking\s+lunge|farmer''?s?\s+walk|bicycle\s+crunch)'
    and tracking not like 'cardio_%';

update fitness.exercises set tracking = 'cardio_distance'
  where tracking not like 'cardio_%'
    and name !~* '(walking\s+lunge|farmer''?s?\s+walk|bicycle\s+crunch)'
    and name ~* '(^|[^a-z])(run|running|jog|jogging|sprint|treadmill|rowing|erg|bike|biking|cycle|cycling|ride|riding|swim|swimming|hike|hiking)($|[^a-z])';

update fitness.exercises set tracking = 'cardio_duration'
  where tracking not like 'cardio_%'
    and name !~* '(walking\s+lunge|farmer''?s?\s+walk|bicycle\s+crunch)'
    and name ~* '(^|[^a-z])(walk|walking|stairs?|stairmaster|elliptical|cross trainer)($|[^a-z])';

-- Programme slots inherit the exercise modality by default. This lets old
-- programme rows start rendering cardio target fields after migration.
update fitness.program_exercises pe
set tracking_type = e.tracking
from fitness.exercises e
where pe.exercise_id = e.id
  and pe.tracking_type is null;

-- Normalise legacy slot values if a client wrote them before this migration.
update fitness.program_exercises set tracking_type = 'strength_weighted' where tracking_type = 'weight_reps';
update fitness.program_exercises set tracking_type = 'strength_bodyweight' where tracking_type = 'bodyweight';
update fitness.program_exercises set tracking_type = 'timed_hold' where tracking_type = 'time';

-- Fill safe cardio defaults for existing cardio slots: 15 minutes is a prompt,
-- not fabricated history. Actual logged data remains in cardio_sessions.
update fitness.program_exercises pe
set
  target_sets = 1,
  rep_min = 0,
  rep_max = 0,
  target_rpe = null,
  rest_seconds = 0,
  target_duration_min = coalesce(pe.target_duration_min, 15),
  cardio_kind = coalesce(
    pe.cardio_kind,
    case
      when e.name ~* '(row|rowing|erg)' then 'row'::fitness.cardio_kind
      when e.name ~* '(bike|biking|cycle|cycling|ride|riding)' then 'bike'::fitness.cardio_kind
      when e.name ~* '(swim|swimming)' then 'swim'::fitness.cardio_kind
      when e.name ~* '(walk|walking)' then 'walk'::fitness.cardio_kind
      when e.name ~* '(hike|hiking)' then 'hike'::fitness.cardio_kind
      when e.name ~* '(stairs?|stairmaster)' then 'stairs'::fitness.cardio_kind
      when e.name ~* '(elliptical|cross trainer)' then 'elliptical'::fitness.cardio_kind
      when e.name ~* '(hiit|interval)' then 'hiit'::fitness.cardio_kind
      else 'run'::fitness.cardio_kind
    end
  )
from fitness.exercises e
where pe.exercise_id = e.id
  and pe.tracking_type like 'cardio_%';

create index if not exists program_exercises_tracking_type_idx
  on fitness.program_exercises(owner_id, tracking_type)
  where deleted_at is null;
