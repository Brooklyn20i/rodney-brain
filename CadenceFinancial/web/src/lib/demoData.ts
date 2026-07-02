// ── FICTIONAL DEMO DATA — DO NOT PUT REAL FIGURES HERE ─────────────────────
// This file is committed to a public git repo. Every name, address, entity
// and number below is made up, chosen only to exercise every screen with a
// coherent, internally-consistent scenario. It follows the same pattern as
// Cadence's own Cadence/demo-seed.sql: real personal data never goes into
// git -- it only ever lives in a private Supabase project entered directly
// by the user (see CadenceFinancial/AGENTS.md).
// ─────────────────────────────────────────────────────────────────────────

import type {
  AgentMessage,
  AllocationPolicy,
  CadenceFinancialData,
  Decision,
  Entity,
  EvidenceItem,
  InvestmentHolding,
  InvestmentTransaction,
  LiquidityBucket,
  Loan,
  MonthlyMetric,
  Property,
  RiskPolicy,
} from './types';

const OWNER = 'demo-owner';
const TS = '2025-07-01T00:00:00Z';
const base = { owner_id: OWNER, created_at: TS, updated_at: TS, deleted_at: null };

const entities: Entity[] = [
  { ...base, id: 'e-personal', name: 'Alex Personal', kind: 'personal', notes: '' },
  {
    ...base,
    id: 'e-joint',
    name: 'Family Home (Joint Ownership)',
    kind: 'joint',
    notes: 'Owner-occupied-turned-rented anchor property, held jointly.',
  },
  {
    ...base,
    id: 'e-harbor',
    name: 'Harbor Bay Holdings',
    kind: 'investment_vehicle',
    notes: 'Investment vehicle holding the two Coastal Bay yield properties and part of the share portfolio.',
  },
];

const properties: Property[] = [
  {
    ...base,
    id: 'p-bellview',
    entity_id: 'e-joint',
    address: '14 Bellview Crescent, Fictional Heights',
    value: 1_450_000,
    valuation_basis: 'Portal-led repeatable estimate, refreshed monthly',
    evidence_status: 'Screenshot refreshed this month',
    role: 'Risk-control anchor; now tenanted',
    annual_rent: 42_000,
  },
  {
    ...base,
    id: 'p-grandview',
    entity_id: 'e-personal',
    address: '8 Grandview Ave, Sample Grove',
    value: 620_000,
    valuation_basis: 'Portal-led repeatable estimate, refreshed monthly',
    evidence_status: 'Screenshot refreshed this month',
    role: 'Family-occupied; loan fully offset',
    annual_rent: 0,
  },
  {
    ...base,
    id: 'p-palmtree-3',
    entity_id: 'e-harbor',
    address: '3 Palmtree Rd, Coastal Bay',
    value: 410_000,
    valuation_basis: 'Portal-led repeatable estimate, refreshed monthly',
    evidence_status: 'Carry-forward, no fresh estimate this month',
    role: 'Yield / cashflow contributor',
    annual_rent: 18_000,
  },
  {
    ...base,
    id: 'p-palmtree-5',
    entity_id: 'e-harbor',
    address: '5 Palmtree Rd, Coastal Bay',
    value: 405_000,
    valuation_basis: 'Portal-led repeatable estimate, refreshed monthly',
    evidence_status: 'Carry-forward, no fresh estimate this month',
    role: 'Yield / cashflow contributor',
    annual_rent: 17_500,
  },
];

const loans: Loan[] = [
  {
    ...base,
    id: 'l-bellview',
    property_id: 'p-bellview',
    balance: 749_870,
    offset_balance: 580_000,
    rate: 0.061,
    monthly_repayment: 4_400,
    rate_type: 'variable',
    review_date: null,
    notes: 'Main net-debt exposure; offset protection ratio ~77%.',
  },
  {
    ...base,
    id: 'l-grandview',
    property_id: 'p-grandview',
    balance: 150_000,
    offset_balance: 150_000,
    rate: 0.063,
    monthly_repayment: 0,
    rate_type: 'variable',
    review_date: null,
    notes: 'Fully offset.',
  },
  {
    ...base,
    id: 'l-palmtree-3',
    property_id: 'p-palmtree-3',
    balance: 160_000,
    offset_balance: 160_000,
    rate: 0.067,
    monthly_repayment: 0,
    rate_type: 'variable',
    review_date: null,
    notes: 'Fully offset; interest-only per current notes.',
  },
  {
    ...base,
    id: 'l-palmtree-5',
    property_id: 'p-palmtree-5',
    balance: 158_000,
    offset_balance: 158_000,
    rate: 0.067,
    monthly_repayment: 0,
    rate_type: 'variable',
    review_date: null,
    notes: 'Fully offset; interest-only per current notes.',
  },
];

