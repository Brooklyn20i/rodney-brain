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

function renderLife(node: React.ReactElement, seed?: (d: CadenceLifeData) => void) {
  const d = emptyData();
  seed?.(d);
  const inserted: Array<{ table: string; row: any }> = [];
  const updated: Array<{ table: string; id: string; patch: any }> = [];
  const removed: string[] = [];
  const life = {
    demo: false,
    data: d,
    insert: vi.fn(async (table: string, row: any) => {
      inserted.push({ table, row });
      return { id: 'new', ...row };
    }),
    update: vi.fn(async (table: string, id: string, patch: any) => {
      updated.push({ table, id, patch });
      return patch;
    }),
    remove: vi.fn(async (_t: string, id: string) => {
      removed.push(id);
    }),
    syncError: null,
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
  return { inserted, updated, removed, workInserted };
}

afterEach(cleanup);

describe('Life nav', () => {
  it('is its own three screens — no work ids anywhere near it', () => {
    const items = LIFE_NAV.flatMap((g) => g.items);
    expect(items.map((i) => i.id)).toEqual(['life:dashboard', 'life:admin', 'life:obligations']);
  });
});

describe('Life dashboard', () => {
  it('surfaces overdue + inside-lead obligations and dated items; upcoming stays quiet', () => {
    renderLife(<Dashboard onMenu={vi.fn()} onNavigate={vi.fn()} />, (d) => {
      d.obligations.push(
        ob({ name: 'BAS lodgement', next_due: shiftDays(-2) }),
        ob({ name: 'Home insurance', next_due: shiftDays(10), lead_days: 30 }),
        ob({ name: 'Passport', next_due: addMonthsClamped(today, 18), lead_days: 90 })
      );
      d.life_items.push(item({ title: 'Book flights', due_date: shiftDays(3) }));
    });
    expect(screen.getByText('BAS lodgement')).toBeTruthy();
    expect(screen.getByText('Home insurance')).toBeTruthy();
    expect(screen.getByText('Book flights')).toBeTruthy();
    expect(screen.queryByText('Passport')).toBeNull();
  });

  it('ticking an obligation rolls next_due forward and logs a history item', async () => {
    const due = shiftDays(-2);
    const { inserted, updated } = renderLife(<Dashboard onMenu={vi.fn()} onNavigate={vi.fn()} />, (d) => {
      d.obligations.push(ob({ id: 'ob1', name: 'BAS lodgement', next_due: due, cadence_months: 3 }));
    });
    fireEvent.click(screen.getByRole('button', { name: 'Done ✓' }));
    await waitFor(() => expect(updated).toHaveLength(1));
    expect(inserted[0].table).toBe('life_items');
    expect(inserted[0].row).toMatchObject({ status: 'done', obligation_id: 'ob1', due_date: due });
    expect(updated[0]).toMatchObject({ table: 'obligations', id: 'ob1' });
    expect(updated[0].patch.next_due > today).toBe(true);
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

  it('a mis-captured work task flicks BACK to Cadence Work and leaves Life', async () => {
    const { workInserted, removed } = renderLife(<Admin onMenu={vi.fn()} />, (d) => {
      d.life_items.push(item({ id: 'i2', status: 'inbox', title: 'Ping Anna about the deck' }));
    });
    fireEvent.click(screen.getByRole('button', { name: '→ Work' }));
    await waitFor(() => expect(removed).toEqual(['i2']));
    expect(workInserted[0].table).toBe('work_items');
    expect(workInserted[0].row).toMatchObject({ title: 'Ping Anna about the deck', inboxed: true });
  });

  it('open items tick done with a completion timestamp', async () => {
    const { updated } = renderLife(<Admin onMenu={vi.fn()} />, (d) => {
      d.life_items.push(item({ id: 'i3', title: 'Dispute Amex charge', category: 'bills' }));
    });
    fireEvent.click(screen.getByRole('button', { name: 'Mark Dispute Amex charge done' }));
    await waitFor(() => expect(updated).toHaveLength(1));
    expect(updated[0].patch.status).toBe('done');
    expect(updated[0].patch.completed_at).toBeTruthy();
  });
});

describe('Obligations register', () => {
  it('adds an obligation from the form', async () => {
    const { inserted } = renderLife(<Obligations onMenu={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: '+ New obligation' }));
    fireEvent.change(screen.getByLabelText('Obligation name'), { target: { value: 'Car rego' } });
    fireEvent.change(screen.getByLabelText('Obligation category'), { target: { value: 'vehicles' } });
    fireEvent.change(screen.getByLabelText('Next due date'), { target: { value: shiftDays(40) } });
    fireEvent.click(screen.getByRole('button', { name: 'Add obligation' }));
    await waitFor(() => expect(inserted).toHaveLength(1));
    expect(inserted[0].row).toMatchObject({ name: 'Car rego', category: 'vehicles', cadence_months: 12 });
  });

  it('Done ✓ appears only when attention is needed, and rolls the cycle', async () => {
    const { updated, inserted } = renderLife(<Obligations onMenu={vi.fn()} />, (d) => {
      d.obligations.push(
        ob({ id: 'due1', name: 'BAS lodgement', next_due: shiftDays(3), lead_days: 21, cadence_months: 3 }),
        ob({ id: 'far1', name: 'Passport', next_due: addMonthsClamped(today, 20), lead_days: 90 })
      );
    });
    expect(screen.getAllByRole('button', { name: 'Done ✓' })).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: 'Done ✓' }));
    await waitFor(() => expect(updated).toHaveLength(1));
    expect(updated[0].id).toBe('due1');
    expect(inserted[0].row.obligation_id).toBe('due1');
  });
});
