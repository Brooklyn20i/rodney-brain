/**
 * Due-date bucketing — the single implementation behind Tasks, Inbox and the
 * cockpit selectors. Pins the bucket boundaries (strictly-before-today =
 * overdue, exactly today = today, within 7 days = week) and the canonical
 * display order so the three screens can never disagree again.
 */
import { describe, it, expect } from 'vitest';
import { bucketForDue, groupByDueBucket, DUE_BUCKETS, DUE_BUCKET_ORDER } from '../dateBuckets';
import { todayStr, addDaysStr } from '../util';

describe('bucketForDue', () => {
  it('maps missing dates to the no-date bucket', () => {
    expect(bucketForDue(null).key).toBe('none');
    expect(bucketForDue(undefined).key).toBe('none');
    expect(bucketForDue('').key).toBe('none');
  });

  it('maps past dates to overdue and today to today', () => {
    expect(bucketForDue(addDaysStr(-1)).key).toBe('overdue');
    expect(bucketForDue('2000-01-01').key).toBe('overdue');
    expect(bucketForDue(todayStr()).key).toBe('today');
  });

  it('puts the 7-day boundary inside "week" and day 8 in "later"', () => {
    expect(bucketForDue(addDaysStr(1)).key).toBe('week');
    expect(bucketForDue(addDaysStr(7)).key).toBe('week');
    expect(bucketForDue(addDaysStr(8)).key).toBe('later');
  });

  it('returns the full bucket descriptor (label/color/rank)', () => {
    const b = bucketForDue(addDaysStr(-3));
    expect(b).toEqual(DUE_BUCKETS.overdue);
    expect(b.label).toBe('Overdue');
    expect(b.rank).toBe(0);
  });
});

describe('groupByDueBucket', () => {
  const item = (due: string | null) => ({ due_date: due });

  it('groups into canonical order and drops empty buckets', () => {
    const groups = groupByDueBucket([
      item(null), item(addDaysStr(30)), item(todayStr()), item(addDaysStr(-2)),
    ]);
    expect(groups.map((g) => g.bucket.key)).toEqual(['overdue', 'today', 'later', 'none']);
  });

  it('preserves input order within a bucket', () => {
    const a = item(addDaysStr(-5));
    const b = item(addDaysStr(-1));
    const groups = groupByDueBucket([a, b]);
    expect(groups[0].items).toEqual([a, b]);
  });

  it('returns an empty array for no items', () => {
    expect(groupByDueBucket([])).toEqual([]);
  });

  it('covers every bucket key in DUE_BUCKET_ORDER', () => {
    expect(DUE_BUCKET_ORDER).toEqual(['overdue', 'today', 'week', 'later', 'none']);
    for (const k of DUE_BUCKET_ORDER) expect(DUE_BUCKETS[k].key).toBe(k);
  });
});
