// A deployment handover reloads the running page (see pwaUpdate.ts). Doing
// that mid-gym-session was the "workouts stop halfway and make me reopen
// them" bug: unlock the phone between sets, the resume-time update check
// finds a new deploy, and the app reloads out from under the workout. While
// a session is live the app raises this hold; the updater then skips update
// checks and defers any pending reload until the hold clears.
//
// localStorage (not memory) so the hold survives the very reload it exists
// to prevent, and carries a timestamp so a session that never closed cleanly
// can't block deployments forever — no real workout runs longer than this.

const KEY = 'cadence-pwa-update-hold';
export const UPDATE_HOLD_TTL_MS = 6 * 60 * 60 * 1000;

export function holdPwaUpdates(hold: boolean, storage: Pick<Storage, 'setItem' | 'removeItem'> | null = defaultStorage()): void {
  if (!storage) return;
  try {
    if (hold) storage.setItem(KEY, String(Date.now()));
    else storage.removeItem(KEY);
  } catch {
    // Storage unavailable (private mode edge cases) — updates just stay live.
  }
}

export function pwaUpdatesHeld(now = Date.now(), storage: Pick<Storage, 'getItem'> | null = defaultStorage()): boolean {
  if (!storage) return false;
  try {
    const raw = storage.getItem(KEY);
    if (!raw) return false;
    const since = Number(raw);
    return Number.isFinite(since) && now - since < UPDATE_HOLD_TTL_MS;
  } catch {
    return false;
  }
}

function defaultStorage(): Storage | null {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
}
