import { beforeEach, describe, expect, it } from 'vitest';
import {
  clearRestTimer,
  loadRestTimer,
  REST_EXPIRE_GRACE_MS,
  saveRestTimer,
} from '../restTimerPersistence';

function memoryStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (k: string) => (map.has(k) ? map.get(k)! : null),
    key: (i: number) => Array.from(map.keys())[i] ?? null,
    removeItem: (k: string) => map.delete(k),
    setItem: (k: string, v: string) => map.set(k, v),
  } as Storage;
}

describe('rest timer persistence', () => {
  let storage: Storage;
  beforeEach(() => {
    storage = memoryStorage();
  });

  it('round-trips an absolute deadline for the same workout', () => {
    const now = 1_000_000;
    saveRestTimer(storage, { workoutId: 'w1', endsAt: now + 180_000, total: 180 });
    const snap = loadRestTimer(storage, 'w1', now + 5_000);
    expect(snap).toEqual({ workoutId: 'w1', endsAt: now + 180_000, total: 180 });
  });

  it('restores the correct remaining time after a gap (absolute, not decrement)', () => {
    const now = 1_000_000;
    saveRestTimer(storage, { workoutId: 'w1', endsAt: now + 180_000, total: 180 });
    // 60s later the deadline is unchanged, so remaining is 120s.
    const snap = loadRestTimer(storage, 'w1', now + 60_000)!;
    const remaining = Math.round((snap.endsAt - (now + 60_000)) / 1000);
    expect(remaining).toBe(120);
  });

  it('ignores a snapshot from a different workout', () => {
    const now = 1_000_000;
    saveRestTimer(storage, { workoutId: 'w1', endsAt: now + 180_000, total: 180 });
    expect(loadRestTimer(storage, 'w2', now)).toBeNull();
  });

  it('restores a completed timer well past the old grace window so save/reset state is visible after mobile resume', () => {
    const now = 1_000_000;
    saveRestTimer(storage, { workoutId: 'w1', endsAt: now, total: 180, completedSetId: 's1' });
    const snap = loadRestTimer(storage, 'w1', now + REST_EXPIRE_GRACE_MS + 1);
    expect(snap).toEqual({ workoutId: 'w1', endsAt: now, total: 180, completedSetId: 's1' });
    expect(storage.getItem('cadence-fitness:rest-timer')).not.toBeNull();
  });

  it('still restores a just-finished timer within the grace window', () => {
    const now = 1_000_000;
    saveRestTimer(storage, { workoutId: 'w1', endsAt: now, total: 180 });
    expect(loadRestTimer(storage, 'w1', now + 5_000)).not.toBeNull();
  });

  it('clears on demand and tolerates corrupt data', () => {
    saveRestTimer(storage, { workoutId: 'w1', endsAt: 1, total: 1 });
    clearRestTimer(storage);
    expect(loadRestTimer(storage, 'w1', 1)).toBeNull();
    storage.setItem('cadence-fitness:rest-timer', '{not json');
    expect(loadRestTimer(storage, 'w1', 1)).toBeNull();
  });
});
