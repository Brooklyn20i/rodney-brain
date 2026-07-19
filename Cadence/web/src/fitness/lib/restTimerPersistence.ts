// Persist the active rest timer as an ABSOLUTE deadline scoped to the workout,
// so leaving the Workout screen and coming back (or a background/foreground)
// restores the same countdown instead of resetting to 0. Absolute-deadline
// only — never a decrement-only model — so a restore after N seconds shows the
// correct remaining time. Cleared on skip/finish/discard and expired safely.

export interface RestTimerSnapshot {
  workoutId: string;
  /** Absolute epoch-ms deadline. Remaining = ceil((endsAt - now) / 1000). */
  endsAt: number;
  /** Original span in seconds, for the progress bar after a restore. */
  total: number;
  /** Set that started this rest block, so an expired timer can expose its save/reset state. */
  completedSetId?: string;
}

const KEY = 'cadence-fitness:rest-timer';

export function saveRestTimer(storage: Storage | undefined, snap: RestTimerSnapshot): void {
  if (!storage) return;
  try {
    storage.setItem(KEY, JSON.stringify(snap));
  } catch {
    // Private mode / quota — the in-memory timer still works, just isn't durable.
  }
}

export function clearRestTimer(storage: Storage | undefined): void {
  if (!storage) return;
  try {
    storage.removeItem(KEY);
  } catch {
    // ignore
  }
}

export function loadRestTimer(storage: Storage | undefined, workoutId: string): RestTimerSnapshot | null {
  if (!storage) return null;
  try {
    const raw = storage.getItem(KEY);
    if (!raw) return null;
    const snap = JSON.parse(raw) as RestTimerSnapshot;
    if (
      !snap ||
      snap.workoutId !== workoutId ||
      typeof snap.endsAt !== 'number' ||
      typeof snap.total !== 'number' ||
      !Number.isFinite(snap.endsAt) ||
      !Number.isFinite(snap.total) ||
      (snap.completedSetId !== undefined && typeof snap.completedSetId !== 'string')
    ) {
      return null;
    }
    // Keep completed timers instead of expiring them in storage. On mobile/PWA
    // resume, this preserves the explicit save/reset state until the user
    // dismisses the completed rest banner.
    return snap;
  } catch {
    return null;
  }
}
