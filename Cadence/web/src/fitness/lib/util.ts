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

// Drop a leading weekday from a program-day / session name so a schedule that
// was authored as "Monday — Upper A" just reads "Upper A". Cadence doesn't
// assume you train on any given weekday — you go in order — so the weekday is
// noise (and wrong the moment you train on a different day). Only strips when a
// separator follows, so a legitimate name like "Sunday Long Run" is left alone.
const DAY_PREFIX_RE =
  /^(monday|tuesday|wednesday|thursday|friday|saturday|sunday|mon|tue|tues|wed|thu|thur|thurs|fri|sat|sun)\s*[—–\-:·]\s*/i;
export function stripDayPrefix(name: string): string {
  const stripped = (name || '').replace(DAY_PREFIX_RE, '').trim();
  return stripped || name;
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
  const v = Number.isFinite(Number(kg)) ? Number(kg) : 0;
  return `${v.toLocaleString('en-AU', { minimumFractionDigits: 0, maximumFractionDigits: digits })}kg`;
}

export function fmtNum(n: number, digits = 0): string {
  const v = Number.isFinite(Number(n)) ? Number(n) : 0;
  return v.toLocaleString('en-AU', { minimumFractionDigits: 0, maximumFractionDigits: digits });
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
  health: 'Apple Health',
  agent: 'Kobe',
};

export const EQUIPMENT_OPTIONS = ['barbell', 'dumbbell', 'cable', 'machine', 'bodyweight', 'kettlebell', 'other'];

// The full common-movement library lives in lib/exerciseCatalog.ts and is
// auto-seeded on first sign-in (see lib/store.tsx).
