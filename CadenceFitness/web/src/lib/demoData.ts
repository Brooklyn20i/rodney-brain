// Fictional demo seed -- loaded only when VITE_DEMO=1 (no Supabase needed).
// Every number here is made up. Generated relative to today so the dashboard,
// trend and cycle views always look alive. Never used in a deployed build.

import type {
  CadenceFitnessData,
  Exercise,
  MuscleGroup,
  NutritionLog,
  Program,
  ProgramDay,
  ProgramExercise,
  Workout,
  WorkoutSet,
} from './types';
import { emptyData } from './types';
import { addDays, todayISO } from './util';

const OWNER = 'demo-owner';
let seq = 0;
function id(prefix: string): string {
  seq += 1;
  return `demo-${prefix}-${seq}`;
}

// Deterministic wobble so the demo looks organic but never changes shape.
function wobble(i: number, scale: number): number {
  return Math.sin(i * 2.399) * scale;
}

function stamp<T>(row: T, dateISO: string): T & {
  owner_id: string;
  created_at: string;
  updated_at: string;
  deleted_at: null;
} {
  const ts = `${dateISO}T09:00:00.000Z`;
  return { ...row, owner_id: OWNER, created_at: ts, updated_at: ts, deleted_at: null };
}

export function loadDemoData(): CadenceFitnessData {
  const data = emptyData();
  const today = todayISO();

  // ── Exercise library ──────────────────────────────────────────────────
  const lib: [string, MuscleGroup, string][] = [
    ['Barbell Bench Press', 'chest', 'barbell'],
    ['Incline Dumbbell Press', 'chest', 'dumbbell'],
    ['Overhead Press', 'shoulders', 'barbell'],
    ['Dumbbell Lateral Raise', 'shoulders', 'dumbbell'],
    ['Cable Triceps Pushdown', 'triceps', 'cable'],
    ['Deadlift', 'back', 'barbell'],
    ['Barbell Row', 'back', 'barbell'],
    ['Lat Pulldown', 'back', 'cable'],
    ['Barbell Curl', 'biceps', 'barbell'],
    ['Barbell Squat', 'quads', 'barbell'],
    ['Leg Press', 'quads', 'machine'],
    ['Romanian Deadlift', 'hamstrings', 'barbell'],
    ['Lying Leg Curl', 'hamstrings', 'machine'],
    ['Standing Calf Raise', 'calves', 'machine'],
    ['Cable Crunch', 'core', 'cable'],
  ];
  const ex = new Map<string, Exercise>();
  for (const [name, muscle_group, equipment] of lib) {
    const row = stamp(
      { id: id('ex'), name, muscle_group, secondary_muscles: '', equipment, notes: '' },
      addDays(today, -60)
    ) as Exercise;
    ex.set(name, row);
    data.exercises.push(row);
  }
  const exId = (name: string) => ex.get(name)!.id;

  // ── Program: 5-day split in 4-week cycles, started 3 weeks ago ────────
  const program: Program = stamp(
    {
      id: id('prog'),
      name: 'Upper/Lower Power-Build',
      description: 'Fictional 5-day split: push, pull, legs, upper, lower. 4-week cycles with a deload in week 4.',
      weeks: 4,
      status: 'active' as const,
      start_date: addDays(today, -21),
      notes: 'Add 2.5kg to a lift whenever all working sets hit the top of the rep range.',
    },
    addDays(today, -22)
  );
  data.programs.push(program);

  const dayDefs: { name: string; focus: string; slots: [string, number, number, number, number][] }[] = [
    {
      name: 'Day 1 — Push',
      focus: 'Chest / shoulders / triceps',
      slots: [
        ['Barbell Bench Press', 4, 5, 8, 180],
        ['Incline Dumbbell Press', 3, 8, 12, 120],
        ['Overhead Press', 3, 6, 10, 150],
        ['Dumbbell Lateral Raise', 3, 12, 15, 90],
        ['Cable Triceps Pushdown', 3, 10, 15, 90],
      ],
    },
    {
      name: 'Day 2 — Pull',
      focus: 'Back / biceps',
      slots: [
        ['Deadlift', 3, 3, 5, 240],
        ['Barbell Row', 4, 6, 10, 150],
        ['Lat Pulldown', 3, 8, 12, 120],
        ['Barbell Curl', 3, 8, 12, 90],
      ],
    },
    {
      name: 'Day 3 — Legs',
      focus: 'Quads / hamstrings / calves',
      slots: [
        ['Barbell Squat', 4, 5, 8, 210],
        ['Leg Press', 3, 8, 12, 150],
        ['Romanian Deadlift', 3, 8, 10, 150],
        ['Standing Calf Raise', 4, 10, 15, 90],
      ],
    },
    {
      name: 'Day 4 — Upper',
      focus: 'Chest / back / arms',
      slots: [
        ['Incline Dumbbell Press', 4, 8, 12, 120],
        ['Barbell Row', 3, 8, 12, 120],
        ['Overhead Press', 3, 8, 12, 120],
        ['Barbell Curl', 3, 10, 15, 90],
        ['Cable Triceps Pushdown', 3, 10, 15, 90],
      ],
    },
    {
      name: 'Day 5 — Lower',
      focus: 'Quads / glutes / core',
      slots: [
        ['Barbell Squat', 3, 8, 10, 180],
        ['Lying Leg Curl', 3, 10, 15, 120],
        ['Standing Calf Raise', 3, 12, 15, 90],
        ['Cable Crunch', 3, 12, 20, 90],
      ],
    },
  ];

  const days: ProgramDay[] = [];
  for (let i = 0; i < dayDefs.length; i++) {
    const d = dayDefs[i];
    const day: ProgramDay = stamp(
      { id: id('day'), program_id: program.id, day_order: i + 1, name: d.name, focus: d.focus },
      addDays(today, -22)
    );
    days.push(day);
    data.program_days.push(day);
    d.slots.forEach(([name, sets, repMin, repMax, rest], j) => {
      const slot: ProgramExercise = stamp(
        {
          id: id('slot'),
          program_day_id: day.id,
          exercise_id: exId(name),
          ex_order: j + 1,
          target_sets: sets,
          rep_min: repMin,
          rep_max: repMax,
          target_rpe: 8,
          rest_seconds: rest,
          notes: '',
        },
        addDays(today, -22)
      );
      data.program_exercises.push(slot);
    });
  }

  // Base working weights (fictional) per exercise, in kg.
  const baseWeight: Record<string, number> = {
    'Barbell Bench Press': 100,
    'Incline Dumbbell Press': 34,
    'Overhead Press': 62.5,
    'Dumbbell Lateral Raise': 12,
    'Cable Triceps Pushdown': 40,
    Deadlift: 180,
    'Barbell Row': 90,
    'Lat Pulldown': 75,
    'Barbell Curl': 40,
    'Barbell Squat': 140,
    'Leg Press': 220,
    'Romanian Deadlift': 110,
    'Lying Leg Curl': 55,
    'Standing Calf Raise': 90,
    'Cable Crunch': 50,
  };

  // ── 3 weeks of completed sessions (5/week: Mon-Fri pattern) ───────────
  let sessionCount = 0;
  for (let daysAgo = 21; daysAgo >= 1; daysAgo--) {
    const date = addDays(today, -daysAgo);
    const dow = new Date(date + 'T12:00:00').getDay(); // 0=Sun
    if (dow === 0 || dow === 6) continue; // rest on weekends
    const dayIdx = sessionCount % days.length;
    sessionCount += 1;
    const pd = days[dayIdx];
    const weekNo = Math.floor((21 - daysAgo) / 7) + 1;
    const workout: Workout = stamp(
      {
        id: id('wo'),
        date,
        program_id: program.id,
        program_day_id: pd.id,
        week_number: weekNo,
        name: pd.name,
        status: 'completed' as const,
        started_at: `${date}T06:10:00.000Z`,
        completed_at: `${date}T07:05:00.000Z`,
        notes: '',
      },
      date
    );
    data.workouts.push(workout);

    const slots = data.program_exercises.filter((s) => s.program_day_id === pd.id);
    for (const slot of slots) {
      const exercise = data.exercises.find((e) => e.id === slot.exercise_id)!;
      // Small linear progression week to week so history and PRs look real.
      const w = (baseWeight[exercise.name] ?? 40) + (weekNo - 1) * 2.5;
      for (let setNo = 1; setNo <= slot.target_sets; setNo++) {
        const reps = Math.max(
          slot.rep_min,
          Math.min(slot.rep_max, slot.rep_max - Math.round(Math.abs(wobble(sessionCount + setNo, 2))))
        );
        const set: WorkoutSet = stamp(
          {
            id: id('set'),
            workout_id: workout.id,
            exercise_id: slot.exercise_id,
            set_number: setNo,
            weight_kg: w,
            reps,
            rpe: 8,
            is_warmup: false,
            done: true,
          },
          date
        );
        data.workout_sets.push(set);
      }
    }
  }

  // ── Cardio + sauna ─────────────────────────────────────────────────────
  for (const daysAgo of [2, 5, 9, 12, 16, 19]) {
    const date = addDays(today, -daysAgo);
    data.cardio_sessions.push(
      stamp(
        {
          id: id('cardio'),
          date,
          kind: (daysAgo % 2 === 0 ? 'run' : 'bike') as CadenceFitnessData['cardio_sessions'][number]['kind'],
          duration_min: 30 + (daysAgo % 3) * 5,
          distance_km: daysAgo % 2 === 0 ? 5.2 : 15,
          avg_hr: 142 + (daysAgo % 4),
          calories: 320 + (daysAgo % 3) * 30,
          notes: '',
        },
        date
      )
    );
  }
  for (const daysAgo of [1, 4, 8, 11, 15, 18]) {
    const date = addDays(today, -daysAgo);
    data.sauna_sessions.push(
      stamp(
        { id: id('sauna'), date, duration_min: 20, temperature_c: 90, rounds: daysAgo % 3 === 0 ? 2 : 1, notes: '' },
        date
      )
    );
  }

  // ── Body + recovery metrics (30 / 14 days) ─────────────────────────────
  for (let daysAgo = 30; daysAgo >= 0; daysAgo--) {
    const date = addDays(today, -daysAgo);
    data.body_metrics.push(
      stamp(
        {
          id: id('body'),
          date,
          weight_kg: Math.round((86.5 - (30 - daysAgo) * 0.045 + wobble(daysAgo, 0.4)) * 10) / 10,
          body_fat_pct: Math.round((18.2 - (30 - daysAgo) * 0.02 + wobble(daysAgo + 3, 0.25)) * 10) / 10,
          muscle_mass_kg: null,
          source: 'renpho' as const,
          notes: '',
        },
        date
      )
    );
  }
  for (let daysAgo = 14; daysAgo >= 0; daysAgo--) {
    const date = addDays(today, -daysAgo);
    data.recovery_metrics.push(
      stamp(
        {
          id: id('rec'),
          date,
          recovery_pct: Math.round(68 + wobble(daysAgo * 3, 22)),
          strain: Math.round((13 + wobble(daysAgo * 2 + 1, 4)) * 10) / 10,
          resting_hr: Math.round(52 + wobble(daysAgo + 5, 3)),
          hrv_ms: Math.round(78 + wobble(daysAgo * 2, 14)),
          sleep_hours: Math.round((7.2 + wobble(daysAgo + 2, 0.8)) * 10) / 10,
          sleep_performance_pct: Math.round(84 + wobble(daysAgo * 4, 10)),
          active_energy_kcal: Math.round(680 + wobble(daysAgo * 5, 260)),
          steps: Math.round(9000 + wobble(daysAgo * 3 + 1, 3500)),
          source: 'whoop' as const,
          notes: '',
        },
        date
      )
    );
  }

  // ── Nutrition: targets, saved meals, today's + yesterday's log ─────────
  data.nutrition_targets.push(
    stamp(
      {
        id: id('target'),
        effective_from: addDays(today, -30),
        phase: 'cut' as const,
        calories: 2400,
        protein_g: 200,
        carbs_g: 220,
        fat_g: 75,
        notes: 'Fictional demo cut targets.',
      },
      addDays(today, -30)
    )
  );
  const meals: [string, CadenceFitnessData['saved_meals'][number]['meal'], number, number, number, number][] = [
    ['Oats, whey & berries', 'breakfast', 520, 42, 62, 12],
    ['Chicken, rice & greens', 'lunch', 680, 55, 78, 14],
    ['Steak, potatoes & salad', 'dinner', 750, 52, 60, 30],
    ['Protein shake', 'shake', 180, 35, 6, 2],
    ['Greek yoghurt & honey', 'snack', 240, 20, 30, 5],
  ];
  for (const [name, meal, calories, p, c, f] of meals) {
    data.saved_meals.push(
      stamp(
        { id: id('meal'), name, meal, calories, protein_g: p, carbs_g: c, fat_g: f, notes: '' },
        addDays(today, -25)
      )
    );
  }
  const logDay = (date: string, upTo: number) => {
    meals.slice(0, upTo).forEach(([name, meal, calories, p, c, f]) => {
      data.nutrition_logs.push(
        stamp(
          { id: id('log'), date, meal, name, calories, protein_g: p, carbs_g: c, fat_g: f, notes: '' },
          date
        ) as NutritionLog
      );
    });
  };
  logDay(addDays(today, -1), 5);
  logDay(today, 3); // dinner not logged yet -- leaves headroom on the dashboard

  // ── Kobe thread ────────────────────────────────────────────────────────
  data.agent_messages.push(
    stamp(
      {
        id: id('msg'),
        sender_type: 'agent' as const,
        sender_label: 'Kobe',
        body: 'Morning. Recovery is 74% and you slept 7.4h — green light for Day 4 Upper. Bench moved up 2.5kg last week; if the top sets feel like RPE 8 or less, take the next jump.',
        status: 'unread' as const,
        linked_workout_id: null,
        linked_date: today,
      },
      today
    )
  );
  data.agent_messages.push(
    stamp(
      {
        id: id('msg'),
        sender_type: 'user' as const,
        sender_label: 'Rodney',
        body: 'Log sauna 20 min after tonight’s session please.',
        status: 'processed' as const,
        linked_workout_id: null,
        linked_date: addDays(today, -1),
      },
      addDays(today, -1)
    )
  );

  return data;
}
