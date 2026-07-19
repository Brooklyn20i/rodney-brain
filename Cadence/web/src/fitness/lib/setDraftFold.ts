// THE single source of truth for folding a typed-but-uncommitted draft over a
// stored set row. Three places must agree on this — committing a set (blur or
// tick), the finish-confirmation counts, and the finish fold-in pass — and
// they used to hold three hand-copied versions of it. A set you filled in but
// forgot to tick must count identically everywhere ("did 12, logged 11").

import { parseDuration, setDuration } from './tracking';
import type { WorkoutSet } from './types';

export interface SetDraft {
  weight?: string;
  reps?: string;
  dur?: string;
}
export type SetDrafts = Record<string, SetDraft>;

export const hasDraftValue = (d: SetDraft | undefined): boolean =>
  Boolean(d && (['weight', 'reps', 'dur'] as const).some((k) => d[k] !== undefined && d[k] !== ''));

/** Any field typed into (even cleared) — the set was touched this session. */
export const draftTouched = (d: SetDraft | undefined): boolean =>
  d !== undefined && (d.weight !== undefined || d.reps !== undefined || d.dur !== undefined);

const nonNegative = (value: string | number | null | undefined): number => Math.max(0, Number(value) || 0);

/** Effective reps: the draft beats the stored value. */
export const foldReps = (s: WorkoutSet, d: SetDraft | undefined): number =>
  d?.reps !== undefined ? Math.max(0, Math.round(Number(d.reps) || 0)) : s.reps || 0;

/** Effective weight in kg: the draft beats the stored value. */
export const foldWeight = (s: WorkoutSet, d: SetDraft | undefined): number =>
  d?.weight !== undefined ? nonNegative(d.weight) : nonNegative(s.weight_kg);

/** Effective hold duration in seconds: the draft beats the stored value. */
export const foldDuration = (s: WorkoutSet, d: SetDraft | undefined): number =>
  d?.dur !== undefined ? parseDuration(d.dur) : setDuration(s);

/**
 * The write patch for committing a draft: only fields actually typed into are
 * included, so an untouched field never overwrites a concurrent change.
 */
export function draftPatch(d: SetDraft | undefined): Partial<WorkoutSet> {
  const patch: Partial<WorkoutSet> = {};
  if (d?.weight !== undefined) patch.weight_kg = nonNegative(d.weight);
  if (d?.reps !== undefined) patch.reps = Math.max(0, Math.round(Number(d.reps) || 0));
  if (d?.dur !== undefined) patch.duration_seconds = parseDuration(d.dur);
  return patch;
}
