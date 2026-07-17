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
  BudgetCategory,
  BudgetFxRate,
  InvestmentThesis,
  StrategyItem,
  Watch,
  BudgetLine,
  CadenceFinancialData,
  Decision,
  Entity,
  EstateItem,
  EvidenceItem,
  Goal,
  InsurancePolicy,
  InvestmentHolding,
  InvestmentIncome,
  InvestmentTransaction,
  LiquidityBucket,
  Loan,
  MonthlyMetric,
  Property,
  PropertyLedgerEntry,
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
    purchase_price: 980_000,
    purchase_date: '2018-03-15',
    cash_invested: 245_000,
    land_value: 720_000,
    depreciation_annual: 8_500,
    property_type: 'house',
    bedrooms: 4,
    bathrooms: 2,
    car_spaces: 2,
    land_size_sqm: 650,
    ownership_share: 1,
    weekly_rent: 810,
    lease_start: '2025-02-01',
    lease_end: '2026-01-31',
    tenant: 'Fictional tenant (12-month lease)',
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
    purchase_price: 430_000,
    purchase_date: '2015-07-01',
    cash_invested: 110_000,
    land_value: 380_000,
    depreciation_annual: 0,
    property_type: 'house',
    bedrooms: 3,
    bathrooms: 1,
    car_spaces: 1,
    land_size_sqm: 520,
    ownership_share: 1,
    weekly_rent: 0,
    lease_start: null,
    lease_end: null,
    tenant: 'Owner-occupied',
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
    purchase_price: 335_000,
    purchase_date: '2020-09-10',
    cash_invested: 92_000,
    land_value: 180_000,
    depreciation_annual: 6_200,
    property_type: 'unit',
    bedrooms: 2,
    bathrooms: 1,
    car_spaces: 1,
    land_size_sqm: 0,
    ownership_share: 1,
    weekly_rent: 346,
    lease_start: '2024-11-01',
    lease_end: '2025-10-31',
    tenant: 'Fictional tenant (periodic)',
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
    purchase_price: 330_000,
    purchase_date: '2020-09-10',
    cash_invested: 90_000,
    land_value: 175_000,
    depreciation_annual: 6_000,
    property_type: 'unit',
    bedrooms: 2,
    bathrooms: 1,
    car_spaces: 1,
    land_size_sqm: 0,
    ownership_share: 1,
    weekly_rent: 337,
    lease_start: '2025-03-01',
    lease_end: '2026-02-28',
    tenant: 'Fictional tenant (12-month lease)',
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

