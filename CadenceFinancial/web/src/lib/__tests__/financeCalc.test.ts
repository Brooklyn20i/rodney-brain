import { describe, expect, it } from 'vitest';
import { investmentBuysSummary, latestMonth, netWorthBridge, summarizePeriod } from '../financeCalc';
import type { InvestmentTransaction, MonthlyMetric } from '../types';

// Fictional fixture data only -- see CadenceFinancial/AGENTS.md for why.
// These numbers are hand-computed, not real figures; they exercise the same
// formula shapes already validated by the Python prototype's test_core.py.
function month(overrides: Partial<MonthlyMetric> & Pick<MonthlyMetric, 'period'>): MonthlyMetric {
  return {
    id: overrides.period,
    owner_id: 'demo-owner',
    cash_saved: 0,
    share_buys: 0,
    btc_buys: 0,
    debt_reduction: 0,
    net_worth: 0,
    cash_offsets: 0,
    total_debt: 0,
    net_debt: 0,
    shares: 0,
    btc_crypto: 0,
    super_balance: 0,
    total_assets: 0,
    property_value: 0,
    property_equity: 0,
    collectibles_value: 0,
    created_at: '',
    updated_at: '',
    deleted_at: null,
    ...overrides,
  };
}

const months: MonthlyMetric[] = [
  month({ period: '2025-02', cash_saved: 1000, debt_reduction: 200, net_worth: 500000 }),
  month({ period: '2025-03', cash_saved: 2000, debt_reduction: 200, net_worth: 502300 }),
  month({ period: '2025-04', cash_saved: -500, debt_reduction: 200, net_worth: 501000 }),
  month({ period: '2025-05', cash_saved: 1500, debt_reduction: 200, net_worth: 505000 }),
  month({ period: '2025-06', cash_saved: -300, btc_buys: 1000, debt_reduction: 200, net_worth: 507000 }),
  month({ period: '2025-07', cash_saved: 2000, debt_reduction: 200, net_worth: 506000 }),
];

describe('summarizePeriod', () => {
  it('computes free cash generated and all-in surplus across the period', () => {
    const summary = summarizePeriod(months, '2025-02', '2025-07');

    expect(summary.months).toBe(6);
    expect(summary.cashSaved).toBeCloseTo(5700, 2);
    expect(summary.investmentBuys).toBeCloseTo(1000, 2);
    expect(summary.freeCashGenerated).toBeCloseTo(6700, 2);
    expect(summary.debtReduction).toBeCloseTo(1200, 2);
    expect(summary.allInSurplus).toBeCloseTo(7900, 2);
    expect(summary.freeCashMonthlyAverage).toBeCloseTo(1116.67, 2);
    expect(summary.allInMonthlyAverage).toBeCloseTo(1316.67, 2);
  });

  it('treats a collectible/retained-asset purchase as deployed surplus, not liquidity', () => {
    const summary = summarizePeriod(months, '2025-02', '2025-07', 2500);

    expect(summary.freeCashPlusCollectibles).toBeCloseTo(9200, 2);
    expect(summary.allInPlusCollectibles).toBeCloseTo(10400, 2);
    expect(summary.freeCashPlusCollectiblesMonthlyAverage).toBeCloseTo(1533.33, 2);
    expect(summary.allInPlusCollectiblesMonthlyAverage).toBeCloseTo(1733.33, 2);
  });

  it('throws when no months fall inside the requested period', () => {
    expect(() => summarizePeriod(months, '2020-01', '2020-02')).toThrow();
  });
});

describe('latestMonth', () => {
  it('returns the most recent period regardless of input order', () => {
    const shuffled = [months[3], months[0], months[5], months[1]];
    expect(latestMonth(shuffled).period).toBe('2025-07');
  });
});

describe('netWorthBridge', () => {
  it('separates operating progress from market movement as a residual', () => {
    const prior = months.find((m) => m.period === '2025-06')!;
    const current = months.find((m) => m.period === '2025-07')!;

    const bridge = netWorthBridge(prior, current);

    expect(bridge.openingNetWorth).toBe(507000);
    expect(bridge.closingNetWorth).toBe(506000);
    expect(bridge.netWorthMovement).toBeCloseTo(-1000, 2);
    expect(bridge.operatingCashAndDebt).toBeCloseTo(2200, 2);
    // Net worth fell 1,000 even though operating activity was +2,200 --
    // the gap must show up entirely as market/other movement.
    expect(bridge.marketAndOtherMovement).toBeCloseTo(-3200, 2);
    expect(bridge.operatingCashAndDebt + bridge.marketAndOtherMovement).toBeCloseTo(
      bridge.netWorthMovement,
      2
    );
  });
});

describe('investmentBuysSummary', () => {
  const transactions: InvestmentTransaction[] = [
    tx({ date: '2025-01-15', ticker: 'ABC', side: 'buy', amount: 500 }),
    tx({ date: '2025-01-20', ticker: 'ABC', side: 'buy', amount: 300 }),
    tx({ date: '2025-03-01', ticker: 'ABC', side: 'sell', amount: 100 }),
    tx({ date: '2025-06-10', ticker: 'BTC', side: 'buy', amount: 1000 }),
    tx({ date: '2025-07-05', ticker: 'XYZ', side: 'buy', amount: 200 }),
  ];

  it('separates share buys from BTC buys and ignores sells', () => {
    const summary = investmentBuysSummary(transactions, '2025-01', '2025-07');

    expect(summary.shares).toBeCloseTo(1000, 2);
    expect(summary.btc).toBeCloseTo(1000, 2);
    expect(summary.total).toBeCloseTo(2000, 2);
    expect(summary.activeMonths).toBe(3);
  });
});

function tx(overrides: Partial<InvestmentTransaction> & Pick<InvestmentTransaction, 'date' | 'ticker' | 'side' | 'amount'>): InvestmentTransaction {
  return {
    id: `${overrides.date}-${overrides.ticker}-${overrides.side}`,
    owner_id: 'demo-owner',
    currency: 'AUD',
    units: 0,
    price: 0,
    notes: '',
    created_at: '',
    updated_at: '',
    deleted_at: null,
    ...overrides,
  };
}
