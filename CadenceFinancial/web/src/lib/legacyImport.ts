// Legacy CSV import -- maps the old Wealth Dashboard / Wealth Cockpit CSV
// export format (and the newer local Cadence Financial prototype's CSVs)
// onto this app's schema. Pure functions only: no filesystem or network
// access here, so they're unit-testable against small fixture rows. The
// actual file-reading + Supabase-writing CLI lives in
// scripts/import-legacy-csv.ts and is meant to be run locally by Rodney
// against his real files -- never against fixtures committed to git.
//
// Column layouts matched here are documented inline next to each mapper,
// taken from Rodney's real export headers. Property/loan linkage is by
// address-string match, which is best-effort -- review the imported rows
// before trusting them for a real month close.

import type {
  Decision,
  DecisionApprovalStatus,
  EvidenceGrade,
  EvidenceItem,
  InvestmentHolding,
  InvestmentTransaction,
  LiquidityBucket,
  Loan,
  LoanRateType,
  MonthlyMetric,
  OwnerLens,
  Property,
} from './types';

export type CsvRow = Record<string, string>;

// Minimal RFC4180-ish CSV parser: handles quoted fields, embedded commas,
// escaped double quotes ("") and CRLF/LF line endings. No external
// dependency needed for a one-off import script.
export function parseCsv(text: string): CsvRow[] {
  const rows: string[][] = [];
  let field = '';
  let row: string[] = [];
  let inQuotes = false;
  const src = text.replace(/\r\n/g, '\n');

  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (inQuotes) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += c;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  const [header, ...body] = rows.filter((r) => r.some((c) => c.trim() !== ''));
  if (!header) return [];
  return body.map((r) => Object.fromEntries(header.map((h, i) => [h.trim(), (r[i] ?? '').trim()])));
}

function num(v: string | undefined): number {
  if (!v) return 0;
  const n = Number(v.replace(/[^0-9.-]/g, ''));
  return Number.isFinite(n) ? n : 0;
}

const now = () => new Date().toISOString();
function stub(owner_id: string) {
  return { owner_id, created_at: now(), updated_at: now(), deleted_at: null };
}

// ── cadence_financial/data/monthly_metrics.csv (the new prototype's own
// format) -- already column-for-column our schema. ─────────────────────────
// period,cash_saved,share_buys,btc_buys,debt_reduction,net_worth,cash_offsets,
// total_debt,net_debt,shares,btc_crypto,super,total_assets,property_value,property_equity
export function mapMonthlyMetricsCsv(rows: CsvRow[], owner_id: string): Omit<MonthlyMetric, 'id'>[] {
  return rows.map((r) => ({
    ...stub(owner_id),
    period: r.period,
    cash_saved: num(r.cash_saved),
    share_buys: num(r.share_buys),
    btc_buys: num(r.btc_buys),
    debt_reduction: num(r.debt_reduction),
    net_worth: num(r.net_worth),
    cash_offsets: num(r.cash_offsets),
    total_debt: num(r.total_debt),
    net_debt: num(r.net_debt),
    shares: num(r.shares),
    btc_crypto: num(r.btc_crypto),
    super_balance: num(r.super),
    total_assets: num(r.total_assets),
    property_value: num(r.property_value),
    property_equity: num(r.property_equity),
    collectibles_value: num(r.collectibles_value),
  }));
}

// ── old Wealth Cockpit monthly_tracking.csv, paired with investment_buys.csv
// for the share_buys/btc_buys columns the old format didn't track directly. ─
// Date,Cash / offsets,Property value,Property equity,Crypto,Shares,Super,
// Total assets,Total debt,Net debt,Net worth,Cash Δ,...,Debt reduction
export function mapMonthlyTrackingCsv(
  trackingRows: CsvRow[],
  investmentBuyRows: CsvRow[],
  owner_id: string
): Omit<MonthlyMetric, 'id'>[] {
  const buysByPeriod = new Map(investmentBuyRows.map((r) => [r.period, r]));
  return trackingRows.map((r) => {
    const period = (r.Date || '').slice(0, 7);
    const buys = buysByPeriod.get(period);
    return {
      ...stub(owner_id),
      period,
      cash_saved: num(r['Cash Δ']),
      share_buys: num(buys?.share_buys),
      btc_buys: num(buys?.btc_buys),
      debt_reduction: num(r['Debt reduction']),
      net_worth: num(r['Net worth']),
      cash_offsets: num(r['Cash / offsets']),
      total_debt: num(r['Total debt']),
      net_debt: num(r['Net debt']),
      shares: num(r.Shares),
      btc_crypto: num(r.Crypto),
      super_balance: num(r.Super),
      total_assets: num(r['Total assets']),
      property_value: num(r['Property value']),
      property_equity: num(r['Property equity']),
      collectibles_value: 0,
    };
  });
}

