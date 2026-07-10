import { beforeEach, describe, expect, it } from 'vitest';
import { clearDrafts, loadDrafts, pruneDrafts, saveDrafts } from '../draftPersistence';

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

describe('draft persistence', () => {
  let storage: Storage;
  beforeEach(() => {
    storage = memoryStorage();
  });

  it('prunes empty drafts', () => {
    expect(pruneDrafts({ a: {}, b: { weight: '' }, c: { reps: '8' } })).toEqual({ c: { reps: '8' } });
  });

  it('round-trips pending edits for the active workout', () => {
    saveDrafts(storage, 'w1', { s1: { weight: '110' }, s2: {} });
    expect(loadDrafts(storage, 'w1')).toEqual({ s1: { weight: '110' } });
  });

  it('does not restore drafts from a different workout', () => {
    saveDrafts(storage, 'w1', { s1: { reps: '8' } });
    expect(loadDrafts(storage, 'w2')).toEqual({});
  });

  it('removes the key when only empty drafts remain', () => {
    saveDrafts(storage, 'w1', { s1: { reps: '8' } });
    saveDrafts(storage, 'w1', { s1: {} });
    expect(storage.getItem('cadence-fitness:workout-drafts')).toBeNull();
  });

  it('clears on demand and tolerates corrupt data', () => {
    saveDrafts(storage, 'w1', { s1: { reps: '8' } });
    clearDrafts(storage);
    expect(loadDrafts(storage, 'w1')).toEqual({});
    storage.setItem('cadence-fitness:workout-drafts', 'nope');
    expect(loadDrafts(storage, 'w1')).toEqual({});
  });
});
