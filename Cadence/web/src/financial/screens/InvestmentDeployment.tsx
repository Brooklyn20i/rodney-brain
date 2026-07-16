import { useCallback, useEffect, useMemo, useState } from 'react';
import { useCadenceFinancial } from '../lib/store';
import { ScreenHeader, Card } from '../components/bits';
import {
  fxRateMap,
  investmentBucketForTransaction,
  investmentBuysSummary,
  investmentIncomeFormError,
  investmentIncomeSummary,
  investmentExposureBucketForHolding,
  investmentPerformanceSummary,
  toAudWithFx,
  type InvestmentBucket,
  type InvestmentBucketSummary,
  type InvestmentExposureBucket,
} from '../lib/financeCalc';
import {
  fetchLiveQuotes,
  liveFxRatesFromQuotes,
  liveNativeValue,
  quoteCurrencyMatchesHolding,
  quoteSymbolsForHoldings,
  yahooSymbol,
  type QuoteMap,
} from '../lib/livePrices';
import { formatMoney, formatPercent, monthLabel, periodRange } from '../lib/util';
import { Chip, CONVICTION_TONE, ThesisDossier, priceSignal } from '../components/ThesisDossier';

const num = (s: string) => Number(s.replace(/[^0-9.-]/g, '')) || 0;
const today = () => new Date().toISOString().slice(0, 10);
const LEDGER_BUCKETS: InvestmentBucket[] = ['shares', 'crypto'];
const EXPOSURE_BUCKETS: InvestmentExposureBucket[] = ['shares', 'crypto', 'commodities'];
const exposureLabel = (bucket: InvestmentExposureBucket): string =>
  bucket === 'shares' ? 'Listed equities & ETFs' : bucket === 'crypto' ? 'Crypto exposure' : 'Commodity ETPs';

function signedMoney(value: number | null, compact = true): string {
  if (value === null) return 'TBC';
  return `${value >= 0 ? '+' : ''}${formatMoney(value, compact)}`;
}

function signedPercent(value: number | null): string {
  if (value === null) return 'TBC';
  return `${value >= 0 ? '+' : ''}${formatPercent(value)}`;
}

