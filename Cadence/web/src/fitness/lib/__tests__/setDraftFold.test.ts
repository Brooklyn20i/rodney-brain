import { describe, expect, it } from 'vitest';
import {
  draftPatch,
  draftTouched,
  foldDuration,
  foldReps,
  foldWeight,
  hasDraftValue,
} from '../setDraftFold';
import type { WorkoutSet } from '../types';

const set = (extra: Partial<WorkoutSet> = {}): WorkoutSet =>
  ({
    id: 's1',
    owner_id: 'o',
    workout_id: 'w1',
    exercise_id: 'e1',
    set_number: 1,
    weight_kg: 100,
    reps: 8,
    duration_seconds: 0,
    rpe: null,
    is_warmup: false,
    done: false,
    created_at: '2026-07-01T00:00:00Z',
    updated_at: '2026-07-01T00:00:00Z',
    deleted_at: null,
    ...extra,
  }) as WorkoutSet;

describe('set draft folding (the one draft-over-row rule)', () => {
  it('a typed draft beats the stored value; no draft falls through to the row', () => {
    expect(foldReps(set(), { reps: '12' })).toBe(12);
    expect(foldReps(set(), {})).toBe(8);
    expect(foldWeight(set(), { weight: '102.5' })).toBe(102.5);
    expect(foldWeight(set(), undefined)).toBe(100);
    expect(foldDuration(set({ duration_seconds: 45 }), { dur: '1:30' })).toBe(90);
    expect(foldDuration(set({ duration_seconds: 45 }), {})).toBe(45);
  });

  it('sanitises garbage: negative and non-numeric input clamps to 0, reps round to integers', () => {
    expect(foldReps(set(), { reps: '11.6' })).toBe(12);
    expect(foldReps(set(), { reps: '-3' })).toBe(0);
    expect(foldReps(set(), { reps: 'abc' })).toBe(0);
    expect(foldWeight(set(), { weight: '-5' })).toBe(0);
  });

  it('an explicitly cleared field ("") folds to 0, not the stored value — clearing means clearing', () => {
    expect(foldReps(set(), { reps: '' })).toBe(0);
    expect(foldWeight(set(), { weight: '' })).toBe(0);
  });

  it('draftPatch only includes fields actually typed into', () => {
    expect(draftPatch({ reps: '10' })).toEqual({ reps: 10 });
    expect(draftPatch({ weight: '80', dur: '0:45' })).toEqual({ weight_kg: 80, duration_seconds: 45 });
    expect(draftPatch({})).toEqual({});
    expect(draftPatch(undefined)).toEqual({});
  });

  it('touched vs has-value: a cleared field is touched but holds no value', () => {
    expect(draftTouched({ reps: '' })).toBe(true);
    expect(hasDraftValue({ reps: '' })).toBe(false);
    expect(hasDraftValue({ reps: '5' })).toBe(true);
    expect(draftTouched({})).toBe(false);
    expect(draftTouched(undefined)).toBe(false);
  });
});
