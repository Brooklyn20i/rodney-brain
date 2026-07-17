import { describe, expect, it } from 'vitest';
import type { Watch } from '../types';
import { filterWatches, parseOptionalMoneyInput, summarizeWatches } from '../watchCalc';

const base = {
  owner_id: 'owner',
  currency: 'AUD',
  full_set_status: 'unknown' as const,
  accessories: '',
  service_history: '',
  provenance: '',
  insurance_notes: '',
  storage_location: '',
  security_notes: '',
  notes: '',
  sentimental: false,
  external_ref: '',
  created_at: '2026-07-16T00:00:00Z',
  updated_at: '2026-07-16T00:00:00Z',
  deleted_at: null,
};

function watch(row: Partial<Watch> & Pick<Watch, 'id' | 'brand' | 'model' | 'collection_role' | 'ownership_status'>): Watch {
  return {
    ...base,
    reference: '',
    nickname: '',
    year: null,
    purchase_price: null,
    purchase_date: null,
    current_value: null,
    value_as_of: null,
    valuation_source: '',
    insurance_value: null,
    material: '',
    dial: '',
    ...row,
  };
}

const rows: Watch[] = [
  watch({
    id: 'owned-1',
    brand: 'Omega',
    model: 'Speedmaster',
    reference: '310.30.42',
    nickname: 'Moonwatch',
    collection_role: 'permanent',
    ownership_status: 'owned',
    purchase_price: 8_000,
    current_value: 10_000,
    valuation_source: 'auction comp',
    value_as_of: '2026-07-01',
    insurance_value: 11_000,
    full_set_status: 'full',
    accessories: 'bracelet and cards',
    service_history: '2025 pressure test',
    storage_location: 'safe',
    security_notes: 'insured safe',
    sentimental: true,
  }),
  watch({ id: 'owned-2', brand: 'Tudor', model: 'Black Bay 58', reference: 'M79030N', collection_role: 'rotation', ownership_status: 'owned', purchase_price: 5_000, current_value: null }),
  watch({ id: 'future-owned', brand: 'Rolex', model: 'Explorer', collection_role: 'future', ownership_status: 'owned', purchase_price: 9_000, current_value: 12_000 }),
  watch({ id: 'candidate', brand: 'Grand Seiko', model: 'Snowflake', reference: 'SBGA211', nickname: 'future spring drive', collection_role: 'future', ownership_status: 'candidate', purchase_price: 7_000, current_value: 7_500 }),
  watch({ id: 'sold', brand: 'IWC', model: 'Mark XVIII', collection_role: 'exit_trade', ownership_status: 'sold', purchase_price: 4_000, current_value: 4_500 }),
  watch({ id: 'traded', brand: 'Breitling', model: 'Navitimer', collection_role: 'exit_trade', ownership_status: 'traded', purchase_price: 6_000, current_value: 5_000 }),
];

describe('watch collection calculations', () => {
  it('keeps blank money unknown and rejects non-numeric text instead of coercing it to zero', () => {
    expect(parseOptionalMoneyInput('')).toEqual({ value: null, valid: true });
    expect(parseOptionalMoneyInput('A$ 1,234.50')).toEqual({ value: 1234.5, valid: true });
    expect(parseOptionalMoneyInput('unknown')).toEqual({ value: null, valid: false });
    expect(parseOptionalMoneyInput('12..3')).toEqual({ value: null, valid: false });
  });

  it('summarizes owned value without future candidates, sold, traded, or future-role rows', () => {
    const summary = summarizeWatches(rows);

    expect(summary.ownedCollectionValue).toBe(10_000);
    expect(summary.knownAcquisitionBasis).toBe(13_000);
    expect(summary.unrealisedPL).toBe(2_000);
    expect(summary.ownedCount).toBe(2);
    expect(summary.dataGaps).toEqual({
      unsupportedCurrency: 0,
      purchasePrice: 0,
      currentValue: 1,
      valuationSource: 1,
      valueAsOf: 1,
      insuranceValue: 1,
      fullSet: 1,
      accessories: 1,
      serviceHistory: 1,
      storageSecurity: 1,
    });
  });

  it('counts active rows by collection role', () => {
    expect(summarizeWatches(rows).roleCounts).toEqual({ permanent: 1, rotation: 1, exit_trade: 2, future: 2 });
  });

  it('never presents native foreign-currency values as AUD totals', () => {
    const usd = watch({
      id: 'usd-watch',
      brand: 'Rolex',
      model: 'Explorer',
      collection_role: 'permanent',
      ownership_status: 'owned',
      currency: 'USD',
      purchase_price: 8_000,
      current_value: 10_000,
    });

    const summary = summarizeWatches([usd]);

    expect(summary.ownedCollectionValue).toBe(0);
    expect(summary.knownAcquisitionBasis).toBe(0);
    expect(summary.unrealisedPL).toBe(0);
    expect(summary.dataGaps.unsupportedCurrency).toBe(1);
  });

  it('searches across brand, model, reference, nickname, provenance, accessories and valuation source', () => {
    expect(filterWatches(rows, { search: 'moonwatch', collectionRole: 'all', status: 'all' }).map((w) => w.id)).toEqual(['owned-1']);
    expect(filterWatches(rows, { search: 'M79030N', collectionRole: 'all', status: 'all' }).map((w) => w.id)).toEqual(['owned-2']);
    expect(filterWatches(rows, { search: 'grand snow', collectionRole: 'all', status: 'all' }).map((w) => w.id)).toEqual(['candidate']);
    expect(filterWatches(rows, { search: 'auction bracelet', collectionRole: 'all', status: 'all' }).map((w) => w.id)).toEqual(['owned-1']);
  });

  it('filters by collection role and ownership status while excluding soft-deleted rows', () => {
    const deleted = watch({ id: 'deleted', brand: 'Rolex', model: 'Explorer', collection_role: 'permanent', ownership_status: 'owned', current_value: 9_000, deleted_at: '2026-07-01T00:00:00Z' });
    expect(filterWatches([...rows, deleted], { search: '', collectionRole: 'exit_trade', status: 'all' }).map((w) => w.id)).toEqual(['sold', 'traded']);
    expect(filterWatches([...rows, deleted], { search: '', collectionRole: 'all', status: 'candidate' }).map((w) => w.id)).toEqual(['candidate']);
    expect(filterWatches([...rows, deleted], { search: 'explorer', collectionRole: 'all', status: 'all' }).map((w) => w.id)).toEqual(['future-owned']);
  });
});
