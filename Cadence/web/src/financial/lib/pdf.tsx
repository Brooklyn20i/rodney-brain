// Monthly PDF Assessment -- structure ported from the already-validated
// Python prototype's report.py (same section order, same executive-read
// framing). Split into a plain-data builder (buildMonthlyAssessmentSections,
// easy to unit test) and the @react-pdf/renderer document that lays that
// data out, so the numbers can be verified without parsing a PDF binary.

import { Document, Page, Text, View, StyleSheet, pdf } from '@react-pdf/renderer';
import type { CadenceFinancialData } from './types';
import {
  buildExecutiveSummary,
  investmentBuysSummary,
  latestMonth,
  netWorthBridge,
  summarizePeriod,
} from './financeCalc';
import { EVIDENCE_GRADE_LABEL, formatMoney, monthLabel, periodRange } from './util';

export interface MonthlyAssessmentSections {
  periodLabel: string;
  executiveSummary: string;
  monthClose: { metric: string; value: string; read: string }[];
  freeCashEngine: { measure: string; total: string; average: string }[];
  bridge: { item: string; movement: string }[];
  investments: { label: string; value: string }[];
  needsRodney: { area: string; priority: string; why: string }[];
  evidence: { item: string; grade: string; status: string }[];
}

export function buildMonthlyAssessmentSections(
  data: CadenceFinancialData
): MonthlyAssessmentSections | null {
  if (data.monthly_metrics.length === 0) return null;

  const sortedMonths = [...data.monthly_metrics].sort((a, b) => a.period.localeCompare(b.period));
  const current = latestMonth(data.monthly_metrics);
  const prior = sortedMonths.length > 1 ? sortedMonths[sortedMonths.length - 2] : current;
  const bridge = netWorthBridge(prior, current);

  const range = periodRange(data.monthly_metrics.map((m) => m.period))!;
  const period = summarizePeriod(data.monthly_metrics, range.start, range.end);

  const txRange = periodRange(data.investment_transactions.map((t) => t.date.slice(0, 7)));
  const buys = txRange
    ? investmentBuysSummary(data.investment_transactions, txRange.start, txRange.end)
    : { shares: 0, btc: 0, total: 0, activeMonths: 0 };

  const periodLabel = monthLabel(current.period);
  const openDecisions = data.decisions.filter(
    (d) => d.approval_status === 'open' || d.approval_status === 'blocked'
  );
  const currentEvidence = data.evidence_items.filter((e) => e.period === current.period);

  return {
    periodLabel,
    executiveSummary: buildExecutiveSummary(bridge, periodLabel),
    monthClose: [
      { metric: 'Net worth', value: formatMoney(current.net_worth), read: `${formatMoney(bridge.netWorthMovement)} month-on-month` },
      { metric: 'Cash / offsets', value: formatMoney(current.cash_offsets), read: 'Protected liquidity' },
      { metric: 'Total debt', value: formatMoney(current.total_debt), read: `Debt reduced by ${formatMoney(current.debt_reduction)}` },
      { metric: 'Net debt', value: formatMoney(current.net_debt), read: 'Economic net-debt position' },
      { metric: 'Shares', value: formatMoney(current.shares), read: 'Market-repriced' },
      { metric: 'BTC / crypto', value: formatMoney(current.btc_crypto), read: 'Main market driver, positive or negative' },
    ],
    freeCashEngine: [
      { measure: 'Cash saved + shares/BTC bought', total: formatMoney(period.freeCashGenerated), average: formatMoney(period.freeCashMonthlyAverage) },
      { measure: 'All-in including debt reduction', total: formatMoney(period.allInSurplus), average: formatMoney(period.allInMonthlyAverage) },
    ],
    bridge: [
      { item: 'Opening net worth', movement: formatMoney(bridge.openingNetWorth) },
      { item: 'Operating cash + investment buys + debt reduction', movement: formatMoney(bridge.operatingCashAndDebt) },
      { item: 'Market and other movement', movement: formatMoney(bridge.marketAndOtherMovement) },
      { item: 'Closing net worth', movement: formatMoney(bridge.closingNetWorth) },
      { item: 'Net movement', movement: formatMoney(bridge.netWorthMovement) },
    ],
    investments: [
      { label: 'Share buys captured', value: formatMoney(buys.shares) },
      { label: 'BTC buys captured', value: formatMoney(buys.btc) },
      { label: 'Total shares + BTC', value: formatMoney(buys.total) },
      { label: 'Active investment months', value: String(buys.activeMonths) },
    ],
    needsRodney: openDecisions.map((d) => ({ area: d.decision_area, priority: d.approval_status, why: d.question })),
    evidence: currentEvidence.map((e) => ({
      item: e.item,
      grade: EVIDENCE_GRADE_LABEL[e.grade] ?? e.grade,
      status: e.status,
    })),
  };
}

