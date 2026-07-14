/**
 * TaskDetailPanel — the ledger direction swap (keep the task, flip who owes
 * whom) and the updates/history thread backed by the comments table.
 */
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { emptyData } from '../../lib/types';

const h = vi.hoisted(() => ({ store: {} as any }));
vi.mock('../../lib/store', () => ({ useCadence: () => h.store }));

import { TaskDetailPanel } from '../../screens/taskScreens/TaskDetailPanel';

const person = { id: 'pJ', name: 'Jarrod Vale', type: 'person', color: '#123', role: '' } as any;
const wi = (o: any) => ({
  id: 'w1', title: 'Send the pricing pack', type: 'task', priority: 'medium', due_date: null,
  project_id: null, person_id: 'pJ', notes: '', done: false, inboxed: false, source: 'you',
  completed_at: null, related_entities: [{ type: 'person', id: 'pJ', name: 'Jarrod Vale' }],
  created_at: '2026-06-01T09:00:00Z', updated_at: '', deleted_at: null, ...o,
});

function setStore(over: any = {}) {
  const { data: d, ...rest } = over;
  h.store = {
    insert: vi.fn().mockResolvedValue({}), update: vi.fn().mockResolvedValue({}),
    remove: vi.fn().mockResolvedValue(undefined), logActivity: vi.fn(),
    session: { user: { id: 'me' } }, ready: true, configured: true, canEdit: true,
    ...rest,
    data: { ...emptyData(), people: [person], ...(d || {}) },
  };
}

beforeEach(() => setStore({ data: { work_items: [wi({})] } }));
afterEach(() => cleanup());

describe('ledger direction swap', () => {
  it('shows the toggle for a person-linked task, reflecting the current direction', () => {
    render(<TaskDetailPanel task={wi({})} onClose={() => {}} />);
    // A plain task = "I owe them".
    expect(screen.getByRole('button', { name: '📥 I owe Jarrod' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: '📤 Jarrod owes me' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('flips task → waitingFor in place and logs a history entry', () => {
    render(<TaskDetailPanel task={wi({})} onClose={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: '📤 Jarrod owes me' }));
    // Same record, type flipped — not a new task. The ball stays with Jarrod.
    expect(h.store.update).toHaveBeenCalledWith('work_items', 'w1', { person_id: 'pJ', type: 'waitingFor' });
    // A system entry is written into the updates thread as history.
    expect(h.store.insert).toHaveBeenCalledWith('comments', {
      work_item_id: 'w1', text: '→ Jarrod Vale owes me', author: 'system',
    });
  });

  it('flips waitingFor → task the other way', () => {
    render(<TaskDetailPanel task={wi({ type: 'waitingFor' })} onClose={() => {}} />);
    expect(screen.getByRole('button', { name: '📤 Jarrod owes me' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByRole('button', { name: '📥 I owe Jarrod' }));
    expect(h.store.update).toHaveBeenCalledWith('work_items', 'w1', { person_id: 'pJ', type: 'task' });
    expect(h.store.insert).toHaveBeenCalledWith('comments',
      expect.objectContaining({ text: '→ I owe Jarrod Vale' }));
  });

  it('does not offer the toggle when the task has no person', () => {
    const solo = wi({ person_id: null, related_entities: [] });
    setStore({ data: { work_items: [solo] } });
    render(<TaskDetailPanel task={solo} onClose={() => {}} />);
    expect(screen.queryByText(/owes me/)).not.toBeInTheDocument();
  });

  it('passes the ball to another linked person, keeping the record and logging the handoff', () => {
    const multi = wi({ related_entities: [
      { type: 'person', id: 'pJ', name: 'Jarrod Vale' },
      { type: 'person', id: 'pA', name: 'Amy Stone' },
    ]});
    setStore({ data: { work_items: [multi] } });
    render(<TaskDetailPanel task={multi} onClose={() => {}} />);
    // Both linked people are counterparty options; the ball is with Jarrod.
    expect(screen.getByRole('button', { name: 'Jarrod' })).toHaveAttribute('aria-pressed', 'true');
    // One tap: pass to Amy — same task, person_id moves, direction preserved.
    fireEvent.click(screen.getByRole('button', { name: 'Amy' }));
    expect(h.store.update).toHaveBeenCalledWith('work_items', 'w1', { person_id: 'pA', type: 'task' });
    expect(h.store.insert).toHaveBeenCalledWith('comments',
      expect.objectContaining({ text: '→ I owe Amy Stone', author: 'system' }));
  });
});

describe('task updates & history', () => {
  it('lists existing updates newest-first with the created origin pinned last', () => {
    setStore({ data: {
      work_items: [wi({})],
      comments: [
        { id: 'c1', work_item_id: 'w1', text: 'Chased Jarrod', author: 'you', created_at: '2026-06-02T10:00:00Z', deleted_at: null },
        { id: 'c2', work_item_id: 'w1', text: '→ Jarrod Vale owes me', author: 'system', created_at: '2026-06-03T10:00:00Z', deleted_at: null },
        { id: 'cX', work_item_id: 'other', text: 'not mine', author: 'you', created_at: '2026-06-04T10:00:00Z', deleted_at: null },
      ],
    }});
    render(<TaskDetailPanel task={wi({})} onClose={() => {}} />);
    const texts = [...document.querySelectorAll('.task-update-text')].map((n) => n.textContent);
    expect(texts).toEqual(['→ Jarrod Vale owes me', 'Chased Jarrod']); // newest first, other task excluded
    expect(document.querySelector('.task-update-origin')?.textContent).toMatch(/Created/);
  });

  it('adds an update to the comments thread', () => {
    render(<TaskDetailPanel task={wi({})} onClose={() => {}} />);
    fireEvent.change(screen.getByPlaceholderText(/Log an update/), { target: { value: 'Confirmed by email' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add update' }));
    expect(h.store.insert).toHaveBeenCalledWith('comments', { work_item_id: 'w1', text: 'Confirmed by email' });
  });

  it('deletes an update', () => {
    setStore({ data: {
      work_items: [wi({})],
      comments: [{ id: 'c1', work_item_id: 'w1', text: 'Chased Jarrod', author: 'you', created_at: '2026-06-02T10:00:00Z', deleted_at: null }],
    }});
    render(<TaskDetailPanel task={wi({})} onClose={() => {}} />);
    fireEvent.click(screen.getByTitle('Delete update'));
    expect(h.store.remove).toHaveBeenCalledWith('comments', 'c1');
  });
});
