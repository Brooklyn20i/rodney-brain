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

// ── Budget labels ───────────────────────────────────────────────────────────
export const BUDGET_FREQUENCY_LABEL: Record<string, string> = {
  weekly: 'Weekly',
  fortnightly: 'Fortnightly',
  monthly: 'Monthly',
  quarterly: 'Quarterly',
  annual: 'Annual',
  one_off: 'One-off',
};

// Currencies offered in the budget line editor. AUD is the base everything
// converts to; the rest need a rate set on the Budget screen.
export const BUDGET_CURRENCIES = ['AUD', 'EUR', 'USD', 'GBP', 'NZD', 'SGD', 'JPY', 'CHF', 'CAD'];

// 'YYYY-MM' -> 'Jul' (short) or 'Jul 25' (with year)
export function monthShort(period: string, withYear = false): string {
  const [y, m] = period.split('-').map(Number);
  const d = new Date(y, m - 1, 1);
  return withYear
    ? d.toLocaleDateString('en-AU', { month: 'short', year: '2-digit' })
    : d.toLocaleDateString('en-AU', { month: 'short' });
}

// 'YYYY-MM' one month later / earlier
export function shiftMonth(period: string, delta: number): string {
  const [y, m] = period.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function currentMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export const BUDGET_INCOME_CATEGORIES: { key: string; label: string }[] = [
  { key: 'salary', label: 'Salary / wages' },
  { key: 'rental_income', label: 'Rental income' },
  { key: 'interest', label: 'Interest' },
  { key: 'dividends', label: 'Dividends' },
  { key: 'business', label: 'Business / other work' },
  { key: 'other_income', label: 'Other income' },
];

export const BUDGET_EXPENSE_CATEGORIES: { key: string; label: string }[] = [
  { key: 'mortgage', label: 'Mortgage' },
  { key: 'rent', label: 'Rent' },
  { key: 'credit_card', label: 'Credit cards' },
  { key: 'loan_repayment', label: 'Loan repayments' },
  { key: 'utilities', label: 'Utilities & bills' },
  { key: 'insurance', label: 'Insurance' },
  { key: 'subscriptions', label: 'Subscriptions' },
  { key: 'living', label: 'Living & everyday' },
  { key: 'savings_transfer', label: 'Savings / investing' },
  { key: 'other_expense', label: 'Other payment' },
];

export const BUDGET_CATEGORY_LABEL: Record<string, string> = Object.fromEntries(
  [...BUDGET_INCOME_CATEGORIES, ...BUDGET_EXPENSE_CATEGORIES].map((c) => [c.key, c.label])
);

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

export const PROPERTY_TYPE_LABEL: Record<string, string> = {
  house: 'House',
  townhouse: 'Townhouse',
  unit: 'Unit / apartment',
  land: 'Land',
  commercial: 'Commercial',
  other: 'Other',
};

export const GEARING_LABEL: Record<string, string> = {
  positive: 'Positively geared',
  neutral: 'Neutral',
  negative: 'Negatively geared',
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
