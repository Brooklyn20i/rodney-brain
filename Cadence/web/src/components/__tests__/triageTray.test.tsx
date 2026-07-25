/**
 * Global Capture + Today triage tray.
 *
 * Captures (inboxed work items) queue in a tray pinned on Today until Rodney
 * shapes them: file as his own task, mark Waiting / owed by others, attach to
 * a project, keep as a note, or dismiss. The Capture FAB (and the `c` key)
 * must open the existing Quick Add sheet from anywhere in the Work domain.
 */
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { emptyData } from '../../lib/types';

const h = vi.hoisted(() => ({ store: {} as any }));
vi.mock('../../lib/store', () => ({ useCadence: () => h.store }));

import { TriageTray } from '../TriageTray';
import { GlobalCapture } from '../GlobalCapture';
import { ItemModal } from '../ItemModal';

const person = (o: any) => ({ id: 'p', name: 'P', type: 'person', color: '#123', role: '', email: '', ...o });
const project = (o: any) => ({
  id: 'pr', name: 'Proj', goal: '', status: 'active', health: 'green', owner: '', target_date: null,
  next_action: '', color: '#456', deleted_at: null, created_at: '', updated_at: '', ...o,
});
const wi = (o: any) => ({
  id: 'w', title: 'T', type: 'task', priority: 'medium', due_date: null, project_id: null, person_id: null,
  notes: '', done: false, inboxed: false, source: 'you', completed_at: null, related_entities: [],
  created_at: '', updated_at: '', deleted_at: null, ...o,
});

function setStore(dataOver: any = {}, over: any = {}) {
  h.store = {
    insert: vi.fn().mockResolvedValue({}), update: vi.fn().mockResolvedValue({}),
    remove: vi.fn().mockResolvedValue(undefined), logActivity: vi.fn(),
    session: { user: { id: 'me', email: 'r@x.com' } },
    ready: true, configured: true, canEdit: true,
    data: { ...emptyData(), ...dataOver },
    ...over,
  };
}
beforeEach(() => setStore());
afterEach(() => cleanup());

describe('Triage tray population', () => {
  it('shows only untriaged captures, with a count; filed/done/delegated items stay out', () => {
    setStore({
      work_items: [
        wi({ id: 'c1', title: 'Fresh capture', inboxed: true }),
        wi({ id: 'c2', title: 'Tagged capture', inboxed: true, person_id: 'amy' }),
        wi({ id: 'f1', title: 'Already filed', inboxed: false, person_id: 'amy' }),
        wi({ id: 'd1', title: 'Done capture', inboxed: true, done: true }),
        wi({ id: 'k1', title: 'With Kobe', inboxed: true, source: 'for:kobe' }),
      ],
      people: [person({ id: 'amy', name: 'Amy Jones' })],
    });
    render(<TriageTray onEdit={vi.fn()} />);
    expect(screen.getByText('Fresh capture')).toBeTruthy();
    expect(screen.getByText('Tagged capture')).toBeTruthy();
    expect(screen.queryByText('Already filed')).toBeNull();
    expect(screen.queryByText('Done capture')).toBeNull();
    expect(screen.queryByText('With Kobe')).toBeNull();
    expect(screen.getByText('2')).toBeTruthy(); // header count badge
  });

  it('shows the empty state when there is nothing to triage', () => {
    render(<TriageTray onEdit={vi.fn()} />);
    expect(screen.getByText(/Nothing to triage/)).toBeTruthy();
  });
});

