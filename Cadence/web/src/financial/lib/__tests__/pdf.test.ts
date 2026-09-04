import { afterEach, describe, expect, it, vi } from 'vitest';
import { pdf } from '@react-pdf/renderer';
import {
  buildMonthlyAssessmentSections,
  MonthlyAssessmentDocument,
  prepareMonthlyAssessmentPdf,
} from '../pdf';
import { deliverPdfBlob, requiresInteractivePdfDelivery, sharePdfBlob } from '../pdfDelivery';
import { loadDemoData } from '../demoData';
import { emptyData } from '../types';
import { monthLabel } from '../util';

describe('buildMonthlyAssessmentSections', () => {
  it('summarizes the fictional demo data into every required section', () => {
    const sections = buildMonthlyAssessmentSections(loadDemoData());
    const expectedLabel = monthLabel('2025-07');

    expect(sections).not.toBeNull();
    expect(sections!.periodLabel).toBe(expectedLabel);
    expect(sections!.executiveSummary).toContain(expectedLabel);
    expect(sections!.monthClose.length).toBeGreaterThan(0);
    expect(sections!.freeCashEngine.length).toBeGreaterThan(0);
    expect(sections!.bridge.map((r) => r.item)).toContain('Closing net worth');
    expect(sections!.investments.length).toBeGreaterThan(0);
    // Demo data has one open/blocked-style decision at minimum.
    expect(sections!.needsRodney.length).toBeGreaterThan(0);
    expect(sections!.evidence.length).toBeGreaterThan(0);
  });

  it('scopes free-cash and investment-buy sections to the reported month', () => {
    const sections = buildMonthlyAssessmentSections(loadDemoData())!;

    expect(sections.periodLabel).toBe(monthLabel('2025-07'));
    expect(sections.freeCashEngine).toEqual([
      { measure: 'This month: cash saved + shares/BTC bought', total: 'A$3,400.00', average: 'A$3,400.00' },
      { measure: 'This month including debt reduction', total: 'A$4,530.00', average: 'A$4,530.00' },
    ]);
    expect(sections.investments).toEqual([
      { label: 'Share buys captured this month', value: 'A$0.00' },
      { label: 'BTC buys captured this month', value: 'A$0.00' },
      { label: 'Total shares + BTC this month', value: 'A$0.00' },
      { label: 'Active investment months', value: '0' },
    ]);
  });

  it('returns null when there is no monthly data to report on', () => {
    expect(buildMonthlyAssessmentSections(emptyData())).toBeNull();
  });
});

describe('MonthlyAssessmentDocument', () => {
  it('renders to a valid, non-empty PDF buffer without throwing', async () => {
    const sections = buildMonthlyAssessmentSections(loadDemoData())!;
    const buffer = await pdf(MonthlyAssessmentDocument({ sections })).toBuffer();

    const chunks: Buffer[] = [];
    await new Promise<void>((resolve, reject) => {
      buffer.on('data', (chunk) => chunks.push(chunk as Buffer));
      buffer.on('end', () => resolve());
      buffer.on('error', reject);
    });
    const out = Buffer.concat(chunks);

    expect(out.length).toBeGreaterThan(0);
    expect(out.subarray(0, 4).toString('ascii')).toBe('%PDF');
  });

  it('prepares the rendered file without trying to deliver it', async () => {
    const prepared = await prepareMonthlyAssessmentPdf(loadDemoData());

    expect(prepared).not.toBeNull();
    expect(prepared!.filename).toContain('Cadence Financial Monthly Assessment');
    expect(prepared!.filename).toContain(monthLabel('2025-07'));
    expect(prepared!.blob.type).toBe('application/pdf');
    expect(prepared!.blob.size).toBeGreaterThan(0);
  });
});

describe('PDF delivery', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('keeps iOS delivery inside the app until the user explicitly shares or saves it', () => {
    vi.stubGlobal('navigator', {
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)',
      platform: 'iPhone',
      maxTouchPoints: 1,
    });
    const open = vi.spyOn(window, 'open');

    expect(requiresInteractivePdfDelivery()).toBe(true);
    expect(open).not.toHaveBeenCalled();
  });

  it('shares a prepared PDF from a fresh iOS user gesture', async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    const canShare = vi.fn().mockReturnValue(true);
    vi.stubGlobal('navigator', {
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)',
      platform: 'iPhone',
      maxTouchPoints: 1,
      share,
      canShare,
    });

    const shared = await sharePdfBlob(
      new Blob(['pdf'], { type: 'application/pdf' }),
      'August.pdf'
    );

    expect(shared).toBe(true);
    expect(canShare).toHaveBeenCalledOnce();
    expect(share).toHaveBeenCalledWith({
      files: [expect.any(File)],
      title: 'August.pdf',
    });
    const sharedFile = share.mock.calls[0][0].files[0] as File;
    expect(sharedFile.name).toBe('August.pdf');
    expect(sharedFile.type).toBe('application/pdf');
  });

  it('reports when native file sharing is unavailable so the UI can show a direct link', async () => {
    vi.stubGlobal('navigator', {
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)',
      platform: 'iPhone',
      maxTouchPoints: 1,
    });

    await expect(
      sharePdfBlob(new Blob(['pdf'], { type: 'application/pdf' }), 'August.pdf')
    ).resolves.toBe(false);
  });

  it('uses an anchor download on non-iOS browsers', () => {
    vi.useFakeTimers();
    const click = vi.fn();
    const remove = vi.fn();
    const anchor = { href: '', download: '', click, remove };
    vi.spyOn(document, 'createElement').mockReturnValue(anchor as unknown as HTMLAnchorElement);
    vi.spyOn(document.body, 'appendChild').mockImplementation((node) => node);
    const revokeObjectURL = vi.fn();
    vi.stubGlobal('URL', { createObjectURL: vi.fn(() => 'blob:desktop-report'), revokeObjectURL });

    deliverPdfBlob(new Blob(['pdf'], { type: 'application/pdf' }), 'August.pdf');

    expect(anchor.download).toBe('August.pdf');
    expect(click).toHaveBeenCalledOnce();
    expect(remove).toHaveBeenCalledOnce();
  });
});
