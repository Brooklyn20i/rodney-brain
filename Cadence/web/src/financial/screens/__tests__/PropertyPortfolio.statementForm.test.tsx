import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Property } from '../../lib/types';
import { SCHEDULED_PROPERTY_LEDGER_NOTE } from '../../lib/propertyCalc';
import { StatementForm } from '../PropertyPortfolio';

afterEach(cleanup);

const property = { id: 'property-demo', address: '1 Example Street' } as Property;

describe('PropertyPortfolio StatementForm entry basis', () => {
  it('persists scheduled status and a rolling-deploy fallback note', async () => {
    const insert = vi.fn().mockResolvedValue({});
    const onDone = vi.fn();

    render(
      <StatementForm
        properties={[property]}
        defaultPeriod="2026-08"
        defaultPropertyId={property.id}
        onDone={onDone}
        insert={insert as never}
      />
    );

    fireEvent.change(screen.getByRole('combobox', { name: 'Entry basis' }), {
      target: { value: 'scheduled' },
    });
    fireEvent.change(screen.getByRole('textbox', { name: 'Council rates amount' }), {
      target: { value: '900' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save statement' }));

    await waitFor(() => expect(insert).toHaveBeenCalledTimes(1));
    expect(insert).toHaveBeenCalledWith(
      'property_ledger',
      expect.objectContaining({
        property_id: property.id,
        period: '2026-08',
        category: 'council_rates',
        amount: 900,
        status: 'scheduled',
        notes: SCHEDULED_PROPERTY_LEDGER_NOTE,
      })
    );
    expect(onDone).toHaveBeenCalledWith('2026-08');
  });
});

describe('statement interest replaces a backfilled estimate', () => {
  const estimateRow = {
    id: 'est-1', owner_id: 't', property_id: 'property-demo', period: '2026-07',
    entry_date: '2026-07-01', category: 'interest', amount: 1500, status: 'actual',
    grade: 'assumption', source: 'Derived from loan terms (net debt × rate)',
    notes: 'Estimated — replace with the statement figure when available.',
    created_at: '', updated_at: '', deleted_at: null,
  };

  it('logging the real interest figure UPDATES the assumption row — never double-counts', async () => {
    const insert = vi.fn().mockResolvedValue({});
    const update = vi.fn().mockResolvedValue({});
    render(
      <StatementForm
        properties={[property]}
        defaultPeriod="2026-07"
        defaultPropertyId={property.id}
        onDone={vi.fn()}
        insert={insert as never}
        update={update as never}
        ledger={[estimateRow as never]}
      />
    );
    fireEvent.change(screen.getByRole('textbox', { name: 'Loan interest amount' }), {
      target: { value: '1450' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save statement' }));

    await waitFor(() => expect(update).toHaveBeenCalledTimes(1));
    expect(update).toHaveBeenCalledWith('property_ledger', 'est-1', expect.objectContaining({
      category: 'interest', amount: 1450, grade: 'statement',
    }));
    expect(insert).not.toHaveBeenCalled(); // the month must not end up with BOTH rows
  });

  it('a fresh month with no estimate still inserts normally', async () => {
    const insert = vi.fn().mockResolvedValue({});
    const update = vi.fn().mockResolvedValue({});
    render(
      <StatementForm
        properties={[property]}
        defaultPeriod="2026-08"
        defaultPropertyId={property.id}
        onDone={vi.fn()}
        insert={insert as never}
        update={update as never}
        ledger={[estimateRow as never]} // estimate belongs to July, not August
      />
    );
    fireEvent.change(screen.getByRole('textbox', { name: 'Loan interest amount' }), {
      target: { value: '1500' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save statement' }));

    await waitFor(() => expect(insert).toHaveBeenCalledTimes(1));
    expect(update).not.toHaveBeenCalled();
  });
});