describe('Triage actions', () => {
  const capture = wi({ id: 'c1', title: 'Chase the invoice', inboxed: true });

  it('"My to-do" files the capture as owed-to-no-one: task type AND person cleared', async () => {
    setStore({ work_items: [wi({ ...capture, type: 'waitingFor', person_id: 'amy' })] });
    render(<TriageTray onEdit={vi.fn()} />);
    fireEvent.click(screen.getByText('My to-do'));
    await waitFor(() => expect(h.store.update).toHaveBeenCalledTimes(1));
    const [table, id, patch] = h.store.update.mock.calls[0];
    expect(table).toBe('work_items');
    expect(id).toBe('c1');
    expect(patch.inboxed).toBe(false);
    expect(patch.type).toBe('task');
    // Owed to no one — the tagged person must not silently become a debt.
    expect(patch.person_id).toBeNull();
  });

  it('"Waiting…" with a person files it as waitingFor owed by that person', async () => {
    setStore({ work_items: [capture], people: [person({ id: 'amy', name: 'Amy Jones' })] });
    render(<TriageTray onEdit={vi.fn()} />);
    fireEvent.click(screen.getByText('Waiting…'));
    fireEvent.click(screen.getByText(/Amy Jones/));
    await waitFor(() => expect(h.store.update).toHaveBeenCalledTimes(1));
    const [, id, patch] = h.store.update.mock.calls[0];
    expect(id).toBe('c1');
    expect(patch).toMatchObject({ inboxed: false, type: 'waitingFor', person_id: 'amy' });
    expect(patch.related_entities).toEqual([{ type: 'person', id: 'amy', name: 'Amy Jones' }]);
  });

  it('"Waiting…" → "No one specific" still files it as waitingFor', async () => {
    setStore({ work_items: [capture] });
    render(<TriageTray onEdit={vi.fn()} />);
    fireEvent.click(screen.getByText('Waiting…'));
    fireEvent.click(screen.getByText('No one specific'));
    await waitFor(() => expect(h.store.update).toHaveBeenCalledTimes(1));
    const [, , patch] = h.store.update.mock.calls[0];
    expect(patch).toMatchObject({ inboxed: false, type: 'waitingFor', person_id: null });
  });

  it('"Project…" files the capture into the picked project', async () => {
    setStore({ work_items: [capture], projects: [project({ id: 'promace', name: 'Promace' })] });
    render(<TriageTray onEdit={vi.fn()} />);
    fireEvent.click(screen.getByText('Project…'));
    fireEvent.click(screen.getByText(/Promace/));
    await waitFor(() => expect(h.store.update).toHaveBeenCalledTimes(1));
    const [, id, patch] = h.store.update.mock.calls[0];
    expect(id).toBe('c1');
    expect(patch).toMatchObject({ inboxed: false, project_id: 'promace' });
    expect(patch.related_entities).toEqual([{ type: 'project', id: 'promace', name: 'Promace' }]);
  });

  it('"Note" keeps the content as a note and retires the work item', async () => {
    setStore({ work_items: [wi({ id: 'c1', title: 'Idea: async standups', inboxed: true, notes: 'details' })] });
    render(<TriageTray onEdit={vi.fn()} />);
    fireEvent.click(screen.getByText('Note'));
    await waitFor(() => expect(h.store.remove).toHaveBeenCalledWith('work_items', 'c1'));
    const [table, row] = h.store.insert.mock.calls[0];
    expect(table).toBe('notes');
    expect(row).toMatchObject({ title: 'Idea: async standups', body: 'details' });
  });

  it('dismiss completes the capture so it leaves every surface', async () => {
    setStore({ work_items: [capture] });
    render(<TriageTray onEdit={vi.fn()} />);
    fireEvent.click(screen.getByTitle(/Dismiss/));
    await waitFor(() => expect(h.store.update).toHaveBeenCalledTimes(1));
    const [, , patch] = h.store.update.mock.calls[0];
    expect(patch.done).toBe(true);
    expect(patch.inboxed).toBe(false);
    expect(patch.completed_at).toBeTruthy();
  });

  it('hides triage actions in read-only mode', () => {
    setStore({ work_items: [capture] }, { canEdit: false });
    render(<TriageTray onEdit={vi.fn()} />);
    expect(screen.getByText('Chase the invoice')).toBeTruthy();
    expect(screen.queryByText('My to-do')).toBeNull();
  });
});

