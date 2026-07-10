// Pure helpers for the guided-workout set steppers and straight-set
// carry-forward. Kept free of React/DOM so the fiddly numeric edge cases
// (rounding, clamping, "did this deliberately change?") are unit-testable and
// deterministic — the stepper defects were all stale-state arithmetic bugs.

export interface StepOptions {
  /** Lower clamp for the result (defaults to 0 — you can't lift negative kg). */
  min?: number;
  /** Decimal places to round the result to. 0 = integer (reps/seconds). */
  round?: number;
}

/**
 * Apply a single +/- step to the current value. Callers accumulate rapid taps
 * by feeding the previous result back in as `current`, so three quick +2.5 taps
 * on 105 land on 112.5 instead of collapsing to 107.5.
 */
export function applyStep(current: number, delta: number, opts: StepOptions = {}): number {
  const { min = 0, round } = opts;
  const raw = (Number.isFinite(current) ? current : 0) + delta;
  const factor = round === undefined ? 1 : 10 ** round;
  const rounded = round === undefined ? raw : Math.round(raw * factor) / factor;
  return Math.max(min, rounded);
}

/**
 * Straight-set carry-forward rule. When the first working set's load changes,
 * the sibling sets that were only ever *inherited* (never deliberately edited,
 * not yet done) should follow the new load. A sibling qualifies when it is:
 *   - still blank (never entered), or
 *   - still equal to the previous inherited load (so it moved with the set,
 *     not away from it).
 * A row the user set to a different weight, or a row already ticked done, keeps
 * its own value and is never clobbered.
 */
export function shouldCarryWeight(siblingCurrent: number, prevWeight: number, newWeight: number): boolean {
  if (newWeight <= 0) return false;
  if (siblingCurrent === newWeight) return false; // already there — no write needed
  const isBlank = siblingCurrent <= 0;
  const stillInherited = prevWeight > 0 && siblingCurrent === prevWeight;
  return isBlank || stillInherited;
}
