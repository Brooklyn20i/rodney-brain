/**
 * MeetingDocModal continuity tests: saves must be acknowledged before closing
 * or navigation, action captures are filed directly without double-submit loss,
 * and meeting commitments are canonical work_items rather than copied note JSON.
 */
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { emptyData } from '../../lib/types';
import type { Note, Person, WorkItem } from '../../lib/types';

const h = vi.hoisted(() => ({ store: {} as any, dates: {} as Record<string, string>, setMeetingDate: vi.fn() }));
vi.mock('../../lib/store', () => ({ useCadence: () => h.store }));
vi.mock('../../lib/meetings', () => ({ useMeetingDates: () => ({ dates: h.dates, setMeetingDate: h.setMeetingDate }) }));
vi.mock('../RichEditor', () => ({
  RichEditor: ({ content, onChange, onBlur }: any) => (
    <textarea
      aria-label="Meeting document"
      defaultValue={content}
      onChange={(e) => onChange((e.target as HTMLTextAreaElement).value)}
      onBlur={() => onBlur?.()}
    />
  ),
}));
vi.mock('../NoteSharePanel', () => ({ NoteSharePanel: ({ onClose }: any) => <button onClick={onClose}>Close share</button> }));
vi.mock('../TopicsPanel', () => ({ TopicsPanel: () => <div>Topics mocked</div> }));

import { MeetingDocModal } from '../MeetingDocModal';

const T0 = '2026-06-01T00:00:00.000Z';
const T1 = '2026-06-01T00:01:00.000Z';

const person = (o: Partial<Person> = {}): Person => ({
  id: 'p1', owner_id: 'o', name: 'Anna Lee', role: '', email: '', notes: '', color: '#123', type: 'person',
  created_at: T0, updated_at: T0, deleted_at: null, ...o,
}) as Person;
const note = (o: Partial<Note> = {}): Note => ({
  id: 'n1', owner_id: 'o', title: '1:1 · Anna Lee · 20/06/2026', body: '<p>Initial</p>', folder: '__mtg__p1',
  created_at: T0, updated_at: T0, deleted_at: null, ...o,
}) as Note;
const wi = (o: Partial<WorkItem>): WorkItem => ({
  id: 'w1', owner_id: 'o', title: 'Open item', type: 'task', priority: 'medium', due_date: null,
  project_id: null, person_id: 'p1', notes: '', done: false, inboxed: false, source: 'you', completed_at: null,
  created_at: T0, updated_at: T0, deleted_at: null, ...o,
}) as WorkItem;

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

function setStore(dataOver: any = {}) {
  h.dates = { n1: '2026-06-20', n0: '2026-06-01' };
  h.setMeetingDate = vi.fn().mockResolvedValue(undefined);
  h.store = {
    insert: vi.fn().mockImplementation(async (_table: string, row: any) => ({ id: row.id || 'new-row', updated_at: T1, ...row })),
    update: vi.fn().mockResolvedValue({ updated_at: T1 }),
    remove: vi.fn().mockResolvedValue(undefined),
    logActivity: vi.fn(),
    data: { ...emptyData(), people: [person()], notes: [note()], work_items: [], ...dataOver },
    session: { user: { id: 'me', email: 'r@example.test' } },
    ready: true,
    configured: true,
    canEdit: true,
  };
}

function renderModal(over: { note?: Note; person?: Person; meetings?: Note[]; onClose?: () => void; onNavigate?: (id: string) => void } = {}) {
  const n = over.note || note();
  const p = over.person || person();
  const meetings = over.meetings || [n, note({ id: 'n0', title: '1:1 · Anna Lee · 01/06/2026', body: '<p>Earlier context</p>' })];
  return render(<MeetingDocModal note={n} person={p} allMeetings={meetings} onClose={over.onClose || vi.fn()} onNavigate={over.onNavigate || vi.fn()} />);
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 5, 20));
  setStore();
});
afterEach(() => cleanup());

