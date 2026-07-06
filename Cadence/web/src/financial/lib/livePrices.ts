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

import type { InvestmentHolding } from './types';

export interface LiveQuote {
  price: number;
  currency: string;
}

export type QuoteMap = Record<string, LiveQuote>;

// Map a holding to its Yahoo Finance symbol:
//   BTC             -> BTC-AUD  (spot in AUD directly)
//   ASX-market rows -> TICKER.AX
//   everything else -> TICKER   (US listings resolve as-is)
export function yahooSymbol(h: Pick<InvestmentHolding, 'ticker' | 'market'>): string {
  const ticker = h.ticker.trim().toUpperCase();
  if (ticker === 'BTC') return 'BTC-AUD';
  if (/asx/i.test(h.market)) return `${ticker}.AX`;
  return ticker;
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
