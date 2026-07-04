import { describe, expect, it } from 'vitest';
import { fetchLiveQuotes, liveNativeValue, yahooSymbol } from '../livePrices';

describe('yahooSymbol', () => {
  it('maps BTC to the AUD spot pair regardless of market label', () => {
    expect(yahooSymbol({ ticker: 'BTC', market: 'Ledger' })).toBe('BTC-AUD');
    expect(yahooSymbol({ ticker: 'btc', market: '' })).toBe('BTC-AUD');
  });

  it('maps ASX-market holdings to .AX suffix', () => {
    expect(yahooSymbol({ ticker: 'VAS', market: 'ASX' })).toBe('VAS.AX');
    expect(yahooSymbol({ ticker: 'ivv', market: 'asx listed' })).toBe('IVV.AX');
  });

  it('passes US listings through unchanged', () => {
    expect(yahooSymbol({ ticker: 'MSFT', market: 'US listed' })).toBe('MSFT');
    expect(yahooSymbol({ ticker: 'VOO', market: 'US listed' })).toBe('VOO');
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
    const quotes = await fetchLiveQuotes(['BTC-AUD', 'MSFT', 'UNKNOWN'], true);
    expect(quotes['BTC-AUD'].currency).toBe('AUD');
    expect(quotes.MSFT.price).toBeGreaterThan(0);
    expect(quotes.UNKNOWN).toBeUndefined();
  });

  it('returns empty for an empty symbol list', async () => {
    expect(await fetchLiveQuotes([], true)).toEqual({});
  });
});
