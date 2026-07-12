/**
 * Multi-device sync safety for the meeting note modal.
 *
 * Guards two failure modes:
 *  1. A stale instance left open on another device must not overwrite a newer
 *     save (dirty-guarded flush + live-adopt-while-clean).
 *  2. REGRESSION: a concurrent stale refetch (older `updated_at`) landing while
 *     the user's own save is in flight must NOT revert freshly typed content or
 *     erase rich-text bullets. Live-sync only adopts a strictly-newer version.
 */
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react';
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
// ISO timestamps so string comparison orders versions correctly.
const T0 = '2026-06-01T00:00:00.000Z';
const mkNote = (body: string, updated_at = T0) =>
  ({ id: 'n1', title: '1:1 · Sarah Chen', body, created_at: T0, updated_at, deleted_at: null }) as any;

function renderModal(note: any) {
  return render(
    <MeetingNoteModal note={note} person={person} allMeetings={[note]} onClose={vi.fn()} onNavigate={vi.fn()} />,
  );
}
const rerenderWith = (rerender: any, note: any) =>
  rerender(<MeetingNoteModal note={note} person={person} allMeetings={[note]} onClose={vi.fn()} onNavigate={vi.fn()} />);
const bodyWrites = () => h.store.update.mock.calls.filter((c: any[]) => c[2] && typeof c[2].body === 'string');
// handleClose is async (auto-split runs before the final flush) — drive it
// inside act and let the microtasks settle before asserting.
const saveAndClose = () => act(async () => { fireEvent.click(screen.getAllByText('Save & Close')[0]); });

beforeEach(() => {
  h.dates = {};
  h.store = {
    insert: vi.fn(),
    // Default: resolve with a newer server timestamp (as a real save would).
    update: vi.fn().mockResolvedValue({ updated_at: '2026-06-01T00:00:05.000Z' }),
    remove: vi.fn(),
    logActivity: vi.fn(),
    session: { user: { id: 'me', email: 'r@x.com' } },
    ready: true, configured: true, canEdit: true,
    data: emptyData(),
  };
});
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe('MeetingNoteModal multi-device sync', () => {
  it('does not write the body when closed without any edits (stale instance cannot clobber)', async () => {
    renderModal(mkNote(bodyWith('Alpha')));
    await saveAndClose();
    expect(bodyWrites()).toHaveLength(0);
  });

  it('still writes the body when the user actually edits, then closes', async () => {
    renderModal(mkNote(bodyWith('Alpha')));
    fireEvent.change(screen.getByDisplayValue('Alpha'), { target: { value: 'Alpha edited' } });
    await saveAndClose();
    const writes = bodyWrites();
    expect(writes.length).toBeGreaterThan(0);
    expect(writes[writes.length - 1][2].body).toContain('Alpha edited');
  });

  it('debounced autosave persists typed text without pressing Save & Close', async () => {
    vi.useFakeTimers();
    renderModal(mkNote(bodyWith('Alpha')));
    fireEvent.change(screen.getByDisplayValue('Alpha'), { target: { value: 'Persisted note' } });
    await act(async () => { await vi.advanceTimersByTimeAsync(700); });
    const writes = bodyWrites();
    expect(writes.length).toBeGreaterThan(0);
    expect(writes[writes.length - 1][2].body).toContain('Persisted note');
  });

  it('adopts a STRICTLY NEWER remote body while there are no local edits (live sync)', () => {
    const { rerender } = renderModal(mkNote(bodyWith('Alpha'), T0));
    expect(screen.getByDisplayValue('Alpha')).toBeTruthy();
    rerenderWith(rerender, mkNote(bodyWith('Beta'), '2026-06-02T00:00:00.000Z'));
    expect(screen.getByDisplayValue('Beta')).toBeTruthy();
    expect(screen.queryByDisplayValue('Alpha')).toBeNull();
  });

  it('does not let a remote change overwrite unsaved local edits', () => {
    const { rerender } = renderModal(mkNote(bodyWith('Alpha'), T0));
    fireEvent.change(screen.getByDisplayValue('Alpha'), { target: { value: 'Local work' } });
    rerenderWith(rerender, mkNote(bodyWith('Beta'), '2026-06-02T00:00:00.000Z'));
    expect(screen.getByDisplayValue('Local work')).toBeTruthy();
    expect(screen.queryByDisplayValue('Beta')).toBeNull();
  });

  it('REGRESSION: a stale concurrent refetch (older updated_at) does not revert freshly typed content', async () => {
    vi.useFakeTimers();
    const note = mkNote(bodyWith('Alpha'), T0);
    const { rerender } = renderModal(note);
    // Type, then let the debounced save fire (server returns a newer timestamp).
    fireEvent.change(screen.getByDisplayValue('Alpha'), { target: { value: 'Alpha edited' } });
    await act(async () => { await vi.advanceTimersByTimeAsync(700); });
    // A stale realtime refetch lands: same note id, OLD body, OLD timestamp —
    // exactly the race that used to wipe the edit back to "Alpha".
    rerenderWith(rerender, { ...note, body: bodyWith('Alpha'), updated_at: T0 });
    expect(screen.getByDisplayValue('Alpha edited')).toBeTruthy();
    expect(screen.queryByDisplayValue('Alpha')).toBeNull();
  });
});