const investmentHoldings: InvestmentHolding[] = [
  {
    ...base,
    id: 'h-msft',
    entity_id: 'e-personal',
    ticker: 'MSFT',
    market: 'US listed',
    currency: 'AUD',
    units: 12.5,
    native_value: 6_200,
    cost_basis: 5_100,
    as_of_date: '2025-07-01',
  },
  {
    ...base,
    id: 'h-voo',
    entity_id: 'e-harbor',
    ticker: 'VOO',
    market: 'US listed',
    currency: 'AUD',
    units: 40,
    native_value: 33_200,
    cost_basis: 30_900,
    as_of_date: '2025-07-01',
  },
  {
    ...base,
    id: 'h-btc',
    entity_id: 'e-personal',
    ticker: 'BTC',
    market: 'Ledger',
    currency: 'AUD',
    units: 1.05,
    native_value: 90_800,
    cost_basis: 72_500,
    as_of_date: '2025-07-01',
  },
];

const investmentTransactions: InvestmentTransaction[] = [
  { ...base, id: 't-1', date: '2025-01-10', ticker: 'MSFT', side: 'buy', currency: 'USD', units: 5, price: 380, amount: 1_900, amount_aud: 2_850, notes: 'Screenshot visible; USD converted at purchase-date FX' },
  { ...base, id: 't-2', date: '2025-01-22', ticker: 'VOO', side: 'buy', currency: 'USD', units: 10, price: 520, amount: 5_200, amount_aud: 7_800, notes: 'Screenshot visible; USD converted at purchase-date FX' },
  { ...base, id: 't-3', date: '2025-03-05', ticker: 'VOO', side: 'buy', currency: 'USD', units: 8, price: 530, amount: 4_240, amount_aud: 6_360, notes: 'Screenshot visible; USD converted at purchase-date FX' },
  { ...base, id: 't-4', date: '2025-06-12', ticker: 'BTC', side: 'buy', currency: 'AUD', units: 0.018, price: 83_333, amount: 1_500, amount_aud: 1_500, notes: 'Ledger purchase screenshot' },
];

// period, cash_saved, share_buys, btc_buys, debt_reduction, net_worth, cash_offsets,
// total_debt, net_debt, shares, btc_crypto, super_balance, total_assets, property_value, property_equity
const monthlyMetrics: MonthlyMetric[] = [
  m('2025-02', 1_200, 0, 0, 1_100, 2_615_900, 616_200, 1_223_300, 607_100, 38_000, 90_000, 210_000, 3_839_200, 2_885_000, 1_661_700),
  m('2025-03', 3_100, 0, 0, 1_050, 2_622_450, 619_300, 1_222_250, 602_950, 38_900, 91_500, 210_000, 3_844_700, 2_885_000, 1_662_750),
  m('2025-04', -400, 0, 0, 1_080, 2_618_530, 618_900, 1_221_170, 602_270, 37_600, 88_200, 210_000, 3_839_700, 2_885_000, 1_663_830),
  m('2025-05', 2_200, 0, 0, 1_020, 2_627_050, 621_100, 1_220_150, 599_050, 39_100, 92_000, 210_000, 3_847_200, 2_885_000, 1_664_850),
  m('2025-06', -250, 0, 1_500, 1_150, 2_630_550, 620_850, 1_219_000, 598_150, 38_700, 95_000, 210_000, 3_849_550, 2_885_000, 1_666_000),
  m('2025-07', 3_400, 0, 0, 1_130, 2_631_580, 624_250, 1_217_870, 593_620, 39_400, 90_800, 210_000, 3_849_450, 2_885_000, 1_667_130),
];

function m(
  period: string,
  cash_saved: number,
  share_buys: number,
  btc_buys: number,
  debt_reduction: number,
  net_worth: number,
  cash_offsets: number,
  total_debt: number,
  net_debt: number,
  shares: number,
  btc_crypto: number,
  super_balance: number,
  total_assets: number,
  property_value: number,
  property_equity: number
): MonthlyMetric {
  return {
    ...base,
    id: `mm-${period}`,
    period,
    cash_saved,
    share_buys,
    btc_buys,
    debt_reduction,
    net_worth,
    cash_offsets,
    total_debt,
    net_debt,
    shares,
    btc_crypto,
    super_balance,
    total_assets,
    property_value,
    property_equity,
    collectibles_value: 0,
  };
}

