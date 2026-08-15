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
