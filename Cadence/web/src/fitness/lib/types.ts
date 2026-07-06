// ── CANONICAL TYPE CONTRACT ────────────────────────────────────────────────
// Single source of truth for the Cadence Fitness data model. Postgres schema
// in CadenceFitness/backend/migrations/ must match, and the agent bridge
// (CadenceFitness/agent/) mirrors the table list.
//
// Derived figures (e1RM, PRs, weekly volume, weight trend, calorie adherence,
// current cycle week) are never stored -- they're computed from these raw
// rows in lib/fitnessCalc.ts so they can't drift from their inputs.
// ─────────────────────────────────────────────────────────────────────────

export type MuscleGroup =
  | 'chest'
  | 'back'
  | 'shoulders'
  | 'biceps'
  | 'triceps'
  | 'quads'
  | 'hamstrings'
  | 'glutes'
  | 'calves'
  | 'core'
  | 'forearms'
  | 'full_body'
  | 'other';

export type ProgramStatus = 'draft' | 'active' | 'completed' | 'archived';

export type WorkoutStatus = 'in_progress' | 'completed' | 'skipped';

export type CardioKind =
  | 'run'
  | 'bike'
  | 'row'
  | 'swim'
  | 'walk'
  | 'hike'
  | 'stairs'
  | 'elliptical'
  | 'hiit'
  | 'other';

// Where a metric came from. 'whoop' / 'renpho' rows are values read off those
// apps; 'health' is synced from Apple Health (which both Whoop and Renpho
// write into); 'agent' is logged by Kobe; 'manual' is typed in directly.
export type MetricSource = 'manual' | 'whoop' | 'renpho' | 'health' | 'agent';

export type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack' | 'shake';

export type NutritionPhase = 'cut' | 'maintain' | 'bulk';

