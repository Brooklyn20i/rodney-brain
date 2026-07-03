// ── Labels + formatting ─────────────────────────────────────────────────────
// en-AU locale to match the rest of the Cadence family (DD/MM dates, kg).

import type { CardioKind, MealType, MetricSource, MuscleGroup, NutritionPhase } from './types';

export function todayISO(): string {
  return toISODate(new Date());
}

export function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function addDays(iso: string, days: number): string {
  const d = new Date(iso + 'T12:00:00');
  d.setDate(d.getDate() + days);
  return toISODate(d);
}

export function fmtDMY(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso.length === 10 ? iso + 'T12:00:00' : iso);
  return d.toLocaleDateString('en-AU', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

// 'Thu 3 Jul'
export function fmtDayShort(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso.length === 10 ? iso + 'T12:00:00' : iso);
  return d.toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' });
}

export function fmtTimeHM(iso: string | null): string {
  if (!iso) return '';
  return new Date(iso).toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' });
}

export function fmtKg(kg: number, digits = 1): string {
  return `${Number(kg).toLocaleString('en-AU', { minimumFractionDigits: 0, maximumFractionDigits: digits })}kg`;
}

export function fmtNum(n: number, digits = 0): string {
  return Number(n).toLocaleString('en-AU', { minimumFractionDigits: 0, maximumFractionDigits: digits });
}

export const MUSCLE_GROUP_LABEL: Record<MuscleGroup, string> = {
  chest: 'Chest',
  back: 'Back',
  shoulders: 'Shoulders',
  biceps: 'Biceps',
  triceps: 'Triceps',
  quads: 'Quads',
  hamstrings: 'Hamstrings',
  glutes: 'Glutes',
  calves: 'Calves',
  core: 'Core',
  forearms: 'Forearms',
  full_body: 'Full body',
  other: 'Other',
};

export const MUSCLE_GROUPS = Object.keys(MUSCLE_GROUP_LABEL) as MuscleGroup[];

export const CARDIO_KIND_LABEL: Record<CardioKind, string> = {
  run: 'Run',
  bike: 'Bike',
  row: 'Row',
  swim: 'Swim',
  walk: 'Walk',
  hike: 'Hike',
  stairs: 'Stairs',
  elliptical: 'Elliptical',
  hiit: 'HIIT',
  other: 'Other',
};

export const CARDIO_KINDS = Object.keys(CARDIO_KIND_LABEL) as CardioKind[];

export const MEAL_LABEL: Record<MealType, string> = {
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  dinner: 'Dinner',
  snack: 'Snack',
  shake: 'Shake',
};

export const MEALS = Object.keys(MEAL_LABEL) as MealType[];

export const PHASE_LABEL: Record<NutritionPhase, string> = {
  cut: 'Cut',
  maintain: 'Maintain',
  bulk: 'Bulk',
};

export const SOURCE_LABEL: Record<MetricSource, string> = {
  manual: 'Manual',
  whoop: 'Whoop',
  renpho: 'Renpho',
  agent: 'Kobe',
};

export const EQUIPMENT_OPTIONS = ['barbell', 'dumbbell', 'cable', 'machine', 'bodyweight', 'kettlebell', 'other'];

// One-tap starter library offered on the Exercises screen when the library is
// empty -- saves typing in the obvious lifts on day one. Rows are inserted as
// normal owner rows; edit or delete them freely afterwards.
export const STARTER_EXERCISES: { name: string; muscle_group: MuscleGroup; equipment: string }[] = [
  { name: 'Barbell Bench Press', muscle_group: 'chest', equipment: 'barbell' },
  { name: 'Incline Dumbbell Press', muscle_group: 'chest', equipment: 'dumbbell' },
  { name: 'Cable Fly', muscle_group: 'chest', equipment: 'cable' },
  { name: 'Overhead Press', muscle_group: 'shoulders', equipment: 'barbell' },
  { name: 'Dumbbell Lateral Raise', muscle_group: 'shoulders', equipment: 'dumbbell' },
  { name: 'Rear Delt Fly', muscle_group: 'shoulders', equipment: 'dumbbell' },
  { name: 'Deadlift', muscle_group: 'back', equipment: 'barbell' },
  { name: 'Barbell Row', muscle_group: 'back', equipment: 'barbell' },
  { name: 'Lat Pulldown', muscle_group: 'back', equipment: 'cable' },
  { name: 'Seated Cable Row', muscle_group: 'back', equipment: 'cable' },
  { name: 'Pull-Up', muscle_group: 'back', equipment: 'bodyweight' },
  { name: 'Barbell Squat', muscle_group: 'quads', equipment: 'barbell' },
  { name: 'Leg Press', muscle_group: 'quads', equipment: 'machine' },
  { name: 'Leg Extension', muscle_group: 'quads', equipment: 'machine' },
  { name: 'Romanian Deadlift', muscle_group: 'hamstrings', equipment: 'barbell' },
  { name: 'Lying Leg Curl', muscle_group: 'hamstrings', equipment: 'machine' },
  { name: 'Hip Thrust', muscle_group: 'glutes', equipment: 'barbell' },
  { name: 'Walking Lunge', muscle_group: 'glutes', equipment: 'dumbbell' },
  { name: 'Standing Calf Raise', muscle_group: 'calves', equipment: 'machine' },
  { name: 'Barbell Curl', muscle_group: 'biceps', equipment: 'barbell' },
  { name: 'Incline Dumbbell Curl', muscle_group: 'biceps', equipment: 'dumbbell' },
  { name: 'Cable Triceps Pushdown', muscle_group: 'triceps', equipment: 'cable' },
  { name: 'Skull Crusher', muscle_group: 'triceps', equipment: 'barbell' },
  { name: 'Cable Crunch', muscle_group: 'core', equipment: 'cable' },
  { name: 'Plank', muscle_group: 'core', equipment: 'bodyweight' },
];
