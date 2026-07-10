// The little "saving… / saved ✓" indicator must stay honest. The fitness store
// keeps changes optimistically and surfaces a `syncError` once its retries are
// exhausted (there is NO durable offline queue), so we must never claim
// "saved ✓" while a save has actually failed.

export type SaveState = 'saving' | 'unsaved' | 'saved';

export function saveState(saving: boolean, hasSyncError: boolean): SaveState {
  if (saving) return 'saving';
  if (hasSyncError) return 'unsaved';
  return 'saved';
}

export function saveStatusLabel(saving: boolean, hasSyncError: boolean): string {
  switch (saveState(saving, hasSyncError)) {
    case 'saving':
      return 'saving…';
    case 'unsaved':
      return 'not saved — check connection';
    default:
      return 'saved ✓';
  }
}
