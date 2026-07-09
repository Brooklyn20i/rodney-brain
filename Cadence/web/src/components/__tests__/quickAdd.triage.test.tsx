/**
 * Capture-first Quick Add + Inbox triage.
 *
 * A quick note tagged with a person or project must be CAPTURED to the Inbox
 * (inboxed: true) and shown there for triage — not filed straight into that
 * person's / project's folder. This locks in the behaviour the user asked for.
 */
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { emptyData } from '../../lib/types';

const h = vi.hoisted(() => ({ store: {} as any }));
vi.mock('../../lib/store', () => ({ useCadence: () => h.store }));

import { QuickAdd } from '../QuickAdd';
import { Inbox } from '../../screens/Inbox';

const person = (o: any) => ({ id: 'p', name: 'P', type: 'person', color: '#123', role: '', email: '', ...o });
const project = (o: any) => ({
  id: 'pr', name: 'Proj', goal: '', status: 'active', health: 'green', owner: '', target_date: null,
  next_action: '', color: '#456', deleted_at: null, created_at: '', updated_at: '', ...o,
});
const wi = (o: any) => ({
  id: 'w', title: 'T', type: 'task', priority: 'medium', due_date: null, project_id: null, person_id: null,
  notes: '', done: false, inboxed: false, source: '', completed_at: null, related_entities: [],
  created_at: '', updated_at: '', deleted_at: null, ...o,
});

function setStore(dataOver: any = {}) {
  h.store = {
    insert: vi.fn().mockResolvedValue({}), update: vi.fn().mockResolvedValue({}),
    remove: vi.fn(), logActivity: vi.fn(),
    session: { user: { id: 'me', email: 'r@x.com' } },
    ready: true, configured: true, canEdit: true,
    data: { ...emptyData(), ...dataOver },
  };
}
beforeEach(() => setStore());
afterEach(() => cleanup());

describe('Quick Add captures to the Inbox', () => {
  it('files a person- and project-tagged note into the Inbox (inboxed: true), keeping the tags', async () => {
    setStore({ people: [person({ id: 'amy', name: 'Amy Jones' })], projects: [project({ id: 'promace', name: 'Promace' })] });
    render(<QuickAdd onClose={vi.fn()} />);
    fireEvent.change(screen.getByPlaceholderText(/Try/), { target: { value: 'Call Amy about Promace' } });
    // Parser should have tagged both — the button stays "Add to Quick Capture", not "Add Task".
    fireEvent.click(screen.getByText('Add to Quick Capture →'));
    await waitFor(() => expect(h.store.insert).toHaveBeenCalledTimes(1));
    const [table, row] = h.store.insert.mock.calls[0];
    expect(table).toBe('work_items');
    expect(row.inboxed).toBe(true);                 // captured, not filed
    expect(row.person_id).toBe('amy');              // tag preserved for triage
    expect(row.project_id).toBe('promace');
  });
});

describe('Inbox shows every capture awaiting triage', () => {
  it('shows an inboxed capture even when it already has a person/project', () => {
    setStore({
      work_items: [
        wi({ id: 'c1', title: 'Tagged capture', inboxed: true, person_id: 'amy', project_id: 'promace' }),
        wi({ id: 'f1', title: 'Already filed', inboxed: false, person_id: 'amy' }),
      ],
    });
    render(<Inbox />);
    expect(screen.getByText('Tagged capture')).toBeTruthy(); // regression: used to be hidden by !isFiled
    expect(screen.queryByText('Already filed')).toBeNull();  // filed items are not in the triage queue
  });
});
