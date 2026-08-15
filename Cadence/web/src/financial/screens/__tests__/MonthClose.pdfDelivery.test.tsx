import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CadenceFinancialCtx, type Ctx } from '../../lib/store';
import { loadDemoData } from '../../lib/demoData';

const h = vi.hoisted(() => ({
  prepare: vi.fn(),
  share: vi.fn(),
  requiresInteractive: vi.fn(),
  deliver: vi.fn(),
}));

vi.mock('../../lib/pdf', () => ({
  prepareMonthlyAssessmentPdf: h.prepare,
}));

vi.mock('../../lib/pdfDelivery', () => ({
  deliverPdfBlob: h.deliver,
  requiresInteractivePdfDelivery: h.requiresInteractive,
  sharePdfBlob: h.share,
}));

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

import { MonthClose } from '../MonthClose';

function monthCloseTree(data = loadDemoData()) {
  const value: Ctx = {
    demo: false,
    data,
    insert: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
    syncError: null,
    clearSyncError: vi.fn(),
  };
  return (
    <CadenceFinancialCtx.Provider value={value}>
      <MonthClose onMenu={vi.fn()} />
    </CadenceFinancialCtx.Provider>
  );
}

function renderMonthClose(data = loadDemoData()) {
  return render(monthCloseTree(data));
}

describe('Month Close PDF delivery on iPhone and iPad', () => {
  it('renders first, then offers a fresh Share or save tap without opening a blank tab', async () => {
    const blob = new Blob(['pdf'], { type: 'application/pdf' });
    h.requiresInteractive.mockReturnValue(true);
    h.prepare.mockResolvedValue({ blob, filename: 'August.pdf' });
    h.share.mockResolvedValue(true);
    vi.stubGlobal('URL', {
      createObjectURL: vi.fn(() => 'blob:cadence-august'),
      revokeObjectURL: vi.fn(),
    });
    const open = vi.spyOn(window, 'open');

    renderMonthClose();
    fireEvent.click(screen.getByRole('button', { name: 'Download monthly PDF' }));

    expect(await screen.findByRole('status')).toHaveTextContent('Your monthly PDF is ready.');
    expect(open).not.toHaveBeenCalled();
    expect(h.deliver).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Share or save PDF' }));

    expect(h.share).toHaveBeenCalledWith(blob, 'August.pdf');
  });

  it('clears a prepared PDF when the financial source data changes', async () => {
    const blob = new Blob(['pdf'], { type: 'application/pdf' });
    h.requiresInteractive.mockReturnValue(true);
    h.prepare.mockResolvedValue({ blob, filename: 'July.pdf' });
    vi.stubGlobal('URL', {
      createObjectURL: vi.fn(() => 'blob:cadence-july'),
      revokeObjectURL: vi.fn(),
    });
    const data = loadDemoData();
    const view = renderMonthClose(data);

    fireEvent.click(screen.getByRole('button', { name: 'Download monthly PDF' }));
    expect(await screen.findByRole('status')).toBeInTheDocument();

    const changedData = {
      ...data,
      monthly_metrics: data.monthly_metrics.map((month, index) =>
        index === 0 ? { ...month, cash_saved: month.cash_saved + 1 } : month
      ),
    };
    view.rerender(monthCloseTree(changedData));

    await waitFor(() => expect(screen.queryByRole('status')).not.toBeInTheDocument());
  });
});
