// Exercise / programme tracking modes and helpers. Kept React-free so the
// programme builder, workout logger, history and tests all share one contract.
import type { CardioKind, Exercise, ExerciseTracking, ProgramExercise, WorkoutSet } from './types';

export const LEGACY_TRACKING = ['weight_reps', 'bodyweight', 'time'] as const;

const TRACKING_VALUES: ExerciseTracking[] = [
  'strength_weighted',
  'strength_bodyweight',
  'timed_hold',
  'cardio_distance',
  'cardio_duration',
  'cardio_interval',
];

// Read an exercise/slot tracking mode, defaulting safely for legacy rows. Older
// data used weight_reps/bodyweight/time; normalise that here instead of leaking
// legacy names through the app.
export function trackingOf(
  ex?: Pick<Exercise, 'tracking'> | Pick<ProgramExercise, 'tracking_type'> | null
): ExerciseTracking {
  const raw = (ex as { tracking?: string | null; tracking_type?: string | null } | null | undefined)?.tracking_type ??
    (ex as { tracking?: string | null } | null | undefined)?.tracking;
  if (raw === 'weight_reps') return 'strength_weighted';
  if (raw === 'bodyweight') return 'strength_bodyweight';
  if (raw === 'time') return 'timed_hold';
  return TRACKING_VALUES.includes(raw as ExerciseTracking) ? (raw as ExerciseTracking) : 'strength_weighted';
}

export function slotTracking(
  slot: Pick<ProgramExercise, 'tracking_type' | 'exercise_id'> | null | undefined,
  exercise?: Pick<Exercise, 'tracking'> | null
): ExerciseTracking {
  return trackingOf(slot?.tracking_type ? slot : exercise);
}

export const TRACKING_LABEL: Record<ExerciseTracking, string> = {
  strength_weighted: 'Weighted strength',
  strength_bodyweight: 'Bodyweight strength',
  timed_hold: 'Timed hold',
  cardio_distance: 'Cardio · distance',
  cardio_duration: 'Cardio · duration',
  cardio_interval: 'Cardio · intervals',
};

export const TRACKING_OPTIONS: { value: ExerciseTracking; label: string; hint: string }[] = [
  { value: 'strength_weighted', label: 'Weighted strength', hint: 'Barbell, dumbbell, machine, cable — kg × reps' },
  { value: 'strength_bodyweight', label: 'Bodyweight strength', hint: 'Push-ups, pull-ups, dips — reps only' },
  { value: 'timed_hold', label: 'Timed hold', hint: 'Planks, dead hangs, wall sits — hold time' },
  { value: 'cardio_distance', label: 'Cardio · distance', hint: 'Runs, rides, rows — duration + distance + HR' },
  { value: 'cardio_duration', label: 'Cardio · duration', hint: 'Incline walk, elliptical, stairs — duration first' },
  { value: 'cardio_interval', label: 'Cardio · intervals', hint: 'Progressive runs, HIIT, interval sessions — notes matter' },
];

export const isCardioTracking = (t: ExerciseTracking): boolean => t.startsWith('cardio_');
export const isStrengthTracking = (t: ExerciseTracking): boolean => !isCardioTracking(t);
export const isTimedTracking = (t: ExerciseTracking): boolean => t === 'timed_hold';
export const isBodyweightTracking = (t: ExerciseTracking): boolean => t === 'strength_bodyweight';
export const isWeightedTracking = (t: ExerciseTracking): boolean => t === 'strength_weighted';

export function slotDestination(
  slot: Pick<ProgramExercise, 'tracking_type' | 'exercise_id'> | null | undefined,
  exercise?: Pick<Exercise, 'tracking'> | null
): 'workout_sets' | 'cardio_sessions' {
  return isCardioTracking(slotTracking(slot, exercise)) ? 'cardio_sessions' : 'workout_sets';
}