const investmentIncome: InvestmentIncome[] = [
  {
    ...base,
    id: 'ii-wire-dividend',
    entity_id: 'e-harbor',
    holding_id: null,
    payment_date: '2025-07-16',
    ticker: 'WIRE',
    income_kind: 'dividend',
    currency: 'AUD',
    gross_amount: 123.45,
    withholding_tax: 0,
    franking_credit: 0,
    net_amount: 123.45,
    amount_aud: 123.45,
    source: 'Demo broker cash statement',
    external_ref: 'demo-wire-dividend-2025-07-16',
    notes: 'Fictional dividend fixture; not real brokerage data.',
  },
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
  { ...base, id: 'lb-protected', label: 'Protected offset-equivalent cash', amount: 624_250, protected_minimum: 580_000, interest_rate: 0, tax_treatment: 'offset', entity_id: 'e-joint', purpose: 'Protected liquidity; economic hurdle is the anchor-property offset.', note: 'Still above the protected minimum.' },
  { ...base, id: 'lb-vehicle-cash', label: 'Harbor Bay Holdings high-interest cash', amount: 42_000, protected_minimum: 0, interest_rate: 0.0465, tax_treatment: 'taxable', entity_id: 'e-harbor', purpose: 'Investment-vehicle savings account; taxable interest, owned by the vehicle not the individual.', note: 'Earning a headline rate — not offset cash.' },
  { ...base, id: 'lb-monthly-surplus', label: 'Monthly disposable investable cashflow', amount: 8_000, protected_minimum: 0, interest_rate: 0, tax_treatment: 'offset', entity_id: null, purpose: 'Ongoing monthly surplus available for deployment once the protected-liquidity rule is met.', note: 'Planning range only, not a spend budget.' },
  { ...base, id: 'lb-deployable-today', label: 'Deployable opportunity capital today', amount: 0, protected_minimum: 0, interest_rate: 0, tax_treatment: 'offset', entity_id: null, purpose: 'One-off deployable cash above the protected minimum.', note: 'Keep at zero until total cash exceeds the protected minimum.' },
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

const goals: Goal[] = [
  {
    ...base,
    id: 'g-fi',
    label: 'Financial independence',
    target_net_worth: 4_000_000,
    target_date: '2035-12-31',
    assumed_growth_rate: 0.05,
    notes: 'Illustrative target for the demo scenario; growth assumption is a planning input, not a forecast.',
  },
];

const insurancePolicies: InsurancePolicy[] = [
  { ...base, id: 'ip-life', category: 'life', insurer: 'Example Mutual', policy_label: 'Life cover — Alex', cover_amount: 1_000_000, premium_annual: 1_450, renewal_date: '2025-11-01', status: 'active', notes: 'Held inside super.' },
  { ...base, id: 'ip-income', category: 'income_protection', insurer: 'Example Mutual', policy_label: 'Income protection — Alex', cover_amount: 120_000, premium_annual: 2_100, renewal_date: '2025-11-01', status: 'under_review', notes: 'Benefit period under review at renewal.' },
  { ...base, id: 'ip-landlord', category: 'landlord', insurer: 'Sample Insurance Co', policy_label: 'Landlord cover — Coastal Bay pair', cover_amount: 850_000, premium_annual: 1_900, renewal_date: '2026-02-15', status: 'active', notes: 'Covers both Palmtree Rd properties.' },
];

const estateItems: EstateItem[] = [
  { ...base, id: 'es-will', item_key: 'will', label: 'Will', status: 'executed', last_reviewed: '2023-08-10', notes: 'Review due after any major asset change.' },
  { ...base, id: 'es-poa-fin', item_key: 'poa_financial', label: 'Power of attorney — financial', status: 'executed', last_reviewed: '2023-08-10', notes: '' },
  { ...base, id: 'es-poa-med', item_key: 'poa_medical', label: 'Power of attorney — medical', status: 'missing', last_reviewed: null, notes: 'Not yet drafted.' },
  { ...base, id: 'es-super-nom', item_key: 'super_binding_nomination', label: 'Super binding death nomination', status: 'review_due', last_reviewed: '2022-05-01', notes: 'Binding nominations lapse after 3 years.' },
];

// Per-property monthly ledger. Built with a small generator so three months
// of realistic statements don't take 150 hand-written lines. Grandview is
// owner-occupied (no rent) so it isn't tenanted here. All fictional.
const propertyLedger: PropertyLedgerEntry[] = (() => {
  const rows: PropertyLedgerEntry[] = [];
  let n = 0;
  const add = (
    property_id: string,
    period: string,
    category: PropertyLedgerEntry['category'],
    amount: number,
    grade: PropertyLedgerEntry['grade'] = 'statement',
    source = ''
  ) => {
    rows.push({ ...base, id: `pl-${++n}`, property_id, period, entry_date: `${period}-05`, category, amount, grade, source, notes: '' });
  };

  const months = ['2025-05', '2025-06', '2025-07'];
  // [property, monthly rent, interest, insurance, strata, water, council, mgmt%]
  const specs: [string, number, number, number, number, number, number, number][] = [
    ['p-bellview', 3_500, 870, 150, 0, 42, 180, 0.05],
    ['p-palmtree-3', 1_500, 0, 90, 320, 35, 140, 0.05],
    ['p-palmtree-5', 1_458, 0, 90, 310, 35, 135, 0.05],
  ];
  for (const [pid, rent, interest, insurance, strata, water, council, mgmtPct] of specs) {
    for (const period of months) {
      add(pid, period, 'rent', rent, 'statement', 'Managing agent rent statement');
      if (interest > 0) add(pid, period, 'interest', interest, 'statement', 'Loan interest (offset-reduced)');
      add(pid, period, 'insurance', insurance, 'statement', 'Landlord policy monthly accrual');
      if (strata > 0) add(pid, period, 'strata', strata, 'statement', 'Quarterly strata levy / 3');
      add(pid, period, 'water', water, 'statement', 'Water usage + service');
      add(pid, period, 'council_rates', council, 'statement', 'Council rates / 12');
      add(pid, period, 'management_fees', Math.round(rent * mgmtPct), 'statement', 'Agent management fee');
    }
  }
  // A one-off repair pushes Palmtree #3 to a monthly loss in July.
  add('p-palmtree-3', '2025-07', 'repairs_maintenance', 3_500, 'statement', 'Hot water system replacement');
  return rows;
})();

// Macro budget — fictional per-month plan. Income in (incl. a EUR salary),
// payments out, one EUR→AUD rate, and a one-off December bonus.
const bgBase = { ...base, currency: 'AUD', start_month: null, end_month: null };
const budgetLines: BudgetLine[] = [
  { ...bgBase, id: 'bg-salary', kind: 'income', category: 'salary', label: 'Salary (after tax)', amount: 6_200, currency: 'EUR', frequency: 'monthly', active: true, sort_order: 0, notes: 'Paid in EUR.' },
  { ...bgBase, id: 'bg-rent-income', kind: 'income', category: 'rental_income', label: 'Rental income (net of agent)', amount: 1_450, frequency: 'weekly', active: true, sort_order: 1, notes: 'AUD, across the property portfolio.' },
  { ...bgBase, id: 'bg-interest', kind: 'income', category: 'interest', label: 'Offset / savings interest', amount: 4_800, frequency: 'annual', active: true, sort_order: 2, notes: '' },
  { ...bgBase, id: 'bg-dividends', kind: 'income', category: 'dividends', label: 'Share dividends', amount: 2_100, frequency: 'quarterly', active: true, sort_order: 3, notes: '' },
  { ...bgBase, id: 'bg-bonus', kind: 'income', category: 'salary', label: 'Annual bonus', amount: 18_000, currency: 'EUR', frequency: 'one_off', start_month: '2025-12', active: true, sort_order: 4, notes: 'One-off, December.' },
  { ...bgBase, id: 'bg-mortgage', kind: 'expense', category: 'mortgage', label: 'Home + investment mortgages', amount: 7_800, frequency: 'monthly', active: true, sort_order: 5, notes: 'Interest + principal across loans.' },
  { ...bgBase, id: 'bg-cards', kind: 'expense', category: 'credit_card', label: 'Credit cards (paid in full)', amount: 2_600, frequency: 'monthly', active: true, sort_order: 6, notes: '' },
  { ...bgBase, id: 'bg-utilities', kind: 'expense', category: 'utilities', label: 'Power, water, internet, phone', amount: 720, frequency: 'monthly', active: true, sort_order: 7, notes: '' },
  { ...bgBase, id: 'bg-insurance', kind: 'expense', category: 'insurance', label: 'Insurances (life, home, motor)', amount: 5_400, frequency: 'annual', active: true, sort_order: 8, notes: '' },
  { ...bgBase, id: 'bg-subs', kind: 'expense', category: 'subscriptions', label: 'Subscriptions', amount: 180, frequency: 'monthly', active: true, sort_order: 9, notes: '' },
  { ...bgBase, id: 'bg-living', kind: 'expense', category: 'living', label: 'Groceries, fuel, everyday', amount: 900, frequency: 'fortnightly', active: true, sort_order: 10, notes: '' },
];

const budgetCategories: BudgetCategory[] = [
  { ...base, id: 'bc-consulting', kind: 'income', key: 'consulting', label: 'Consulting / side work', sort_order: 0 },
];

const budgetFxRates: BudgetFxRate[] = [
  { ...base, id: 'fx-eur', currency: 'EUR', rate_to_aud: 1.64 },
];

const investmentTheses: InvestmentThesis[] = [
  { ...base, id: 'th-anchor', target_kind: 'property', target_id: 'prop-anchor', target_label: 'Anchor PPOR',
    driver: 'AU property', role: 'Ballast / future home', thesis: 'Inner-city land scarcity; future primary residence.',
    kill_criteria: 'Structural shift in city fundamentals or a forced-sale liquidity need.', conviction: 'core',
    status: 'intact', conviction_score: 8, is_structural: false, review_frequency_months: 6,
    last_reviewed: '2026-07-01', next_review_date: '2027-01-01' },
  { ...base, id: 'th-btc', target_kind: 'holding', target_id: 'inv-btc', target_label: 'BTC (self-custody)',
    driver: 'Crypto / digital gold', role: 'Convex growth', thesis: 'Asymmetric store-of-value; sized small.',
    kill_criteria: 'Position exceeds 10% of net worth (trim) or thesis-level regulatory break.', conviction: 'hold',
    status: 'intact', conviction_score: 7, is_structural: false, review_frequency_months: 3,
    last_reviewed: '2026-07-01', next_review_date: '2026-10-01' },
  { ...base, id: 'th-family', target_kind: 'property', target_id: 'prop-family', target_label: 'Family home (parents)',
    driver: 'Family commitment', role: 'Not an investment', thesis: 'Housing for family — a commitment, not a return.',
    kill_criteria: 'N/A — never for sale.', conviction: 'hold', status: 'intact', conviction_score: null,
    is_structural: true, review_frequency_months: 12, last_reviewed: null, next_review_date: null },
];


const strategyItems: StrategyItem[] = [
  { ...base, id: 'st-1', section: 'now', title: 'Confirm insurance schedule with broker', detail: 'Landlord policy for the second Coastal Bay unit | Confirm home policy is landlord-rated', due_date: '2026-06-28', done: false, done_at: null },
  { ...base, id: 'st-2', section: 'now', title: 'Open savings ladder + notify bank', detail: 'At-call + TDs, maturities before the move date', due_date: '2026-07-31', done: false, done_at: null },
  { ...base, id: 'st-3', section: 'tranche', title: 'Tranche 1: index fund + gold', detail: 'Placed by the trustee from vehicle cash', due_date: '2026-08-05', done: false, done_at: null },
  { ...base, id: 'st-buy', section: 'monthly', title: 'Monthly buys — this month ($8k)', detail: '$4,000 -> global index fund | $2,000 -> gold ETC | $2,000 -> savings ladder | Do NOT draw on the offset', due_date: '2026-07-03', done: false, done_at: null },
  { ...base, id: 'st-buy2', section: 'monthly', title: 'Monthly buys — next month ($8k)', detail: '$4,000 -> global index fund | $2,000 -> gold ETC | $2,000 -> savings ladder', due_date: '2026-08-03', done: false, done_at: null },
  { ...base, id: 'st-cal1', section: 'calendar', title: 'QUARTERLY CHECK — automated', detail: 'Fires itself: drift vs bands, decisions, personal-risk checklist.', due_date: '2026-08-15', done: false, done_at: null },
  { ...base, id: 'st-cal2', section: 'calendar', title: 'Refinance review before restructure', detail: 'Shop both investment loans while fully offset.', due_date: '2027-10-15', done: false, done_at: null },
];

const watchBase = { ...base, currency: 'AUD', value_as_of: '2025-07-01', valuation_source: 'Demo market comp', deleted_at: null };
const watches: Watch[] = [
  {
    ...watchBase,
    id: 'w-aurora',
    brand: 'Aurora',
    model: 'Moonphase Calendar',
    reference: 'AUR-39-MP',
    nickname: 'Blue moon',
    year: 2021,
    collection_role: 'permanent',
    ownership_status: 'owned',
    purchase_price: 8_200,
    purchase_date: '2022-04-12',
    current_value: 9_100,
    insurance_value: 10_000,
    full_set_status: 'full',
    accessories: 'Outer box, warranty card, spare strap and manual.',
    material: 'Steel',
    dial: 'Blue guilloché',
    service_history: 'Pressure test 2025; full service not yet due.',
    provenance: 'Authorised dealer receipt retained.',
    insurance_notes: 'Insured schedule value to review annually.',
    storage_location: 'Home safe.',
    security_notes: 'Away-from-home rider pending review.',
    notes: 'Fictional permanent keeper used for demo collection control.',
    sentimental: true,
    external_ref: 'demo-watch-aurora-moonphase',
  },
  {
    ...watchBase,
    id: 'w-northstar',
    brand: 'Northstar',
    model: 'Diver 200',
    reference: 'NSD-200-BK',
    nickname: 'Weekend diver',
    year: 2023,
    collection_role: 'rotation',
    ownership_status: 'owned',
    purchase_price: 3_400,
    purchase_date: '2023-10-05',
    current_value: 3_050,
    insurance_value: null,
    full_set_status: 'partial',
    accessories: 'Box and spare links; warranty card missing in demo scenario.',
    material: 'Steel',
    dial: 'Black',
    service_history: '',
    provenance: 'Demo private purchase; seller details intentionally fictional.',
    insurance_notes: 'Insurance value missing — demo data gap.',
    storage_location: 'Watch roll when travelling.',
    security_notes: 'Keep in hotel safe when not worn.',
    notes: 'Useful wear-test row with an insurance data gap.',
    sentimental: false,
    external_ref: 'demo-watch-northstar-diver',
  },
  {
    ...watchBase,
    id: 'w-voyager',
    brand: 'Voyager',
    model: 'GMT 41',
    reference: 'VYG-GMT-41',
    nickname: 'Trade candidate',
    year: 2020,
    collection_role: 'exit_trade',
    ownership_status: 'owned',
    purchase_price: 6_750,
    purchase_date: '2021-02-20',
    current_value: null,
    value_as_of: null,
    insurance_value: 6_500,
    full_set_status: 'full',
    accessories: 'Full set plus spare links.',
    material: 'Steel',
    dial: 'Black',
    service_history: 'Service unknown — verify before listing.',
    provenance: 'Original papers scanned in demo scenario.',
    insurance_notes: 'Insured value carried until sale/trade decision.',
    storage_location: 'Home safe pending exit decision.',
    security_notes: 'Needs photos and condition notes before any exit decision.',
    notes: 'Owned, but deliberately marked as exit/trade to exercise workflow.',
    sentimental: false,
    external_ref: 'demo-watch-voyager-gmt',
  },
  {
    ...watchBase,
    id: 'w-atelier-candidate',
    brand: 'Atelier',
    model: 'Annual Calendar',
    reference: 'AT-AC-38',
    nickname: 'Future calendar',
    year: null,
    collection_role: 'future',
    ownership_status: 'candidate',
    purchase_price: null,
    purchase_date: null,
    current_value: 18_000,
    insurance_value: null,
    full_set_status: 'unknown',
    accessories: '',
    material: 'Rose gold',
    dial: 'Silver',
    service_history: '',
    provenance: 'Candidate only — never counted in owned value.',
    insurance_notes: '',
    storage_location: '',
    security_notes: '',
    notes: 'Fictional future target so candidates do not inflate collection totals.',
    sentimental: false,
    external_ref: 'demo-watch-atelier-future',
  },
];

export function loadDemoData(): CadenceFinancialData {
  return {
    entities,
    properties,
    loans,
    investment_holdings: investmentHoldings,
    investment_transactions: investmentTransactions,
    investment_income: investmentIncome,
    monthly_metrics: monthlyMetrics,
    evidence_items: evidenceItems,
    decisions,
    liquidity_buckets: liquidityBuckets,
    agent_messages: agentMessages,
    allocation_policies: allocationPolicies,
    risk_policies: riskPolicies,
    goals,
    insurance_policies: insurancePolicies,
    estate_items: estateItems,
    property_ledger: propertyLedger,
    budget_lines: budgetLines,
    budget_categories: budgetCategories,
    budget_fx_rates: budgetFxRates,
    investment_theses: investmentTheses,
    thesis_notes: [],
    strategy_items: strategyItems,
    watches,
  };
}
