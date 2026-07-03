// ── Derived fitness figures ─────────────────────────────────────────────────
// Everything here is computed from raw rows and never stored (same discipline
// as Cadence Financial's financeCalc.ts): e1RM, PRs, weekly volume, weight
// trend, nutrition totals/adherence and program-cycle position can't drift
// from their inputs because they have no inputs of their own.

import type {
  BodyMetric,
  Exercise,
  MuscleGroup,
  NutritionLog,
  NutritionTarget,
  Program,
  ProgramDay,
  Workout,
  WorkoutSet,
} from './types';

// Epley estimated one-rep max. reps=1 returns the weight itself; nonsense
// inputs (no reps / no weight) return 0 so they never rank as a PR.
export function epley1RM(weightKg: number, reps: number): number {
  if (weightKg <= 0 || reps <= 0) return 0;
  if (reps === 1) return weightKg;
  return weightKg * (1 + reps / 30);
}

// Sets that count toward volume and PRs: ticked off and not a warm-up.
export function workingSets(sets: WorkoutSet[]): WorkoutSet[] {
  return sets.filter((s) => s.done && !s.is_warmup);
}

export interface ExercisePR {
  exercise_id: string;
  e1rm: number;
  weight_kg: number;
  reps: number;
  date: string; // workout date the PR was set
}

// Best (highest-e1RM) working set per exercise across all completed history.
export function prsByExercise(sets: WorkoutSet[], workouts: Workout[]): Map<string, ExercisePR> {
  const workoutDate = new Map(workouts.map((w) => [w.id, w.date]));
  const best = new Map<string, ExercisePR>();
  for (const s of workingSets(sets)) {
    const date = workoutDate.get(s.workout_id);
    if (!date) continue;
    const e1rm = epley1RM(Number(s.weight_kg), s.reps);
    if (e1rm <= 0) continue;
    const prev = best.get(s.exercise_id);
    if (!prev || e1rm > prev.e1rm) {
      best.set(s.exercise_id, { exercise_id: s.exercise_id, e1rm, weight_kg: Number(s.weight_kg), reps: s.reps, date });
    }
  }
  return best;
}

// PRs set within a recent window (for the dashboard's "recent PRs" card):
// sets whose e1RM beats every earlier working set of the same exercise.
export function recentPRs(
  sets: WorkoutSet[],
  workouts: Workout[],
  sinceISO: string
): ExercisePR[] {
  const workoutDate = new Map(workouts.map((w) => [w.id, w.date]));
  const rows = workingSets(sets)
    .map((s) => ({ s, date: workoutDate.get(s.workout_id) || '', e1rm: epley1RM(Number(s.weight_kg), s.reps) }))
    .filter((r) => r.date && r.e1rm > 0)
    .sort((a, b) => a.date.localeCompare(b.date));
  const bestSoFar = new Map<string, number>();
  const out: ExercisePR[] = [];
  for (const { s, date, e1rm } of rows) {
    const prev = bestSoFar.get(s.exercise_id) ?? 0;
    if (e1rm > prev) {
      bestSoFar.set(s.exercise_id, e1rm);
      if (prev > 0 && date >= sinceISO) {
        out.push({ exercise_id: s.exercise_id, e1rm, weight_kg: Number(s.weight_kg), reps: s.reps, date });
      }
    }
  }
  // Latest PR per exercise only, newest first.
  const latest = new Map<string, ExercisePR>();
  for (const pr of out) latest.set(pr.exercise_id, pr);
  return [...latest.values()].sort((a, b) => b.date.localeCompare(a.date));
}

// Monday-start week containing `iso`, as inclusive ISO date bounds.
// Formats in local time (not toISOString/UTC) so the date can't shift.
export function weekOf(iso: string): { start: string; end: string } {
  const fmt = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const d = new Date(iso + 'T12:00:00');
  const dow = (d.getDay() + 6) % 7; // Mon=0
  d.setDate(d.getDate() - dow);
  const start = fmt(d);
  d.setDate(d.getDate() + 6);
  const end = fmt(d);
  return { start, end };
}

// Hard (working) sets per muscle group for workouts in [start, end].
export function weeklySetsByMuscle(
  sets: WorkoutSet[],
  workouts: Workout[],
  exercises: Exercise[],
  start: string,
  end: string
): Map<MuscleGroup, number> {
  const inWeek = new Set(workouts.filter((w) => w.date >= start && w.date <= end).map((w) => w.id));
  const muscle = new Map(exercises.map((e) => [e.id, e.muscle_group]));
  const counts = new Map<MuscleGroup, number>();
  for (const s of workingSets(sets)) {
    if (!inWeek.has(s.workout_id)) continue;
    const m = muscle.get(s.exercise_id);
    if (!m) continue;
    counts.set(m, (counts.get(m) ?? 0) + 1);
  }
  return counts;
}

// Total kg lifted (weight x reps over working sets) for one workout.
export function workoutTonnage(sets: WorkoutSet[], workoutId: string): number {
  return workingSets(sets)
    .filter((s) => s.workout_id === workoutId)
    .reduce((sum, s) => sum + Number(s.weight_kg) * s.reps, 0);
}

