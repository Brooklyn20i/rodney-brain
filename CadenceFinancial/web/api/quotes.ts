// Vercel serverless function: live market quotes, proxied server-side.
//
// The browser can't call Yahoo Finance directly (CORS), so this tiny
// function does it on the app's behalf. Public price data only -- no keys,
// no personal data transits this endpoint, and responses are edge-cached
// for 5 minutes so a refresh-happy client can't hammer the source.
//
// GET /api/quotes?symbols=BTC-AUD,VAS.AX,MSFT
// -> { quotes: { "BTC-AUD": { price: 123456.78, currency: "AUD" }, ... } }

const YAHOO = 'https://query1.finance.yahoo.com/v8/finance/chart/';
const UA = 'Mozilla/5.0 (compatible; CadenceFinancial/1.0)';

export default async function handler(req: { query: Record<string, string | string[]> }, res: {
  setHeader: (k: string, v: string) => void;
  status: (code: number) => { json: (body: unknown) => void };
}) {
  const raw = Array.isArray(req.query.symbols) ? req.query.symbols[0] : (req.query.symbols ?? '');
  const symbols = String(raw)
    .split(',')
    .map((s) => s.trim().toUpperCase())
    .filter((s) => /^[A-Z0-9.^=-]{1,12}$/.test(s))
    .slice(0, 20);

  if (symbols.length === 0) {
    res.status(400).json({ error: 'symbols query parameter required' });
    return;
  }

  const quotes: Record<string, { price: number; currency: string }> = {};
  await Promise.all(
    symbols.map(async (sym) => {
      try {
        const r = await fetch(`${YAHOO}${encodeURIComponent(sym)}?interval=1d&range=1d`, {
          headers: { 'User-Agent': UA, Accept: 'application/json' },
        });
        if (!r.ok) return;
        const j = (await r.json()) as {
          chart?: { result?: { meta?: { regularMarketPrice?: number; currency?: string } }[] };
        };
        const meta = j.chart?.result?.[0]?.meta;
        if (meta && typeof meta.regularMarketPrice === 'number') {
          quotes[sym] = { price: meta.regularMarketPrice, currency: meta.currency ?? '' };
        }
      } catch {
        // Failed symbols are simply omitted; the client shows them as unavailable.
      }
    })
  );

  res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600');
  res.status(200).json({ quotes });
}
