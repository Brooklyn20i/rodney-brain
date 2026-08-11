import { afterEach, describe, expect, it, vi } from 'vitest';
import { pdf } from '@react-pdf/renderer';
import { buildMonthlyAssessmentSections, MonthlyAssessmentDocument } from '../pdf';
import { deliverPdfBlob, preparePdfDeliveryTarget } from '../pdfDelivery';
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
});

describe('PDF delivery', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('opens an iOS delivery target synchronously before PDF rendering starts', () => {
    const target = { location: { href: 'about:blank' }, close: vi.fn() };
    vi.stubGlobal('navigator', {
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)',
      platform: 'iPhone',
      maxTouchPoints: 1,
    });
    const open = vi.spyOn(window, 'open').mockReturnValue(target as unknown as Window);

    expect(preparePdfDeliveryTarget()).toBe(target);
    expect(open).toHaveBeenCalledWith('', '_blank');
  });

  it('navigates the pre-opened iOS target to the PDF and keeps the blob URL alive', () => {
    vi.useFakeTimers();
    const target = { location: { href: 'about:blank' }, close: vi.fn() };
    const createObjectURL = vi.fn(() => 'blob:cadence-report');
    const revokeObjectURL = vi.fn();
    vi.stubGlobal('URL', { createObjectURL, revokeObjectURL });

    deliverPdfBlob(new Blob(['pdf'], { type: 'application/pdf' }), 'August.pdf', target as unknown as Window);

    expect(target.location.href).toBe('blob:cadence-report');
    expect(revokeObjectURL).not.toHaveBeenCalled();
    vi.advanceTimersByTime(20_000);
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:cadence-report');
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

    deliverPdfBlob(new Blob(['pdf'], { type: 'application/pdf' }), 'August.pdf', null);

    expect(anchor.download).toBe('August.pdf');
    expect(click).toHaveBeenCalledOnce();
    expect(remove).toHaveBeenCalledOnce();
  });
});
