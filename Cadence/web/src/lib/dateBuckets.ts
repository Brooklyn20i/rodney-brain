// Single source of truth for due-date bucketing (Overdue / Today / This week /
// Later / No date). Tasks, Inbox and the cockpit selectors all group by these
// buckets — one implementation so the boundaries can never drift apart.

import { todayStr, addDaysStr } from './util';

export type DueBucketKey = 'overdue' | 'today' | 'week' | 'later' | 'none';

export interface DueBucket {
  key: DueBucketKey;
  label: string;
  color: string; // CSS var for count badges / group headers
  rank: number;  // display order (0 first)
}

export const DUE_BUCKETS: Record<DueBucketKey, DueBucket> = {
  overdue: { key: 'overdue', label: 'Overdue', color: 'var(--red)', rank: 0 },
  today: { key: 'today', label: 'Today', color: 'var(--orange)', rank: 1 },
  week: { key: 'week', label: 'This week', color: 'var(--accent)', rank: 2 },
  later: { key: 'later', label: 'Later', color: 'var(--purple)', rank: 3 },
  none: { key: 'none', label: 'No date', color: 'var(--text3)', rank: 4 },
};

export const DUE_BUCKET_ORDER: DueBucketKey[] = ['overdue', 'today', 'week', 'later', 'none'];

export function bucketForDue(due: string | null | undefined): DueBucket {
  if (!due) return DUE_BUCKETS.none;
  const today = todayStr();
  if (due < today) return DUE_BUCKETS.overdue;
  if (due === today) return DUE_BUCKETS.today;
  if (due <= addDaysStr(7)) return DUE_BUCKETS.week;
  return DUE_BUCKETS.later;
}

// Group items into buckets, preserving canonical bucket order and dropping
// empty buckets. Items keep their input order within a bucket — callers sort.
export function groupByDueBucket<T extends { due_date: string | null }>(
  items: T[],
): { bucket: DueBucket; items: T[] }[] {
  const map = new Map<DueBucketKey, T[]>();
  for (const it of items) {
    const key = bucketForDue(it.due_date).key;
    const list = map.get(key);
    if (list) list.push(it);
    else map.set(key, [it]);
  }
  return DUE_BUCKET_ORDER
    .filter((k) => map.has(k))
    .map((k) => ({ bucket: DUE_BUCKETS[k], items: map.get(k)! }));
}
