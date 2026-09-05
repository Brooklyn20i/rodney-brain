/**
 * Cadence Life — the fourth domain. The nav must be its own three screens,
 * the dashboard must surface only what needs attention, ticking an
 * obligation must roll it forward AND log history, and the inbox must route
 * in both directions (file into Life, or flick a mis-captured work item back
 * to Cadence Work) without the two domains ever sharing tables.
 */
import { fireEvent, render, screen, waitFor, cleanup } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CadenceLifeCtx, type Ctx as LifeCtx } from '../../lib/store';
import { CadenceCtx } from '../../../lib/store';
import { emptyData, type CadenceLifeData, type LifeItem, type Obligation } from '../../lib/types';
import { LIFE_NAV } from '../../../components/Sidebar';
import { todayLocalISO, addMonthsClamped } from '../../lib/lifeCalc';
import { Dashboard } from '../Dashboard';
import { Admin } from '../Admin';
import { Obligations } from '../Obligations';

const today = todayLocalISO();
const shiftDays = (days: number) => {
  const [y, m, d] = today.split('-').map(Number);
  const dt = new Date(y, m - 1, d + days);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
};

const STAMP = { owner_id: 'o', created_at: '2026-01-01', updated_at: '2026-01-01', deleted_at: null };
const ob = (over: Partial<Obligation>): Obligation =>
  ({ id: crypto.randomUUID(), name: 'Rego', category: 'vehicles', cadence_months: 12, next_due: shiftDays(5), lead_days: 30, amount: null, notes: '', ...STAMP, ...over }) as Obligation;
const item = (over: Partial<LifeItem>): LifeItem =>
  ({ id: crypto.randomUUID(), title: 'Book flights', notes: '', status: 'open', category: 'travel', due_date: null, obligation_id: null, completed_at: null, ...STAMP, ...over }) as LifeItem;

function renderLife(
  node: React.ReactElement,
  seed?: (d: CadenceLifeData) => void,
  opts: { syncError?: string | null; insertError?: Error; updateError?: Error; completeError?: Error } = {}
) {
  const d = emptyData();
  seed?.(d);
  const inserted: Array<{ table: string; row: any }> = [];
  const updated: Array<{ table: string; id: string; patch: any }> = [];
  const removed: string[] = [];
  const completed: Array<{ id: string; expectedDue: string; today: string }> = [];
  const life = {
    demo: false,
    data: d,
    insert: vi.fn(async (table: string, row: any) => {
      if (opts.insertError) throw opts.insertError;
      inserted.push({ table, row });
      return { id: 'new', ...row };
    }),
    update: vi.fn(async (table: string, id: string, patch: any) => {
      if (opts.updateError) throw opts.updateError;
      updated.push({ table, id, patch });
      return patch;
    }),
    completeObligation: vi.fn(async (id: string, expectedDue: string, todayArg: string) => {
      if (opts.completeError) throw opts.completeError;
      completed.push({ id, expectedDue, today: todayArg });
      const obligation = d.obligations.find((o) => o.id === id)!;
      const history = item({ id: 'hist-new', title: obligation.name, category: obligation.category, status: 'done', due_date: expectedDue, obligation_id: id });
      inserted.push({ table: 'life_items', row: history });
      updated.push({ table: 'obligations', id, patch: { next_due: addMonthsClamped(expectedDue, obligation.cadence_months) } });
      return { obligation: { ...obligation, next_due: addMonthsClamped(expectedDue, obligation.cadence_months) }, history };
    }),
    remove: vi.fn(async (_t: string, id: string) => {
      removed.push(id);
    }),
    syncError: opts.syncError ?? null,
    clearSyncError: vi.fn(),
  } as unknown as LifeCtx;
  const workInserted: Array<{ table: string; row: any }> = [];
  const work = {
    insert: vi.fn(async (table: string, row: any) => {
      workInserted.push({ table, row });
      return { id: 'w-new', ...row };
    }),
  } as any;
  render(
    <CadenceCtx.Provider value={work}>
      <CadenceLifeCtx.Provider value={life}>{node}</CadenceLifeCtx.Provider>
    </CadenceCtx.Provider>
  );
  return { inserted, updated, removed, workInserted, completed };
}

afterEach(cleanup);

describe('Life nav', () => {
  it('is its own three screens — no work ids anywhere near it', () => {
    const items = LIFE_NAV.flatMap((g) => g.items);
    expect(items.map((i) => i.id)).toEqual(['life:dashboard', 'life:admin', 'life:obligations']);
  });
});

