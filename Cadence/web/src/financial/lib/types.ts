// ── CANONICAL TYPE CONTRACT ────────────────────────────────────────────────
// Single source of truth for the Cadence Financial data model. Postgres
// schema in CadenceFinancial/backend/migrations/0001_init.sql must match.
//
// Money fields are stored as numbers (dollars, 2dp) in Postgres but all
// arithmetic happens in integer cents -- see lib/financeCalc.ts. Derived
// figures (free cash generated, all-in surplus, net debt, bridge movements)
// are never stored; they're computed from these raw rows so they can't
// drift from their inputs.
// ─────────────────────────────────────────────────────────────────────────

export type EntityKind = 'personal' | 'joint' | 'investment_vehicle';

export type EvidenceGrade =
  | 'screenshot'
  | 'statement'
  | 'broker'
  | 'tax'
  | 'market_repriced'
  | 'stale_carry_forward'
  | 'assumption'
  | 'user_stated_scenario';

export type EvidenceStatus = 'received' | 'partial' | 'missing' | 'accepted';

export type DecisionApprovalStatus = 'open' | 'clarified' | 'approved' | 'blocked' | 'implemented';

// Kept as a label only -- no automation is wired to these. Matches the
// brief's "keep the specialist-agent lens, but don't force Rodney to manage
// agents": Kobe owns control/close, Warren owns investments, Dan owns
// property/debt, McKinsey owns strategy/governance.
export type OwnerLens = 'kobe' | 'warren' | 'dan' | 'mckinsey' | 'rodney';

export type LoanRateType = 'fixed' | 'variable';
export type InvestmentSide = 'buy' | 'sell';

export type PropertyType = 'house' | 'townhouse' | 'unit' | 'land' | 'commercial' | 'other';