// The exercise library. Seed it with the starter list in util.ts or add your
// own; program slots and logged sets both reference these rows.
export interface Exercise {
  id: string;
  owner_id: string;
  name: string;
  muscle_group: MuscleGroup;
  secondary_muscles: string; // free text, e.g. "triceps, front delts"
  equipment: string; // 'barbell' | 'dumbbell' | 'cable' | 'machine' | 'bodyweight' | free text
  notes: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

// A training program (e.g. a 5-day split) run in cycles of `weeks` weeks.
// One program is 'active' at a time; the Workout screen builds today's
// session from its days.
export interface Program {
  id: string;
  owner_id: string;
  name: string;
  description: string;
  weeks: number; // mesocycle length; week N of the cycle shown on the dashboard
  status: ProgramStatus;
  start_date: string | null; // 'YYYY-MM-DD'; anchors the cycle-week calculation
  notes: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

// A day slot within a program ("Day 1 — Push"). day_order is its position,
// not a weekday: you run the next day whenever you next train.
export interface ProgramDay {
  id: string;
  owner_id: string;
  program_id: string;
  day_order: number;
  name: string;
  focus: string; // e.g. "Chest / shoulders / triceps"
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

// An exercise slot in a program day with its set/rep targets.
export interface ProgramExercise {
  id: string;
  owner_id: string;
  program_day_id: string;
  exercise_id: string;
  ex_order: number;
  target_sets: number;
  rep_min: number;
  rep_max: number;
  target_rpe: number | null;
  rest_seconds: number;
  notes: string; // progression cues, e.g. "+2.5kg when all sets hit top reps"
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

// A logged gym session. Usually created from a program day (guided mode) but
// program refs are nullable so ad-hoc sessions work too.
export interface Workout {
  id: string;
  owner_id: string;
  date: string; // 'YYYY-MM-DD'
  program_id: string | null;
  program_day_id: string | null;
  week_number: number | null; // cycle week this session belonged to
  name: string;
  status: WorkoutStatus;
  started_at: string | null;
  completed_at: string | null;
  notes: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

// One logged set. Weight in kg; `done` flips when the set is ticked off in
// guided mode (undone rows are the pre-filled targets).
export interface WorkoutSet {
  id: string;
  owner_id: string;
  workout_id: string;
  exercise_id: string;
  set_number: number;
  weight_kg: number;
  reps: number;
  rpe: number | null;
  is_warmup: boolean;
  done: boolean;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface CardioSession {
  id: string;
  owner_id: string;
  date: string;
  kind: CardioKind;
  duration_min: number;
  distance_km: number;
  avg_hr: number;
  calories: number;
  // When a run/row/ride is logged inside a gym session it's linked here, so it
  // shows within that workout and is cleaned up if the session is discarded.
  // Standalone cardio (logged on the Cardio screen) leaves this null.
  workout_id: string | null;
  // WHOOP-synced sessions carry source 'whoop' + the WHOOP workout id (for
  // idempotent upserts) and the WHOOP-only numbers; manual entries leave these
  // at their defaults / null (migration 0039).
  source?: MetricSource;
  external_id?: string | null;
  strain?: number | null;
  max_hr?: number | null;
  altitude_gain_m?: number | null;
  notes: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface SaunaSession {
  id: string;
  owner_id: string;
  date: string;
  duration_min: number;
  temperature_c: number;
  rounds: number;
  notes: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

// One row per day of scale/body-composition data (Renpho or manual).
export interface BodyMetric {
  id: string;
  owner_id: string;
  date: string;
  measurement_at?: string | null;
  weight_kg: number;
  body_fat_pct: number | null;
  muscle_mass_kg: number | null;
  body_score?: number | null;
  body_fat_mass_kg?: number | null;
  fat_free_mass_kg?: number | null;
  skeletal_muscle_mass_kg?: number | null;
  bmi?: number | null;
  bmr_kcal?: number | null;
  visceral_fat?: number | null;
  subcutaneous_fat_pct?: number | null;
  bone_mass_kg?: number | null;
  protein_mass_kg?: number | null;
  body_water_mass_kg?: number | null;
  smi_kg_m2?: number | null;
  whr?: number | null;
  metabolic_age?: number | null;
  height_cm?: number | null;
  report_age?: number | null;
  report_sex?: string | null;
  optimal_weight_kg?: number | null;
  target_weight_delta_kg?: number | null;
  target_fat_mass_delta_kg?: number | null;
  target_muscle_mass_delta_kg?: number | null;
  source: MetricSource;
  notes: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

// One row per day of Whoop-style recovery data (or manual entry).
export interface RecoveryMetric {
  id: string;
  owner_id: string;
  date: string;
  recovery_pct: number | null; // Whoop recovery 0-100
  strain: number | null; // Whoop day strain 0-21
  resting_hr: number | null;
  hrv_ms: number | null;
  sleep_hours: number | null;
  sleep_performance_pct: number | null;
  // Calories burned + steps for the day. Populated from Apple Health (active
  // energy / step count) or entered manually; used for the energy-balance view.
  active_energy_kcal: number | null;
  steps: number | null;
  // Fuller WHOOP physiology (all nullable; migration 0039). Populated by the
  // WHOOP API sync, blank for manual/Health rows.
  spo2_percentage?: number | null;
  skin_temp_celsius?: number | null;
  respiratory_rate?: number | null;
  sleep_efficiency_pct?: number | null;
  sleep_consistency_pct?: number | null;
  sleep_light_min?: number | null;
  sleep_deep_min?: number | null;
  sleep_rem_min?: number | null;
  sleep_awake_min?: number | null;
  sleep_cycle_count?: number | null;
  sleep_disturbance_count?: number | null;
  sleep_need_min?: number | null;
  sleep_debt_min?: number | null;
  day_avg_hr?: number | null;
  day_max_hr?: number | null;
  source: MetricSource;
  notes: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

// A logged food entry. Daily totals and adherence are computed, never stored.
export interface NutritionLog {
  id: string;
  owner_id: string;
  date: string;
  meal: MealType;
  name: string;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  notes: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

// Reusable favourite meals for one-tap logging.
export interface SavedMeal {
  id: string;
  owner_id: string;
  name: string;
  meal: MealType;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  notes: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

// Calorie/macro targets, phased: the row with the latest effective_from on or
// before a given date applies (so a cut can follow a bulk without editing
// history).
export interface NutritionTarget {
  id: string;
  owner_id: string;
  effective_from: string; // 'YYYY-MM-DD'
  phase: NutritionPhase;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  notes: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

// A message channel between Rodney and Kobe (running in his separate Hermes
// agent environment -- not part of this app). Mirrors the pattern used by
// Cadence Work and Cadence Financial. This table is the app-side half; Kobe's
// side needs a scoped Supabase grant (see migrations/0003_agent_access.sql
// and AGENTS.md).
export type MessageSenderType = 'user' | 'agent' | 'system';
export type MessageStatus = 'unread' | 'processed';

export interface AgentMessage {
  id: string;
  owner_id: string;
  sender_type: MessageSenderType;
  sender_label: string; // 'Kobe' | 'Rodney' | ...
  body: string;
  status: MessageStatus;
  linked_workout_id: string | null;
  linked_date: string | null; // 'YYYY-MM-DD', if the message concerns a specific day
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

// Status of the native WHOOP API connection (fitness.whoop_connection). Read
// directly by the Sync screen, not part of the main data store — it's a single
// per-owner status row, and its token material lives in a separate service-role
// table that the client can never read. Recovery/strain/sleep still land in
// recovery_metrics with source 'whoop'.
export interface WhoopConnection {
  owner_id: string;
  whoop_user_id: string | null;
  scopes: string;
  connected_at: string;
  last_sync_at: string | null;
  last_sync_status: 'ok' | 'error' | null;
  last_sync_error: string;
  synced_from: string | null;
  updated_at: string;
}

export interface CadenceFitnessData {
  exercises: Exercise[];
  programs: Program[];
  program_days: ProgramDay[];
  program_exercises: ProgramExercise[];
  workouts: Workout[];
  workout_sets: WorkoutSet[];
  cardio_sessions: CardioSession[];
  sauna_sessions: SaunaSession[];
  body_metrics: BodyMetric[];
  recovery_metrics: RecoveryMetric[];
  nutrition_logs: NutritionLog[];
  saved_meals: SavedMeal[];
  nutrition_targets: NutritionTarget[];
  agent_messages: AgentMessage[];
}

export const TABLES: (keyof CadenceFitnessData)[] = [
  'exercises',
  'programs',
  'program_days',
  'program_exercises',
  'workouts',
  'workout_sets',
  'cardio_sessions',
  'sauna_sessions',
  'body_metrics',
  'recovery_metrics',
  'nutrition_logs',
  'saved_meals',
  'nutrition_targets',
  'agent_messages',
];

export const emptyData = (): CadenceFitnessData => ({
  exercises: [],
  programs: [],
  program_days: [],
  program_exercises: [],
  workouts: [],
  workout_sets: [],
  cardio_sessions: [],
  sauna_sessions: [],
  body_metrics: [],
  recovery_metrics: [],
  nutrition_logs: [],
  saved_meals: [],
  nutrition_targets: [],
  agent_messages: [],
});