export function cardioKindForName(name: string): CardioKind {
  const n = name.toLowerCase();
  if (/\b(row|rowing|erg)\b/.test(n)) return 'row';
  if (/\b(bike|biking|cycle|cycling|ride|riding)\b/.test(n)) return 'bike';
  if (/\b(swim|swimming)\b/.test(n)) return 'swim';
  if (/\b(walk|walking)\b/.test(n)) return 'walk';
  if (/\b(hike|hiking)\b/.test(n)) return 'hike';
  if (/\b(stair|stairs|stairmaster)\b/.test(n)) return 'stairs';
  if (/\b(elliptical|cross trainer)\b/.test(n)) return 'elliptical';
  if (/\b(hiit|interval|intervals)\b/.test(n)) return 'hiit';
  return 'run';
}

// The hold time on a set, tolerant of a missing column on legacy rows.
export const setDuration = (s: Pick<WorkoutSet, 'duration_seconds'>): number => Number(s.duration_seconds) || 0;

// Seconds → compact "m:ss" (or "45s" under a minute) for display.
export function fmtDuration(secs: number): string {
  const s = Math.max(0, Math.round(secs));
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

// Parse a hold time typed as "m:ss", "90", "1:30" or "45s" back to seconds.
export function parseDuration(input: string): number {
  const t = input.trim().toLowerCase().replace(/\s*(s|sec|secs|seconds)$/, '');
  if (!t) return 0;
  if (t.includes(':')) {
    const [m, s] = t.split(':');
    return Math.max(0, Math.round((Number(m) || 0) * 60 + (Number(s) || 0)));
  }
  return Math.max(0, Math.round(Number(t) || 0));
}

const TIME_RE = /\b(plank|wall\s?sit|hollow\s?hold|hollow|l-?sit|dead\s?hang|hang\s?hold|isometric|superman\s?hold|hold)\b/i;
const BODYWEIGHT_RE = /\b(push-?up|pull-?up|chin-?up|dip|sit-?up|nordic curl|hanging leg raise|russian twist)\b/i;
const CARDIO_EXACT_RE = /\b(run|running|jog|jogging|sprint|treadmill|rowing|erg|bike|biking|cycle|cycling|ride|riding|elliptical|stairmaster|stairs?|swim|swimming|hike|hiking|walk|walking|hiit|intervals?|progressive)\b/i;
const INTERVAL_RE = /\b(hiit|intervals?|fartlek|progressive|tempo|threshold)\b/i;

// Guess a tracking mode from a fresh exercise/slot name. Unknown names stay
// weighted strength. Never use this to override a user-set mode.
export function guessTracking(name: string): ExerciseTracking {
  if (/\b(walking\s+lunge|farmer'?s?\s+walk|bicycle\s+crunch)\b/i.test(name)) return 'strength_weighted';
  if (INTERVAL_RE.test(name)) return 'cardio_interval';
  if (CARDIO_EXACT_RE.test(name)) {
    return /\b(walk|walking|stairs?|stairmaster|elliptical)\b/i.test(name) ? 'cardio_duration' : 'cardio_distance';
  }
  if (TIME_RE.test(name)) return 'timed_hold';
  if (BODYWEIGHT_RE.test(name)) return 'strength_bodyweight';
  return 'strength_weighted';
}

// Used to nudge users away from logging a run as kg×reps. Keep the same caveat:
// do not false-positive on barbell rows/walking lunges/bicycle crunches.
export function looksLikeCardio(name: string): boolean {
  return isCardioTracking(guessTracking(name));
}

export function cardioTargetSummary(slot: Pick<ProgramExercise, 'target_duration_min' | 'target_distance_km' | 'target_calories' | 'target_avg_hr' | 'target_pace' | 'target_incline' | 'interval_notes' | 'notes'>): string {
  return [
    slot.target_duration_min ? `${slot.target_duration_min} min` : '',
    slot.target_distance_km ? `${slot.target_distance_km} km` : '',
    slot.target_calories ? `${slot.target_calories} kcal` : '',
    slot.target_avg_hr ? `${slot.target_avg_hr} avg HR` : '',
    slot.target_pace ? `pace ${slot.target_pace}` : '',
    slot.target_incline ? `incline ${slot.target_incline}` : '',
    slot.interval_notes || slot.notes || '',
  ]
    .filter(Boolean)
    .join(' · ');
}
