import { describe, it, expect } from 'vitest';
import { daysQuiet, lastMovementIso, QUIET_CHIP_DAYS, STALE_DAYS } from '../staleness';
import type { Comment, WorkItem } from '../types';

const wi = (o: Partial<WorkItem>): WorkItem => ({
  id: 'w', owner_id: 'me', title: 'T', type: 'waitingFor', priority: 'medium', due_date: null,
  project_id: null, person_id: 'p1', notes: '', done: false, inboxed: false, source: '',
  completed_at: null, created_at: '', updated_at: '', deleted_at: null, ...o,
});
const c = (o: Partial<Comment>): Comment => ({
  id: 'c', owner_id: 'me', work_item_id: 'w', text: 'x', author: 'you',
  created_at: '', updated_at: '', deleted_at: null, ...o,
});

const NOW = new Date('2026-07-26T12:00:00Z');

describe('lastMovementIso', () => {
  it('is the latest of the record timestamps and its thread', () => {
    const w = wi({ created_at: '2026-07-01T00:00:00Z', updated_at: '2026-07-10T00:00:00Z' });
    expect(lastMovementIso(w, [])).toBe('2026-07-10T00:00:00Z');
    // A later update on the thread wins — chasing logs one, resetting the clock.
    const comments = [c({ id: 'c1', created_at: '2026-07-20T00:00:00Z' })];
    expect(lastMovementIso(w, comments)).toBe('2026-07-20T00:00:00Z');
  });

  it('ignores other items’ comments and deleted comments', () => {
    const w = wi({ updated_at: '2026-07-10T00:00:00Z' });
    const comments = [
      c({ id: 'other', work_item_id: 'not-w', created_at: '2026-07-25T00:00:00Z' }),
      c({ id: 'gone', created_at: '2026-07-24T00:00:00Z', deleted_at: '2026-07-24T01:00:00Z' }),
    ];
    expect(lastMovementIso(w, comments)).toBe('2026-07-10T00:00:00Z');
  });

  it('is null when nothing carries a timestamp', () => {
    expect(lastMovementIso(wi({}), [])).toBeNull();
  });
});

describe('daysQuiet', () => {
  it('counts whole days since the last movement', () => {
    const w = wi({ updated_at: '2026-07-20T12:00:00Z' });
    expect(daysQuiet(w, [], NOW)).toBe(6);
  });

  it('treats missing timestamps as fresh — never nag on absent data', () => {
    expect(daysQuiet(wi({}), [], NOW)).toBe(0);
  });

  it('never goes negative on future timestamps (clock skew)', () => {
    const w = wi({ updated_at: '2026-07-30T00:00:00Z' });
    expect(daysQuiet(w, [], NOW)).toBe(0);
  });

  it('thresholds are ordered: chip shows before stale kicks in', () => {
    expect(QUIET_CHIP_DAYS).toBeLessThan(STALE_DAYS);
  });
});
