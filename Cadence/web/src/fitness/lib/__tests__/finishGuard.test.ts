import { describe, expect, it } from 'vitest';
import { finishConfirmMessage, finishNeedsConfirm, summariseFinish } from '../finishGuard';

describe('finish guard', () => {
  it('counts logged vs dropped rows (value or already-done = logged)', () => {
    const s = summariseFinish([
      { done: true, value: 8 },
      { done: false, value: 10 }, // filled but not ticked — still counts
      { done: false, value: 0 }, // empty target — dropped
      { done: true, value: 0 }, // done with no value — kept/logged
    ]);
    expect(s).toEqual({ total: 4, completed: 3, remaining: 1 });
  });

  it('requires confirmation only when some sets are unfinished', () => {
    expect(finishNeedsConfirm(summariseFinish([{ done: true, value: 8 }]))).toBe(false);
    expect(finishNeedsConfirm(summariseFinish([{ done: false, value: 0 }]))).toBe(true);
    // Empty session (no rows) — nothing to confirm.
    expect(finishNeedsConfirm(summariseFinish([]))).toBe(false);
  });

  it('warns loudly about a fully-empty finish (the 0/16 case)', () => {
    const rows = Array.from({ length: 16 }, () => ({ done: false, value: 0 }));
    const msg = finishConfirmMessage(summariseFinish(rows));
    expect(msg).toContain("haven't completed any of 16 sets");
  });

  it('reports completed/remaining counts on a partial finish', () => {
    const msg = finishConfirmMessage(
      summariseFinish([
        { done: true, value: 8 },
        { done: false, value: 0 },
        { done: false, value: 0 },
      ])
    );
    expect(msg).toContain('completed 1 of 3 sets');
    expect(msg).toContain('2 unfinished sets');
  });

  it('returns null when everything is done', () => {
    expect(finishConfirmMessage(summariseFinish([{ done: true, value: 8 }]))).toBeNull();
  });
});
