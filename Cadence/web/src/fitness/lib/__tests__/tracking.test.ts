import { describe, it, expect } from 'vitest';
import {
  fmtDuration,
  parseDuration,
  guessTracking,
  looksLikeCardio,
  trackingOf,
  setDuration,
} from '../tracking';

describe('tracking helpers', () => {
  it('trackingOf defaults unknown/absent to weight_reps', () => {
    expect(trackingOf(null)).toBe('weight_reps');
    expect(trackingOf({})).toBe('weight_reps');
    expect(trackingOf({ tracking: undefined })).toBe('weight_reps');
    expect(trackingOf({ tracking: 'garbage' as never })).toBe('weight_reps');
    expect(trackingOf({ tracking: 'time' })).toBe('time');
    expect(trackingOf({ tracking: 'bodyweight' })).toBe('bodyweight');
  });

  it('setDuration tolerates a missing column', () => {
    expect(setDuration({ duration_seconds: undefined })).toBe(0);
    expect(setDuration({ duration_seconds: 45 })).toBe(45);
  });

  it('fmtDuration renders seconds under a minute, m:ss above', () => {
    expect(fmtDuration(0)).toBe('0s');
    expect(fmtDuration(45)).toBe('45s');
    expect(fmtDuration(60)).toBe('1:00');
    expect(fmtDuration(90)).toBe('1:30');
    expect(fmtDuration(125)).toBe('2:05');
  });

  it('parseDuration accepts m:ss and bare seconds, and round-trips fmtDuration', () => {
    expect(parseDuration('')).toBe(0);
    expect(parseDuration('45')).toBe(45);
    expect(parseDuration('1:30')).toBe(90);
    expect(parseDuration('2:05')).toBe(125);
    for (const secs of [0, 5, 45, 60, 90, 125, 600]) {
      expect(parseDuration(fmtDuration(secs))).toBe(secs);
    }
  });

  it('guessTracking flags isometric holds, leaves lifts as weight_reps', () => {
    expect(guessTracking('Plank')).toBe('time');
    expect(guessTracking('Side Plank')).toBe('time');
    expect(guessTracking('Dead Hang')).toBe('time');
    expect(guessTracking('Wall Sit')).toBe('time');
    expect(guessTracking('Barbell Bench Press')).toBe('weight_reps');
    expect(guessTracking('Pendlay Row')).toBe('weight_reps');
  });

  it('looksLikeCardio catches run/row/ride/swim, not lifts', () => {
    expect(looksLikeCardio('Running')).toBe(true);
    expect(looksLikeCardio('Treadmill Run')).toBe(true);
    expect(looksLikeCardio('Rowing')).toBe(true);
    expect(looksLikeCardio('Cycling')).toBe(true);
    expect(looksLikeCardio('Swim')).toBe(true);
    // Must NOT false-positive on lifts that merely contain "row"/"walk".
    expect(looksLikeCardio('Barbell Row')).toBe(false);
    expect(looksLikeCardio('Walking Lunge')).toBe(false);
    expect(looksLikeCardio('Bicycle Crunch')).toBe(false);
    expect(looksLikeCardio('Bench Press')).toBe(false);
    expect(looksLikeCardio('Plank')).toBe(false);
  });
});
