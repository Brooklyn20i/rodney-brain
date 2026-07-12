import { describe, expect, it } from 'vitest';
import {
  deriveNewMonth,
  financialYearForPeriod,
  investmentBucketForHolding,
  investmentBuysSummary,
  investmentPerformanceSummary,
  latestMonth,
  netWorthBridge,
  nextPeriod,
  performanceHistory,
  summarizePeriod,
} from '../financeCalc';
import type { BudgetFxRate, InvestmentHolding, InvestmentTransaction, MonthlyMetric } from '../types';

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

describe('nextPeriod', () => {
  it('advances within a year and across a year boundary', () => {
    expect(nextPeriod('2025-07')).toBe('2025-08');
    expect(nextPeriod('2025-09')).toBe('2025-10');
    expect(nextPeriod('2025-12')).toBe('2026-01');
  });
});

describe('deriveNewMonth', () => {
  // Hand-computed fixture: fictional balances only.
  const prior = month({
    period: '2025-07',
    cash_offsets: 620_000,
    total_debt: 1_218_000,
    net_worth: 2_631_580,
  });

  const inputs = {
    period: '2025-08',
    cash_offsets: 623_500, // +3,500 saved
    total_debt: 1_216_800, // 1,200 principal paid down
    shares: 40_000,
    btc_crypto: 88_000,
    super_balance: 210_000,
    property_value: 2_885_000,
    collectibles_value: 2_500,
    share_buys: 1_000,
    btc_buys: 0,
  };

  it('derives movement and balance-sheet fields from closing balances', () => {
    const m = deriveNewMonth(prior, inputs);

    expect(m.period).toBe('2025-08');
    expect(m.cash_saved).toBeCloseTo(3_500, 2);
    expect(m.debt_reduction).toBeCloseTo(1_200, 2);
    expect(m.net_debt).toBeCloseTo(1_216_800 - 623_500, 2);
    expect(m.property_equity).toBeCloseTo(2_885_000 - 1_216_800, 2);
    // total assets = cash + property + shares + crypto + super + collectibles
    const expectedAssets = 623_500 + 2_885_000 + 40_000 + 88_000 + 210_000 + 2_500;
    expect(m.total_assets).toBeCloseTo(expectedAssets, 2);
    expect(m.net_worth).toBeCloseTo(expectedAssets - 1_216_800, 2);
    expect(m.share_buys).toBe(1_000);
    expect(m.btc_buys).toBe(0);
  });

  it('produces a row whose bridge reconciles against the prior month', () => {
    const derived = deriveNewMonth(prior, inputs);
    const asMetric = month({ ...derived, period: derived.period });
    const bridge = netWorthBridge(prior, asMetric);
    expect(bridge.operatingCashAndDebt + bridge.marketAndOtherMovement).toBeCloseTo(
      bridge.netWorthMovement,
      2
    );
    // Operating = 3,500 saved + 1,200 debt + 1,000 share buys
    expect(bridge.operatingCashAndDebt).toBeCloseTo(5_700, 2);
  });

  it('handles negative months (cash spent, debt drawn) with correct signs', () => {
    const m = deriveNewMonth(prior, {
      ...inputs,
      cash_offsets: 615_000, // spent 5,000
      total_debt: 1_220_000, // drew 2,000 more debt
    });
    expect(m.cash_saved).toBeCloseTo(-5_000, 2);
    expect(m.debt_reduction).toBeCloseTo(-2_000, 2);
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

  it('sums the AUD-equivalent amount, not the native-currency amount, for foreign-currency buys', () => {
    const mixedCurrency: InvestmentTransaction[] = [
      tx({ date: '2025-02-01', ticker: 'AUDCO', side: 'buy', currency: 'AUD', amount: 100 }),
      // A USD buy where the native amount (100) would silently equal the AUD
      // one above if summed directly -- amount_aud is what must be used.
      tx({ date: '2025-02-05', ticker: 'USDCO', side: 'buy', currency: 'USD', amount: 100, amount_aud: 150 }),
    ];

    const summary = investmentBuysSummary(mixedCurrency, '2025-02', '2025-02');

    expect(summary.shares).toBeCloseTo(250, 2); // 100 (AUD) + 150 (USD converted), not 200
  });
});

function tx(overrides: Partial<InvestmentTransaction> & Pick<InvestmentTransaction, 'date' | 'ticker' | 'side' | 'amount'>): InvestmentTransaction {
  return {
    id: `${overrides.date}-${overrides.ticker}-${overrides.side}`,
    owner_id: 'demo-owner',
    currency: 'AUD',
    units: 0,
    price: 0,
    amount_aud: overrides.amount, // default: same currency, override to test FX conversion
    notes: '',
    created_at: '',
    updated_at: '',
    deleted_at: null,
    ...overrides,
  };
}

describe('performanceHistory', () => {
  it('attributes each month and reconciles cumulatively: operating + market = total', () => {
    const history = performanceHistory(months)!;

    // 5 bridge rows for 6 months of data.
    expect(history.rows).toHaveLength(5);
    history.rows.forEach((r) => expect(r.operating + r.market).toBeCloseTo(r.total, 2));

    // Cumulative totals reconcile with the end-to-end net worth movement.
    expect(history.openingNetWorth).toBeCloseTo(500000, 2);
    expect(history.closingNetWorth).toBeCloseTo(506000, 2);
    expect(history.totalMovement).toBeCloseTo(6000, 2);
    expect(history.operatingTotal + history.marketTotal).toBeCloseTo(history.totalMovement, 2);

    // Hand-computed: operating Mar..Jul = (2000+200)+(-500+200)+(1500+200)+(-300+1000+200)+(2000+200) = 6700.
    expect(history.operatingTotal).toBeCloseTo(6700, 2);
    expect(history.marketTotal).toBeCloseTo(-700, 2);
    expect(history.operatingShare).toBeCloseTo(6700 / 6000, 4);
  });

  it('returns null with fewer than two months', () => {
    expect(performanceHistory(months.slice(0, 1))).toBeNull();
    expect(performanceHistory([])).toBeNull();
  });
});

function holding(overrides: Partial<InvestmentHolding> & Pick<InvestmentHolding, 'ticker'>): InvestmentHolding {
  return {
    id: overrides.ticker,
    owner_id: 'demo-owner',
    entity_id: null,
    market: 'Stake',
    currency: 'AUD',
    units: 1,
    native_value: 0,
    cost_basis: 0,
    as_of_date: '2026-07-12',
    created_at: '',
    updated_at: '',
    deleted_at: null,
    ...overrides,
  };
}

function fx(currency: string, rate: number): BudgetFxRate {
  return { id: currency, owner_id: 'demo-owner', currency, rate_to_aud: rate, created_at: '', updated_at: '', deleted_at: null };
}

describe('investment performance summary', () => {
  it('uses Australian financial years, starting in July', () => {
    expect(financialYearForPeriod('2026-07')).toEqual({ label: 'FY2027 YTD', start: '2026-07', openingPeriod: '2026-06' });
    expect(financialYearForPeriod('2026-06')).toEqual({ label: 'FY2026 YTD', start: '2025-07', openingPeriod: '2025-06' });
  });

  it('classifies BTC/VBTC separately from shares and gold', () => {
    expect(investmentBucketForHolding(holding({ ticker: 'BTC', market: 'Ledger' }))).toBe('crypto');
    expect(investmentBucketForHolding(holding({ ticker: 'VBTC', market: 'Stake Aus' }))).toBe('crypto');
    expect(investmentBucketForHolding(holding({ ticker: 'PMGOLD', market: 'Stake Aus' }))).toBe('other');
    expect(investmentBucketForHolding(holding({ ticker: 'GOOG', market: 'Stake Wall St' }))).toBe('shares');
  });

  it('summarises invested/current/total and FY YTD gain by bucket in AUD', () => {
    const perf = investmentPerformanceSummary(
      [
        holding({ ticker: 'GOOG', currency: 'USD', native_value: 110, cost_basis: 100 }), // A$165 / A$150
        holding({ ticker: 'WIRE', currency: 'AUD', native_value: 80, cost_basis: 90 }),
        holding({ ticker: 'BTC', market: 'Ledger', currency: 'AUD', native_value: 300, cost_basis: 100 }),
        holding({ ticker: 'PMGOLD', currency: 'AUD', native_value: 40, cost_basis: 50 }),
      ],
      [tx({ date: '2026-07-03', ticker: 'GOOG', side: 'buy', currency: 'USD', amount: 10, amount_aud: 15 })],
      [month({ period: '2026-06', shares: 210, btc_crypto: 250 }), month({ period: '2026-07', shares: 245, btc_crypto: 300 })],
      [fx('USD', 1.5)]
    );

    expect(perf.fyLabel).toBe('FY2027 YTD');
    expect(perf.buckets.shares.invested).toBeCloseTo(240, 2);
    expect(perf.buckets.shares.currentValue).toBeCloseTo(245, 2);
    expect(perf.buckets.shares.totalGain).toBeCloseTo(5, 2);
    expect(perf.buckets.shares.fyGain).toBeCloseTo(20, 2); // 245 current - 210 opening - 15 buys
    expect(perf.buckets.crypto.currentValue).toBeCloseTo(300, 2);
    expect(perf.buckets.crypto.fyGain).toBeCloseTo(50, 2);
    expect(perf.buckets.other.fyGain).toBeNull();
    expect(perf.total.currentValue).toBeCloseTo(585, 2);
  });
});
