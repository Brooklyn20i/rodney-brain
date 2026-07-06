import { describe, it, expect, beforeEach, vi } from 'vitest';
import { enqueue, dequeueAll, dropEntry, clearQueue, queueCount, isNetworkError } from '../offlineQueue';

beforeEach(() => {
  localStorage.clear();
  vi.unstubAllGlobals();
});

describe('offline queue', () => {
  it('enqueues, counts, and preserves FIFO order', () => {
    enqueue({ op: 'insert', table: 'work_items', row: { id: 'a' } });
    enqueue({ op: 'update', table: 'work_items', id: 'a', patch: { done: true } });
    expect(queueCount()).toBe(2);
    const all = dequeueAll();
    expect(all.map((e) => e.op.op)).toEqual(['insert', 'update']);
  });

  it('returns a unique qid per entry and dropEntry removes only that one', () => {
    const q1 = enqueue({ op: 'remove', table: 'notes', id: 'n1' });
    const q2 = enqueue({ op: 'remove', table: 'notes', id: 'n2' });
    expect(q1).not.toBe(q2);
    dropEntry(q1);
    const all = dequeueAll();
    expect(all).toHaveLength(1);
    expect(all[0].qid).toBe(q2);
  });

  it('persists across a simulated reload (localStorage-backed)', () => {
    enqueue({ op: 'insert', table: 'people', row: { id: 'p1' } });
    // dequeueAll reads from localStorage fresh each call — simulates a reload.
    expect(dequeueAll()).toHaveLength(1);
  });

  it('clearQueue empties everything', () => {
    enqueue({ op: 'insert', table: 'x', row: {} });
    enqueue({ op: 'insert', table: 'y', row: {} });
    clearQueue();
    expect(queueCount()).toBe(0);
    expect(dequeueAll()).toEqual([]);
  });

  it('survives corrupt localStorage without throwing', () => {
    localStorage.setItem('cadence_offline_queue', '{not valid json');
    expect(dequeueAll()).toEqual([]);
    expect(queueCount()).toBe(0);
  });
});

describe('isNetworkError', () => {
  it('treats offline as a network error regardless of message', () => {
    vi.stubGlobal('navigator', { onLine: false });
    expect(isNetworkError({ message: 'anything' })).toBe(true);
  });

  it('classifies fetch/timeout/Safari failures as retryable network errors', () => {
    vi.stubGlobal('navigator', { onLine: true });
    for (const m of ['Failed to fetch', 'NetworkError', 'network request failed', 'Load failed', 'request timeout', 'ERR_INTERNET_DISCONNECTED']) {
      expect(isNetworkError({ message: m }), m).toBe(true);
    }
  });

  it('classifies validation / RLS / constraint errors as permanent (not network)', () => {
    vi.stubGlobal('navigator', { onLine: true });
    for (const m of ['duplicate key value violates unique constraint', 'permission denied', 'null value in column', 'invalid input syntax']) {
      expect(isNetworkError({ message: m }), m).toBe(false);
    }
  });
});
