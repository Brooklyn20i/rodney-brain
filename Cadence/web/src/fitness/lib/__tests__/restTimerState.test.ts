import { describe, expect, it } from 'vitest';
import { shouldFireRestCompleteCue } from '../restTimerState';

describe('rest timer completion cue state', () => {
  it('fires once when the timer reaches zero or below', () => {
    let alreadyChimed = false;

    expect(shouldFireRestCompleteCue(1, alreadyChimed)).toBe(false);
    expect(shouldFireRestCompleteCue(0, alreadyChimed)).toBe(true);

    alreadyChimed = true;
    expect(shouldFireRestCompleteCue(0, alreadyChimed)).toBe(false);
    expect(shouldFireRestCompleteCue(-5, alreadyChimed)).toBe(false);
  });
});
