// Live market pricing for shares and BTC.
//
// Quotes come from the app's own /api/quotes serverless proxy (Yahoo
// Finance underneath; the browser can't call it directly because of CORS).
// Live prices are a *display and reprice-assist* layer: nothing is written
// to the database until the owner applies a reprice, which stamps the
// holding's as_of_date and logs a market_repriced evidence item -- the same
// evidence regime as every other number in the app.
//
// Property is deliberately NOT here: realestate.com.au has no public API
// and scraping it violates its terms, so property stays a one-tap manual
// reprice from the portal's estimate (see Debt & Offset screen).

import type { BudgetFxRate, InvestmentHolding } from './types';

export interface LiveQuote {
  price: number;
  currency: string;
}

export type QuoteMap = Record<string, LiveQuote>;

// Yahoo Finance's USD -> AUD FX pair. `price` is AUD per 1 USD.
export const USD_AUD_FX_SYMBOL = 'USDAUD=X';

// Map a holding to its Yahoo Finance symbol:
//   BTC                      -> BTC-AUD  (spot in AUD directly)
//   ASX / Australian brokers -> TICKER.AX
//   everything else          -> TICKER   (US listings resolve as-is)
export function yahooSymbol(h: Pick<InvestmentHolding, 'ticker' | 'market'>): string {
  const ticker = h.ticker.trim().toUpperCase();
  const market = h.market.trim();
  if (ticker === 'BTC') return 'BTC-AUD';
  if (/\b(asx|stake\s+aus|australia|australian)\b/i.test(market)) return `${ticker}.AX`;
  return ticker;
}

export function quoteSymbolsForHoldings(
  holdings: Pick<InvestmentHolding, 'ticker' | 'market' | 'currency' | 'deleted_at'>[]
): string[] {
  const symbols = new Set<string>();
  for (const h of holdings) {
    if (h.deleted_at) continue;
    symbols.add(yahooSymbol(h));
    if ((h.currency || 'AUD').toUpperCase() === 'USD') symbols.add(USD_AUD_FX_SYMBOL);
  }
  return [...symbols];
}

export function liveFxRatesFromQuotes(quotes: QuoteMap): BudgetFxRate[] {
  const usdAud = quotes[USD_AUD_FX_SYMBOL];
  if (!usdAud || !Number.isFinite(usdAud.price) || usdAud.price <= 0) return [];
  if ((usdAud.currency || '').toUpperCase() !== 'AUD') return [];
  return [
    {
      id: 'live-usd-aud',
      owner_id: 'live-quote',
      currency: 'USD',
      rate_to_aud: usdAud.price,
      created_at: '',
      updated_at: '',
      deleted_at: null,
    },
  ];
}

export function quoteCurrencyMatchesHolding(symbol: string, quoteCurrency: string, holdingCurrency: string): boolean {
  const quote = (quoteCurrency || '').toUpperCase();
  const holding = (holdingCurrency || 'AUD').toUpperCase();
  if (quote === holding) return true;
  // Yahoo occasionally returns a blank currency for ASX ETPs (for example
  // PMGOLD.AX) even though the listing trades in AUD. Only accept that blank
  // currency for an explicit .AX symbol against an AUD holding; never use it
  // for US/other listings where a blank currency would hide a mismatch.
  return quote === '' && symbol.toUpperCase().endsWith('.AX') && holding === 'AUD';
}

// Upstream quote data can be numerically wrong even when its currency metadata
// looks compatible. PMGOLD.AX is a known Yahoo Finance exception: on
// 2026-07-20 Yahoo returned A$17.94 while the official ASX market page showed
// A$56.93. Keep PMGOLD on manual/official-ASX repricing until the discrepancy
// is demonstrably resolved.
export function quoteAutoRepriceBlockReason(symbol: string): string | null {
  if (symbol.trim().toUpperCase() === 'PMGOLD.AX') {
    return 'Automatic PMGOLD pricing is disabled because the feed is wrong; use the official ASX price.';
  }
  return null;
}

export function quoteCanAutoReprice(symbol: string, quoteCurrency: string, holdingCurrency: string): boolean {
  return quoteAutoRepriceBlockReason(symbol) === null && quoteCurrencyMatchesHolding(symbol, quoteCurrency, holdingCurrency);
}

// units * price, rounded to cents -- the holding's new native_value if the
// live quote is applied.
export function liveNativeValue(units: number, price: number): number {
  return Math.round(units * price * 100) / 100;
}

// Fictional demo quotes so VITE_DEMO=1 exercises the whole live-pricing UI
// with no network. Chosen to sit near (not equal to) the demo holdings'
// stored values so the delta column visibly does something.
// Currencies match the demo holdings (all AUD) so the demo exercises the
// live-apply path; the reprice screen guards on currency match, so a real
// USD-listed holding left as AUD is caught rather than mis-repriced.
const DEMO_QUOTES: QuoteMap = {
  'BTC-AUD': { price: 88_900, currency: 'AUD' },
  MSFT: { price: 512, currency: 'AUD' },
  VOO: { price: 845, currency: 'AUD' },
  [USD_AUD_FX_SYMBOL]: { price: 1.5, currency: 'AUD' },
};

export async function fetchLiveQuotes(symbols: string[], demo: boolean): Promise<QuoteMap> {
  if (symbols.length === 0) return {};
  if (demo) {
    const out: QuoteMap = {};
    for (const s of symbols) if (DEMO_QUOTES[s]) out[s] = DEMO_QUOTES[s];
    return out;
  }
  // BASE_URL is '/' in the unified app -- the quotes function is a Vercel
  // serverless function at Cadence/web/api/quotes.ts, reachable at /api/quotes.
  const r = await fetch(`${import.meta.env.BASE_URL}api/quotes?symbols=${encodeURIComponent(symbols.join(','))}`);
  if (!r.ok) throw new Error(`Quote service returned ${r.status}`);
  const j = (await r.json()) as { quotes?: QuoteMap };
  return j.quotes ?? {};
}
