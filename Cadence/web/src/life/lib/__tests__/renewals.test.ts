import { describe, expect, it, vi } from 'vitest';
import { completeRenewalCycle, renewalCycleKey } from '../renewals';
import type { CadenceLifeData, LifeItem, Obligation } from '../types';

const stamp = { created_at: '2026-01-01', updated_at: '2026-01-01', deleted_at: null };

const ob = (over: Partial<Obligation> = {}): Obligation => ({
  id: 'ob-1',
  owner_id: 'o',
  name: 'Car rego',
  category: 'vehicles',
  cadence_months: 12,
  next_due: '2026-09-01',
  lead_days: 30,
  amount: 890,
  notes: 'Pay through state portal',
  ...stamp,
  ...over,
});

const history = (over: Partial<LifeItem> = {}): LifeItem => ({
  id: 'hist-1',
  owner_id: 'o',
  title: 'Car rego',
  notes: '',
  status: 'done',
  category: 'vehicles',
  due_date: '2026-09-01',
  obligation_id: 'ob-1',
  completed_at: '2026-09-02T00:00:00.000Z',
  ...stamp,
  ...over,
});

const data = (): CadenceLifeData => ({ life_items: [], obligations: [ob()] });

describe('renewal completion helper', () => {
  it('uses the stable obligation/due cycle identity expected by the atomic RPC', () => {
    expect(renewalCycleKey(ob())).toBe('ob-1:2026-09-01');
  });

  it('calls the atomic completeObligation mutation with expected due and today', async () => {
    const mutation = vi.fn(async () => ({ obligation: ob({ next_due: '2027-09-01' }), history: history() }));
    const result = await completeRenewalCycle({ data: data(), completeObligation: mutation }, ob(), '2026-09-05');

    expect(mutation).toHaveBeenCalledWith('ob-1', '2026-09-01', '2026-09-05');
    expect(result.obligation.next_due).toBe('2027-09-01');
    expect(result.history.obligation_id).toBe('ob-1');
  });

  it('falls back offline without duplicating history when a failed roll-forward is retried', async () => {
    const d = data();
    let insertCalls = 0;
    const insert = vi.fn(async (_table: 'life_items', row: Partial<LifeItem>) => {
      insertCalls += 1;
      const saved = history({ id: `hist-${insertCalls}`, ...row });
      d.life_items.push(saved);
      return saved;
    });
    const update = vi
      .fn()
      .mockRejectedValueOnce(new Error('network lost after history'))
      .mockImplementation(async (_table: 'obligations', _id: string, patch: Partial<Obligation>) => {
        d.obligations[0] = { ...d.obligations[0], ...patch };
        return d.obligations[0];
      });

    await expect(completeRenewalCycle({ data: d, insert, update }, ob(), '2026-09-05')).rejects.toThrow(/network lost/);
    await completeRenewalCycle({ data: d, insert, update }, ob(), '2026-09-05');

    expect(insert).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledTimes(2);
    expect(d.life_items).toHaveLength(1);
    expect(d.life_items[0].notes).toMatch(/Renewal cycle ob-1:2026-09-01/);
  });
});