function nativeMoney(value: number, currency: string): string {
  return `${currency.toUpperCase()} ${value.toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function PerformanceCard({ summary }: { summary: InvestmentBucketSummary }) {
  const totalTone = summary.totalGain >= 0 ? 'good' : 'bad';
  const fyTone = summary.fyGain === null ? 'neutral' : summary.fyGain >= 0 ? 'good' : 'bad';
  const basisLabel = summary.currentValueBasis === 'month_close' ? 'month-close ledger' : 'holding rows';
  return (
    <div className={`inv-perf-card inv-${summary.bucket}`}>
      <div className="inv-perf-head">
        <div>
          <div className="inv-perf-label">{summary.label}</div>
          <div className="inv-perf-sub">
            {basisLabel} · {summary.holdings} holding{summary.holdings === 1 ? '' : 's'} · {summary.asOfDate ?? 'TBC'}
          </div>
        </div>
        <span className="grade-tag">AUD</span>
      </div>
      <div className="inv-perf-main">{formatMoney(summary.currentValue)}</div>
      <div className="inv-perf-split">
        <div>
          <span>Invested</span>
          <strong>{formatMoney(summary.invested, true)}</strong>
        </div>
        <div>
          <span>Total</span>
          <strong className={`cf-tone-${totalTone}`}>{signedMoney(summary.totalGain)} / {signedPercent(summary.totalReturn)}</strong>
        </div>
        <div>
          <span>FY YTD</span>
          <strong className={`cf-tone-${fyTone}`}>{signedMoney(summary.fyGain)} / {signedPercent(summary.fyReturn)}</strong>
        </div>
      </div>
      {summary.missingCurrencies.length > 0 && (
        <div className="inv-warning">Missing FX for {summary.missingCurrencies.join(', ')} — AUD totals use native value until live FX is available.</div>
      )}
    </div>
  );
}

export function InvestmentDeployment({ onMenu }: { onMenu: () => void }) {
  const { data, demo, insert, update, remove } = useCadenceFinancial();
  const [form, setForm] = useState<'holding' | 'buy' | 'income' | null>(null);
  // Per-row reprice state: holding id -> { value, date }
  const [reprice, setReprice] = useState<Record<string, { value: string; date: string }>>({});
  // Per-card thesis dossier expander: holding id | null
  const [thesisFor, setThesisFor] = useState<string | null>(null);

  // ── Live quotes: display + reprice-assist. Nothing persists until Apply,
  // which stamps as_of_date and (for Apply-all) logs a market_repriced
  // evidence item -- same regime as any manual reprice. ──
  const [quotes, setQuotes] = useState<QuoteMap>({});
  const [quotesState, setQuotesState] = useState<'idle' | 'loading' | 'error'>('idle');

  const refreshQuotes = useCallback(async () => {
    const symbols = quoteSymbolsForHoldings(data.investment_holdings);
    if (symbols.length === 0) return;
    setQuotesState('loading');
    try {
      setQuotes(await fetchLiveQuotes(symbols, demo));
      setQuotesState('idle');
    } catch {
      setQuotesState('error');
    }
  }, [data.investment_holdings, demo]);

  useEffect(() => {
    void refreshQuotes();
  }, [refreshQuotes]);

  const liveFor = (h: (typeof data.investment_holdings)[number]) => {
    const symbol = yahooSymbol(h);
    const q = quotes[symbol];
    if (!q) return null;
    // Guard: the quote is in the LISTING's currency (Yahoo returns USD for a US
    // listing), but native_value is stored in the HOLDING's currency. Applying
    // a USD quote to an AUD-labelled holding would write a USD number into an
    // AUD field — a silent ~1.5× error. Only reprice when the currencies match;
    // cross-currency conversion isn't done here (FX rates are AUD-pegged). A
    // blank Yahoo currency is accepted only for explicit .AX/AUD symbols by the
    // helper, covering ASX ETPs such as PMGOLD.AX.
    if (!quoteCurrencyMatchesHolding(symbol, q.currency, h.currency)) return null;
    return liveNativeValue(h.units, q.price);
  };

  // A quote exists but its currency doesn't match the holding's → return the
  // quote currency so the row can explain why no live reprice is offered.
  const quoteCurrencyMismatch = (h: (typeof data.investment_holdings)[number]) => {
    const symbol = yahooSymbol(h);
    const q = quotes[symbol];
    if (!q) return null;
    if (quoteCurrencyMatchesHolding(symbol, q.currency, h.currency)) return null;
    const qc = (q.currency || 'UNKNOWN').toUpperCase();
    const hc = (h.currency || 'AUD').toUpperCase();
    return { quote: qc, holding: hc };
  };

  const applyLive = async (id: string) => {
    const h = data.investment_holdings.find((x) => x.id === id);
    if (!h) return;
    const live = liveFor(h);
    if (live === null) return;
    await update('investment_holdings', id, { native_value: live, as_of_date: today() });
  };

  const applyAllLive = async () => {
    const applicable = data.investment_holdings.filter((h) => liveFor(h) !== null);
    if (applicable.length === 0) return;
    for (const h of applicable) {
      await update('investment_holdings', h.id, { native_value: liveFor(h)!, as_of_date: today() });
    }
    // One evidence row for the batch: same regime as any other reprice.
    await insert('evidence_items', {
      item: 'Listed shares & BTC',
      period: today().slice(0, 7),
      grade: 'market_repriced',
      status: 'accepted',
      source: 'Live market quotes (via /api/quotes)',
      notes: `${applicable.length} holding(s) repriced to market.`,
    });
  };

  const [holding, setHolding] = useState({ ticker: '', market: '', currency: 'AUD', units: '', native_value: '', cost_basis: '' });
  const [buy, setBuy] = useState({ date: today(), ticker: '', currency: 'AUD', units: '', price: '', amount: '', amount_aud: '', notes: '' });
  const [income, setIncome] = useState({
    entity_id: '',
    holding_id: '',
    payment_date: today(),
    ticker: '',
    income_kind: 'dividend',
    currency: 'AUD',
    gross_amount: '',
    withholding_tax: '',
    franking_credit: '',
    net_amount: '',
    amount_aud: '',
    source: '',
    external_ref: '',
    notes: '',
  });
  const [editingIncomeId, setEditingIncomeId] = useState<string | null>(null);
  const [incomeEdit, setIncomeEdit] = useState<typeof income | null>(null);
  const [incomeError, setIncomeError] = useState<string | null>(null);

  const range = periodRange(data.investment_transactions.map((t) => t.date.slice(0, 7)));
  const summary = range ? investmentBuysSummary(data.investment_transactions, range.start, range.end) : null;
  const investmentHoldings = data.investment_holdings;
  const investmentTransactions = data.investment_transactions;
  const monthlyMetrics = data.monthly_metrics;
  const budgetFxRates = data.budget_fx_rates;
  const entities = data.entities;
  const investmentIncomeRows = data.investment_income.filter((r) => !r.deleted_at);
  const incomeDates = investmentIncomeRows.map((r) => r.payment_date).sort();
  const incomeSummary = investmentIncomeSummary(
    investmentIncomeRows,
    incomeDates[0] ?? '0000-01-01',
    incomeDates[incomeDates.length - 1] ?? '9999-12-31'
  );
  const liveFxRates = useMemo(() => liveFxRatesFromQuotes(quotes), [quotes]);
  const effectiveFxRates = useMemo(() => [...budgetFxRates, ...liveFxRates], [budgetFxRates, liveFxRates]);
  const perf = useMemo(
    () => investmentPerformanceSummary(investmentHoldings, investmentTransactions, monthlyMetrics, effectiveFxRates),
    [effectiveFxRates, investmentHoldings, investmentTransactions, monthlyMetrics]
  );
  const fxRates = useMemo(() => fxRateMap(effectiveFxRates), [effectiveFxRates]);
  const entityName = (id: string | null) => entities.find((e) => e.id === id)?.name ?? 'Unassigned';
  const holdingsByExposure = useMemo(
    () =>
      Object.fromEntries(
        EXPOSURE_BUCKETS.map((bucket) => [
          bucket,
          [...investmentHoldings]
            .filter((h) => !h.deleted_at && investmentExposureBucketForHolding(h) === bucket)
            .sort((a, b) => {
              const av = toAudWithFx(a.native_value, a.currency, fxRates).value;
              const bv = toAudWithFx(b.native_value, b.currency, fxRates).value;
              return bv - av;
            }),
        ])
      ) as Record<InvestmentExposureBucket, typeof investmentHoldings>,
    [investmentHoldings, fxRates]
  );

  const exposureTotals = useMemo(
    () =>
      Object.fromEntries(
        EXPOSURE_BUCKETS.map((bucket) => {
          const rows = holdingsByExposure[bucket];
          const currentValue = rows.reduce((sum, h) => sum + toAudWithFx(h.native_value, h.currency, fxRates).value, 0);
          const invested = rows.reduce((sum, h) => sum + toAudWithFx(h.cost_basis, h.currency, fxRates).value, 0);
          return [bucket, { currentValue, invested }];
        })
      ) as Record<InvestmentExposureBucket, { currentValue: number; invested: number }>,
    [holdingsByExposure, fxRates]
  );

  const addHolding = async () => {
    if (!holding.ticker.trim()) return;
    await insert('investment_holdings', {
      entity_id: null,
      ticker: holding.ticker.trim().toUpperCase(),
      market: holding.market.trim(),
      currency: holding.currency.trim().toUpperCase() || 'AUD',
      units: num(holding.units),
      native_value: num(holding.native_value),
      cost_basis: num(holding.cost_basis),
      as_of_date: today(),
    });
    setHolding({ ticker: '', market: '', currency: 'AUD', units: '', native_value: '', cost_basis: '' });
    setForm(null);
  };

  const addBuy = async () => {
    if (!buy.ticker.trim() || !buy.date) return;
    const amount = num(buy.amount);
    const currency = buy.currency.trim().toUpperCase() || 'AUD';
    await insert('investment_transactions', {
      date: buy.date,
      ticker: buy.ticker.trim().toUpperCase(),
      side: 'buy',
      currency,
      units: num(buy.units),
      price: num(buy.price),
      amount,
      // AUD rows: native amount IS the AUD amount. Foreign rows need it entered.
      amount_aud: currency === 'AUD' ? amount : num(buy.amount_aud) || amount,
      notes: buy.notes.trim(),
    });
    setBuy({ date: today(), ticker: '', currency: 'AUD', units: '', price: '', amount: '', amount_aud: '', notes: '' });
    setForm(null);
  };

  const incomeFormError = (src: typeof income) => investmentIncomeFormError({
    currency: src.currency,
    grossAmount: src.gross_amount,
    withholdingTax: src.withholding_tax,
    netAmount: src.net_amount,
    amountAud: src.amount_aud,
  });

  const incomePayload = (src: typeof income) => {
    const currency = src.currency.trim().toUpperCase() || 'AUD';
    const gross = num(src.gross_amount);
    const withholding = num(src.withholding_tax);
    const net = src.net_amount.trim() ? num(src.net_amount) : Math.max(0, gross - withholding);
    return {
      entity_id: src.entity_id || null,
      holding_id: src.holding_id || null,
      payment_date: src.payment_date,
      ticker: src.ticker.trim().toUpperCase(),
      income_kind: src.income_kind as 'dividend' | 'distribution' | 'interest',
      currency,
      gross_amount: gross,
      withholding_tax: withholding,
      franking_credit: num(src.franking_credit),
      net_amount: net,
      amount_aud: currency === 'AUD' ? net : num(src.amount_aud),
      source: src.source.trim(),
      external_ref: src.external_ref.trim(),
      notes: src.notes.trim(),
    };
  };

  const addIncome = async () => {
    if (!income.ticker.trim() || !income.payment_date) return;
    const validationError = incomeFormError(income);
    if (validationError) {
      setIncomeError(validationError);
      return;
    }
    setIncomeError(null);
    await insert('investment_income', incomePayload(income));
    setIncome({
      entity_id: '',
      holding_id: '',
      payment_date: today(),
      ticker: '',
      income_kind: 'dividend',
      currency: 'AUD',
      gross_amount: '',
      withholding_tax: '',
      franking_credit: '',
      net_amount: '',
      amount_aud: '',
      source: '',
      external_ref: '',
      notes: '',
    });
    setForm(null);
  };

  const startEditIncome = (row: (typeof data.investment_income)[number]) => {
    setEditingIncomeId(row.id);
    setIncomeEdit({
      entity_id: row.entity_id ?? '',
      holding_id: row.holding_id ?? '',
      payment_date: row.payment_date,
      ticker: row.ticker,
      income_kind: row.income_kind,
      currency: row.currency,
      gross_amount: String(row.gross_amount),
      withholding_tax: String(row.withholding_tax),
      franking_credit: String(row.franking_credit),
      net_amount: String(row.net_amount),
      amount_aud: String(row.amount_aud),
      source: row.source,
      external_ref: row.external_ref,
      notes: row.notes,
    });
  };

  const saveIncomeEdit = async () => {
    if (!editingIncomeId || !incomeEdit) return;
    const validationError = incomeFormError(incomeEdit);
    if (validationError) {
      setIncomeError(validationError);
      return;
    }
    setIncomeError(null);
    await update('investment_income', editingIncomeId, incomePayload(incomeEdit));
    setEditingIncomeId(null);
    setIncomeEdit(null);
  };

  const saveReprice = async (id: string) => {
    const r = reprice[id];
    if (!r) return;
    await update('investment_holdings', id, { native_value: num(r.value), as_of_date: r.date || today() });
    setReprice((p) => {
      const { [id]: _drop, ...rest } = p;
      return rest;
    });
  };

  return (
    <>
      <ScreenHeader title="Investments" subtitle="Broker-listed holdings vs BTC custody: invested, current, total and FY YTD." onMenu={onMenu}>
        <button className="btn btn-secondary btn-sm" onClick={() => setForm(form === 'holding' ? null : 'holding')}>
          {form === 'holding' ? 'Cancel' : '+ Holding'}
        </button>
        <button className="btn btn-primary btn-sm" onClick={() => setForm(form === 'buy' ? null : 'buy')}>
          {form === 'buy' ? 'Cancel' : '+ Buy'}
        </button>
        <button className="btn btn-secondary btn-sm" onClick={() => setForm(form === 'income' ? null : 'income')}>
          {form === 'income' ? 'Cancel' : '+ Income'}
        </button>
      </ScreenHeader>
      <div className="screen-content">
        {form === 'holding' && (
          <Card title="New holding">
            <div className="wizard-grid">
              {(
                [
                  ['ticker', 'Ticker'],
                  ['market', 'Market / account'],
                  ['currency', 'Currency'],
                  ['units', 'Units'],
                  ['native_value', 'Current value (native)'],
                  ['cost_basis', 'Cost basis (native)'],
                ] as const
              ).map(([key, label]) => (
                <div className="form-group" key={key}>
                  <label className="field">{label}</label>
                  <input type="text" value={holding[key]} onChange={(e) => setHolding((h) => ({ ...h, [key]: e.target.value }))} />
                </div>
              ))}
            </div>
            <button className="btn btn-primary" onClick={addHolding}>
              Add holding
            </button>
          </Card>
        )}
        {form === 'buy' && (
          <Card title="New buy transaction">
            <div className="wizard-grid">
              {(
                [
                  ['date', 'Date (YYYY-MM-DD)'],
                  ['ticker', 'Ticker'],
                  ['currency', 'Currency'],
                  ['units', 'Units'],
                  ['price', 'Price (native)'],
                  ['amount', 'Amount (native)'],
                  ['amount_aud', 'Amount (AUD) — required if not AUD'],
                  ['notes', 'Notes / evidence'],
                ] as const
              ).map(([key, label]) => (
                <div className="form-group" key={key}>
                  <label className="field">{label}</label>
                  <input type="text" value={buy[key]} onChange={(e) => setBuy((b) => ({ ...b, [key]: e.target.value }))} />
                </div>
              ))}
            </div>
            <button className="btn btn-primary" onClick={addBuy}>
              Add buy
            </button>
          </Card>
        )}
        {form === 'income' && (
          <Card title="Log investment income">
            <div className="wizard-grid">
              <div className="form-group">
                <label className="field">Entity</label>
                <select value={income.entity_id} onChange={(e) => setIncome((v) => ({ ...v, entity_id: e.target.value }))}>
                  <option value="">Unassigned</option>
                  {entities.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="field">Holding</label>
                <select value={income.holding_id} onChange={(e) => setIncome((v) => ({ ...v, holding_id: e.target.value }))}>
                  <option value="">No linked holding</option>
                  {investmentHoldings.filter((h) => !h.deleted_at).map((h) => <option key={h.id} value={h.id}>{h.ticker} · {h.market || h.currency}</option>)}
                </select>
              </div>
              {(
                [
                  ['payment_date', 'Payment date'],
                  ['ticker', 'Ticker'],
                  ['currency', 'Currency'],
                  ['gross_amount', 'Gross amount'],
                  ['withholding_tax', 'Withholding tax'],
                  ['franking_credit', 'Franking credit'],
                  ['net_amount', 'Net amount (blank = gross − withholding)'],
                  ['amount_aud', 'AUD equivalent (required if not AUD)'],
                  ['source', 'Source'],
                  ['external_ref', 'External reference'],
                  ['notes', 'Notes'],
                ] as const
              ).map(([key, label]) => (
                <div className="form-group" key={key}>
                  <label className="field">{label}</label>
                  <input type="text" value={income[key]} onChange={(e) => setIncome((v) => ({ ...v, [key]: e.target.value }))} />
                </div>
              ))}
              <div className="form-group">
                <label className="field">Kind</label>
                <select value={income.income_kind} onChange={(e) => setIncome((v) => ({ ...v, income_kind: e.target.value }))}>
                  <option value="dividend">Dividend</option>
                  <option value="distribution">Distribution</option>
                  <option value="interest">Interest</option>
                </select>
              </div>
            </div>
            {incomeError && <p className="inv-warning" role="alert">{incomeError}</p>}
            <button className="btn btn-primary" onClick={addIncome}>
              Log income
            </button>
          </Card>
        )}

        <div className="inv-hero">
          {LEDGER_BUCKETS.map((bucket) => (
            <PerformanceCard key={bucket} summary={perf.buckets[bucket]} />
          ))}
          <PerformanceCard summary={perf.total} />
        </div>

        <Card title={`${perf.fyLabel} performance basis`}>
          <div className="inv-basis-grid">
            <div>
              <span>FY opening</span>
              <strong>{perf.fyOpeningPeriod ? monthLabel(perf.fyOpeningPeriod) : 'Missing baseline'}</strong>
            </div>
            <div>
              <span>Latest month close</span>
              <strong>{perf.latestMetricPeriod ? monthLabel(perf.latestMetricPeriod) : 'No month close'}</strong>
            </div>
            <div>
              <span>Currency rule</span>
              <strong>AUD totals; USD via live USD/AUD FX</strong>
            </div>
            <div>
              <span>Evidence grade</span>
              <strong>Management-grade, not tax-grade</strong>
            </div>
          </div>
          <p className="inv-note">
            Top cards use the latest month-close ledger so they reconcile to Monthly Metrics. Holdings below are position rows and may differ after intra-month repricing until the next close is posted.
          </p>
          <p className="inv-note">
            FY YTD gain = current value − FY opening value − FY buys. This separates market movement from new capital deployed.
            {perf.total.missingCurrencies.length > 0 ? ` Set FX for ${perf.total.missingCurrencies.join(', ')} to make AUD totals decision-grade.` : ''}
          </p>
        </Card>

        <Card title="Holdings by category">
          <div className="inv-live-actions">
            <button className="btn btn-secondary btn-sm" onClick={refreshQuotes} disabled={quotesState === 'loading'}>
              {quotesState === 'loading' ? 'Fetching…' : '↻ Refresh live prices'}
            </button>
            {Object.keys(quotes).length > 0 && (
              <button className="btn btn-primary btn-sm" onClick={applyAllLive}>
                Apply all live prices
              </button>
            )}
            {quotesState === 'error' && <span className="inv-warning">Live prices unavailable right now — stored values shown.</span>}
          </div>

          {EXPOSURE_BUCKETS.map((bucket) => {
            const totals = exposureTotals[bucket];
            const rows = holdingsByExposure[bucket];
            return (
              <section className="inv-section" key={bucket}>
                <div className="inv-section-head">
                  <div>
                    <h3>{exposureLabel(bucket)}</h3>
                    <p>{formatMoney(totals.currentValue, true)} current · {formatMoney(totals.invested, true)} invested</p>
                  </div>
                  <span className="grade-tag">{rows.length} holdings</span>
                </div>
                <div className="inv-holding-grid">
                  {rows.map((h) => {
                  const editing = reprice[h.id];
                  const live = liveFor(h);
                  const thesis = (data.investment_theses ?? []).find((t) => t.target_id === h.id && !t.deleted_at);
                  const perUnit = h.units > 0 ? (live !== null ? live : h.native_value) / h.units : null;
                  const sig = thesis && !thesis.is_structural ? priceSignal(thesis, perUnit) : null;
                  const liveDelta = live !== null ? live - h.native_value : null;
                  const audCurrent = toAudWithFx(h.native_value, h.currency, fxRates);
                  const audCost = toAudWithFx(h.cost_basis, h.currency, fxRates);
                  const pl = audCurrent.value - audCost.value;
                  const plPct = audCost.value > 0 ? pl / audCost.value : null;
                  return (
                    <article className="inv-holding-card" key={h.id}>
                      <div className="inv-holding-top">
                        <div>
                          <strong>{h.ticker}</strong>
                          <span>{h.market || 'No market'} · {entityName(h.entity_id)}</span>
                        </div>
                        <span className="grade-tag">{h.currency}</span>
                      </div>
                      <div className="inv-holding-values">
                        <div>
                          <span>Current (AUD)</span>
                          {editing ? (
                            <input
                              type="text"
                              value={editing.value}
                              onChange={(e) => setReprice((p) => ({ ...p, [h.id]: { ...editing, value: e.target.value } }))}
                            />
                          ) : (
                            <strong>{formatMoney(audCurrent.value, true)}</strong>
                          )}
                          <small>Native value: {nativeMoney(h.native_value, h.currency)}</small>
                        </div>
                        <div>
                          <span>Invested</span>
                          <strong>{formatMoney(audCost.value, true)}</strong>
                          <small>{nativeMoney(h.cost_basis, h.currency)}</small>
                        </div>
                        <div>
                          <span>Total P/L</span>
                          <strong className={pl >= 0 ? 'cf-tone-good' : 'cf-tone-bad'}>{signedMoney(pl)} / {signedPercent(plPct)}</strong>
                          <small>{h.units.toLocaleString('en-AU')} units · {h.as_of_date}</small>
                        </div>
                      </div>
                      <div className="inv-holding-live">
                        {live === null ? (
                          (() => {
                            const mm = quoteCurrencyMismatch(h);
                            return mm ? (
                              <span className="inv-warning">Live quote is {mm.quote}; holding is {mm.holding}</span>
                            ) : (
                              <span>Live quote unavailable</span>
                            );
                          })()
                        ) : (
                          <span>
                            Live native: {nativeMoney(live, h.currency)}
                            {liveDelta !== null && Math.abs(liveDelta) >= 0.005 && (
                              <strong className={liveDelta >= 0 ? 'cf-tone-good' : 'cf-tone-bad'}>
                                {' '}({liveDelta >= 0 ? '+' : ''}{nativeMoney(liveDelta, h.currency)})
                              </strong>
                            )}
                          </span>
                        )}
                        {editing ? (
                          <button className="btn btn-primary btn-sm" onClick={() => saveReprice(h.id)}>
                            Save
                          </button>
                        ) : live !== null ? (
                          <button className="btn btn-secondary btn-sm" onClick={() => applyLive(h.id)}>
                            Apply live
                          </button>
                        ) : (
                          <button
                            className="btn btn-secondary btn-sm"
                            onClick={() => setReprice((p) => ({ ...p, [h.id]: { value: String(h.native_value), date: today() } }))}
                          >
                            Reprice
                          </button>
                        )}
                      </div>
                      <div style={{ borderTop: '1px solid var(--border)', marginTop: 10, paddingTop: 8 }}>
                        <button
                          onClick={() => setThesisFor(thesisFor === h.id ? null : h.id)}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0,
                            font: 'inherit', fontSize: 12.5, color: 'var(--accent)', fontWeight: 600,
                            display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ fontSize: 10 }}>{thesisFor === h.id ? '▾' : '▸'}</span>
                          Thesis
                          {thesis && (
                            <Chip bg={CONVICTION_TONE[thesis.conviction].bg} fg={CONVICTION_TONE[thesis.conviction].fg}>
                              {CONVICTION_TONE[thesis.conviction].label}
                            </Chip>
                          )}
                          {sig && <Chip bg={sig.bg} fg={sig.fg}>{sig.label}</Chip>}
                          {!thesis && <span style={{ color: 'var(--text3)', fontWeight: 400 }}>none yet</span>}
                        </button>
                        {thesisFor === h.id && (
                          <div style={{ marginTop: 10 }}>
                            <ThesisDossier targetKind="holding" targetId={h.id}
                              targetLabel={`${h.ticker} · ${h.market}`} currentPrice={perUnit} />
                          </div>
                        )}
                      </div>
                    </article>
                  );
                  })}
                  {rows.length === 0 && <p className="inv-note">No {exposureLabel(bucket).toLowerCase()} holdings recorded.</p>}
                </div>
              </section>
            );
          })}
        </Card>

        <Card title="Investment income">
          {incomeError && form !== 'income' && <p className="inv-warning" role="alert">{incomeError}</p>}
          <div className="cf-metric-grid">
            <div className="cf-metric">
              <div className="cf-metric-label">Dividends</div>
              <div className="cf-metric-value">{formatMoney(incomeSummary.dividends, true)}</div>
            </div>
            <div className="cf-metric">
              <div className="cf-metric-label">Distributions</div>
              <div className="cf-metric-value">{formatMoney(incomeSummary.distributions, true)}</div>
            </div>
            <div className="cf-metric">
              <div className="cf-metric-label">Interest</div>
              <div className="cf-metric-value">{formatMoney(incomeSummary.interest, true)}</div>
            </div>
            <div className="cf-metric">
              <div className="cf-metric-label">Total income</div>
              <div className="cf-metric-value">{formatMoney(incomeSummary.total, true)}</div>
            </div>
          </div>
          <div className="cf-table-wrap" style={{ marginTop: 12 }}>
            <table className="cf-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Entity</th>
                  <th>Ticker</th>
                  <th>Kind</th>
                  <th>Net native</th>
                  <th>AUD</th>
                  <th>Source / ref</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {[...investmentIncomeRows].sort((a, b) => b.payment_date.localeCompare(a.payment_date)).map((row) => {
                  const editing = editingIncomeId === row.id && incomeEdit;
                  return (
                    <tr key={row.id}>
                      {editing ? (
                        <>
                          <td><input value={incomeEdit.payment_date} onChange={(e) => setIncomeEdit((v) => v && ({ ...v, payment_date: e.target.value }))} /></td>
                          <td>
                            <select value={incomeEdit.entity_id} onChange={(e) => setIncomeEdit((v) => v && ({ ...v, entity_id: e.target.value }))}>
                              <option value="">Unassigned</option>
                              {entities.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
                            </select>
                          </td>
                          <td><input value={incomeEdit.ticker} onChange={(e) => setIncomeEdit((v) => v && ({ ...v, ticker: e.target.value }))} /></td>
                          <td>
                            <select value={incomeEdit.income_kind} onChange={(e) => setIncomeEdit((v) => v && ({ ...v, income_kind: e.target.value }))}>
                              <option value="dividend">Dividend</option>
                              <option value="distribution">Distribution</option>
                              <option value="interest">Interest</option>
                            </select>
                          </td>
                          <td><input value={incomeEdit.net_amount} onChange={(e) => setIncomeEdit((v) => v && ({ ...v, net_amount: e.target.value }))} /></td>
                          <td><input value={incomeEdit.amount_aud} onChange={(e) => setIncomeEdit((v) => v && ({ ...v, amount_aud: e.target.value }))} /></td>
                          <td><input value={incomeEdit.source} onChange={(e) => setIncomeEdit((v) => v && ({ ...v, source: e.target.value }))} /></td>
                          <td>
                            <button className="btn btn-primary btn-sm" onClick={saveIncomeEdit}>Save</button>
                            <button className="btn btn-secondary btn-sm" onClick={() => { setEditingIncomeId(null); setIncomeEdit(null); }}>Cancel</button>
                          </td>
                        </>
                      ) : (
                        <>
                          <td>{row.payment_date}</td>
                          <td>{entityName(row.entity_id)}</td>
                          <td>{row.ticker}</td>
                          <td>{row.income_kind}</td>
                          <td>{row.currency} {row.net_amount.toLocaleString('en-AU', { minimumFractionDigits: 2 })}</td>
                          <td>{formatMoney(row.amount_aud)}</td>
                          <td style={{ textAlign: 'left', color: 'var(--text2)', fontSize: 12 }}>{row.source}{row.external_ref ? ` · ${row.external_ref}` : ''}</td>
                          <td>
                            <button className="btn btn-secondary btn-sm" onClick={() => startEditIncome(row)}>Edit</button>
                            <button className="btn btn-secondary btn-sm" onClick={() => remove('investment_income', row.id)}>Delete</button>
                          </td>
                        </>
                      )}
                    </tr>
                  );
                })}
                {investmentIncomeRows.length === 0 && (
                  <tr><td colSpan={8} style={{ textAlign: 'left', color: 'var(--text2)' }}>No investment income logged yet.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>

        {summary && (
          <Card title="Capital deployed by month">
            <div className="cf-metric-grid">
              <div className="cf-metric">
                <div className="cf-metric-label">Share buys captured</div>
                <div className="cf-metric-value">{formatMoney(summary.shares, true)}</div>
              </div>
              <div className="cf-metric">
                <div className="cf-metric-label">Crypto/BTC buys captured</div>
                <div className="cf-metric-value">{formatMoney(summary.btc, true)}</div>
              </div>
              <div className="cf-metric">
                <div className="cf-metric-label">Total deployed</div>
                <div className="cf-metric-value">{formatMoney(summary.total, true)}</div>
              </div>
              <div className="cf-metric">
                <div className="cf-metric-label">Active months</div>
                <div className="cf-metric-value">{summary.activeMonths}</div>
              </div>
            </div>
            <div className="cf-table-wrap">
              <table className="cf-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Bucket</th>
                    <th>Ticker</th>
                    <th>Units</th>
                    <th>Amount native</th>
                    <th>Amount AUD</th>
                    <th>Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {[...data.investment_transactions]
                    .filter((t) => t.side === 'buy')
                    .sort((a, b) => b.date.localeCompare(a.date))
                    .map((t) => (
                      <tr key={t.id}>
                        <td>{t.date}</td>
                        <td>{investmentBucketForTransaction(t)}</td>
                        <td>{t.ticker}</td>
                        <td>{t.units}</td>
                        <td>
                          {t.currency} {t.amount.toLocaleString('en-AU', { minimumFractionDigits: 2 })}
                        </td>
                        <td>{formatMoney(t.amount_aud)}</td>
                        <td style={{ textAlign: 'left', color: 'var(--text2)', fontSize: 12 }}>{t.notes}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}
      </div>
    </>
  );
}
