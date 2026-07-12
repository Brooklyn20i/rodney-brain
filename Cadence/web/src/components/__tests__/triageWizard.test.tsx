/**
 * Card-by-card triage wizard — every destination must write the right patch,
 * enrichment edits (title/notes/due) must ride along in the same write, and
 * the deck must advance card-by-card to the done screen.
 */
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { emptyData } from '../../lib/types';

const h = vi.hoisted(() => ({ store: {} as any, enqueue: vi.fn() }));
vi.mock('../../lib/store', () => ({ useCadence: () => h.store }));
vi.mock('../../lib/agendaQueue', () => ({
  useAgendaQueue: () => ({ enqueue: h.enqueue, clear: vi.fn() }),
}));

import { TriageWizard } from '../TriageWizard';

const wi = (o: any) => ({
  id: 'w', title: 'T', type: 'task', priority: 'medium', due_date: null, project_id: null,
  person_id: null, notes: '', done: false, inboxed: true, source: '', completed_at: null,
  related_entities: undefined, created_at: '2026-06-01T00:00:00Z', deleted_at: null, ...o,
});
const anna = { id: 'pA', name: 'Anna Lee', type: 'person', color: '#123', role: '' } as any;

function setStore(dataOver: any = {}) {
  h.store = {
    insert: vi.fn().mockImplementation(async (table: string, row: any) => ({ id: `new-${table}`, ...row })),
    update: vi.fn().mockResolvedValue({}),
    remove: vi.fn().mockResolvedValue(undefined),
    logActivity: vi.fn(),
    session: { user: { id: 'me', email: 'r@x.com' } },
    ready: true, configured: true, canEdit: true,
    data: { ...emptyData(), ...dataOver },
  };
}

const click = (name: string | RegExp) =>
  act(async () => { fireEvent.click(screen.getByRole('button', { name })); });
const lastUpdate = () => h.store.update.mock.calls[h.store.update.mock.calls.length - 1];

beforeEach(() => {
  h.enqueue = vi.fn().mockResolvedValue('queued');
  setStore({ work_items: [wi({ id: 'c1', title: 'Capture one' })] });
});
afterEach(() => cleanup());