describe('MeetingDocModal save acknowledgement', () => {
  it('does not reset a dirty editor draft when a realtime update rerenders the same note', () => {
    const { rerender } = renderModal();
    fireEvent.change(screen.getByLabelText('Meeting document'), { target: { value: '<p>Local draft</p>' } });

    const newerServerNote = note({ body: '<p>Server update</p>', updated_at: T1 });
    rerender(<MeetingDocModal note={newerServerNote} person={person()} allMeetings={[newerServerNote]} onClose={vi.fn()} onNavigate={vi.fn()} />);

    expect(screen.getByLabelText('Meeting document')).toHaveValue('<p>Local draft</p>');
  });

  it('does not close on Save & Close until the note update is acknowledged', async () => {
    const close = vi.fn();
    const ack = deferred<any>();
    h.store.update = vi.fn().mockReturnValueOnce(ack.promise);
    renderModal({ onClose: close });

    fireEvent.change(screen.getByLabelText('Meeting document'), { target: { value: '<p>Edited</p>' } });
    await act(async () => { fireEvent.click(screen.getAllByRole('button', { name: 'Save & Close' })[0]); });

    expect(close).not.toHaveBeenCalled();
    expect(screen.getByText('Saving…')).toBeInTheDocument();
    expect(h.store.update).toHaveBeenCalledWith('notes', 'n1', { body: '<p>Edited</p>' }, { strict: true });

    await act(async () => { ack.resolve({ updated_at: T1 }); await ack.promise; });
    expect(close).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Saved')).toBeInTheDocument();
  });

  it('keeps a failed draft open and retries it before closing', async () => {
    const close = vi.fn();
    h.store.update = vi.fn()
      .mockRejectedValueOnce(new Error('network down'))
      .mockResolvedValueOnce({ updated_at: T1 });
    renderModal({ onClose: close });

    fireEvent.change(screen.getByLabelText('Meeting document'), { target: { value: '<p>Still here</p>' } });
    await act(async () => { fireEvent.click(screen.getAllByRole('button', { name: 'Save & Close' })[0]); });

    expect(close).not.toHaveBeenCalled();
    expect(screen.getAllByText(/Save failed/).length).toBeGreaterThan(0);
    expect(screen.getByLabelText('Meeting document')).toHaveValue('<p>Still here</p>');

    await act(async () => { fireEvent.click(screen.getAllByRole('button', { name: 'Save & Close' })[0]); });
    expect(close).toHaveBeenCalledTimes(1);
    expect(h.store.update).toHaveBeenLastCalledWith('notes', 'n1', { body: '<p>Still here</p>' }, { strict: true });
  });

  it('serializes rapid edits and saves text typed while the first save is inflight', async () => {
    const first = deferred<any>();
    h.store.update = vi.fn()
      .mockReturnValueOnce(first.promise)
      .mockResolvedValueOnce({ updated_at: '2026-06-01T00:02:00.000Z' });
    renderModal();

    fireEvent.change(screen.getByLabelText('Meeting document'), { target: { value: '<p>First</p>' } });
    await act(async () => { vi.advanceTimersByTime(650); });
    expect(h.store.update).toHaveBeenCalledTimes(1);

    fireEvent.change(screen.getByLabelText('Meeting document'), { target: { value: '<p>Second</p>' } });
    await act(async () => { first.resolve({ updated_at: T1 }); await first.promise; });
    await act(async () => { await Promise.resolve(); });

    expect(h.store.update).toHaveBeenCalledTimes(2);
    expect(h.store.update).toHaveBeenLastCalledWith('notes', 'n1', { body: '<p>Second</p>' }, { strict: true });
  });

  it('awaits save acknowledgement before navigating to a previous meeting', async () => {
    const nav = vi.fn();
    const ack = deferred<any>();
    h.store.update = vi.fn().mockReturnValueOnce(ack.promise);
    renderModal({ onNavigate: nav });

    fireEvent.change(screen.getByLabelText('Meeting document'), { target: { value: '<p>Before nav</p>' } });
    await act(async () => { fireEvent.click(screen.getAllByRole('button', { name: /01\/06/ })[0]); });
    expect(nav).not.toHaveBeenCalled();
    await act(async () => { ack.resolve({ updated_at: T1 }); await ack.promise; });
    expect(nav).toHaveBeenCalledWith('n0');
  });
});

