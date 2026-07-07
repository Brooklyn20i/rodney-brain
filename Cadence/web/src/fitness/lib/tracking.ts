// How exercises are logged (weight×reps vs bodyweight reps vs timed holds) and
// the helpers that keep the logger, history and calcs honest about it. Kept
// React-free so any module can use it.
import type { Exercise, ExerciseTracking, WorkoutSet } from './types';

// Read an exercise's tracking mode, defaulting to weight×reps. Tolerates rows
// written before the tracking migration (where the column is absent) and any
// unexpected value, so the UI never breaks on legacy/foreign data.
export function trackingOf(ex?: Pick<Exercise, 'tracking'> | null): ExerciseTracking {
  const t = ex?.tracking;
  return t === 'time' || t === 'bodyweight' ? t : 'weight_reps';
}

export const TRACKING_LABEL: Record<ExerciseTracking, string> = {
  weight_reps: 'Weight × reps',
  bodyweight: 'Bodyweight reps',
  time: 'Timed hold',
};

export const TRACKING_OPTIONS: { value: ExerciseTracking; label: string; hint: string }[] = [
  { value: 'weight_reps', label: 'Weight × reps', hint: 'Barbell, dumbbell, machine, cable' },
  { value: 'bodyweight', label: 'Bodyweight reps', hint: 'Push-ups, pull-ups, dips — reps only' },
  { value: 'time', label: 'Timed hold', hint: 'Planks, dead hangs, wall sits — hold time' },
];

// The hold time on a set, tolerant of a missing column on legacy rows.
export const setDuration = (s: Pick<WorkoutSet, 'duration_seconds'>): number =>
  Number(s.duration_seconds) || 0;

// Seconds → compact "m:ss" (or "45s" under a minute) for display.
export function fmtDuration(secs: number): string {
  const s = Math.max(0, Math.round(secs));
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

// Parse a hold time typed as "m:ss", "90", "1:30" or "45s" back to seconds.
// Tolerates the trailing unit that fmtDuration emits ("45s") so re-saving an
// unedited field never zeroes the value.
export function parseDuration(input: string): number {
  const t = input.trim().toLowerCase().replace(/\s*(s|sec|secs|seconds)$/, '');
  if (!t) return 0;
  if (t.includes(':')) {
    const [m, s] = t.split(':');
    return Math.max(0, Math.round((Number(m) || 0) * 60 + (Number(s) || 0)));
  }
  return Math.max(0, Math.round(Number(t) || 0));
}

// Guess a tracking mode from a new exercise's name so planks etc. default
// sensibly. Only ever used to seed a fresh choice — never to override one the
// user set. Unknown names stay weight×reps.
const TIME_RE = /\b(plank|wall\s?sit|hollow\s?hold|hollow|l-?sit|dead\s?hang|hang\s?hold|isometric|superman\s?hold|hold)\b/i;
export function guessTracking(name: string): ExerciseTracking {
  return TIME_RE.test(name) ? 'time' : 'weight_reps';
}

// A run/row/ride/swim belongs in the Cardio block (time + distance), not the
// weights list. Used to nudge the user when they search for one as an exercise.
// Deliberately excludes bare "row" and "walk": too many lifts are "… Row"
// (Barbell/Pendlay/Cable Row) or contain "walk" (Walking Lunge, Farmer's Walk).
// The rowing machine is caught via "rowing"/"erg" instead.
const CARDIO_RE = /\b(run|running|jog|jogging|sprint|treadmill|rowing|erg|bike|biking|cycle|cycling|ride|riding|elliptical|stairmaster|swim|swimming|hike|hiking)\b/i;
export function looksLikeCardio(name: string): boolean {
  return CARDIO_RE.test(name);
}
