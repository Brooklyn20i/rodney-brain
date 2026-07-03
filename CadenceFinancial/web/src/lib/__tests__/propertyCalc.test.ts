import { describe, expect, it } from 'vitest';
import {
  availablePeriods,
  isIncome,
  monthlyPnL,
  portfolioMonth,
  propertyYields,
  trailingAverages,
} from '../propertyCalc';
import type { Property, PropertyLedgerCategory, PropertyLedgerEntry } from '../types';

// Fictional fixtures only -- see CadenceFinancial/AGENTS.md.
let seq = 0;
function entry(
  property_id: string,
  period: string,
  category: PropertyLedgerCategory,
  amount: number
): PropertyLedgerEntry {
  return {
    id: `e-${++seq}`,
    owner_id: 'demo-owner',
    property_id,
    period,
    entry_date: `${period}-05`,
    category,
    amount,
    grade: 'statement',
    source: '',
    notes: '',
    created_at: '',
    updated_at: '',
    deleted_at: null,
  };
}

function property(id: string, value: number, address = id): Property {
  return {
    id,
    owner_id: 'demo-owner',
    entity_id: null,
    address,
    value,
    valuation_basis: '',
    evidence_status: '',
    role: '',
    annual_rent: 0,
    created_at: '',
    updated_at: '',
    deleted_at: null,
  };
}

const ledger: PropertyLedgerEntry[] = [
  // Property A, May: rent 2000, interest 500, insurance 100, water 50 => net +1350
  entry('A', '2025-05', 'rent', 2000),
  entry('A', '2025-05', 'interest', 500),
  entry('A', '2025-05', 'insurance', 100),
  entry('A', '2025-05', 'water', 50),
  // Property A, June: rent 2000 + other income 200, big repair 3000 => net -900
  entry('A', '2025-06', 'rent', 2000),
  entry('A', '2025-06', 'other_income', 200),
  entry('A', '2025-06', 'repairs_maintenance', 3000),
  entry('A', '2025-06', 'insurance', 100),
  // Property B, May: rent 1500, strata 300 => net +1200
  entry('B', '2025-05', 'rent', 1500),
  entry('B', '2025-05', 'strata', 300),
];

describe('isIncome', () => {
  it('classifies rent and other_income as income, everything else as expense', () => {
    expect(isIncome('rent')).toBe(true);
    expect(isIncome('other_income')).toBe(true);
    expect(isIncome('interest')).toBe(false);
    expect(isIncome('strata')).toBe(false);
  });
});

describe('monthlyPnL', () => {
  it('sums income and itemises expenses for a property-month', () => {
    const pnl = monthlyPnL(ledger, 'A', '2025-05');
    expect(pnl.rent).toBeCloseTo(2000, 2);
    expect(pnl.otherIncome).toBeCloseTo(0, 2);
    expect(pnl.totalIncome).toBeCloseTo(2000, 2);
    expect(pnl.totalExpenses).toBeCloseTo(650, 2);
    expect(pnl.netCashflow).toBeCloseTo(1350, 2);
    expect(pnl.expensesByCategory.interest).toBeCloseTo(500, 2);
    expect(pnl.expensesByCategory.insurance).toBeCloseTo(100, 2);
    expect(pnl.expensesByCategory.water).toBeCloseTo(50, 2);
    // Categories with no entry are absent, not zero.
    expect(pnl.expensesByCategory.strata).toBeUndefined();
  });

  it('counts other_income and can produce a negative month on a big repair', () => {
    const pnl = monthlyPnL(ledger, 'A', '2025-06');
    expect(pnl.totalIncome).toBeCloseTo(2200, 2); // 2000 rent + 200 other
    expect(pnl.totalExpenses).toBeCloseTo(3100, 2); // 3000 repair + 100 insurance
    expect(pnl.netCashflow).toBeCloseTo(-900, 2);
  });

  it('returns an all-zero P&L for a property-month with no entries', () => {
    const pnl = monthlyPnL(ledger, 'A', '2025-01');
    expect(pnl.totalIncome).toBe(0);
    expect(pnl.totalExpenses).toBe(0);
    expect(pnl.netCashflow).toBe(0);
  });
});

describe('portfolioMonth', () => {
  const properties = [property('A', 500_000, '1 Test St'), property('B', 300_000, '2 Test St')];

  it('aggregates across properties and reports where costs come from', () => {
    const pm = portfolioMonth(ledger, properties, '2025-05');
    expect(pm.totalIncome).toBeCloseTo(3500, 2); // 2000 + 1500
    expect(pm.totalExpenses).toBeCloseTo(950, 2); // 650 + 300
    expect(pm.netCashflow).toBeCloseTo(2550, 2);
    expect(pm.byCategory.interest).toBeCloseTo(500, 2);
    expect(pm.byCategory.strata).toBeCloseTo(300, 2);
    // Per-property rows carry address + value through.
    const rowA = pm.rows.find((r) => r.propertyId === 'A')!;
    expect(rowA.address).toBe('1 Test St');
    expect(rowA.value).toBe(500_000);
  });

  it('reconciles: sum of per-property net equals portfolio net', () => {
    const pm = portfolioMonth(ledger, properties, '2025-05');
    const sumRows = pm.rows.reduce((s, r) => s + r.netCashflow, 0);
    expect(sumRows).toBeCloseTo(pm.netCashflow, 2);
  });
});

describe('availablePeriods', () => {
  it('returns sorted unique periods', () => {
    expect(availablePeriods(ledger)).toEqual(['2025-05', '2025-06']);
  });
});

describe('trailingAverages', () => {
  it('averages only over months that have entries for the property', () => {
    // Property A has two months: net +1350 and -900 => avg net 225.
    const t = trailingAverages(ledger, 'A');
    expect(t.months).toBe(2);
    expect(t.avgIncome).toBeCloseTo((2000 + 2200) / 2, 2); // 2100
    expect(t.avgExpenses).toBeCloseTo((650 + 3100) / 2, 2); // 1875
    expect(t.avgNet).toBeCloseTo((1350 - 900) / 2, 2); // 225
  });

  it('is empty for a property with no ledger', () => {
    expect(trailingAverages(ledger, 'Z').months).toBe(0);
  });
});

describe('propertyYields', () => {
  it('annualises monthly figures against value', () => {
    const y = propertyYields(2000, 1350, 500_000);
    expect(y.grossYield).toBeCloseTo((2000 * 12) / 500_000, 6); // 4.8%
    expect(y.netYield).toBeCloseTo((1350 * 12) / 500_000, 6); // 3.24%
  });

  it('returns null yields when value is zero', () => {
    expect(propertyYields(2000, 1350, 0)).toEqual({ grossYield: null, netYield: null });
  });
});