describe('TriageWizard destinations', () => {
  it('My tasks: files with the enrichment edits in the same write', async () => {
    render(<TriageWizard onClose={vi.fn()} />);
    fireEvent.change(screen.getByDisplayValue('Capture one'), { target: { value: 'Polished title' } });
    fireEvent.change(screen.getByPlaceholderText(/context you'll need later/), { target: { value: 'ctx' } });
    fireEvent.change(document.querySelector('.wizard-card-due input')!, { target: { value: '2026-07-20' } });
    await click(/My tasks/);
    expect(lastUpdate()).toEqual(['work_items', 'c1', expect.objectContaining({
      title: 'Polished title', notes: 'ctx', due_date: '2026-07-20', inboxed: false, type: 'task',
    })]);
    expect(screen.getByText('Triage complete')).toBeInTheDocument();
    expect(screen.getByText(/1 filed · 0 skipped/)).toBeInTheDocument();
  });

  it('Person → they owe me: becomes a waitingFor on their ledger', async () => {
    setStore({ work_items: [wi({ id: 'c1', title: 'Chase the report' })], people: [anna] });
    render(<TriageWizard onClose={vi.fn()} />);
    await click(/Person…/);
    await click(/Anna Lee/);
    await click(/Something they owe me/);
    expect(lastUpdate()).toEqual(['work_items', 'c1', expect.objectContaining({
      inboxed: false, type: 'waitingFor', person_id: 'pA',
      related_entities: [{ type: 'person', id: 'pA', name: 'Anna Lee' }],
    })]);
    expect(h.enqueue).not.toHaveBeenCalled();
  });

  it('Person → I owe them: stays a task on my list, linked to them', async () => {
    setStore({ work_items: [wi({ id: 'c1' })], people: [anna] });
    render(<TriageWizard onClose={vi.fn()} />);
    await click(/Person…/);
    await click(/Anna Lee/);
    await click(/Something I owe them/);
    expect(lastUpdate()).toEqual(['work_items', 'c1', expect.objectContaining({
      inboxed: false, type: 'task', person_id: 'pA',
    })]);
  });

  it('Person → raise at next 1:1: files to them AND queues the agenda item', async () => {
    setStore({ work_items: [wi({ id: 'c1', title: 'Discuss budget' })], people: [anna] });
    render(<TriageWizard onClose={vi.fn()} />);
    await click(/Person…/);
    await click(/Anna Lee/);
    await click(/Raise at the next 1:1/);
    expect(lastUpdate()).toEqual(['work_items', 'c1', expect.objectContaining({
      inboxed: false, type: 'task', person_id: 'pA',
    })]);
    expect(h.enqueue).toHaveBeenCalledWith('pA', {
      title: 'Discuss budget', notes: '', source_item_id: 'c1',
    });
  });

  it('meeting groups are not offered in the person picker', async () => {
    setStore({ work_items: [wi({ id: 'c1' })], people: [
      anna, { id: 'gC', name: 'CLT', type: 'meeting_group', color: '#0E7490', role: '' },
    ]});
    render(<TriageWizard onClose={vi.fn()} />);
    await click(/Person…/);
    expect(screen.getByRole('button', { name: /Anna Lee/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /CLT/ })).not.toBeInTheDocument();
  });

  it('creates a person on the spot, then files to them', async () => {
    render(<TriageWizard onClose={vi.fn()} />);
    await click(/Person…/);
    fireEvent.change(screen.getByPlaceholderText('+ New person…'), { target: { value: 'Dana New' } });
    await act(async () => { fireEvent.keyDown(screen.getByPlaceholderText('+ New person…'), { key: 'Enter' }); });
    expect(h.store.insert).toHaveBeenCalledWith('people', expect.objectContaining({ name: 'Dana New', type: 'person' }));
    await click(/Something they owe me/);
    expect(lastUpdate()).toEqual(['work_items', 'c1', expect.objectContaining({
      type: 'waitingFor', person_id: 'new-people',
    })]);
  });

  it('Project: links the item and clears inboxed', async () => {
    setStore({ work_items: [wi({ id: 'c1' })], projects: [
      { id: 'prA', name: 'Apollo', status: 'active', deleted_at: null, color: '#D93025' },
      { id: 'prOld', name: 'Retired', status: 'done', deleted_at: null, color: '#999' },
    ]});
    render(<TriageWizard onClose={vi.fn()} />);
    await click(/Project…/);
    expect(screen.queryByRole('button', { name: /Retired/ })).not.toBeInTheDocument();
    await click(/Apollo/);
    expect(lastUpdate()).toEqual(['work_items', 'c1', expect.objectContaining({
      inboxed: false, project_id: 'prA',
      related_entities: [{ type: 'project', id: 'prA', name: 'Apollo' }],
    })]);
  });

  it('Make it a note: creates the note and removes the work item', async () => {
    render(<TriageWizard onClose={vi.fn()} />);
    fireEvent.change(screen.getByPlaceholderText(/context you'll need later/), { target: { value: 'Long thought' } });
    await click(/Make it a note/);
    expect(h.store.insert).toHaveBeenCalledWith('notes', { title: 'Capture one', body: 'Long thought' });
    expect(h.store.remove).toHaveBeenCalledWith('work_items', 'c1');
  });

  it('Bin: removes the item outright', async () => {
    render(<TriageWizard onClose={vi.fn()} />);
    await click(/Bin/);
    expect(h.store.remove).toHaveBeenCalledWith('work_items', 'c1');
    expect(h.store.insert).not.toHaveBeenCalled();
  });
});

describe('TriageWizard deck flow', () => {
  it('steps through the deck card by card and tallies filed vs skipped', async () => {
    setStore({ work_items: [
      wi({ id: 'c1', title: 'First', created_at: '2026-06-02T00:00:00Z' }),
      wi({ id: 'c2', title: 'Second', created_at: '2026-06-01T00:00:00Z' }),
    ]});
    render(<TriageWizard onClose={vi.fn()} />);
    expect(screen.getByText('Card 1 of 2')).toBeInTheDocument();
    expect(screen.getByDisplayValue('First')).toBeInTheDocument();
    await click(/Skip/);
    expect(screen.getByText('Card 2 of 2')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Second')).toBeInTheDocument();
    await click(/My tasks/);
    expect(screen.getByText('Triage complete')).toBeInTheDocument();
    expect(screen.getByText(/1 filed · 1 skipped/)).toBeInTheDocument();
  });

  it('a card already handled elsewhere is skippable without a write', async () => {
    setStore({ work_items: [wi({ id: 'c1', inboxed: false })] });
    // Snapshot happens at open — simulate by seeding the queue then flipping:
    // here the item is already un-inboxed, so getTriageQueue returns nothing
    // and the wizard opens straight onto the done screen.
    render(<TriageWizard onClose={vi.fn()} />);
    expect(screen.getByText('Triage complete')).toBeInTheDocument();
    expect(h.store.update).not.toHaveBeenCalled();
  });

  it('Done button closes the wizard', async () => {
    const onClose = vi.fn();
    setStore({ work_items: [] });
    render(<TriageWizard onClose={onClose} />);
    await click('Done');
    expect(onClose).toHaveBeenCalled();
  });
});
