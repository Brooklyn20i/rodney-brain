/**
 * Month Close wizard — the DB enforces ONE live row per (owner, period), so
 * re-closing an existing month must UPDATE it in place (a correction), never
 * insert a duplicate the constraint would reject with a cryptic error. That
 * rejection was the "monthly report doesn't work" brick: once a month existed,
 * every re-save failed and there was no edit path at all.
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { CadenceFinancialCtx, type Ctx } from '../../lib/store';
import { emptyData, type CadenceFinancialData, type MonthlyMetric } from '../../lib/types';
import { MonthCloseWizard } from '../MonthCloseWizard';

const STAMP = { owner_id: 't', created_at: '', updated_at: '', deleted_at: null };
const metric = (o: Partial<MonthlyMetric>): MonthlyMetric => ({
  id: 'm', period: '2026-07', cash_saved: 0, share_buys: 0, btc_buys: 0, debt_reduction: 0,
  net_worth: 0, cash_offsets: 0, total_debt: 0, net_debt: 0, shares: 0, btc_crypto: 0,
  super_balance: 0, total_assets: 0, property_value: 0, property_equity: 0, collectibles_value: 0,
  ...STAMP, ...o,
} as MonthlyMetric);

function renderWizard(months: MonthlyMetric[], mode: 'next' | 'edit-latest', over: Partial<Ctx> = {}) {
  const data: CadenceFinancialData = { ...emptyData(), monthly_metrics: months };
  const value = {
    demo: false, data,
    insert: vi.fn().mockResolvedValue({}),
    update: vi.fn().mockResolvedValue({}),
    remove: vi.fn(), syncError: null, clearSyncError: vi.fn(),
    ...over,
  } as unknown as Ctx;
  const onDone = vi.fn();
  render(
    <CadenceFinancialCtx.Provider value={value}>
      <MonthCloseWizard months={months} mode={mode} onDone={onDone} />
    </CadenceFinancialCtx.Provider>
  );
  return { value, onDone };
}

const JUL = metric({ id: 'jul', period: '2026-07', cash_offsets: 100_000, total_debt: 900_000, shares: 50_000, btc_crypto: 20_000, super_balance: 200_000, property_value: 1_500_000, collectibles_value: 0, net_worth: 970_000 });
const AUG = metric({ id: 'aug', period: '2026-08', cash_offsets: 110_000, total_debt: 890_000, shares: 52_000, btc_crypto: 21_000, super_balance: 200_000, property_value: 1_500_000, collectibles_value: 0, net_worth: 993_000, cash_saved: 10_000, debt_reduction: 10_000 });

const fill = (label: string, v: string) => {
  const input = screen.getByLabelText(label) as HTMLInputElement; // exact — the grade selects share prefixes
  fireEvent.change(input, { target: { value: v } });
};

describe('MonthCloseWizard save semantics', () => {
  it('closing a NEW month inserts a monthly_metrics row for the next period', async () => {
    const { value, onDone } = renderWizard([JUL], 'next');
    fill('Cash / offsets (closing)', '105000');
    fill('Total debt (closing)', '895000');
    fill('BTC / crypto value', '22000');
    fill('Listed shares value', '51000');
    fireEvent.click(screen.getByRole('button', { name: /Close Aug 2026/ }));
    await waitFor(() => expect(onDone).toHaveBeenCalled());
    const metricInsert = (value.insert as ReturnType<typeof vi.fn>).mock.calls.find((c) => c[0] === 'monthly_metrics');
    expect(metricInsert).toBeTruthy();
    expect(metricInsert![1]).toMatchObject({ period: '2026-08', cash_saved: 5000, debt_reduction: 5000 });
    expect(value.update).not.toHaveBeenCalledWith('monthly_metrics', expect.anything(), expect.anything());
  });

  it('re-closing an EXISTING month updates the saved row in place — never a duplicate insert', async () => {
    const { value, onDone } = renderWizard([JUL, AUG], 'edit-latest');
    // Prefilled from the saved close; correct one figure.
    fill('Cash / offsets (closing)', '120000');
    fireEvent.click(screen.getByRole('button', { name: /Save correction to Aug 2026/ }));
    await waitFor(() => expect(onDone).toHaveBeenCalled());
    expect(value.update).toHaveBeenCalledWith('monthly_metrics', 'aug', expect.objectContaining({
      period: '2026-08',
      cash_offsets: 120000,
      // Movements re-derive from July, not from the stale August values.
      cash_saved: 20000,
    }));
    const metricInserts = (value.insert as ReturnType<typeof vi.fn>).mock.calls.filter((c) => c[0] === 'monthly_metrics');
    expect(metricInserts).toHaveLength(0);
  });

  it('a correction refreshes the period’s evidence rows instead of stacking duplicates', async () => {
    const evidence = {
      id: 'ev-cash', ...STAMP, item: 'Cash and offsets', period: '2026-08',
      grade: 'screenshot', status: 'received', source: '', notes: '',
    };
    const data: CadenceFinancialData = { ...emptyData(), monthly_metrics: [JUL, AUG], evidence_items: [evidence as never] };
    const value = {
      demo: false, data,
      insert: vi.fn().mockResolvedValue({}),
      update: vi.fn().mockResolvedValue({}),
      remove: vi.fn(), syncError: null, clearSyncError: vi.fn(),
    } as unknown as Ctx;
    const onDone = vi.fn();
    render(
      <CadenceFinancialCtx.Provider value={value}>
        <MonthCloseWizard months={[JUL, AUG]} mode="edit-latest" onDone={onDone} />
      </CadenceFinancialCtx.Provider>
    );
    fireEvent.click(screen.getByRole('button', { name: /Save correction/ }));
    await waitFor(() => expect(onDone).toHaveBeenCalled());
    // The existing evidence line was updated; no second "Cash and offsets" row.
    expect(value.update).toHaveBeenCalledWith('evidence_items', 'ev-cash', expect.objectContaining({ item: 'Cash and offsets', period: '2026-08' }));
    const evidenceInserts = (value.insert as ReturnType<typeof vi.fn>).mock.calls
      .filter((c) => c[0] === 'evidence_items' && c[1].item === 'Cash and offsets');
    expect(evidenceInserts).toHaveLength(0);
  });

  it('refuses to correct the earliest month on record (no prior to derive from)', () => {
    renderWizard([JUL], 'edit-latest');
    expect(screen.getByText(/earliest month on record/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Save correction/ })).toBeNull();
  });
});