describe('ItemModal capture editing', () => {
  it('preserves inboxed=true when clarifying an existing capture with a due date', async () => {
    setStore({ work_items: [wi({ id: 'c1', title: 'Clarify me', inboxed: true })] });
    const { container } = render(<ItemModal existing={wi({ id: 'c1', title: 'Clarify me', inboxed: true })} onClose={vi.fn()} />);
    const dueInput = container.querySelector('input[type="date"]') as HTMLInputElement;
    fireEvent.change(dueInput, { target: { value: '2026-07-31' } });
    // The default save on an inboxed capture is explicit about NOT filing.
    fireEvent.click(screen.getByRole('button', { name: 'Save, keep in Inbox' }));
    await waitFor(() => expect(h.store.update).toHaveBeenCalledTimes(1));
    const [, id, patch] = h.store.update.mock.calls[0];
    expect(id).toBe('c1');
    expect(patch.due_date).toBe('2026-07-31');
    expect(patch.inboxed).not.toBe(false);
  });

  it('"Save & file" is the explicit exit: clears inboxed and names the ledger it goes to', async () => {
    const captureAmy = wi({
      id: 'c1', title: 'Chase the invoice', inboxed: true, person_id: 'amy',
      related_entities: [{ type: 'person', id: 'amy', name: 'Amy Stone' }],
    });
    setStore({ work_items: [captureAmy] });
    render(<ItemModal existing={captureAmy} onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: "Save & file to Amy's ledger" }));
    await waitFor(() => expect(h.store.update).toHaveBeenCalledTimes(1));
    const [, id, patch] = h.store.update.mock.calls[0];
    expect(id).toBe('c1');
    expect(patch).toMatchObject({ inboxed: false, person_id: 'amy' });
  });

  it('"Save & move to My tasks" files a person-less capture', async () => {
    setStore({ work_items: [wi({ id: 'c1', title: 'Solo capture', inboxed: true })] });
    render(<ItemModal existing={wi({ id: 'c1', title: 'Solo capture', inboxed: true })} onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Save & move to My tasks' }));
    await waitFor(() => expect(h.store.update).toHaveBeenCalledTimes(1));
    const [, , patch] = h.store.update.mock.calls[0];
    expect(patch.inboxed).toBe(false);
  });

  it('an already-filed task keeps the plain Save button', () => {
    setStore({ work_items: [wi({ id: 'f1', title: 'Filed task', inboxed: false })] });
    render(<ItemModal existing={wi({ id: 'f1', title: 'Filed task', inboxed: false })} onClose={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Save' })).toBeTruthy();
    expect(screen.queryByText(/Save & file|keep in Inbox/)).toBeNull();
  });
});

describe('Global Capture', () => {
  it('opens the Quick Add sheet from the floating button', () => {
    render(<GlobalCapture />);
    fireEvent.click(screen.getByRole('button', { name: 'Capture' }));
    expect(screen.getByPlaceholderText(/Try/)).toBeTruthy(); // the QuickAdd input
  });

  it('opens on the `c` shortcut, but never while typing in a field', () => {
    render(
      <>
        <input aria-label="other-field" />
        <GlobalCapture />
      </>,
    );
    fireEvent.keyDown(screen.getByLabelText('other-field'), { key: 'c' });
    expect(screen.queryByPlaceholderText(/Try/)).toBeNull(); // typing guard
    fireEvent.keyDown(document.body, { key: 'c' });
    expect(screen.getByPlaceholderText(/Try/)).toBeTruthy();
  });

  it('is hidden entirely in read-only mode', () => {
    setStore({}, { canEdit: false });
    render(<GlobalCapture />);
    expect(screen.queryByRole('button', { name: 'Capture' })).toBeNull();
    fireEvent.keyDown(document.body, { key: 'c' });
    expect(screen.queryByPlaceholderText(/Try/)).toBeNull();
  });
});
