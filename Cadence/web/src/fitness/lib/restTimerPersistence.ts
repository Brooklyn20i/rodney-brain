// Persist the active rest timer as an ABSOLUTE deadline scoped to the workout,
// so leaving the Workout screen and coming back (or a background/foreground)
// restores the same countdown instead of resetting to 0. Absolute-deadline
// only — never a decrement-only model — so a restore after N seconds shows the
// correct remaining time. Cleared on skip/finish/discard and expired safely.

export interface RestTimerSnapshot {
  workoutId: string;
  /** Absolute epoch-ms deadline. Remaining = round((endsAt - now) / 1000). */
  endsAt: number;
  /** Original span in seconds, for the progress bar after a restore. */
  total: number;
}

const KEY = 'cadence-fitness:rest-timer';
// Match the in-component auto-clear: a timer more than 30s past its deadline is
// stale — don't resurrect a "Rest complete" bar the user never dismissed.
export const REST_EXPIRE_GRACE_MS = 30_000;

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

export function loadRestTimer(
  storage: Storage | undefined,
  workoutId: string,
  now: number
): RestTimerSnapshot | null {
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
      !Number.isFinite(snap.total)
    ) {
      return null;
    }
    // Expire safely — well past the deadline means the rest is long over.
    if (now - snap.endsAt > REST_EXPIRE_GRACE_MS) {
      clearRestTimer(storage);
      return null;
    }
    return snap;
  } catch {
    return null;
  }
}