const evidenceItems: EvidenceItem[] = [
  { ...base, id: 'ev-cash', item: 'Cash and offsets', period: '2025-07', grade: 'screenshot', status: 'received', source: 'July screenshot', notes: 'Visible balances only; account identifiers excluded.' },
  { ...base, id: 'ev-loans', item: 'Loans', period: '2025-07', grade: 'screenshot', status: 'received', source: 'July screenshot', notes: 'Visible loan balances only; account identifiers excluded.' },
  { ...base, id: 'ev-btc', item: 'BTC / crypto', period: '2025-07', grade: 'screenshot', status: 'received', source: 'Ledger/app screenshot', notes: 'Management-grade value and units; not tax-grade.' },
  { ...base, id: 'ev-shares', item: 'Listed shares', period: '2025-07', grade: 'market_repriced', status: 'accepted', source: 'Prior accepted holdings + market quotes', notes: 'Holdings unchanged; repriced only.' },
  { ...base, id: 'ev-super', item: 'Super', period: '2025-07', grade: 'stale_carry_forward', status: 'missing', source: 'Prior statement', notes: 'Needs latest super statement for a decision-grade update.' },
  { ...base, id: 'ev-property', item: 'Property values', period: '2025-07', grade: 'stale_carry_forward', status: 'accepted', source: 'Prior portal-led estimate', notes: 'No fresh valuation supplied this month.' },
  { ...base, id: 'ev-watch', item: 'Collectible scenario (example watch)', period: '2025-07', grade: 'user_stated_scenario', status: 'partial', source: 'Example scenario', notes: '$2,500 example treated as a collectible/retained-asset purchase, not liquidity.' },
];

const decisions: Decision[] = [
  { ...base, id: 'd-liquidity', decision_area: 'Liquidity policy', question: 'Define the protected offset/cash minimum vs. deployable capital.', options: 'Fully protected / fully deployable / hybrid', recommended_position: 'Treat current cash as protected liquidity; deploy only new monthly surplus.', approval_status: 'clarified', owner_lens: 'kobe', decision_date: '2025-05-01', evidence_link: 'Operating note', follow_up_action: 'Review quarterly' },
  { ...base, id: 'd-super', decision_area: 'Super statement', question: 'Latest super statement is needed to move off carry-forward.', options: '', recommended_position: 'Request latest statement from provider.', approval_status: 'open', owner_lens: 'warren', decision_date: null, evidence_link: '', follow_up_action: 'Chase provider statement' },
  { ...base, id: 'd-collectible', decision_area: 'Collectible treatment', question: 'Confirm collectible purchases count as deployed surplus, not liquidity.', options: 'Count as liquidity / count as deployed surplus', recommended_position: 'Count as deployed surplus (retained asset).', approval_status: 'approved', owner_lens: 'rodney', decision_date: '2025-07-01', evidence_link: '', follow_up_action: 'Apply consistently in Free Cash Engine' },
  { ...base, id: 'd-access', decision_area: 'Access protection', question: 'This app holds sensitive net-worth data — confirm access protection before wider use.', options: 'Password-only / Supabase auth / no protection', recommended_position: 'Supabase auth required; keep source repo private.', approval_status: 'open', owner_lens: 'kobe', decision_date: null, evidence_link: '', follow_up_action: 'Confirm before sharing beyond the owner' },
  { ...base, id: 'd-valuation', decision_area: 'Property valuation refresh', question: 'Portal-led values are two months stale for the Coastal Bay properties.', options: 'Refresh now / carry forward', recommended_position: 'Refresh next month if portal data is available.', approval_status: 'open', owner_lens: 'dan', decision_date: null, evidence_link: '', follow_up_action: 'Pull a fresh portal estimate' },
];

