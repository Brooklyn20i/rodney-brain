import type { Workout } from './types';

// "Live" = a session Rodney is actually in the middle of: in_progress (or
// still staging) and recent. The age cap keeps a stale row that self-heal
// hasn't swept yet (it runs on the Workout screen) from being treated as an
// active session — nobody trains for six hours.
export const LIVE_SESSION_MAX_AGE_MS = 6 * 60 * 60 * 1000;

export function hasLiveWorkout(workouts: Workout[], now = Date.now()): boolean {
  return workouts.some((w) => {
    if (w.deleted_at) return false;
    if (w.status !== 'in_progress' && w.status !== 'initializing') return false;
    const startedMs = Date.parse(w.started_at ?? w.created_at);
    return Number.isFinite(startedMs) && now - startedMs < LIVE_SESSION_MAX_AGE_MS;
  });
}