// ── evidence_register.csv (new prototype format) ───────────────────────────
// item,period,evidence_grade,status,source,notes
const GRADE_ALIASES: Record<string, EvidenceGrade> = {
  'screenshot-grade': 'screenshot',
  screenshot: 'screenshot',
  'statement-grade': 'statement',
  statement: 'statement',
  'broker-grade': 'broker',
  broker: 'broker',
  'tax-grade': 'tax',
  tax: 'tax',
  'market-repriced': 'market_repriced',
  market_repriced: 'market_repriced',
  'stale/carry-forward': 'stale_carry_forward',
  'stale / carry-forward': 'stale_carry_forward',
  'carry-forward': 'stale_carry_forward',
  stale_carry_forward: 'stale_carry_forward',
  assumption: 'assumption',
  'user-stated scenario': 'user_stated_scenario',
  user_stated_scenario: 'user_stated_scenario',
};

export function normalizeEvidenceGrade(raw: string): EvidenceGrade {
  return GRADE_ALIASES[raw.trim().toLowerCase()] ?? 'assumption';
}

export function mapEvidenceRegisterCsv(rows: CsvRow[], owner_id: string): Omit<EvidenceItem, 'id'>[] {
  return rows.map((r) => ({
    ...stub(owner_id),
    item: r.item,
    period: r.period,
    grade: normalizeEvidenceGrade(r.evidence_grade || ''),
    status: (r.status as EvidenceItem['status']) || 'accepted',
    source: r.source || '',
    notes: r.notes || '',
  }));
}

// ── property_register.csv ───────────────────────────────────────────────
// Property,Value,Loan,Offset,...,Annual rent,...,Role / thesis,...,
// Owner/entity,Valuation basis,Evidence status
export function mapPropertyRegisterCsv(rows: CsvRow[], owner_id: string): Omit<Property, 'id'>[] {
  return rows
    .filter((r) => r.Property && r.Property !== 'TOTAL')
    .map((r) => ({
      ...stub(owner_id),
      entity_id: null, // link manually after import -- entity names aren't stable IDs
      address: r.Property,
      value: num(r.Value),
      valuation_basis: r['Valuation basis'] || '',
      evidence_status: r['Evidence status'] || '',
      role: r['Role / thesis'] || '',
      annual_rent: num(r['Annual rent']),
    }));
}

// ── loan_offset_register.csv ────────────────────────────────────────────
// Property,Loan balance,Offset balance,...,Rate,Monthly repayment,...,
// Fixed/variable,Review/maturity date,...
export function mapLoanOffsetRegisterCsv(
  rows: CsvRow[],
  properties: { id: string; address: string }[],
  owner_id: string
): Omit<Loan, 'id'>[] {
  return rows
    .filter((r) => r.Property && r.Property !== 'TOTAL' && !r.Property.toLowerCase().includes('control note'))
    .map((r) => {
      const property = properties.find((p) => p.address === r.Property);
      const rateType: LoanRateType = /fixed/i.test(r['Fixed/variable'] || '') ? 'fixed' : 'variable';
      return {
        ...stub(owner_id),
        property_id: property?.id ?? '',
        balance: num(r['Loan balance']),
        offset_balance: num(r['Offset balance']),
        rate: num(r.Rate),
        monthly_repayment: num(r['Monthly repayment']),
        rate_type: rateType,
        review_date: r['Review/maturity date'] && r['Review/maturity date'] !== 'TBC' ? r['Review/maturity date'] : null,
        notes: r['Notes / evidence status'] || '',
      };
    });
}

