import { describe, it, expect } from 'vitest';
import { readMeetingDates, readMergedMeetingDates } from '../meetings';

const rec = (map: Record<string, string>, updated_at: string, deleted_at: string | null = null) =>
  ({ title: '__meeting_dates__', body: JSON.stringify(map), updated_at, deleted_at });

describe('readMergedMeetingDates', () => {
  it('merges every copy so a date in an older record is not lost', () => {
    // The single-record reader would take only the newest and drop Anna.
    const notes = [
      rec({ nAnna: '2026-06-20' }, '2026-05-01'),
      rec({ nBob: '2026-06-21' }, '2026-06-05'),
    ];
    expect(readMeetingDates(notes)).toEqual({ nBob: '2026-06-21' });      // old behaviour: Anna lost
    expect(readMergedMeetingDates(notes)).toEqual({                        // recovered
      nAnna: '2026-06-20', nBob: '2026-06-21',
    });
  });

  it('lets the newest record win on a conflicting key', () => {
    const notes = [
      rec({ n1: '2026-06-20' }, '2026-05-01'),
      rec({ n1: '2026-07-01' }, '2026-06-05'),
    ];
    expect(readMergedMeetingDates(notes).n1).toBe('2026-07-01');
  });

  it('ignores deleted records and unparseable bodies', () => {
    const notes = [
      rec({ n1: '2026-06-20' }, '2026-05-01'),
      { title: '__meeting_dates__', body: 'not json', updated_at: '2026-06-01', deleted_at: null },
      rec({ n2: '2026-06-22' }, '2026-06-02', '2026-06-03'), // deleted
    ];
    expect(readMergedMeetingDates(notes)).toEqual({ n1: '2026-06-20' });
  });

  it('keeps person-keyed entries (older format) available to callers', () => {
    // The merge is key-agnostic — person-id keys survive so the strip can
    // surface meetings the note-id-only path would miss.
    expect(readMergedMeetingDates([rec({ pAnna: '2026-06-20' }, '2026-06-01')]))
      .toEqual({ pAnna: '2026-06-20' });
  });
});
