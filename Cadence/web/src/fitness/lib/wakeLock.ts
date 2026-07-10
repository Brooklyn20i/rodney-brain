// Keep the screen awake during an active Gym Focus session so the phone doesn't
// dim/lock between sets. Feature-detected (Screen Wake Lock API) and fully
// no-op where unsupported — iOS Safari added support late, older browsers never
// will — so this is best-effort and never throws into a workout.

export interface WakeLockSentinelLike {
  released: boolean;
  release: () => Promise<void>;
  addEventListener?: (type: 'release', cb: () => void) => void;
}

export interface WakeLockLike {
  request: (type: 'screen') => Promise<WakeLockSentinelLike>;
}

export interface WakeLockNavigatorLike {
  wakeLock?: WakeLockLike;
}

export interface WakeLockManager {
  request: () => Promise<void>;
  release: () => Promise<void>;
  isSupported: () => boolean;
}

export function createWakeLock(
  nav: WakeLockNavigatorLike | undefined = typeof navigator === 'undefined'
    ? undefined
    : (navigator as unknown as WakeLockNavigatorLike)
): WakeLockManager {
  let sentinel: WakeLockSentinelLike | null = null;

  const isSupported = () => Boolean(nav && nav.wakeLock && typeof nav.wakeLock.request === 'function');

  const request = async () => {
    if (!isSupported()) return;
    if (sentinel && !sentinel.released) return; // already held
    try {
      sentinel = await nav!.wakeLock!.request('screen');
      // The OS can drop the lock on its own (tab hidden, battery saver). Forget
      // the stale sentinel so a later request() re-acquires cleanly.
      sentinel?.addEventListener?.('release', () => {
        sentinel = null;
      });
    } catch {
      sentinel = null;
    }
  };

  const release = async () => {
    const current = sentinel;
    sentinel = null;
    if (!current || current.released) return;
    try {
      await current.release();
    } catch {
      // ignore
    }
  };

  return { request, release, isSupported };
}
