import { describe, expect, it } from 'vitest';
import {
  cyclePosition,
  dayNutrition,
  epley1RM,
  estimateTDEE,
  lastSetsForExercise,
  nextProgramDay,
  prsByExercise,
  recentPRs,
  targetFor,
  trendDelta,
  weekOf,
  weeklySetsByMuscle,
  weekReport,
  weightTrend,
  workoutTonnage,
} from '../fitnessCalc';
import type {
  BodyMetric,
  Exercise,
  NutritionLog,
  NutritionTarget,
  Program,
  ProgramDay,
  Workout,
  WorkoutSet,
} from '../types';

const base = { owner_id: 'o', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z', deleted_at: null };

function workout(id: string, date: string, extra: Partial<Workout> = {}): Workout {
  return {
    id,
    date,
    program_id: null,
    program_day_id: null,
    week_number: null,
    name: '',
    status: 'completed',
    started_at: null,
    completed_at: `${date}T10:00:00Z`,
    notes: '',
    ...base,
    ...extra,
  };
}

function set(id: string, workout_id: string, exercise_id: string, weight: number, reps: number, extra: Partial<WorkoutSet> = {}): WorkoutSet {
  return {
    id,
    workout_id,
    exercise_id,
    set_number: 1,
    weight_kg: weight,
    reps,
    rpe: null,
    is_warmup: false,
    done: true,
    ...base,
    ...extra,
  };
}

describe('epley1RM', () => {
  it('returns the weight itself for a single', () => {
    expect(epley1RM(100, 1)).toBe(100);
  });
  it('estimates above the weight for multiple reps', () => {
    expect(epley1RM(100, 10)).toBeCloseTo(133.33, 1);
  });
  it('returns 0 for nonsense inputs', () => {
    expect(epley1RM(0, 5)).toBe(0);
    expect(epley1RM(100, 0)).toBe(0);
  });
});

describe('prsByExercise', () => {
  const workouts = [workout('w1', '2026-06-01'), workout('w2', '2026-06-08')];
  it('keeps the best e1RM set per exercise', () => {
    const sets = [
      set('s1', 'w1', 'ex1', 100, 5),
      set('s2', 'w2', 'ex1', 102.5, 5),
      set('s3', 'w2', 'ex2', 60, 10),
    ];
    const prs = prsByExercise(sets, workouts);
    expect(prs.get('ex1')!.weight_kg).toBe(102.5);
    expect(prs.get('ex1')!.date).toBe('2026-06-08');
    expect(prs.get('ex2')!.reps).toBe(10);
  });
  it('ignores warmups and undone sets', () => {
    const sets = [
      set('s1', 'w1', 'ex1', 100, 5),
      set('s2', 'w2', 'ex1', 140, 5, { is_warmup: true }),
      set('s3', 'w2', 'ex1', 150, 5, { done: false }),
    ];
    expect(prsByExercise(sets, workouts).get('ex1')!.weight_kg).toBe(100);
  });
});

describe('recentPRs', () => {
  it('only counts improvements over prior history, within the window', () => {
    const workouts = [workout('w1', '2026-06-01'), workout('w2', '2026-06-20'), workout('w3', '2026-06-27')];
    const sets = [
      set('s1', 'w1', 'ex1', 100, 5),
      set('s2', 'w2', 'ex1', 95, 5), // not a PR
      set('s3', 'w3', 'ex1', 105, 5), // PR
    ];
    const prs = recentPRs(sets, workouts, '2026-06-15');
    expect(prs).toHaveLength(1);
    expect(prs[0].weight_kg).toBe(105);
  });
  it('does not flag the first-ever set of an exercise as a PR', () => {
    const workouts = [workout('w1', '2026-06-27')];
    const sets = [set('s1', 'w1', 'ex1', 100, 5)];
    expect(recentPRs(sets, workouts, '2026-06-01')).toHaveLength(0);
  });
});

describe('weekOf', () => {
  it('returns the Monday-start week', () => {
    // 2026-07-03 is a Friday.
    expect(weekOf('2026-07-03')).toEqual({ start: '2026-06-29', end: '2026-07-05' });
    expect(weekOf('2026-06-29')).toEqual({ start: '2026-06-29', end: '2026-07-05' });
  });
});

describe('weeklySetsByMuscle / workoutTonnage', () => {
  const exercises: Exercise[] = [
    { id: 'ex1', name: 'Bench', muscle_group: 'chest', secondary_muscles: '', equipment: '', notes: '', ...base },
    { id: 'ex2', name: 'Squat', muscle_group: 'quads', secondary_muscles: '', equipment: '', notes: '', ...base },
  ];
  const workouts = [workout('w1', '2026-06-30'), workout('w2', '2026-06-20')];
  const sets = [
    set('s1', 'w1', 'ex1', 100, 5),
    set('s2', 'w1', 'ex1', 100, 5),
    set('s3', 'w1', 'ex2', 140, 5),
    set('s4', 'w2', 'ex1', 100, 5), // outside the week
  ];
  it('counts hard sets inside the week only', () => {
    const counts = weeklySetsByMuscle(sets, workouts, exercises, '2026-06-29', '2026-07-05');
    expect(counts.get('chest')).toBe(2);
    expect(counts.get('quads')).toBe(1);
  });
  it('sums tonnage per workout', () => {
    expect(workoutTonnage(sets, 'w1')).toBe(100 * 5 + 100 * 5 + 140 * 5);
  });
});

describe('weightTrend / trendDelta', () => {
  it('computes a trailing moving average and its change', () => {
    const metrics: BodyMetric[] = Array.from({ length: 14 }, (_, i) => ({
      id: `m${i}`,
      date: `2026-06-${String(i + 1).padStart(2, '0')}`,
      weight_kg: 90 - i * 0.1, // steady loss
      body_fat_pct: null,
      muscle_mass_kg: null,
      source: 'renpho',
      notes: '',
      ...base,
    }));
    const trend = weightTrend(metrics, 7);
    expect(trend).toHaveLength(14);
    expect(trend[13].avg).toBeLessThan(trend[6].avg);
    const delta = trendDelta(trend, 7);
    expect(delta).not.toBeNull();
    expect(delta!).toBeLessThan(0);
  });
  it('returns null delta with too little data', () => {
    expect(trendDelta([], 7)).toBeNull();
  });
});

describe('dayNutrition / targetFor', () => {
  const logs: NutritionLog[] = [
    { id: 'n1', date: '2026-07-03', meal: 'breakfast', name: 'Oats', calories: 500, protein_g: 40, carbs_g: 60, fat_g: 10, notes: '', ...base },
    { id: 'n2', date: '2026-07-03', meal: 'lunch', name: 'Chicken', calories: 700, protein_g: 55, carbs_g: 70, fat_g: 15, notes: '', ...base },
    { id: 'n3', date: '2026-07-02', meal: 'dinner', name: 'Steak', calories: 800, protein_g: 50, carbs_g: 40, fat_g: 35, notes: '', ...base },
  ];
  it('totals one day only', () => {
    const t = dayNutrition(logs, '2026-07-03');
    expect(t.calories).toBe(1200);
    expect(t.protein_g).toBe(95);
  });
  it('applies the newest target on or before the date', () => {
    const targets: NutritionTarget[] = [
      { id: 't1', effective_from: '2026-01-01', phase: 'bulk', calories: 3200, protein_g: 190, carbs_g: 380, fat_g: 90, notes: '', ...base },
      { id: 't2', effective_from: '2026-06-01', phase: 'cut', calories: 2400, protein_g: 200, carbs_g: 220, fat_g: 75, notes: '', ...base },
    ];
    expect(targetFor(targets, '2026-07-03')!.phase).toBe('cut');
    expect(targetFor(targets, '2026-03-01')!.phase).toBe('bulk');
    expect(targetFor(targets, '2025-12-01')).toBeNull();
  });
});

describe('estimateTDEE / weekReport', () => {
  // 21 days of complete logging at 2500 kcal/day with weight dead flat →
  // maintenance should come back ≈ 2500.
  const flatMetrics: BodyMetric[] = Array.from({ length: 21 }, (_, i) => ({
    id: `bm${i}`,
    date: `2026-06-${String(i + 1).padStart(2, '0')}`,
    weight_kg: 90,
    body_fat_pct: null,
    muscle_mass_kg: null,
    source: 'renpho' as const,
    notes: '',
    ...base,
  }));
  const steadyLogs: NutritionLog[] = Array.from({ length: 21 }, (_, i) => ({
    id: `nl${i}`,
    date: `2026-06-${String(i + 1).padStart(2, '0')}`,
    meal: 'dinner' as const,
    name: 'Day of food',
    calories: 2500,
    protein_g: 180,
    carbs_g: 250,
    fat_g: 80,
    notes: '',
    ...base,
  }));

  it('flat weight at steady intake → TDEE ≈ intake', () => {
    const est = estimateTDEE(steadyLogs, flatMetrics, '2026-06-21');
    expect(est).not.toBeNull();
    expect(est!.reliable).toBe(true);
    expect(est!.tdee).toBe(2500);
    expect(est!.weightDeltaKg).toBeCloseTo(0, 5);
  });

  it('losing weight at steady intake → TDEE above intake (a real deficit)', () => {
    // ~0.5kg lost across the window at 2500/day → TDEE ≈ 2500 + 0.5*7700/20
    const losing = flatMetrics.map((m, i) => ({ ...m, weight_kg: 90 - i * 0.025 }));
    const est = estimateTDEE(steadyLogs, losing, '2026-06-21');
    expect(est).not.toBeNull();
    expect(est!.tdee).toBeGreaterThan(2500);
    expect(est!.tdee).toBeLessThan(2800);
  });

  it('too little data → null or unreliable', () => {
    expect(estimateTDEE([], [], '2026-06-21')).toBeNull();
    const twoDays = flatMetrics.slice(0, 2);
    expect(estimateTDEE(steadyLogs, twoDays, '2026-06-21')).toBeNull(); // span < 7d
    const sparse = estimateTDEE(steadyLogs.slice(0, 3), flatMetrics, '2026-06-21');
    expect(sparse!.reliable).toBe(false); // only 3 logged days
  });

  it('weekReport aggregates days, adherence and balance', () => {
    const targets: NutritionTarget[] = [
      { id: 't', effective_from: '2026-01-01', phase: 'cut', calories: 2600, protein_g: 190, carbs_g: 240, fat_g: 80, notes: '', ...base },
    ];
    // Week of Mon 15 Jun – Sun 21 Jun, fully logged at 2500 (all under 2600).
    const r = weekReport(steadyLogs, targets, flatMetrics, '2026-06-17');
    expect(r.start).toBe('2026-06-15');
    expect(r.end).toBe('2026-06-21');
    expect(r.loggedDays).toBe(7);
    expect(r.avgIntake).toBe(2500);
    expect(r.onTargetDays).toBe(7);
    expect(r.weightDeltaKg).toBeCloseTo(0, 5);
    expect(r.tdee).toBe(2500);
    expect(r.avgDailyBalance).toBe(0);
    expect(r.projectedKgPerWeek).toBeCloseTo(0, 5);
  });

  it('weekReport with nothing logged reports empty days, not zeros-as-data', () => {
    const r = weekReport([], [], [], '2026-06-17');
    expect(r.loggedDays).toBe(0);
    expect(r.avgIntake).toBeNull();
    expect(r.days.every((d) => !d.logged)).toBe(true);
  });
});

describe('cyclePosition', () => {
  const program: Program = {
    id: 'p1', name: 'Block', description: '', weeks: 4, status: 'active',
    start_date: '2026-06-01', notes: '', ...base,
  };
  it('tracks week within the cycle and the cycle number', () => {
    expect(cyclePosition(program, '2026-06-01')).toEqual({ cycle: 1, week: 1 });
    expect(cyclePosition(program, '2026-06-08')).toEqual({ cycle: 1, week: 2 });
    expect(cyclePosition(program, '2026-06-29')).toEqual({ cycle: 2, week: 1 });
  });
  it('returns null before the start or without a start date', () => {
    expect(cyclePosition(program, '2026-05-31')).toBeNull();
    expect(cyclePosition({ ...program, start_date: null }, '2026-06-05')).toBeNull();
  });
});

describe('nextProgramDay', () => {
  const days: ProgramDay[] = [1, 2, 3].map((n) => ({
    id: `d${n}`, program_id: 'p1', day_order: n, name: `Day ${n}`, focus: '', ...base,
  }));
  it('suggests the first day with no history', () => {
    expect(nextProgramDay(days, [], 'p1')!.id).toBe('d1');
  });
  it('advances past the last completed day and wraps', () => {
    const done = [
      workout('w1', '2026-06-01', { program_id: 'p1', program_day_id: 'd3' }),
    ];
    expect(nextProgramDay(days, done, 'p1')!.id).toBe('d1');
    const done2 = [workout('w2', '2026-06-02', { program_id: 'p1', program_day_id: 'd1' })];
    expect(nextProgramDay(days, done2, 'p1')!.id).toBe('d2');
  });
});

describe('lastSetsForExercise', () => {
  it('returns the most recent completed workout containing the exercise', () => {
    const workouts = [
      workout('w1', '2026-06-20'),
      workout('w2', '2026-06-27'),
      workout('w3', '2026-07-01', { status: 'in_progress' }),
    ];
    const sets = [
      set('s1', 'w1', 'ex1', 100, 8),
      set('s2', 'w2', 'ex1', 102.5, 8),
      set('s3', 'w3', 'ex1', 105, 8),
    ];
    const last = lastSetsForExercise(sets, workouts, 'ex1', 'w3');
    expect(last!.date).toBe('2026-06-27');
    expect(Number(last!.sets[0].weight_kg)).toBe(102.5);
  });
  it('returns null with no history', () => {
    expect(lastSetsForExercise([], [], 'ex1')).toBeNull();
  });
});
