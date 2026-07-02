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
});