export interface Entity {
  id: string;
  owner_id: string;
  name: string;
  kind: EntityKind;
  notes: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface Property {
  id: string;
  owner_id: string;
  entity_id: string | null;
  address: string;
  value: number;
  valuation_basis: string;
  evidence_status: string;
  role: string;
  annual_rent: number;
  // ── Rich property-investment fields (migration 0007) ──
  // All optional so pre-existing rows and the CSV importer stay valid; the
  // returns engine guards each with a sensible default. This is the data the
  // best property tools (Stessa / Real Estate Investar / PropertyMe) hold per
  // property so cash-on-cash, yield-on-cost, LVR, CAGR and gearing can all be
  // computed rather than eyeballed.
  purchase_price?: number;
  purchase_date?: string | null; // 'YYYY-MM-DD'
  // Total cash out of pocket to acquire (deposit + stamp duty + legals +
  // buyer's agent). The denominator for cash-on-cash return.
  cash_invested?: number;
  land_value?: number; // for land-tax & depreciation split
  // Annual depreciation deduction (Div 43 capital works + Div 40 plant), from
  // a quantity-surveyor schedule. Non-cash: reduces taxable income, not cash.
  depreciation_annual?: number;
  property_type?: PropertyType;
  bedrooms?: number;
  bathrooms?: number;
  car_spaces?: number;
  land_size_sqm?: number;
  ownership_share?: number; // fraction owned, e.g. 0.5 for tenants-in-common
  weekly_rent?: number; // current contract/asking rent per week
  lease_start?: string | null; // 'YYYY-MM-DD'
  lease_end?: string | null; // 'YYYY-MM-DD'
  tenant?: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface Loan {
  id: string;
  owner_id: string;
  property_id: string;
  balance: number;
  offset_balance: number;
  rate: number;
  monthly_repayment: number;
  rate_type: LoanRateType;
  review_date: string | null;
  notes: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface InvestmentHolding {
  id: string;
  owner_id: string;
  entity_id: string | null;
  ticker: string;
  market: string;
  currency: string;
  units: number;
  native_value: number;
  cost_basis: number;
  as_of_date: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface InvestmentTransaction {
  id: string;
  owner_id: string;
  date: string;
  ticker: string;
  side: InvestmentSide;
  currency: string;
  units: number;
  price: number;
  // Native-currency amount, exactly as evidenced (screenshot/statement).
  amount: number;
  // AUD-equivalent amount at time of purchase. Equal to `amount` when
  // currency is already AUD. Required (not derived) because there's no
  // single "current" FX rate that correctly restates a historical foreign-
  // currency purchase -- it must be captured at entry time. Aggregating
  // `amount` directly across currencies would silently mix AUD and USD.
  amount_aud: number;
  notes: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

// One row per calendar month (period = 'YYYY-MM'). Drives the Free Cash
// Engine and Net Worth Bridge -- the core operating-vs-market split.
export interface MonthlyMetric {
  id: string;
  owner_id: string;
  period: string;
  cash_saved: number;
  share_buys: number;
  btc_buys: number;
  debt_reduction: number;
  net_worth: number;
  cash_offsets: number;
  total_debt: number;
  net_debt: number;
  shares: number;
  btc_crypto: number;
  super_balance: number;
  total_assets: number;
  property_value: number;
  property_equity: number;
  // Cumulative value of retained collectible/asset purchases (e.g. watches).
  // Zero unless a collectible purchase has actually been logged.
  collectibles_value: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface EvidenceItem {
  id: string;
  owner_id: string;
  item: string;
  period: string;
  grade: EvidenceGrade;
  status: EvidenceStatus;
  source: string;
  notes: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface Decision {
  id: string;
  owner_id: string;
  decision_area: string;
  question: string;
  options: string;
  recommended_position: string;
  approval_status: DecisionApprovalStatus;
  owner_lens: OwnerLens;
  decision_date: string | null;
  evidence_link: string;
  follow_up_action: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface LiquidityBucket {
  id: string;
  owner_id: string;
  label: string;
  amount: number;
  protected_minimum: number;
  purpose: string;
  note: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

// Asset classes used by allocation policy + the Asset Allocation screen.
// Keys are stable identifiers; display labels live in util.ts.
export type AssetClass = 'property' | 'cash' | 'shares' | 'btc' | 'super' | 'collectibles';

// Target allocation bands -- the workbook's Balance Sheet target min/base/max
// columns, promoted from hardcoded UI constants to owner-editable policy.
export interface AllocationPolicy {
  id: string;
  owner_id: string;
  asset_class: AssetClass;
  target_min: number; // fraction of net worth, e.g. 0.05
  target_base: number;
  target_max: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

// Risk metric thresholds -- the workbook's Risk Dashboard green/amber columns.
// direction says which side of the threshold is healthy:
//   lower_better:  green when value <= green_threshold, amber when <= amber_threshold
//   higher_better: green when value >= green_threshold, amber when >= amber_threshold
export type RiskDirection = 'lower_better' | 'higher_better';

export interface RiskPolicy {
  id: string;
  owner_id: string;
  metric_key: string;
  green_threshold: number;
  amber_threshold: number;
  direction: RiskDirection;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

// A message channel between Rodney and his agents (Kobe/Warren/Dan, running
// in his separate Hermes agent environment -- not part of this app). Mirrors
// the pattern already used by the main Cadence app's `agent_messages` table.
// This table is the *app-side* half of that integration: Kobe's own side
// needs a scoped Supabase grant to read/write it, set up separately (see
// AGENTS.md) -- this app doesn't attempt to run or connect to Kobe itself.
export type MessageSenderType = 'user' | 'agent' | 'system';
export type MessageStatus = 'unread' | 'processed';

export interface AgentMessage {
  id: string;
  owner_id: string;
  sender_type: MessageSenderType;
  sender_label: string; // 'Kobe' | 'Warren' | 'Dan' | 'Rodney' | ...
  body: string;
  status: MessageStatus;
  linked_decision_id: string | null;
  linked_period: string | null; // 'YYYY-MM', if the message concerns a specific month
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

// The owner's stated objective -- the number the whole app steers toward.
// The workbook's own strategy lane flagged "no defined objective" as its
// top governance gap; a goal row is what turns the monthly close from
// bookkeeping into navigation. Runway math lives in lib/goalCalc.ts and is
// computed from *actual trailing operating performance*, never stored.
export interface Goal {
  id: string;
  owner_id: string;
  label: string;
  target_net_worth: number;
  target_date: string | null; // 'YYYY-MM-DD', optional
  // Annual growth assumption applied to existing net worth in the "with
  // growth" runway scenario. 0 = operating-only (no market assumption).
  assumed_growth_rate: number;
  notes: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

// Personal insurance register -- the protection layer the workbook had no
// row for at all. Management-grade record only: what exists, how much cover,
// when it renews. Never advice about what cover to buy.
export type InsuranceCategory =
  | 'life'
  | 'tpd'
  | 'income_protection'
  | 'trauma'
  | 'health'
  | 'home_contents'
  | 'landlord'
  | 'motor'
  | 'liability'
  | 'other';

export type InsuranceStatus = 'active' | 'lapsed' | 'under_review';

export interface InsurancePolicy {
  id: string;
  owner_id: string;
  category: InsuranceCategory;
  insurer: string;
  policy_label: string; // e.g. "Life cover — Alex", never a policy number
  cover_amount: number;
  premium_annual: number;
  renewal_date: string | null;
  status: InsuranceStatus;
  notes: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

// Estate-readiness checklist: wills, powers of attorney, binding super
// nominations. Status tracking only -- the documents themselves live with
// the lawyer, not in this app.
export type EstateItemStatus = 'missing' | 'in_progress' | 'executed' | 'review_due';

export interface EstateItem {
  id: string;
  owner_id: string;
  item_key: string; // 'will' | 'poa_financial' | 'poa_medical' | 'super_binding_nomination' | ...
  label: string;
  status: EstateItemStatus;
  last_reviewed: string | null;
  notes: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

// Per-property monthly ledger: one row per line item on a rent statement or
// cost. This is the source of truth for property P&L. Income vs expense is
// derived from the category (see propertyCalc.ts INCOME_CATEGORIES), and
// `amount` is always stored positive. Interest is treated as an expense
// category (entered from the loan statement) so the P&L captures the real
// financing cost; loan principal is NOT a P&L line (it's a balance-sheet
// transfer), which is why net cashflow here is an interest-only P&L figure.
export type PropertyLedgerCategory =
  | 'rent'
  | 'other_income'
  | 'interest'
  | 'insurance'
  | 'strata'
  | 'water'
  | 'council_rates'
  | 'land_tax'
  | 'management_fees'
  | 'repairs_maintenance'
  | 'utilities'
  | 'other_expense';

export interface PropertyLedgerEntry {
  id: string;
  owner_id: string;
  property_id: string;
  period: string; // 'YYYY-MM'
  entry_date: string | null; // 'YYYY-MM-DD', optional actual date on the statement
  category: PropertyLedgerCategory;
  amount: number; // always positive; category determines income vs expense
  grade: EvidenceGrade;
  source: string; // e.g. "May agent rent statement", "Q2 council rates notice"
  notes: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

// ── Macro budget / cashflow plan ────────────────────────────────────────────
// A forward-looking recurring budget: income streams in minus recurring
// payments out = free cash. Distinct from monthly_metrics (actuals) and the
// Free Cash Engine (which reads actuals) — this is the plan Rodney sets.
// Each line carries its own frequency; the app normalises to a monthly view
// (see lib/budgetCalc.ts). Amounts are always positive; `kind` decides sign.
export type BudgetKind = 'income' | 'expense';

// 'one_off' lands the whole amount in a single month (its start_month) — for a
// bonus, a one-time bill, etc. Every other frequency recurs and is amortised
// to a monthly figure.
export type BudgetFrequency = 'weekly' | 'fortnightly' | 'monthly' | 'quarterly' | 'annual' | 'one_off';

// Built-in grouping keys. Stored as free text (DB doesn't constrain it) so
// owner-added categories need no migration; the UI merges these presets with
// the owner's own BudgetCategory rows per kind.
export type BudgetCategoryKey =
  // income
  | 'salary'
  | 'rental_income'
  | 'interest'
  | 'dividends'
  | 'business'
  | 'other_income'
  // expense
  | 'mortgage'
  | 'rent'
  | 'credit_card'
  | 'loan_repayment'
  | 'utilities'
  | 'insurance'
  | 'subscriptions'
  | 'living'
  | 'savings_transfer'
  | 'other_expense';

export interface BudgetLine {
  id: string;
  owner_id: string;
  kind: BudgetKind;
  category: string; // BudgetCategory key, but free text at the DB level
  label: string;
  amount: number; // always positive, in `currency`; kind decides income vs payment
  currency: string; // 'AUD' | 'EUR' | ...; converted to AUD via budget_fx_rates
  frequency: BudgetFrequency;
  // Optional month window, 'YYYY-MM' inclusive. null = unbounded. A line only
  // contributes to months inside its window; one_off lands in start_month.
  start_month: string | null;
  end_month: string | null;
  active: boolean;
  sort_order: number;
  notes: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

// Owner-added category, extending the built-in income/expense dropdown lists.
// Better classification now improves reporting later.
export interface BudgetCategory {
  id: string;
  owner_id: string;
  kind: BudgetKind;
  key: string; // slug stored on budget_lines.category
  label: string;
  sort_order: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

// Currency → AUD conversion rate. AUD is the base (implicitly 1); a row exists
// per foreign currency the owner uses. Rodney earns EUR, banks AUD.
export interface BudgetFxRate {
  id: string;
  owner_id: string;
  currency: string;
  rate_to_aud: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface CadenceFinancialData {
  entities: Entity[];
  properties: Property[];
  loans: Loan[];
  investment_holdings: InvestmentHolding[];
  investment_transactions: InvestmentTransaction[];
  monthly_metrics: MonthlyMetric[];
  evidence_items: EvidenceItem[];
  decisions: Decision[];
  liquidity_buckets: LiquidityBucket[];
  agent_messages: AgentMessage[];
  allocation_policies: AllocationPolicy[];
  risk_policies: RiskPolicy[];
  goals: Goal[];
  insurance_policies: InsurancePolicy[];
  estate_items: EstateItem[];
  property_ledger: PropertyLedgerEntry[];
  budget_lines: BudgetLine[];
  budget_categories: BudgetCategory[];
  budget_fx_rates: BudgetFxRate[];
}

export const TABLES: (keyof CadenceFinancialData)[] = [
  'entities',
  'properties',
  'loans',
  'investment_holdings',
  'investment_transactions',
  'monthly_metrics',
  'evidence_items',
  'decisions',
  'liquidity_buckets',
  'agent_messages',
  'allocation_policies',
  'risk_policies',
  'goals',
  'insurance_policies',
  'estate_items',
  'property_ledger',
  'budget_lines',
  'budget_categories',
  'budget_fx_rates',
];

export const emptyData = (): CadenceFinancialData => ({
  entities: [],
  properties: [],
  loans: [],
  investment_holdings: [],
  investment_transactions: [],
  monthly_metrics: [],
  evidence_items: [],
  decisions: [],
  liquidity_buckets: [],
  agent_messages: [],
  allocation_policies: [],
  risk_policies: [],
  goals: [],
  insurance_policies: [],
  estate_items: [],
  property_ledger: [],
  budget_lines: [],
  budget_categories: [],
  budget_fx_rates: [],
});
