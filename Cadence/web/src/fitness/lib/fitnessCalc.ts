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
  RecoveryMetric,
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

// ── Recovery analytics (long-range Whoop history) ───────────────────────────
// Turns years of daily rows into something readable: trend series with a
// rolling baseline, range stats vs a personal baseline, monthly aggregates,
// and a then-vs-now trajectory. All computed, never stored.

// Which recovery fields exist, and which direction is "better" — so the UI can
// colour a rising HRV green but a rising resting HR red.
export type RecoveryField =
  | 'recovery_pct'
  | 'hrv_ms'
  | 'resting_hr'
  | 'sleep_hours'
  | 'sleep_performance_pct'
  | 'strain';

export const RECOVERY_HIGHER_BETTER: Record<RecoveryField, boolean> = {
  recovery_pct: true,
  hrv_ms: true,
  resting_hr: false, // lower resting HR is better
  sleep_hours: true,
  sleep_performance_pct: true,
  strain: true, // not strictly "better", but treated as up = more training
};

export interface MetricPoint {
  date: string;
  value: number;
  avg: number; // trailing moving average over `window` readings
}

function fieldValue(r: RecoveryMetric, field: RecoveryField): number | null {
  const v = r[field];
  return v == null ? null : Number(v);
}

// Rows with a value for `field`, in [sinceISO, untilISO], oldest first, as a
// series with a trailing moving average. sinceISO/untilISO are inclusive; pass
// null for no bound.
export function metricSeries(
  rows: RecoveryMetric[],
  field: RecoveryField,
  window = 7,
  sinceISO: string | null = null,
  untilISO: string | null = null
): MetricPoint[] {
  const vals = rows
    .filter((r) => !r.deleted_at && fieldValue(r, field) != null)
    .filter((r) => (sinceISO ? r.date >= sinceISO : true) && (untilISO ? r.date <= untilISO : true))
    .map((r) => ({ date: r.date, value: fieldValue(r, field)! }))
    .sort((a, b) => a.date.localeCompare(b.date));
  return vals.map((p, i) => {
    const slice = vals.slice(Math.max(0, i - window + 1), i + 1);
    return { ...p, avg: slice.reduce((s, x) => s + x.value, 0) / slice.length };
  });
}

export interface RangeStats {
  field: RecoveryField;
  count: number;
  latest: number | null;
  latestDate: string | null;
  avg: number | null;
  min: number | null;
  max: number | null;
  // Latest value minus the average over the range — "where you sit vs baseline".
  vsAvg: number | null;
  higherBetter: boolean;
}

