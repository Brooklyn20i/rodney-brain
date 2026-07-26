import type { Comment, WorkItem } from './types';

// A commitment someone owes you is only as good as your follow-up — but
// nothing used to say WHEN to follow up. "Movement" here = the record itself
// changing (edit, flip, tick) or an update landing on its thread. Chasing
// logs an update, so a chase resets the clock by design.

// Show the "Nd quiet" chip from here…
export const QUIET_CHIP_DAYS = 4;
// …and treat the item as stale (needs a chase) from here.
export const STALE_DAYS = 7;

export function lastMovementIso(w: WorkItem, comments: Comment[]): string | null {
  let latest: string | null = null;
  const consider = (iso?: string | null) => {
    if (iso && (!latest || iso > latest)) latest = iso;
  };
  consider(w.updated_at);
  consider(w.created_at);
  for (const c of comments) {
    if (c.work_item_id === w.id && !c.deleted_at) consider(c.created_at);
  }
  return latest;
}

// Whole days since the last movement. Items with no timestamps at all (old
// local rows, test fixtures) count as fresh — never nag on missing data.
export function daysQuiet(w: WorkItem, comments: Comment[], now: Date = new Date()): number {
  const last = lastMovementIso(w, comments);
  if (!last) return 0;
  const ms = now.getTime() - new Date(last).getTime();
  return Math.max(0, Math.floor(ms / 86_400_000));
}
