// Comprehensive library of common gym movements, preloaded into the app so
// every everyday lift is available from day one (programs and logged sets both
// reference an exercise row, so these become real rows — see the auto-seed in
// lib/store.tsx). Add your own on the Exercises screen; edit or delete any of
// these freely.

import type { ExerciseTracking, MuscleGroup } from './types';

export interface CatalogExercise {
  name: string;
  muscle_group: MuscleGroup;
  equipment: string;
  // Omitted = weight × reps. Set only where the movement is logged differently.
  tracking?: ExerciseTracking;
}

export const EXERCISE_CATALOG: CatalogExercise[] = [
  // ── Chest ────────────────────────────────────────────────────────────
  { name: 'Barbell Bench Press', muscle_group: 'chest', equipment: 'barbell' },
  { name: 'Incline Barbell Bench Press', muscle_group: 'chest', equipment: 'barbell' },
  { name: 'Decline Barbell Bench Press', muscle_group: 'chest', equipment: 'barbell' },
  { name: 'Dumbbell Bench Press', muscle_group: 'chest', equipment: 'dumbbell' },
  { name: 'Incline Dumbbell Press', muscle_group: 'chest', equipment: 'dumbbell' },
  { name: 'Machine Chest Press', muscle_group: 'chest', equipment: 'machine' },
  { name: 'Pec Deck', muscle_group: 'chest', equipment: 'machine' },
  { name: 'Cable Fly', muscle_group: 'chest', equipment: 'cable' },
  { name: 'Incline Cable Fly', muscle_group: 'chest', equipment: 'cable' },
  { name: 'Dumbbell Fly', muscle_group: 'chest', equipment: 'dumbbell' },
  { name: 'Push-Up', muscle_group: 'chest', equipment: 'bodyweight', tracking: 'strength_bodyweight' },
  { name: 'Chest Dip', muscle_group: 'chest', equipment: 'bodyweight' },

  // ── Back ─────────────────────────────────────────────────────────────
  { name: 'Deadlift', muscle_group: 'back', equipment: 'barbell' },
  { name: 'Rack Pull', muscle_group: 'back', equipment: 'barbell' },
  { name: 'Barbell Row', muscle_group: 'back', equipment: 'barbell' },
  { name: 'Pendlay Row', muscle_group: 'back', equipment: 'barbell' },
  { name: 'T-Bar Row', muscle_group: 'back', equipment: 'machine' },
  { name: 'Dumbbell Row', muscle_group: 'back', equipment: 'dumbbell' },
  { name: 'Chest-Supported Row', muscle_group: 'back', equipment: 'machine' },
  { name: 'Seated Cable Row', muscle_group: 'back', equipment: 'cable' },
  { name: 'Lat Pulldown', muscle_group: 'back', equipment: 'cable' },
  { name: 'Close-Grip Lat Pulldown', muscle_group: 'back', equipment: 'cable' },
  { name: 'Straight-Arm Pulldown', muscle_group: 'back', equipment: 'cable' },
  { name: 'Pull-Up', muscle_group: 'back', equipment: 'bodyweight' },
  { name: 'Chin-Up', muscle_group: 'back', equipment: 'bodyweight' },
  { name: 'Machine Row', muscle_group: 'back', equipment: 'machine' },

  // ── Shoulders ────────────────────────────────────────────────────────
  { name: 'Overhead Press', muscle_group: 'shoulders', equipment: 'barbell' },
  { name: 'Seated Dumbbell Shoulder Press', muscle_group: 'shoulders', equipment: 'dumbbell' },
  { name: 'Arnold Press', muscle_group: 'shoulders', equipment: 'dumbbell' },
  { name: 'Machine Shoulder Press', muscle_group: 'shoulders', equipment: 'machine' },
  { name: 'Dumbbell Lateral Raise', muscle_group: 'shoulders', equipment: 'dumbbell' },
  { name: 'Cable Lateral Raise', muscle_group: 'shoulders', equipment: 'cable' },
  { name: 'Rear Delt Fly', muscle_group: 'shoulders', equipment: 'dumbbell' },
  { name: 'Reverse Pec Deck', muscle_group: 'shoulders', equipment: 'machine' },
  { name: 'Face Pull', muscle_group: 'shoulders', equipment: 'cable' },
  { name: 'Front Raise', muscle_group: 'shoulders', equipment: 'dumbbell' },
  { name: 'Upright Row', muscle_group: 'shoulders', equipment: 'barbell' },
  { name: 'Barbell Shrug', muscle_group: 'shoulders', equipment: 'barbell' },
  { name: 'Dumbbell Shrug', muscle_group: 'shoulders', equipment: 'dumbbell' },

  // ── Biceps ───────────────────────────────────────────────────────────
  { name: 'Barbell Curl', muscle_group: 'biceps', equipment: 'barbell' },
  { name: 'EZ-Bar Curl', muscle_group: 'biceps', equipment: 'barbell' },
  { name: 'Dumbbell Curl', muscle_group: 'biceps', equipment: 'dumbbell' },
  { name: 'Incline Dumbbell Curl', muscle_group: 'biceps', equipment: 'dumbbell' },
  { name: 'Hammer Curl', muscle_group: 'biceps', equipment: 'dumbbell' },
  { name: 'Preacher Curl', muscle_group: 'biceps', equipment: 'machine' },
  { name: 'Cable Curl', muscle_group: 'biceps', equipment: 'cable' },
  { name: 'Concentration Curl', muscle_group: 'biceps', equipment: 'dumbbell' },

  // ── Triceps ──────────────────────────────────────────────────────────
  { name: 'Close-Grip Bench Press', muscle_group: 'triceps', equipment: 'barbell' },
  { name: 'Cable Triceps Pushdown', muscle_group: 'triceps', equipment: 'cable' },
  { name: 'Rope Pushdown', muscle_group: 'triceps', equipment: 'cable' },
  { name: 'Overhead Cable Extension', muscle_group: 'triceps', equipment: 'cable' },
  { name: 'Skull Crusher', muscle_group: 'triceps', equipment: 'barbell' },
  { name: 'Dumbbell Overhead Extension', muscle_group: 'triceps', equipment: 'dumbbell' },
  { name: 'Triceps Dip', muscle_group: 'triceps', equipment: 'bodyweight' },
  { name: 'Bench Dip', muscle_group: 'triceps', equipment: 'bodyweight' },

  // ── Quads ────────────────────────────────────────────────────────────
  { name: 'Barbell Back Squat', muscle_group: 'quads', equipment: 'barbell' },
  { name: 'Front Squat', muscle_group: 'quads', equipment: 'barbell' },
  { name: 'Hack Squat', muscle_group: 'quads', equipment: 'machine' },
  { name: 'Leg Press', muscle_group: 'quads', equipment: 'machine' },
  { name: 'Leg Extension', muscle_group: 'quads', equipment: 'machine' },
  { name: 'Goblet Squat', muscle_group: 'quads', equipment: 'dumbbell' },
  { name: 'Bulgarian Split Squat', muscle_group: 'quads', equipment: 'dumbbell' },
  { name: 'Walking Lunge', muscle_group: 'quads', equipment: 'dumbbell' },
  { name: 'Smith Machine Squat', muscle_group: 'quads', equipment: 'machine' },

  // ── Hamstrings ───────────────────────────────────────────────────────
  { name: 'Romanian Deadlift', muscle_group: 'hamstrings', equipment: 'barbell' },
  { name: 'Stiff-Leg Deadlift', muscle_group: 'hamstrings', equipment: 'barbell' },
  { name: 'Lying Leg Curl', muscle_group: 'hamstrings', equipment: 'machine' },
  { name: 'Seated Leg Curl', muscle_group: 'hamstrings', equipment: 'machine' },
  { name: 'Good Morning', muscle_group: 'hamstrings', equipment: 'barbell' },
  { name: 'Nordic Curl', muscle_group: 'hamstrings', equipment: 'bodyweight', tracking: 'strength_bodyweight' },

  // ── Glutes ───────────────────────────────────────────────────────────
  { name: 'Hip Thrust', muscle_group: 'glutes', equipment: 'barbell' },
  { name: 'Glute Bridge', muscle_group: 'glutes', equipment: 'barbell' },
  { name: 'Sumo Deadlift', muscle_group: 'glutes', equipment: 'barbell' },
  { name: 'Cable Glute Kickback', muscle_group: 'glutes', equipment: 'cable' },
  { name: 'Hip Abduction', muscle_group: 'glutes', equipment: 'machine' },

  // ── Calves ───────────────────────────────────────────────────────────
  { name: 'Standing Calf Raise', muscle_group: 'calves', equipment: 'machine' },
  { name: 'Seated Calf Raise', muscle_group: 'calves', equipment: 'machine' },
  { name: 'Leg Press Calf Raise', muscle_group: 'calves', equipment: 'machine' },

  // ── Core ─────────────────────────────────────────────────────────────
  { name: 'Plank', muscle_group: 'core', equipment: 'bodyweight', tracking: 'timed_hold' },
  { name: 'Side Plank', muscle_group: 'core', equipment: 'bodyweight', tracking: 'timed_hold' },
  { name: 'Cable Crunch', muscle_group: 'core', equipment: 'cable' },
  { name: 'Hanging Leg Raise', muscle_group: 'core', equipment: 'bodyweight', tracking: 'strength_bodyweight' },
  { name: 'Ab Wheel Rollout', muscle_group: 'core', equipment: 'other' },
  { name: 'Russian Twist', muscle_group: 'core', equipment: 'bodyweight', tracking: 'strength_bodyweight' },
  { name: 'Machine Crunch', muscle_group: 'core', equipment: 'machine' },
  { name: 'Decline Sit-Up', muscle_group: 'core', equipment: 'bodyweight', tracking: 'strength_bodyweight' },

  // ── Forearms ─────────────────────────────────────────────────────────
  { name: 'Wrist Curl', muscle_group: 'forearms', equipment: 'dumbbell' },
  { name: 'Reverse Wrist Curl', muscle_group: 'forearms', equipment: 'dumbbell' },
  { name: "Farmer's Carry", muscle_group: 'forearms', equipment: 'dumbbell' },

  // ── Full body / conditioning ─────────────────────────────────────────
  { name: 'Power Clean', muscle_group: 'full_body', equipment: 'barbell' },
  { name: 'Clean and Press', muscle_group: 'full_body', equipment: 'barbell' },
  { name: 'Thruster', muscle_group: 'full_body', equipment: 'barbell' },
  { name: 'Kettlebell Swing', muscle_group: 'full_body', equipment: 'kettlebell' },
];