function daysAgoISO(fromISO: string, days: number): string {
  const d = new Date(fromISO + 'T12:00:00');
  d.setDate(d.getDate() - days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Summary stats for `field` over the last `days` (relative to the newest row
// present), plus the latest reading and how it compares to that window's mean.
export function rangeStats(rows: RecoveryMetric[], field: RecoveryField, days: number | null): RangeStats {
  const all = metricSeries(rows, field, 1);
  const newest = all.length ? all[all.length - 1].date : null;
  const since = days != null && newest ? daysAgoISO(newest, days) : null;
  const pts = since ? all.filter((p) => p.date >= since) : all;
  const values = pts.map((p) => p.value);
  const latest = pts.length ? pts[pts.length - 1] : null;
  const avg = values.length ? values.reduce((s, v) => s + v, 0) / values.length : null;
  return {
    field,
    count: pts.length,
    latest: latest?.value ?? null,
    latestDate: latest?.date ?? null,
    avg,
    min: values.length ? Math.min(...values) : null,
    max: values.length ? Math.max(...values) : null,
    vsAvg: latest && avg != null ? latest.value - avg : null,
    higherBetter: RECOVERY_HIGHER_BETTER[field],
  };
}

export interface MonthlyRecovery {
  month: string; // 'YYYY-MM'
  days: number;
  recovery: number | null;
  hrv: number | null;
  rhr: number | null;
  sleep: number | null;
  strain: number | null;
}

const avgOf = (xs: (number | null)[]): number | null => {
  const v = xs.filter((x): x is number => x != null);
  return v.length ? v.reduce((s, x) => s + x, 0) / v.length : null;
};

// One row per calendar month with the month's average of each metric.
export function monthlyRecovery(rows: RecoveryMetric[]): MonthlyRecovery[] {
  const byMonth = new Map<string, RecoveryMetric[]>();
  for (const r of rows) {
    if (r.deleted_at) continue;
    const m = r.date.slice(0, 7);
    (byMonth.get(m) ?? byMonth.set(m, []).get(m)!).push(r);
  }
  return [...byMonth.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([month, rs]) => ({
      month,
      days: rs.length,
      recovery: avgOf(rs.map((r) => fieldValue(r, 'recovery_pct'))),
      hrv: avgOf(rs.map((r) => fieldValue(r, 'hrv_ms'))),
      rhr: avgOf(rs.map((r) => fieldValue(r, 'resting_hr'))),
      sleep: avgOf(rs.map((r) => fieldValue(r, 'sleep_hours'))),
      strain: avgOf(rs.map((r) => fieldValue(r, 'strain'))),
    }));
}

export interface Trajectory {
  field: RecoveryField;
  thenAvg: number | null; // mean of the first `window` days of history
  nowAvg: number | null; // mean of the most recent `window` days
  delta: number | null; // now − then
  pctChange: number | null; // delta / then
  spanDays: number; // days between the two windows' midpoints (context)
  improved: boolean | null; // direction-aware (respects higher/lower-is-better)
  higherBetter: boolean;
}

// Then-vs-now: mean of the first `window` days of history vs the most recent
// `window` days — the headline "3-year trajectory" per metric.
export function trajectory(rows: RecoveryMetric[], field: RecoveryField, window = 90): Trajectory {
  const s = metricSeries(rows, field, 1);
  const higherBetter = RECOVERY_HIGHER_BETTER[field];
  if (s.length < 2) {
    return { field, thenAvg: null, nowAvg: null, delta: null, pctChange: null, spanDays: 0, improved: null, higherBetter };
  }
  const first = s[0].date;
  const last = s[s.length - 1].date;
  const thenCut = daysAgoISO(first, -window); // first + window days
  const nowCut = daysAgoISO(last, window); // last − window days
  const thenPts = s.filter((p) => p.date <= thenCut).map((p) => p.value);
  const nowPts = s.filter((p) => p.date >= nowCut).map((p) => p.value);
  const thenAvg = thenPts.length ? thenPts.reduce((a, b) => a + b, 0) / thenPts.length : null;
  const nowAvg = nowPts.length ? nowPts.reduce((a, b) => a + b, 0) / nowPts.length : null;
  const delta = thenAvg != null && nowAvg != null ? nowAvg - thenAvg : null;
  const spanDays = Math.round(
    (new Date(last + 'T12:00:00').getTime() - new Date(first + 'T12:00:00').getTime()) / 86_400_000
  );
  return {
    field,
    thenAvg,
    nowAvg,
    delta,
    pctChange: delta != null && thenAvg ? delta / thenAvg : null,
    spanDays,
    improved: delta == null || delta === 0 ? null : higherBetter ? delta > 0 : delta < 0,
    higherBetter,
  };
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

// ── Energy balance (MacroFactor-style) ─────────────────────────────────────
// The honest way to know your deficit/surplus: infer maintenance (TDEE) from
// what you actually ate vs how your trend weight actually moved, instead of
// trusting a formula or a watch. Over a window:
//   TDEE ≈ avg intake − (Δ trend-weight kg × 7700 kcal) / days
// Requires consistent food logging + regular weigh-ins to be meaningful.

const KCAL_PER_KG = 7700;

export interface EnergyEstimate {
  tdee: number; // estimated maintenance kcal/day
  avgIntake: number; // average logged kcal/day (logged days only)
  weightDeltaKg: number; // trend weight change across the window
  spanDays: number; // days between first and last trend point used
  loggedDays: number; // days with at least one food log in the window
  reliable: boolean; // enough data to take the number seriously
}

export function estimateTDEE(
  logs: NutritionLog[],
  metrics: BodyMetric[],
  endDate: string,
  windowDays = 21
): EnergyEstimate | null {
  const startDate = (() => {
    const d = new Date(endDate + 'T12:00:00');
    d.setDate(d.getDate() - (windowDays - 1));
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  })();

  const trend = weightTrend(metrics).filter((p) => p.date >= startDate && p.date <= endDate);
  if (trend.length < 2) return null;
  const first = trend[0];
  const last = trend[trend.length - 1];
  const spanDays = Math.round(
    (new Date(last.date + 'T12:00:00').getTime() - new Date(first.date + 'T12:00:00').getTime()) / 86_400_000
  );
  if (spanDays < 7) return null;

  const byDay = new Map<string, number>();
  for (const l of logs) {
    if (l.date >= first.date && l.date <= last.date) {
      byDay.set(l.date, (byDay.get(l.date) ?? 0) + Number(l.calories));
    }
  }
  const loggedDays = byDay.size;
  if (loggedDays === 0) return null;
  const avgIntake = [...byDay.values()].reduce((a, b) => a + b, 0) / loggedDays;

  const weightDeltaKg = last.avg - first.avg;
  const tdee = avgIntake - (weightDeltaKg * KCAL_PER_KG) / spanDays;

  return {
    tdee: Math.round(tdee),
    avgIntake: Math.round(avgIntake),
    weightDeltaKg,
    spanDays,
    loggedDays,
    // ~half the window logged and weigh-ins spanning at least 10 days:
    // below that the arithmetic still works but the number is noise.
    reliable: loggedDays >= Math.min(10, windowDays / 2) && spanDays >= 10,
  };
}

export interface WeekDayReport {
  date: string;
  calories: number; // 0 if nothing logged
  protein_g: number;
  logged: boolean;
  target: number | null; // calorie target in force that day
  delta: number | null; // calories − target (needs both)
}

export interface WeekReport {
  start: string;
  end: string;
  days: WeekDayReport[];
  loggedDays: number;
  avgIntake: number | null; // logged days only
  avgProtein: number | null;
  onTargetDays: number; // logged days at or under target (cut logic)
  weightDeltaKg: number | null; // trend change across the week
  tdee: number | null; // estimate as of week end
  avgDailyBalance: number | null; // avgIntake − tdee
  projectedKgPerWeek: number | null; // what that balance implies
}

// One week of nutrition vs targets vs scale movement — the weekly review.
export function weekReport(
  logs: NutritionLog[],
  targets: NutritionTarget[],
  metrics: BodyMetric[],
  weekStart: string
): WeekReport {
  const { start, end } = weekOf(weekStart);
  const days: WeekDayReport[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(start + 'T12:00:00');
    d.setDate(d.getDate() + i);
    const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const dayLogs = logs.filter((l) => l.date === date);
    const calories = dayLogs.reduce((s, l) => s + Number(l.calories), 0);
    const protein = dayLogs.reduce((s, l) => s + Number(l.protein_g), 0);
    const t = targetFor(targets, date);
    days.push({
      date,
      calories,
      protein_g: protein,
      logged: dayLogs.length > 0,
      target: t ? t.calories : null,
      delta: t && dayLogs.length > 0 ? calories - t.calories : null,
    });
  }

  const logged = days.filter((d) => d.logged);
  const avgIntake = logged.length ? Math.round(logged.reduce((s, d) => s + d.calories, 0) / logged.length) : null;
  const avgProtein = logged.length ? Math.round(logged.reduce((s, d) => s + d.protein_g, 0) / logged.length) : null;
  const onTargetDays = logged.filter((d) => d.delta !== null && d.delta <= 0).length;

  const trend = weightTrend(metrics).filter((p) => p.date >= start && p.date <= end);
  const weightDeltaKg = trend.length >= 2 ? trend[trend.length - 1].avg - trend[0].avg : null;

  const est = estimateTDEE(logs, metrics, end);
  const tdee = est && est.reliable ? est.tdee : null;
  const avgDailyBalance = tdee !== null && avgIntake !== null ? avgIntake - tdee : null;
  const projectedKgPerWeek = avgDailyBalance !== null ? (avgDailyBalance * 7) / KCAL_PER_KG : null;

  return {
    start,
    end,
    days,
    loggedDays: logged.length,
    avgIntake,
    avgProtein,
    onTargetDays,
    weightDeltaKg,
    tdee,
    avgDailyBalance,
    projectedKgPerWeek,
  };
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
