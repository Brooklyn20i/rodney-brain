import { describe, expect, it } from 'vitest';
import { pdf } from '@react-pdf/renderer';
import { buildMonthlyAssessmentSections, MonthlyAssessmentDocument } from '../pdf';
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