// ── share_transactions.csv ──────────────────────────────────────────────
// Date,Australian FY,Market,Ticker,Side,Currency,Shares,Price,Amount / proceeds,...
// An optional "Amount AUD" column carries the AUD-equivalent at purchase
// date for foreign-currency rows -- required for an accurate multi-currency
// total (see InvestmentTransaction.amount_aud). Without it, AUD-currency
// rows are unaffected but foreign-currency rows fall back to their native
// amount, which understates/overstates the AUD total and should be
// corrected before trusting the aggregate "buys captured" figure.
export function mapShareTransactionsCsv(rows: CsvRow[], owner_id: string): Omit<InvestmentTransaction, 'id'>[] {
  return rows
    .filter((r) => r.Date && r.Ticker)
    .map((r) => {
      const currency = r.Currency || 'AUD';
      const amount = num(r['Amount / proceeds']);
      const amountAud = r['Amount AUD'] ? num(r['Amount AUD']) : currency === 'AUD' ? amount : amount;
      return {
        ...stub(owner_id),
        date: r.Date,
        ticker: r.Ticker,
        side: (r.Side as InvestmentTransaction['side']) || 'buy',
        currency,
        units: num(r.Shares),
        price: num(r.Price),
        amount,
        amount_aud: amountAud,
        notes: r['Source / caveat'] || '',
      };
    });
}

// ── listed_share_snapshot.csv ───────────────────────────────────────────
// Market / account,Entity / owner,Ticker,Instrument,Currency,Shares,
// Equity / value native,Profit / loss native,...
export function mapListedShareSnapshotCsv(rows: CsvRow[], owner_id: string): Omit<InvestmentHolding, 'id'>[] {
  return rows
    .filter((r) => r.Ticker && r['Equity / value native'])
    .map((r) => ({
      ...stub(owner_id),
      entity_id: null, // link manually after import
      ticker: r.Ticker,
      market: r['Market / account'] || '',
      currency: r.Currency || 'AUD',
      units: num(r.Shares),
      native_value: num(r['Equity / value native']),
      cost_basis: num(r['Equity / value native']) - num(r['Profit / loss native']),
      as_of_date: new Date().toISOString().slice(0, 10),
    }));
}

// ── decision_log.csv ────────────────────────────────────────────────────
// Decision ID,Date raised,Decision area,Question / decision needed,Options,
// Recommended position,Approval status,Approved by,Decision date,
// Evidence / link,Follow-up action
const STATUS_ALIASES: Record<string, DecisionApprovalStatus> = {
  open: 'open',
  blocked: 'blocked',
};
function normalizeApprovalStatus(raw: string): DecisionApprovalStatus {
  const s = raw.trim().toLowerCase();
  if (STATUS_ALIASES[s]) return STATUS_ALIASES[s];
  if (/(implement|execut)/.test(s)) return 'implemented';
  if (/(adopt|approv)/.test(s)) return 'approved';
  if (/clarif/.test(s)) return 'clarified';
  if (/block/.test(s)) return 'blocked';
  return 'open';
}
const OWNER_LENS_ALIASES: Record<string, OwnerLens> = { kobe: 'kobe', warren: 'warren', dan: 'dan', mckinsey: 'mckinsey', rodney: 'rodney' };
function inferOwnerLens(raw: string): OwnerLens {
  const s = raw.toLowerCase();
  for (const key of Object.keys(OWNER_LENS_ALIASES)) {
    if (s.includes(key)) return OWNER_LENS_ALIASES[key];
  }
  return 'kobe';
}

// ── liquidity_buckets.csv ───────────────────────────────────────────────
// Bucket,Amount / planning value,Protected minimum / target,
// Available above minimum,Purpose,Source/evidence,Monthly review note
export function mapLiquidityBucketsCsv(rows: CsvRow[], owner_id: string): Omit<LiquidityBucket, 'id'>[] {
  return rows
    .filter((r) => r.Bucket && !/^control (summary|note)$/i.test(r.Bucket))
    .map((r) => ({
      ...stub(owner_id),
      label: r.Bucket,
      amount: num(r['Amount / planning value']),
      protected_minimum: num(r['Protected minimum / target']),
      purpose: r.Purpose || '',
      note: r['Monthly review note'] || r['Source/evidence'] || '',
    }));
}

export function mapDecisionLogCsv(rows: CsvRow[], owner_id: string): Omit<Decision, 'id'>[] {
  return rows
    .filter((r) => r['Decision area'])
    .map((r) => ({
      ...stub(owner_id),
      decision_area: r['Decision area'],
      question: r['Question / decision needed'] || '',
      options: r.Options || '',
      recommended_position: r['Recommended position'] || '',
      approval_status: normalizeApprovalStatus(r['Approval status'] || ''),
      owner_lens: inferOwnerLens(`${r['Approved by'] || ''} ${r['Recommended position'] || ''}`),
      decision_date: r['Decision date'] || null,
      evidence_link: r['Evidence / link'] || '',
      follow_up_action: r['Follow-up action'] || '',
    }));
}
