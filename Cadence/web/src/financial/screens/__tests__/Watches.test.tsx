import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { CadenceFinancialCtx, type Ctx } from '../../lib/store';
import { emptyData, type Watch } from '../../lib/types';
import { Watches } from '../Watches';

const base: Omit<Watch, 'id' | 'brand' | 'model'> = {
  owner_id: 'owner',
  reference: '',
  nickname: '',
  year: null,
  collection_role: 'permanent',
  ownership_status: 'owned',
  currency: 'AUD',
  purchase_price: null,
  purchase_date: null,
  current_value: null,
  value_as_of: null,
  valuation_source: '',
  insurance_value: null,
  full_set_status: 'unknown',
  accessories: '',
  material: '',
  dial: '',
  service_history: '',
  provenance: '',
  insurance_notes: '',
  storage_location: '',
  security_notes: '',
  notes: '',
  sentimental: true,
  external_ref: '',
  created_at: '2026-07-17T00:00:00Z',
  updated_at: '2026-07-17T00:00:00Z',
  deleted_at: null,
};

function renderWatches() {
  const watches: Watch[] = [
    { ...base, id: 'one', brand: 'Rolex', model: 'GMT-Master II' },
    { ...base, id: 'two', brand: 'Cartier', model: 'Tank' },
  ];
  const data = emptyData();
  data.watches = watches;
  const update = vi.fn();
  const value: Ctx = {
    demo: false,
    data,
    insert: vi.fn(),
    update,
    remove: vi.fn(),
    syncError: null,
    clearSyncError: vi.fn(),
  };
  const view = render(
    <CadenceFinancialCtx.Provider value={value}>
      <Watches onMenu={vi.fn()} />
    </CadenceFinancialCtx.Provider>,
  );
  return { ...view, update };
}

describe('Watches screen', () => {
  it('resets the edit form when the selected watch changes', () => {
    renderWatches();
    fireEvent.click(screen.getAllByRole('button', { name: 'Edit' })[0]);
    const firstBrandInput = screen.getAllByRole('textbox')[0];
    expect(firstBrandInput).toHaveValue('Rolex');
    fireEvent.change(firstBrandInput, { target: { value: 'Wrong row value' } });

    fireEvent.click(screen.getAllByRole('button', { name: 'Edit' })[1]);

    expect(screen.getAllByRole('textbox')[0]).toHaveValue('Cartier');
  });

  it('rejects invalid year text instead of silently clearing the stored year', async () => {
    const { update } = renderWatches();
    fireEvent.click(screen.getAllByRole('button', { name: 'Edit' })[0]);
    fireEvent.change(screen.getAllByRole('textbox')[4], { target: { value: '202A' } });

    fireEvent.click(screen.getByRole('button', { name: 'Save watch' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Year must be a whole number or blank.');
    expect(update).not.toHaveBeenCalled();
  });
});
