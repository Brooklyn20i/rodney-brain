import { describe, expect, it } from 'vitest';
import { saveState, saveStatusLabel } from '../saveStatus';

describe('save status', () => {
  it('shows saving while a write is in flight', () => {
    expect(saveState(true, false)).toBe('saving');
    expect(saveStatusLabel(true, false)).toBe('saving…');
    // saving takes precedence even if a prior error is still around
    expect(saveState(true, true)).toBe('saving');
  });

  it('never claims saved when a sync error is present', () => {
    expect(saveState(false, true)).toBe('unsaved');
    expect(saveStatusLabel(false, true)).not.toContain('saved ✓');
    expect(saveStatusLabel(false, true)).toContain('not saved');
  });

  it('shows saved only when idle and error-free', () => {
    expect(saveState(false, false)).toBe('saved');
    expect(saveStatusLabel(false, false)).toBe('saved ✓');
  });

  it('shows queued (never "saved ✓") while offline writes await replay', () => {
    expect(saveState(false, false, 3)).toBe('queued');
    expect(saveStatusLabel(false, false, 3)).toBe('3 queued — will sync when online');
    // A live write or a real error still outranks the queue.
    expect(saveState(true, false, 3)).toBe('saving');
    expect(saveState(false, true, 3)).toBe('unsaved');
  });
});