// ── Body weight trend ───────────────────────────────────────────────────────

export interface TrendPoint {
  date: string;
  weight_kg: number;
  avg: number; // trailing moving average over `window` calendar entries
}

export function weightTrend(metrics: BodyMetric[], window = 7): TrendPoint[] {
  const sorted = [...metrics]
    .filter((m) => Number(m.weight_kg) > 0)
    .sort((a, b) => a.date.localeCompare(b.date));
  return sorted.map((m, i) => {
    const slice = sorted.slice(Math.max(0, i - window + 1), i + 1);
    const avg = slice.reduce((s, x) => s + Number(x.weight_kg), 0) / slice.length;
    return { date: m.date, weight_kg: Number(m.weight_kg), avg };
  });
}

// Change in trend (moving average) over roughly the last `days` days.
// Returns null with fewer than two points.
export function trendDelta(points: TrendPoint[], days = 7): number | null {
  if (points.length < 2) return null;
  const last = points[points.length - 1];
  const cutoff = new Date(last.date + 'T12:00:00');
  cutoff.setDate(cutoff.getDate() - days);
  const cutoffISO = cutoff.toISOString().slice(0, 10);
  let ref = points[0];
  for (const p of points) {
    if (p.date <= cutoffISO) ref = p;
    else break;
  }
  if (ref.date === last.date) return null;
  return last.avg - ref.avg;
}

// ── Nutrition ───────────────────────────────────────────────────────────────

export interface DayNutrition {
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
}

export function dayNutrition(logs: NutritionLog[], date: string): DayNutrition {
  const rows = logs.filter((l) => l.date === date);
  return {
    calories: rows.reduce((s, l) => s + Number(l.calories), 0),
    protein_g: rows.reduce((s, l) => s + Number(l.protein_g), 0),
    carbs_g: rows.reduce((s, l) => s + Number(l.carbs_g), 0),
    fat_g: rows.reduce((s, l) => s + Number(l.fat_g), 0),
  };
}

// The target row in force on `date`: latest effective_from on or before it.
export function targetFor(targets: NutritionTarget[], date: string): NutritionTarget | null {
  const applicable = targets
    .filter((t) => t.effective_from <= date)
    .sort((a, b) => a.effective_from.localeCompare(b.effective_from));
  return applicable.length ? applicable[applicable.length - 1] : null;
}

// ── Program cycles ──────────────────────────────────────────────────────────

export interface CyclePosition {
  cycle: number; // 1-based mesocycle number since start_date
  week: number; // 1..program.weeks within the current cycle
}

export function cyclePosition(program: Program, dateISO: string): CyclePosition | null {
  if (!program.start_date || program.weeks <= 0) return null;
  const start = new Date(program.start_date + 'T12:00:00');
  const d = new Date(dateISO + 'T12:00:00');
  const diffDays = Math.floor((d.getTime() - start.getTime()) / 86_400_000);
  if (diffDays < 0) return null;
  const weekIndex = Math.floor(diffDays / 7);
  return {
    cycle: Math.floor(weekIndex / program.weeks) + 1,
    week: (weekIndex % program.weeks) + 1,
  };
}

// The program day to run next: the one after the most recently *completed*
// program-day session, wrapping around; the first day if there's no history.
export function nextProgramDay(days: ProgramDay[], workouts: Workout[], programId: string): ProgramDay | null {
  const ordered = days
    .filter((d) => d.program_id === programId)
    .sort((a, b) => a.day_order - b.day_order);
  if (ordered.length === 0) return null;
  const done = workouts
    .filter((w) => w.program_id === programId && w.status === 'completed' && w.program_day_id)
    .sort((a, b) => (a.completed_at || a.date).localeCompare(b.completed_at || b.date));
  const last = done.length ? done[done.length - 1] : null;
  if (!last) return ordered[0];
  const idx = ordered.findIndex((d) => d.id === last.program_day_id);
  if (idx === -1) return ordered[0];
  return ordered[(idx + 1) % ordered.length];
}

// Working sets of `exerciseId` from the most recent completed workout that
// contains it (excluding `excludeWorkoutId`, i.e. the session in progress) --
// the "last time" hint shown while training.
export function lastSetsForExercise(
  sets: WorkoutSet[],
  workouts: Workout[],
  exerciseId: string,
  excludeWorkoutId?: string
): { date: string; sets: WorkoutSet[] } | null {
  const byWorkout = new Map<string, WorkoutSet[]>();
  for (const s of workingSets(sets)) {
    if (s.exercise_id !== exerciseId || s.workout_id === excludeWorkoutId) continue;
    const arr = byWorkout.get(s.workout_id) || [];
    arr.push(s);
    byWorkout.set(s.workout_id, arr);
  }
  const candidates = workouts
    .filter((w) => w.status === 'completed' && byWorkout.has(w.id))
    .sort((a, b) => a.date.localeCompare(b.date));
  if (candidates.length === 0) return null;
  const w = candidates[candidates.length - 1];
  const rows = (byWorkout.get(w.id) || []).sort((a, b) => a.set_number - b.set_number);
  return { date: w.date, sets: rows };
}
