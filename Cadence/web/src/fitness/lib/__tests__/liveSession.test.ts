import { describe, expect, it } from 'vitest';
import { hasLiveWorkout, LIVE_SESSION_MAX_AGE_MS } from '../liveSession';
import type { Workout } from '../types';

const NOW = Date.parse('2026-08-24T10:00:00Z');
const iso = (msAgo: number) => new Date(NOW - msAgo).toISOString();

const workout = (over: Partial<Workout>): Workout => ({
  id: crypto.randomUUID(),
  owner_id: 'o',
  date: '2026-08-24',
  program_id: null,
  program_day_id: null,
  week_number: 1,
  name: 'Upper B',
  status: 'in_progress',
  started_at: iso(20 * 60_000),
  completed_at: null,
  notes: '',
  created_at: iso(20 * 60_000),
  updated_at: iso(60_000),
  deleted_at: null,
  ...over,
});

describe('hasLiveWorkout', () => {
  it('a recent in_progress session is live', () => {
    expect(hasLiveWorkout([workout({})], NOW)).toBe(true);
  });

  it('a session still staging (initializing) counts — it is about to be live', () => {
    expect(hasLiveWorkout([workout({ status: 'initializing' })], NOW)).toBe(true);
  });

  it('completed, skipped and deleted sessions are not live', () => {
    expect(hasLiveWorkout([workout({ status: 'completed' })], NOW)).toBe(false);
    expect(hasLiveWorkout([workout({ status: 'skipped' })], NOW)).toBe(false);
    expect(hasLiveWorkout([workout({ deleted_at: iso(0) })], NOW)).toBe(false);
  });

  it("a stale in_progress row (yesterday's un-swept session) is NOT live", () => {
    expect(hasLiveWorkout([workout({ started_at: iso(LIVE_SESSION_MAX_AGE_MS + 60_000) })], NOW)).toBe(false);
  });

  it('falls back to created_at when started_at is missing', () => {
    expect(hasLiveWorkout([workout({ started_at: null, created_at: iso(10 * 60_000) })], NOW)).toBe(true);
    expect(
      hasLiveWorkout([workout({ started_at: null, created_at: iso(LIVE_SESSION_MAX_AGE_MS + 60_000) })], NOW)
    ).toBe(false);
  });

  it('empty list is not live', () => {
    expect(hasLiveWorkout([], NOW)).toBe(false);
  });
});
