import { describe, expect, it } from 'vitest';
import { planRestOnComplete, shouldFireRestCompleteCue } from '../restTimerState';

describe('rest timer completion cue state', () => {
  it('fires once when the timer reaches zero or below', () => {
    let alreadyChimed = false;

    expect(shouldFireRestCompleteCue(1, alreadyChimed)).toBe(false);
    expect(shouldFireRestCompleteCue(0, alreadyChimed)).toBe(true);

    alreadyChimed = true;
    expect(shouldFireRestCompleteCue(0, alreadyChimed)).toBe(false);
    expect(shouldFireRestCompleteCue(-5, alreadyChimed)).toBe(false);
  });

  it('fires again for the next rest timer after the caller resets the latch', () => {
    let alreadyChimed = false;
    expect(shouldFireRestCompleteCue(0, alreadyChimed)).toBe(true);

    alreadyChimed = true;
    expect(shouldFireRestCompleteCue(0, alreadyChimed)).toBe(false);

    // Starting a new rest timer resets Workout's chimedRef to false; the next
    // completion should therefore fire a second cue rather than staying muted.
    alreadyChimed = false;
    expect(shouldFireRestCompleteCue(0, alreadyChimed)).toBe(true);
  });
});

describe('planRestOnComplete', () => {
  it('runs the slot rest when configured', () => {
    expect(planRestOnComplete(180, 120)).toEqual({ start: true, seconds: 180 });
  });

  it('falls back to the default when the slot has no rest', () => {
    expect(planRestOnComplete(null, 120)).toEqual({ start: true, seconds: 120 });
    expect(planRestOnComplete(undefined, 90)).toEqual({ start: true, seconds: 90 });
  });

  it('does not start a timer (or any cue) for zero / invalid rest', () => {
    expect(planRestOnComplete(0, 120)).toEqual({ start: false, seconds: 0 });
    expect(planRestOnComplete(-30, 120)).toEqual({ start: false, seconds: 0 });
    expect(planRestOnComplete(Number.NaN, 0)).toEqual({ start: false, seconds: 0 });
  });
});
