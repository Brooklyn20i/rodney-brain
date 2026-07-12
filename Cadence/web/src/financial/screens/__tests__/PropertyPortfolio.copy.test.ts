import { describe, expect, it } from 'vitest';
import { PROPERTY_EXPENSE_BREAKDOWN_HELP, propertyExpenseBreakdownTitle } from '../PropertyPortfolio';

describe('PropertyPortfolio expense breakdown copy', () => {
  it('labels the portfolio expense chart as a monthly expense breakdown', () => {
    expect(propertyExpenseBreakdownTitle('2026-07')).toBe('Monthly expense breakdown — July 2026');
    expect(propertyExpenseBreakdownTitle('2026-07')).not.toMatch(/where the costs come from/i);
  });

  it('explains the chart scope so it is not confused with full portfolio costs', () => {
    expect(PROPERTY_EXPENSE_BREAKDOWN_HELP).toMatch(/logged property expenses/i);
    expect(PROPERTY_EXPENSE_BREAKDOWN_HELP).toMatch(/selected month/i);
    expect(PROPERTY_EXPENSE_BREAKDOWN_HELP).toMatch(/excludes rent, other income, loan principal and offset transfers/i);
    expect(PROPERTY_EXPENSE_BREAKDOWN_HELP).toMatch(/interest-only cashflow/i);
  });
});
