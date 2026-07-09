import { describe, it, expect } from 'vitest';
import {
  fmtDuration,
  parseDuration,
  guessTracking,
  isCardioTracking,
  isTimedTracking,
  looksLikeCardio,
  slotDestination,
  slotTracking,
  trackingOf,
  setDuration,
} from '../tracking';

describe('tracking helpers', () => {
  it('trackingOf defaults unknown/absent to strength_weighted and normalises legacy values', () => {
    expect(trackingOf(null)).toBe('strength_weighted');
    expect(trackingOf({})).toBe('strength_weighted');
    expect(trackingOf({ tracking: undefined })).toBe('strength_weighted');
    expect(trackingOf({ tracking: 'garbage' as never })).toBe('strength_weighted');
    expect(trackingOf({ tracking: 'time' })).toBe('timed_hold');
    expect(trackingOf({ tracking: 'bodyweight' })).toBe('strength_bodyweight');
    expect(trackingOf({ tracking: 'cardio_distance' })).toBe('cardio_distance');
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

  it('guessTracking flags holds/bodyweight/cardio, leaves weighted lifts as strength_weighted', () => {
    expect(guessTracking('Plank')).toBe('timed_hold');
    expect(guessTracking('Side Plank')).toBe('timed_hold');
    expect(guessTracking('Dead Hang')).toBe('timed_hold');
    expect(guessTracking('Wall Sit')).toBe('timed_hold');
    expect(guessTracking('Push-Up')).toBe('strength_bodyweight');
    expect(guessTracking('Barbell Bench Press')).toBe('strength_weighted');
    expect(guessTracking('Pendlay Row')).toBe('strength_weighted');
    expect(guessTracking('15-minute progressive run')).toBe('cardio_interval');
    expect(guessTracking('Treadmill Run')).toBe('cardio_distance');
    expect(guessTracking('Incline Walk')).toBe('cardio_duration');
  });

  it('slotTracking lets programme slots override the exercise library modality', () => {
    const exercise = { tracking: 'strength_weighted' as const };
    expect(slotTracking({ exercise_id: 'run', tracking_type: 'cardio_distance' }, exercise)).toBe('cardio_distance');
    expect(slotTracking({ exercise_id: 'plank', tracking_type: null }, { tracking: 'time' })).toBe('timed_hold');
    expect(isCardioTracking(slotTracking({ exercise_id: 'run', tracking_type: 'cardio_interval' }, exercise))).toBe(true);
    expect(isTimedTracking(slotTracking({ exercise_id: 'plank', tracking_type: null }, { tracking: 'timed_hold' }))).toBe(true);
  });

  it('routes cardio programme slots to cardio_sessions instead of workout_sets', () => {
    const exercise = { tracking: 'strength_weighted' as const };
    expect(slotDestination({ exercise_id: 'run', tracking_type: 'cardio_interval' }, exercise)).toBe('cardio_sessions');
    expect(slotDestination({ exercise_id: 'bench', tracking_type: 'strength_weighted' }, exercise)).toBe('workout_sets');
    expect(slotDestination({ exercise_id: 'plank', tracking_type: 'timed_hold' }, exercise)).toBe('workout_sets');
  });

  it('looksLikeCardio catches run/row/ride/swim, not lifts', () => {
    expect(looksLikeCardio('Running')).toBe(true);
    expect(looksLikeCardio('15-minute progressive run')).toBe(true);
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
