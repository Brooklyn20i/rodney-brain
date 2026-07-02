// ── Currency + date formatting ──────────────────────────────────────────────
// en-AU locale matches the source data (AUD figures, DD/MM dates).

export function formatMoney(dollars: number, compact = false): string {
  const sign = dollars < 0 ? '-' : '';
  const abs = Math.abs(dollars);
  if (compact) {
    if (abs >= 1_000_000) return `${sign}A$${(abs / 1_000_000).toFixed(2)}m`;
    if (abs >= 1_000) return `${sign}A$${(abs / 1_000).toFixed(1)}k`;
  }
  return `${sign}A$${abs.toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function formatPercent(fraction: number, digits = 1): string {
  return `${(fraction * 100).toFixed(digits)}%`;
}

// 'YYYY-MM' -> 'Jul 2025'
export function monthLabel(period: string): string {
  const [y, m] = period.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('en-AU', { month: 'short', year: 'numeric' });
}

export function fmtDMY(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso.length === 10 ? iso + 'T12:00:00' : iso);
  return d.toLocaleDateString('en-AU', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export const EVIDENCE_GRADE_LABEL: Record<string, string> = {
  screenshot: 'Screenshot-grade',
  statement: 'Statement-grade',
  broker: 'Broker-grade',
  tax: 'Tax-grade',
  market_repriced: 'Market-repriced',
  stale_carry_forward: 'Stale / carry-forward',
  assumption: 'Assumption',
  user_stated_scenario: 'User-stated scenario',
};

// Grades a screen can trust for decisions without a follow-up flag.
export const STRONG_EVIDENCE_GRADES = new Set(['screenshot', 'statement', 'broker', 'tax']);

export const OWNER_LENS_LABEL: Record<string, string> = {
  kobe: 'Kobe (control / close)',
  warren: 'Warren (investments)',
  dan: 'Dan (property / debt)',
  mckinsey: 'McKinsey (strategy)',
  rodney: 'Rodney (owner)',
};

// Smallest/largest 'YYYY-MM' period in a list -- used to size the Free Cash
// Engine / Net Worth Bridge windows to however much monthly data is loaded,
// rather than a hardcoded date range.
export function periodRange(periods: string[]): { start: string; end: string } | null {
  if (periods.length === 0) return null;
  const sorted = [...periods].sort();
  return { start: sorted[0], end: sorted[sorted.length - 1] };
}

export const APPROVAL_STATUS_LABEL: Record<string, string> = {
  open: 'Open',
  clarified: 'Clarified',
  approved: 'Approved',
  blocked: 'Blocked',
  implemented: 'Implemented',
};

export const INSURANCE_CATEGORY_LABEL: Record<string, string> = {
  life: 'Life',
  tpd: 'TPD',
  income_protection: 'Income protection',
  trauma: 'Trauma',
  health: 'Health',
  home_contents: 'Home & contents',
  landlord: 'Landlord',
  motor: 'Motor',
  liability: 'Liability / umbrella',
  other: 'Other',
};

export const INSURANCE_STATUS_LABEL: Record<string, string> = {
  active: 'Active',
  lapsed: 'Lapsed',
  under_review: 'Under review',
};

export const ESTATE_STATUS_LABEL: Record<string, string> = {
  missing: 'Missing',
  in_progress: 'In progress',
  executed: 'Executed',
  review_due: 'Review due',
};

// The standard estate-readiness checklist offered when adding an item.
export const ESTATE_ITEM_PRESETS: { key: string; label: string }[] = [
  { key: 'will', label: 'Will' },
  { key: 'poa_financial', label: 'Power of attorney — financial' },
  { key: 'poa_medical', label: 'Power of attorney — medical' },
  { key: 'super_binding_nomination', label: 'Super binding death nomination' },
  { key: 'beneficiary_review', label: 'Beneficiary review' },
  { key: 'emergency_file', label: 'Emergency file / key contacts' },
  { key: 'other', label: 'Other' },
];
