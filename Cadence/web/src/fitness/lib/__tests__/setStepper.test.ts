import { describe, expect, it } from 'vitest';
import { applyStep, shouldCarryWeight } from '../setStepper';

describe('applyStep', () => {
  it('accumulates rapid taps when the previous result is fed back in', () => {
    // Three quick +2.5 taps on 105 must reach 112.5, not collapse to 107.5.
    let w = 105;
    w = applyStep(w, 2.5, { min: 0, round: 2 });
    w = applyStep(w, 2.5, { min: 0, round: 2 });
    w = applyStep(w, 2.5, { min: 0, round: 2 });
    expect(w).toBe(112.5);
  });

  it('accumulates rapid rep taps as integers', () => {
    let r = 0;
    r = applyStep(r, 1, { round: 0 });
    r = applyStep(r, 1, { round: 0 });
    r = applyStep(r, 1, { round: 0 });
    expect(r).toBe(3);
  });

  it('clamps at the minimum and never goes negative', () => {
    expect(applyStep(2, -2.5, { min: 0, round: 2 })).toBe(0);
    expect(applyStep(0, -1, { round: 0 })).toBe(0);
  });

  it('rounds to avoid binary float drift', () => {
    expect(applyStep(0.1, 0.2, { round: 2 })).toBe(0.3);
  });

  it('treats a non-finite current as zero', () => {
    expect(applyStep(NaN, 2.5, { round: 2 })).toBe(2.5);
  });
});

describe('shouldCarryWeight', () => {
  it('fills a blank sibling', () => {
    expect(shouldCarryWeight(0, 105, 110)).toBe(true);
  });

  it('follows a load change on a still-inherited sibling', () => {
    expect(shouldCarryWeight(105, 105, 110)).toBe(true);
  });

  it('never clobbers a sibling the user set to a different weight', () => {
    expect(shouldCarryWeight(120, 105, 110)).toBe(false);
  });

  it('is a no-op when the sibling already equals the new weight', () => {
    expect(shouldCarryWeight(110, 105, 110)).toBe(false);
  });

  it('does not carry a zero/blank new weight', () => {
    expect(shouldCarryWeight(105, 105, 0)).toBe(false);
  });

  it('does not treat inheritance as valid when there was no previous load', () => {
    expect(shouldCarryWeight(105, 0, 110)).toBe(false);
  });
});