// ── The 1:1 loop: queue merge on open + auto-split on close ────────────────────
describe('MeetingNoteModal 1:1 loop', () => {
  const actionsBody = serializeMeeting({
    agenda: [],
    actions: [
      { id: 'ac1', title: 'Mine to do', owner: 'me', due: '', done: false, pushed: false },
      { id: 'ac2', title: 'Theirs to chase', owner: 'them', due: '', done: false, pushed: false },
    ],
    notes: '',
  });

  it('auto-splits actions on close: mine → my task, theirs → their owes-me ledger', async () => {
    renderModal(mkNote(actionsBody));
    await saveAndClose();

    const inserts = h.store.insert.mock.calls.filter((c: any[]) => c[0] === 'work_items').map((c: any[]) => c[1]);
    expect(inserts).toHaveLength(2);
    const mine = inserts.find((r: any) => r.title === 'Mine to do');
    const theirs = inserts.find((r: any) => r.title === 'Theirs to chase');
    expect(mine).toMatchObject({ type: 'task', person_id: 'p1', inboxed: false });
    expect(theirs).toMatchObject({ type: 'waitingFor', person_id: 'p1', inboxed: false });
    // Structured provenance back to this meeting note.
    expect(mine.related_entities).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'note', id: 'n1' }),
    ]));
    // The pushed flags land in the final body write of the same close.
    const writes = bodyWrites();
    expect(writes.length).toBeGreaterThan(0);
    expect(writes[writes.length - 1][2].body).toContain('"pushed":true');
  });

  it('re-closing never duplicates already-pushed actions', async () => {
    const pushedBody = serializeMeeting({
      agenda: [],
      actions: [{ id: 'ac1', title: 'Already filed', owner: 'me', due: '', done: false, pushed: true }],
      notes: '',
    });
    renderModal(mkNote(pushedBody));
    await saveAndClose();
    expect(h.store.insert.mock.calls.filter((c: any[]) => c[0] === 'work_items')).toHaveLength(0);
  });

  it('merges the agenda queue into the upcoming meeting and clears the queue', async () => {
    const meetingNote = { ...mkNote(bodyWith('Alpha')), folder: '__mtg__p1' };
    const queueNote = {
      id: 'q1', title: '__agenda__p1',
      body: JSON.stringify({ items: [{ id: 'qa1', title: 'Raise budget', notes: '', status: 'discuss' }] }),
      created_at: T0, updated_at: T0, deleted_at: null,
    } as any;
    h.dates = { n1: '2999-01-01' }; // this note IS the upcoming 1:1
    h.store.data = { ...emptyData(), notes: [meetingNote, queueNote] };

    renderModal(meetingNote);
    expect(await screen.findByDisplayValue('Raise budget')).toBeTruthy();
    // Queue emptied so a re-open can't re-merge (ids also dedupe as backstop).
    expect(h.store.update).toHaveBeenCalledWith('notes', 'q1',
      expect.objectContaining({ body: JSON.stringify({ items: [] }) }));
  });

  it('does NOT merge the queue into a past (non-upcoming) meeting', () => {
    const meetingNote = { ...mkNote(bodyWith('Alpha')), folder: '__mtg__p1' };
    const queueNote = {
      id: 'q1', title: '__agenda__p1',
      body: JSON.stringify({ items: [{ id: 'qa1', title: 'Raise budget', notes: '', status: 'discuss' }] }),
      created_at: T0, updated_at: T0, deleted_at: null,
    } as any;
    h.dates = {}; // no upcoming date → not the upcoming meeting
    h.store.data = { ...emptyData(), notes: [meetingNote, queueNote] };

    renderModal(meetingNote);
    expect(screen.queryByDisplayValue('Raise budget')).toBeNull();
    expect(h.store.update).not.toHaveBeenCalledWith('notes', 'q1', expect.anything());
  });
});