const liquidityBuckets: LiquidityBucket[] = [
  { ...base, id: 'lb-protected', label: 'Protected offset-equivalent cash', amount: 624_250, protected_minimum: 580_000, purpose: 'Protected liquidity; economic hurdle is the anchor-property offset.', note: 'Still above the protected minimum.' },
  { ...base, id: 'lb-vehicle-cash', label: 'Harbor Bay Holdings cash subset', amount: 42_000, protected_minimum: 0, purpose: 'Included in the protected cash pool; do not double-count.', note: 'Investment-vehicle cash subset.' },
  { ...base, id: 'lb-monthly-surplus', label: 'Monthly disposable investable cashflow', amount: 8_000, protected_minimum: 0, purpose: 'Ongoing monthly surplus available for deployment once the protected-liquidity rule is met.', note: 'Planning range only, not a spend budget.' },
  { ...base, id: 'lb-deployable-today', label: 'Deployable opportunity capital today', amount: 0, protected_minimum: 0, purpose: 'One-off deployable cash above the protected minimum.', note: 'Keep at zero until total cash exceeds the protected minimum.' },
];

const agentMessages: AgentMessage[] = [
  {
    ...base,
    id: 'am-1',
    sender_type: 'agent',
    sender_label: 'Kobe',
    body: 'July month close is ready for review. Cash and debt evidence is screenshot-grade; super is still carry-forward from last month.',
    status: 'unread',
    linked_decision_id: null,
    linked_period: '2025-07',
  },
  {
    ...base,
    id: 'am-2',
    sender_type: 'user',
    sender_label: 'Alex',
    body: 'Noted. Chase the latest super statement when you get a chance.',
    status: 'processed',
    linked_decision_id: 'd-super',
    linked_period: null,
  },
  {
    ...base,
    id: 'am-3',
    sender_type: 'agent',
    sender_label: 'Warren',
    body: 'VOO position is now the largest single holding at 33.2k -- still inside the shares target band, flagging for visibility only.',
    status: 'unread',
    linked_decision_id: null,
    linked_period: '2025-07',
  },
];

// Generic default bands -- standard-looking policy percentages, not personal
// figures. Same values the Asset Allocation screen previously hardcoded.
const allocationPolicies: AllocationPolicy[] = [
  { ...base, id: 'ap-property', asset_class: 'property', target_min: 0.35, target_base: 0.5, target_max: 0.65 },
  { ...base, id: 'ap-cash', asset_class: 'cash', target_min: 0.1, target_base: 0.2, target_max: 0.35 },
  { ...base, id: 'ap-shares', asset_class: 'shares', target_min: 0.05, target_base: 0.15, target_max: 0.3 },
  { ...base, id: 'ap-btc', asset_class: 'btc', target_min: 0, target_base: 0.05, target_max: 0.1 },
  { ...base, id: 'ap-super', asset_class: 'super', target_min: 0.1, target_base: 0.15, target_max: 0.25 },
  { ...base, id: 'ap-collectibles', asset_class: 'collectibles', target_min: 0, target_base: 0, target_max: 0.05 },
];

const riskPolicies: RiskPolicy[] = [
  { ...base, id: 'rp-debt-assets', metric_key: 'debt_assets', green_threshold: 0.4, amber_threshold: 0.5, direction: 'lower_better' },
  { ...base, id: 'rp-netdebt-nw', metric_key: 'net_debt_nw', green_threshold: 0.2, amber_threshold: 0.3, direction: 'lower_better' },
  { ...base, id: 'rp-property-nw', metric_key: 'property_equity_nw', green_threshold: 0.5, amber_threshold: 0.65, direction: 'lower_better' },
  { ...base, id: 'rp-cash-nw', metric_key: 'cash_nw', green_threshold: 0.15, amber_threshold: 0.1, direction: 'higher_better' },
  { ...base, id: 'rp-crypto-nw', metric_key: 'crypto_nw', green_threshold: 0.05, amber_threshold: 0.1, direction: 'lower_better' },
  { ...base, id: 'rp-shares-nw', metric_key: 'shares_nw', green_threshold: 0.1, amber_threshold: 0.05, direction: 'higher_better' },
  { ...base, id: 'rp-liquidity-coverage', metric_key: 'protected_liquidity_coverage', green_threshold: 1.0, amber_threshold: 0.95, direction: 'higher_better' },
];

export function loadDemoData(): CadenceFinancialData {
  return {
    entities,
    properties,
    loans,
    investment_holdings: investmentHoldings,
    investment_transactions: investmentTransactions,
    monthly_metrics: monthlyMetrics,
    evidence_items: evidenceItems,
    decisions,
    liquidity_buckets: liquidityBuckets,
    agent_messages: agentMessages,
    allocation_policies: allocationPolicies,
    risk_policies: riskPolicies,
  };
}
