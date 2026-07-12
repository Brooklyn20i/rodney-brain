import { describe, expect, it } from 'vitest';
import {
  fetchLiveQuotes,
  liveFxRatesFromQuotes,
  liveNativeValue,
  quoteCurrencyMatchesHolding,
  quoteSymbolsForHoldings,
  USD_AUD_FX_SYMBOL,
  yahooSymbol,
} from '../livePrices';

describe('yahooSymbol', () => {
  it('maps BTC to the AUD spot pair regardless of market label', () => {
    expect(yahooSymbol({ ticker: 'BTC', market: 'Ledger' })).toBe('BTC-AUD');
    expect(yahooSymbol({ ticker: 'btc', market: '' })).toBe('BTC-AUD');
  });

  it('maps ASX-market holdings to .AX suffix', () => {
    expect(yahooSymbol({ ticker: 'VAS', market: 'ASX' })).toBe('VAS.AX');
    expect(yahooSymbol({ ticker: 'ivv', market: 'asx listed' })).toBe('IVV.AX');
  });

  it('maps Stake Aus holdings to ASX Yahoo symbols', () => {
    expect(yahooSymbol({ ticker: 'WIRE', market: 'Stake Aus' })).toBe('WIRE.AX');
    expect(yahooSymbol({ ticker: 'PGA1', market: 'Stake Aus' })).toBe('PGA1.AX');
    expect(yahooSymbol({ ticker: 'VBTC', market: 'Stake Aus' })).toBe('VBTC.AX');
    expect(yahooSymbol({ ticker: 'PMGOLD', market: 'Stake Aus' })).toBe('PMGOLD.AX');
  });

  it('passes US listings through unchanged', () => {
    expect(yahooSymbol({ ticker: 'MSFT', market: 'US listed' })).toBe('MSFT');
    expect(yahooSymbol({ ticker: 'VOO', market: 'US listed' })).toBe('VOO');
    expect(yahooSymbol({ ticker: 'GOOG', market: 'Stake Wall St larger' })).toBe('GOOG');
    expect(yahooSymbol({ ticker: 'TSLA', market: 'Stake Wall St smaller' })).toBe('TSLA');
  });
});

describe('quoteSymbolsForHoldings', () => {
  it('includes live USD/AUD FX when any active holding is USD denominated', () => {
    const symbols = quoteSymbolsForHoldings([
      { ticker: 'WIRE', market: 'Stake Aus', currency: 'AUD', deleted_at: null },
      { ticker: 'GOOG', market: 'Stake Wall St larger', currency: 'USD', deleted_at: null },
      { ticker: 'TSLA', market: 'Stake Wall St smaller', currency: 'USD', deleted_at: '2026-01-01' },
    ]);

    expect(symbols).toEqual(['WIRE.AX', 'GOOG', USD_AUD_FX_SYMBOL]);
  });
});

describe('liveFxRatesFromQuotes', () => {
  it('turns a live USD/AUD quote into an app FX rate row', () => {
    expect(liveFxRatesFromQuotes({ [USD_AUD_FX_SYMBOL]: { price: 1.44, currency: 'AUD' } })).toEqual([
      expect.objectContaining({ currency: 'USD', rate_to_aud: 1.44, deleted_at: null }),
    ]);
  });

  it('does not create an FX rate from a missing or invalid quote', () => {
    expect(liveFxRatesFromQuotes({})).toEqual([]);
    expect(liveFxRatesFromQuotes({ [USD_AUD_FX_SYMBOL]: { price: 0, currency: 'AUD' } })).toEqual([]);
    expect(liveFxRatesFromQuotes({ [USD_AUD_FX_SYMBOL]: { price: Number.NaN, currency: 'AUD' } })).toEqual([]);
    expect(liveFxRatesFromQuotes({ [USD_AUD_FX_SYMBOL]: { price: 1.44, currency: 'USD' } })).toEqual([]);
  });
});

describe('quoteCurrencyMatchesHolding', () => {
  it('requires quote and holding currencies to match before repricing', () => {
    expect(quoteCurrencyMatchesHolding('GOOG', 'USD', 'USD')).toBe(true);
    expect(quoteCurrencyMatchesHolding('GOOG', 'USD', 'AUD')).toBe(false);
  });

  it('treats blank ASX quote currency as AUD only for AUD holdings', () => {
    expect(quoteCurrencyMatchesHolding('PMGOLD.AX', '', 'AUD')).toBe(true);
    expect(quoteCurrencyMatchesHolding('PMGOLD.AX', '', 'USD')).toBe(false);
    expect(quoteCurrencyMatchesHolding('GOOG', '', 'USD')).toBe(false);
  });
});

describe('liveNativeValue', () => {
  it('multiplies units by price and rounds to cents', () => {
    expect(liveNativeValue(12.5, 512)).toBe(6400);
    expect(liveNativeValue(1.05, 88_900)).toBeCloseTo(93_345, 2);
    expect(liveNativeValue(3, 33.333)).toBeCloseTo(100, 2);
  });
});

describe('fetchLiveQuotes (demo mode)', () => {
  it('returns canned quotes without any network call', async () => {
    const quotes = await fetchLiveQuotes(['BTC-AUD', 'MSFT', USD_AUD_FX_SYMBOL, 'UNKNOWN'], true);
    expect(quotes['BTC-AUD'].currency).toBe('AUD');
    expect(quotes.MSFT.price).toBeGreaterThan(0);
    expect(quotes[USD_AUD_FX_SYMBOL].price).toBe(1.5);
    expect(quotes.UNKNOWN).toBeUndefined();
  });

  it('returns empty for an empty symbol list', async () => {
    expect(await fetchLiveQuotes([], true)).toEqual({});
  });
});