describe('MeetingDocModal continuity and action capture', () => {
  it('shows open commitments with I-owe and they-owe semantics from canonical work_items', () => {
    setStore({ work_items: [
      wi({ id: 'mine', title: 'Draft deck', person_id: 'p1', type: 'task' }),
      wi({ id: 'theirs', title: 'Anna sends numbers', person_id: 'p2', type: 'waitingFor', related_entities: [{ type: 'person', id: 'p1', name: 'Anna Lee' }] }),
      wi({ id: 'done', title: 'Done item', person_id: 'p1', done: true }),
    ]});
    renderModal();

    expect(screen.getAllByText('I owe Anna').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Anna owes me').length).toBeGreaterThan(0);
    expect(screen.getByText('Draft deck')).toBeInTheDocument();
    expect(screen.getByText('Anna sends numbers')).toBeInTheDocument();
    expect(screen.queryByText('Done item')).not.toBeInTheDocument();
  });

  it('direct filed action capture is guarded against rapid taps and preserves text typed while inflight', async () => {
    const ack = deferred<any>();
    h.store.insert = vi.fn().mockReturnValueOnce(ack.promise);
    renderModal();

    fireEvent.change(screen.getByPlaceholderText(/Capture a task/), { target: { value: 'Send draft' } });
    const button = screen.getByRole('button', { name: /I owe Anna/ });
    await act(async () => {
      fireEvent.click(button);
      fireEvent.click(button);
    });
    fireEvent.change(screen.getByPlaceholderText(/Capture a task/), { target: { value: 'New action' } });

    expect(h.store.insert).toHaveBeenCalledTimes(1);
    expect(h.store.insert.mock.calls[0][0]).toBe('work_items');
    expect(h.store.insert.mock.calls[0][1]).toMatchObject({ title: 'Send draft', type: 'task', inboxed: false, person_id: 'p1' });
    expect(h.store.insert.mock.calls[0][2]).toEqual({ strict: true });

    await act(async () => { ack.resolve({ id: h.store.insert.mock.calls[0][1].id, updated_at: T1 }); await ack.promise; });
    expect(screen.getByPlaceholderText(/Capture a task/)).toHaveValue('New action');
  });

  it('failed action capture keeps the draft and retries with the same stable client id', async () => {
    h.store.insert = vi.fn()
      .mockRejectedValueOnce(new Error('timeout'))
      .mockResolvedValueOnce({ id: 'server-row', updated_at: T1 });
    renderModal();

    fireEvent.change(screen.getByPlaceholderText(/Capture a task/), { target: { value: 'Chase answer' } });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Give to Anna/ })); });
    const firstId = h.store.insert.mock.calls[0][1].id;
    expect(screen.getByText(/Capture failed/)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/Capture a task/)).toHaveValue('Chase answer');

    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Give to Anna/ })); });
    expect(h.store.insert).toHaveBeenCalledTimes(2);
    expect(h.store.insert.mock.calls[1][1].id).toBe(firstId);
  });

  it('shows an inline error when a commitment completion toggle is rejected', async () => {
    setStore({ work_items: [wi({ id: 'mine', title: 'Draft deck', person_id: 'p1', type: 'task' })] });
    h.store.update = vi.fn().mockRejectedValueOnce(new Error('RLS rejected'));
    renderModal();

    await act(async () => { fireEvent.click(screen.getByLabelText('Complete Draft deck')); });

    expect(screen.getByText(/Could not update commitment/)).toBeInTheDocument();
    expect(h.store.update).toHaveBeenCalledWith('work_items', 'mine', expect.objectContaining({ done: true }), { strict: true });
  });

  it('saves title edits strictly and retains the draft title on failure', async () => {
    h.store.update = vi.fn().mockRejectedValueOnce(new Error('title write failed'));
    renderModal();

    const titleInput = screen.getByDisplayValue('1:1 · Anna Lee · 20/06/2026');
    fireEvent.change(titleInput, { target: { value: 'Custom title' } });
    await act(async () => { fireEvent.blur(titleInput); });

    expect(titleInput).toHaveValue('Custom title');
    expect(screen.getByText(/Could not save title/)).toBeInTheDocument();
    expect(h.store.update).toHaveBeenCalledWith('notes', 'n1', { title: 'Custom title' }, { strict: true });
  });

  it('group meetings require a participant for direct filed actions and include prior meetings as navigable context', async () => {
    const group = person({ id: 'g1', name: 'Leadership Weekly', type: 'meeting_group' });
    const anna = person({ id: 'p1', name: 'Anna Lee' });
    const n = note({ id: 'n1', title: 'Leadership Weekly · 20/06/2026', folder: '__mtg__g1' });
    setStore({ people: [group, anna], notes: [n] });
    renderModal({ person: group, note: n, meetings: [n, note({ id: 'n0', title: 'Leadership Weekly · 01/06/2026', body: '<p>Earlier context</p>', folder: '__mtg__g1' })] });

    expect(screen.getByText('Previous meeting context')).toBeInTheDocument();
    expect(screen.getByText(/Earlier context/)).toBeInTheDocument();
    fireEvent.change(screen.getByPlaceholderText(/Capture a task/), { target: { value: 'Anna sends pack' } });
    expect(screen.getByRole('button', { name: /They owe me/ })).toBeDisabled();

    fireEvent.change(screen.getByLabelText('Action owner'), { target: { value: 'p1' } });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /They owe me/ })); });
    const payload = h.store.insert.mock.calls[0][1];
    expect(payload).toMatchObject({ title: 'Anna sends pack', type: 'waitingFor', person_id: 'p1', inboxed: false });
    expect(payload.related_entities).toContainEqual({ type: 'person', id: 'g1', name: 'Leadership Weekly' });
  });
});
