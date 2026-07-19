// The little "saving… / saved ✓" indicator must stay honest. The fitness
// store keeps changes optimistically; once its retries are exhausted a
// network failure lands in the durable offline queue (synced when the
// connection returns) and anything else surfaces a `syncError` — so we must
// never claim "saved ✓" while a change is queued or has actually failed.

export type SaveState = 'saving' | 'unsaved' | 'queued' | 'saved';

export function saveState(saving: boolean, hasSyncError: boolean, pendingCount = 0): SaveState {
  if (saving) return 'saving';
  if (hasSyncError) return 'unsaved';
  if (pendingCount > 0) return 'queued';
  return 'saved';
}

export function saveStatusLabel(saving: boolean, hasSyncError: boolean, pendingCount = 0): string {
  switch (saveState(saving, hasSyncError, pendingCount)) {
    case 'saving':
      return 'saving…';
    case 'unsaved':
      return 'not saved — check connection';
    case 'queued':
      return `${pendingCount} queued — will sync when online`;
    default:
      return 'saved ✓';
  }
}