const styles = StyleSheet.create({
  page: { padding: 28, fontSize: 9, fontFamily: 'Helvetica', color: '#111827' },
  title: { fontSize: 20, textAlign: 'center', marginBottom: 4, fontFamily: 'Helvetica-Bold' },
  subtitle: { fontSize: 9, textAlign: 'center', marginBottom: 12, color: '#4b5563' },
  callout: { fontSize: 9.5, backgroundColor: '#f3f4f6', padding: 8, borderRadius: 4, marginBottom: 12, lineHeight: 1.4 },
  h1: { fontSize: 12, marginTop: 8, marginBottom: 6, fontFamily: 'Helvetica-Bold' },
  table: { borderWidth: 0.5, borderColor: '#d1d5db', marginBottom: 6 },
  row: { flexDirection: 'row', borderBottomWidth: 0.5, borderBottomColor: '#d1d5db' },
  headerRow: { flexDirection: 'row', backgroundColor: '#111827' },
  cell: { flex: 1, padding: 4, fontSize: 8.5 },
  headerCell: { flex: 1, padding: 4, fontSize: 8.5, color: '#ffffff', fontFamily: 'Helvetica-Bold' },
  footer: { position: 'absolute', bottom: 18, left: 28, right: 28, fontSize: 7, color: '#6b7280', flexDirection: 'row', justifyContent: 'space-between' },
  disclaimer: { fontSize: 7.5, color: '#6b7280', marginTop: 10, lineHeight: 1.4 },
});

function Table({ headers, rows }: { headers: string[]; rows: string[][] }) {
  return (
    <View style={styles.table}>
      <View style={styles.headerRow}>
        {headers.map((h) => (
          <Text key={h} style={styles.headerCell}>
            {h}
          </Text>
        ))}
      </View>
      {rows.map((r, i) => (
        <View style={styles.row} key={i}>
          {r.map((c, j) => (
            <Text key={j} style={styles.cell}>
              {c}
            </Text>
          ))}
        </View>
      ))}
    </View>
  );
}

export function MonthlyAssessmentDocument({ sections }: { sections: MonthlyAssessmentSections }) {
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <Text style={styles.title}>Cadence Financial</Text>
        <Text style={styles.subtitle}>
          Monthly Financial Assessment | {sections.periodLabel} | Private management report
        </Text>
        <Text style={styles.callout}>{sections.executiveSummary}</Text>

        <Text style={styles.h1}>Month Close</Text>
        <Table
          headers={['Metric', 'Value', 'Read']}
          rows={sections.monthClose.map((r) => [r.metric, r.value, r.read])}
        />

        <Text style={styles.h1}>Free Cash Engine</Text>
        <Table
          headers={['Measure', 'Period total', 'Monthly average']}
          rows={sections.freeCashEngine.map((r) => [r.measure, r.total, r.average])}
        />

        <Text style={styles.h1}>Net Worth Bridge</Text>
        <Table headers={['Bridge item', 'Movement']} rows={sections.bridge.map((r) => [r.item, r.movement])} />

        <Text style={styles.h1}>Investment Deployment</Text>
        <Table headers={['Investment buys captured', 'Amount']} rows={sections.investments.map((r) => [r.label, r.value])} />

        <Text style={styles.h1}>Needs you</Text>
        {sections.needsRodney.length === 0 ? (
          <Text style={styles.cell}>Nothing open this month.</Text>
        ) : (
          <Table
            headers={['Decision area', 'Status', 'Why it matters']}
            rows={sections.needsRodney.map((r) => [r.area, r.priority, r.why])}
          />
        )}

        <Text style={styles.h1}>Evidence Grades</Text>
        {sections.evidence.length === 0 ? (
          <Text style={styles.cell}>No evidence logged for this period.</Text>
        ) : (
          <Table
            headers={['Item', 'Grade', 'Status']}
            rows={sections.evidence.map((r) => [r.item, r.grade, r.status])}
          />
        )}

        <Text style={styles.disclaimer}>
          This is a management-grade Cadence Financial assessment. It is not tax, audit, legal,
          lending or broker-grade advice. No trades, payments, refinance, tax/legal decisions or
          external contact are authorised by this report.
        </Text>

        <View style={styles.footer} fixed>
          <Text>Cadence Financial -- private management report</Text>
          <Text render={({ pageNumber }) => `Page ${pageNumber}`} />
        </View>
      </Page>
    </Document>
  );
}

export async function exportMonthlyAssessmentPdf(data: CadenceFinancialData): Promise<void> {
  const sections = buildMonthlyAssessmentSections(data);
  if (!sections) return;
  const blob = await pdf(<MonthlyAssessmentDocument sections={sections} />).toBlob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `Cadence Financial Monthly Assessment - ${sections.periodLabel}.pdf`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
