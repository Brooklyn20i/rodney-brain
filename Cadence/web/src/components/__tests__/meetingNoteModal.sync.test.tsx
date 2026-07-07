/**
 * Multi-device sync safety for the meeting note modal.
 *
 * Regression guard for a data-loss bug: an instance of a meeting left open on
 * one device held a stale in-memory snapshot and, on "Save & Close", wrote that
 * snapshot back — clobbering a newer save made on another device. The fix is
 * two-fold: (1) never persist the body unless the user actually edited it, and
 * (2) live-adopt an incoming remote body while there are no unsaved local edits.
 */
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { emptyData } from '../../lib/types';
import { serializeMeeting } from '../../lib/meetingData';

const h = vi.hoisted(() => ({ store: {} as any, dates: {} as Record<string, string> }));
vi.mock('../../lib/store', () => ({ useCadence: () => h.store }));
vi.mock('../../lib/meetings', async (orig) => ({
  ...(await (orig() as Promise<Record<string, unknown>>)),
  useMeetingDates: () => ({ dates: h.dates, setMeetingDate: vi.fn() }),
}));

import { MeetingNoteModal } from '../MeetingNoteModal';

const person = { id: 'p1', name: 'Sarah Chen', type: 'person', color: '#123', role: '' } as any;
const bodyWith = (topic: string) =>
  serializeMeeting({ agenda: [{ id: 'a1', title: topic, notes: '', status: 'discuss' }], actions: [], notes: '' });
const mkNote = (body: string) =>
  ({ id: 'n1', title: '1:1 · Sarah Chen', body, created_at: '2026-06-01T00:00:00Z', updated_at: '2026-06-01T00:00:00Z', deleted_at: null }) as any;

function renderModal(note: any) {
  return render(
    <MeetingNoteModal note={note} person={person} allMeetings={[note]} onClose={vi.fn()} onNavigate={vi.fn()} />,
  );
}
const bodyWrites = () => h.store.update.mock.calls.filter((c: any[]) => c[2] && typeof c[2].body === 'string');
const saveAndClose = () => fireEvent.click(screen.getAllByText('Save & Close')[0]);

beforeEach(() => {
  h.dates = {};
  h.store = {
    insert: vi.fn(), update: vi.fn().mockResolvedValue({}), remove: vi.fn(), logActivity: vi.fn(),
    session: { user: { id: 'me', email: 'r@x.com' } },
    ready: true, configured: true, canEdit: true,
    data: emptyData(),
  };
});
afterEach(() => cleanup());

describe('MeetingNoteModal multi-device sync', () => {
  it('does not write the body when closed without any edits (stale instance cannot clobber)', () => {
    renderModal(mkNote(bodyWith('Alpha')));
    saveAndClose();
    expect(bodyWrites()).toHaveLength(0);
  });

  it('still writes the body when the user actually edits, then closes', () => {
    renderModal(mkNote(bodyWith('Alpha')));
    fireEvent.change(screen.getByDisplayValue('Alpha'), { target: { value: 'Alpha edited' } });
    saveAndClose();
    const writes = bodyWrites();
    expect(writes.length).toBeGreaterThan(0);
    expect(writes[writes.length - 1][2].body).toContain('Alpha edited');
  });

  it('adopts a remote body change while there are no local edits (live sync)', () => {
    const { rerender } = renderModal(mkNote(bodyWith('Alpha')));
    expect(screen.getByDisplayValue('Alpha')).toBeTruthy();
    const remote = mkNote(bodyWith('Beta'));
    rerender(<MeetingNoteModal note={remote} person={person} allMeetings={[remote]} onClose={vi.fn()} onNavigate={vi.fn()} />);
    expect(screen.getByDisplayValue('Beta')).toBeTruthy();
    expect(screen.queryByDisplayValue('Alpha')).toBeNull();
  });

  it('does not let a remote change overwrite unsaved local edits', () => {
    const { rerender } = renderModal(mkNote(bodyWith('Alpha')));
    fireEvent.change(screen.getByDisplayValue('Alpha'), { target: { value: 'Local work' } });
    const remote = mkNote(bodyWith('Beta'));
    rerender(<MeetingNoteModal note={remote} person={person} allMeetings={[remote]} onClose={vi.fn()} onNavigate={vi.fn()} />);
    expect(screen.getByDisplayValue('Local work')).toBeTruthy();
    expect(screen.queryByDisplayValue('Beta')).toBeNull();
  });
});