describe('Life dashboard', () => {
  it('surfaces overdue + inside-lead obligations plus dated and undated action items; upcoming stays quiet', () => {
    renderLife(<Dashboard onMenu={vi.fn()} onNavigate={vi.fn()} />, (d) => {
      d.obligations.push(
        ob({ name: 'BAS lodgement', next_due: shiftDays(-2) }),
        ob({ name: 'Home insurance', next_due: shiftDays(10), lead_days: 30 }),
        ob({ name: 'Passport', next_due: addMonthsClamped(today, 18), lead_days: 90 })
      );
      d.life_items.push(
        item({ title: 'Book flights', due_date: shiftDays(3) }),
        item({ title: 'Dispute duplicate charge', due_date: null }),
        item({ title: 'Waiting on pathology receipt', status: 'waiting', category: 'health', due_date: null })
      );
    });
    expect(screen.getByText('BAS lodgement')).toBeTruthy();
    expect(screen.getByText('Home insurance')).toBeTruthy();
    expect(screen.getByText('Book flights')).toBeTruthy();
    expect(screen.getByText('Dispute duplicate charge')).toBeTruthy();
    expect(screen.getByText('Waiting on pathology receipt')).toBeTruthy();
    expect(screen.queryByText('Passport')).toBeNull();
  });

  it('does not show a false all-clear when the Life schema failed to load', () => {
    renderLife(<Dashboard onMenu={vi.fn()} onNavigate={vi.fn()} />, undefined, { syncError: 'life schema unavailable' });
    expect(screen.getByText(/Life data did not load/i)).toBeTruthy();
    expect(screen.queryByText('Nothing needs you')).toBeNull();
  });

  it('quick captures from Home into the Life inbox and preserves the draft on failed save', async () => {
    const { inserted } = renderLife(<Dashboard onMenu={vi.fn()} onNavigate={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('Quick capture a life to-do'), { target: { value: 'Renew pet registration' } });
    fireEvent.click(screen.getByRole('button', { name: '+ Capture' }));
    await waitFor(() => expect(inserted).toHaveLength(1));
    expect(inserted[0].row).toMatchObject({ title: 'Renew pet registration', status: 'inbox', category: 'admin' });

    cleanup();
    renderLife(<Dashboard onMenu={vi.fn()} onNavigate={vi.fn()} />, undefined, { insertError: new Error('save blocked') });
    fireEvent.change(screen.getByLabelText('Quick capture a life to-do'), { target: { value: 'Keep this draft' } });
    fireEvent.click(screen.getByRole('button', { name: '+ Capture' }));
    await screen.findByText(/save blocked/i);
    expect(screen.getByLabelText('Quick capture a life to-do')).toHaveValue('Keep this draft');
  });

  it('ticking an obligation delegates to the atomic renewal completion mutation with the visible expected due date', async () => {
    const due = shiftDays(-2);
    const { completed } = renderLife(<Dashboard onMenu={vi.fn()} onNavigate={vi.fn()} />, (d) => {
      d.obligations.push(ob({ id: 'ob1', name: 'BAS lodgement', next_due: due, cadence_months: 3 }));
    });
    expect(screen.getByText(new RegExp(`Next due ${due}`))).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Complete BAS lodgement renewal' }));
    await waitFor(() => expect(completed).toHaveLength(1));
    expect(completed[0]).toMatchObject({ id: 'ob1', expectedDue: due });
  });

  it('points at the inbox when captures are waiting', () => {
    const onNavigate = vi.fn();
    renderLife(<Dashboard onMenu={vi.fn()} onNavigate={onNavigate} />, (d) => {
      d.life_items.push(item({ status: 'inbox', title: 'Gutter quote' }));
    });
    fireEvent.click(screen.getByRole('button', { name: /Go to inbox/ }));
    expect(onNavigate).toHaveBeenCalledWith('admin');
  });
});

describe('Life admin', () => {
  it('captures land in the inbox and filing sets category + due', async () => {
    const { inserted, updated } = renderLife(<Admin onMenu={vi.fn()} />, (d) => {
      d.life_items.push(item({ id: 'i1', status: 'inbox', title: 'Renew Costco?' }));
    });
    // Quick capture goes straight to the Life inbox.
    fireEvent.change(screen.getByLabelText('Capture a life to-do'), { target: { value: 'Rebook dentist' } });
    fireEvent.click(screen.getByRole('button', { name: '+ Capture' }));
    await waitFor(() => expect(inserted).toHaveLength(1));
    expect(inserted[0].row).toMatchObject({ title: 'Rebook dentist', status: 'inbox' });

    // Filing the existing capture.
    fireEvent.change(screen.getByLabelText('Category for Renew Costco?'), { target: { value: 'bills' } });
    fireEvent.click(screen.getAllByRole('button', { name: 'File' })[0]);
    await waitFor(() => expect(updated).toHaveLength(1));
    expect(updated[0]).toMatchObject({ table: 'life_items', id: 'i1' });
    expect(updated[0].patch).toMatchObject({ status: 'open', category: 'bills' });
  });

  it('removes the unsafe cross-domain transfer shortcut rather than duplicating Life and Work rows', () => {
    renderLife(<Admin onMenu={vi.fn()} />, (d) => {
      d.life_items.push(item({ id: 'i2', status: 'inbox', title: 'Ping Anna about the deck' }));
    });
    expect(screen.queryByRole('button', { name: '→ Work' })).toBeNull();
    expect(screen.getByText(/Work transfer disabled/i)).toBeTruthy();
  });

  it('searches and filters by category and explicit waiting status', () => {
    renderLife(<Admin onMenu={vi.fn()} initialView="open" />, (d) => {
      d.life_items.push(
        item({ id: 'i3', title: 'Dispute Amex charge', category: 'bills' }),
        item({ id: 'i4', title: 'Waiting on pathology receipt', status: 'waiting', category: 'health' })
      );
    });
    fireEvent.change(screen.getByLabelText('Search admin items'), { target: { value: 'pathology' } });
    expect(screen.getByText('Waiting on pathology receipt')).toBeTruthy();
    expect(screen.queryByText('Dispute Amex charge')).toBeNull();

    fireEvent.change(screen.getByLabelText('Search admin items'), { target: { value: '' } });
    fireEvent.change(screen.getByLabelText('Filter category'), { target: { value: 'bills' } });
    expect(screen.getByText('Dispute Amex charge')).toBeTruthy();
    expect(screen.queryByText('Waiting on pathology receipt')).toBeNull();

    fireEvent.change(screen.getByLabelText('Filter category'), { target: { value: 'all' } });
    fireEvent.click(screen.getByRole('button', { name: /Waiting \(1\)/ }));
    expect(screen.getByText('Waiting on pathology receipt')).toBeTruthy();
    expect(screen.queryByText('Dispute Amex charge')).toBeNull();
  });

  it('edits an existing admin item and keeps the edit draft visible if save fails', async () => {
    const { updated } = renderLife(<Admin onMenu={vi.fn()} />, (d) => {
      d.life_items.push(item({ id: 'i5', title: 'Dispute Amex charge', notes: 'old note', category: 'bills', due_date: shiftDays(2) }));
    });
    fireEvent.click(screen.getByRole('button', { name: 'Edit Dispute Amex charge' }));
    fireEvent.change(screen.getByLabelText('Edit title for Dispute Amex charge'), { target: { value: 'Dispute Amex duplicate charge' } });
    fireEvent.change(screen.getByLabelText('Edit notes for Dispute Amex charge'), { target: { value: 'Attach PDF statement' } });
    fireEvent.change(screen.getByLabelText('Edit category for Dispute Amex charge'), { target: { value: 'admin' } });
    fireEvent.change(screen.getByLabelText('Edit due date for Dispute Amex charge'), { target: { value: shiftDays(7) } });
    fireEvent.click(screen.getByRole('button', { name: 'Save item changes' }));
    await waitFor(() => expect(updated).toHaveLength(1));
    expect(updated[0].patch).toMatchObject({
      title: 'Dispute Amex duplicate charge',
      notes: 'Attach PDF statement',
      category: 'admin',
      due_date: shiftDays(7),
    });

    cleanup();
    renderLife(<Admin onMenu={vi.fn()} />, (d) => {
      d.life_items.push(item({ id: 'i5', title: 'Dispute Amex charge', notes: 'old note', category: 'bills' }));
    }, { updateError: new Error('save failed') });
    fireEvent.click(screen.getByRole('button', { name: 'Edit Dispute Amex charge' }));
    fireEvent.change(screen.getByLabelText('Edit notes for Dispute Amex charge'), { target: { value: 'keep this draft' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save item changes' }));
    await screen.findByText(/save failed/i);
    expect(screen.getByLabelText('Edit notes for Dispute Amex charge')).toHaveValue('keep this draft');
  });

  it('open items tick done with a completion timestamp and waiting status is explicit', async () => {
    const { updated } = renderLife(<Admin onMenu={vi.fn()} />, (d) => {
      d.life_items.push(item({ id: 'i3', title: 'Dispute Amex charge', category: 'bills' }));
    });
    fireEvent.click(screen.getByRole('button', { name: 'Waiting on Dispute Amex charge' }));
    await waitFor(() => expect(updated[0].patch.status).toBe('waiting'));
    fireEvent.click(screen.getByRole('button', { name: 'Mark Dispute Amex charge done' }));
    await waitFor(() => expect(updated).toHaveLength(2));
    expect(updated[1].patch.status).toBe('done');
    expect(updated[1].patch.completed_at).toBeTruthy();
  });

  it('does not reopen renewal history as an ordinary task', () => {
    renderLife(<Admin onMenu={vi.fn()} initialView="done" />, (d) => {
      d.life_items.push(
        item({ id: 'done-normal', title: 'Cancel old subscription', status: 'done', completed_at: '2026-09-01T00:00:00.000Z' }),
        item({ id: 'done-renewal', title: 'Car rego', status: 'done', obligation_id: 'ob1', due_date: '2026-09-01', completed_at: '2026-09-01T00:00:00.000Z' })
      );
    });
    expect(screen.getByText(/renewal history/i)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Reopen Cancel old subscription' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Reopen Car rego' })).toBeNull();
  });
});

describe('Obligations register', () => {
  it('adds an obligation from the form', async () => {
    const { inserted } = renderLife(<Obligations onMenu={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: '+ New obligation' }));
    fireEvent.change(screen.getByLabelText('Obligation name'), { target: { value: 'Car rego' } });
    fireEvent.change(screen.getByLabelText('Obligation category'), { target: { value: 'vehicles' } });
    fireEvent.change(screen.getByLabelText('Next due date'), { target: { value: shiftDays(40) } });
    fireEvent.change(screen.getByLabelText('Typical cost'), { target: { value: '89.50' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add obligation' }));
    await waitFor(() => expect(inserted).toHaveLength(1));
    expect(inserted[0].row).toMatchObject({ name: 'Car rego', category: 'vehicles', cadence_months: 12, amount: 89.5 });
  });

  it('keeps invalid obligation drafts visible and never silently strips required fields', async () => {
    const { inserted } = renderLife(<Obligations onMenu={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: '+ New obligation' }));
    fireEvent.change(screen.getByLabelText('Obligation name'), { target: { value: 'Invalid renewal' } });
    fireEvent.change(screen.getByLabelText('Next due date'), { target: { value: '2026-02-30' } });
    fireEvent.change(screen.getByLabelText('Typical cost'), { target: { value: '-10' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add obligation' }));
    expect(await screen.findByText(/real due date/i)).toBeTruthy();
    expect(inserted).toHaveLength(0);
    expect(screen.getByLabelText('Obligation name')).toHaveValue('Invalid renewal');
  });

  it('keeps obligation drafts on failed save', async () => {
    renderLife(<Obligations onMenu={vi.fn()} />, undefined, { insertError: new Error('database unavailable') });
    fireEvent.click(screen.getByRole('button', { name: '+ New obligation' }));
    fireEvent.change(screen.getByLabelText('Obligation name'), { target: { value: 'Pet registration' } });
    fireEvent.change(screen.getByLabelText('Next due date'), { target: { value: shiftDays(40) } });
    fireEvent.click(screen.getByRole('button', { name: 'Add obligation' }));
    expect(await screen.findByText(/database unavailable/i)).toBeTruthy();
    expect(screen.getByLabelText('Obligation name')).toHaveValue('Pet registration');
  });

  it('Done ✓ appears only when attention is needed, shows next date, and uses the atomic cycle mutation once under rapid taps', async () => {
    const { completed } = renderLife(<Obligations onMenu={vi.fn()} />, (d) => {
      d.obligations.push(
        ob({ id: 'due1', name: 'BAS lodgement', next_due: shiftDays(3), lead_days: 21, cadence_months: 3 }),
        ob({ id: 'far1', name: 'Passport', next_due: addMonthsClamped(today, 20), lead_days: 90 })
      );
    });
    expect(screen.getByText(new RegExp(`Next due ${shiftDays(3)}`))).toBeTruthy();
    const button = screen.getByRole('button', { name: 'Complete BAS lodgement renewal' });
    expect(screen.getAllByRole('button', { name: /Complete .* renewal/ })).toHaveLength(1);
    fireEvent.click(button);
    fireEvent.click(button);
    await waitFor(() => expect(completed).toHaveLength(1));
    expect(completed[0]).toMatchObject({ id: 'due1', expectedDue: shiftDays(3) });
  });
});
