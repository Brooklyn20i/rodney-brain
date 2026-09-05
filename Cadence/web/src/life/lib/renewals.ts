import { rollForward } from './lifeCalc';
import type { CadenceLifeData, LifeItem, Obligation } from './types';

export type RenewalCompletionResult = { obligation: Obligation; history: LifeItem; already_completed?: boolean };

type AtomicRenewalMutation = {
  data: CadenceLifeData;
  completeObligation: (id: string, expectedDue: string, todayIso: string) => Promise<RenewalCompletionResult>;
};

type OfflineRenewalMutation = {
  data: CadenceLifeData;
  insert: (table: 'life_items', row: Partial<LifeItem>) => Promise<LifeItem>;
  update: (table: 'obligations', id: string, patch: Partial<Obligation>) => Promise<Obligation>;
};

export type RenewalMutation = AtomicRenewalMutation | OfflineRenewalMutation;

export function renewalCycleKey(obligation: Pick<Obligation, 'id' | 'next_due'>): string {
  return `${obligation.id}:${obligation.next_due}`;
}

function existingHistory(data: CadenceLifeData, obligation: Obligation): LifeItem | null {
  return (
    data.life_items.find(
      (item) =>
        !item.deleted_at &&
        item.status === 'done' &&
        item.obligation_id === obligation.id &&
        item.due_date === obligation.next_due
    ) ?? null
  );
}

function evidenceNotes(obligation: Obligation, todayIso: string, nextDue: string): string {
  const evidence = `Renewal cycle ${renewalCycleKey(obligation)} completed ${todayIso}; next due ${nextDue}.`;
  return obligation.notes.trim() ? `${obligation.notes.trim()}\n\n${evidence}` : evidence;
}

export async function completeRenewalCycle(
  mutation: RenewalMutation,
  obligation: Obligation,
  todayIso: string
): Promise<RenewalCompletionResult> {
  if ('completeObligation' in mutation) {
    return mutation.completeObligation(obligation.id, obligation.next_due, todayIso);
  }

  const nextDue = rollForward(obligation, todayIso);
  let history = existingHistory(mutation.data, obligation);
  if (!history) {
    history = await mutation.insert('life_items', {
      title: obligation.name,
      notes: evidenceNotes(obligation, todayIso, nextDue),
      status: 'done',
      category: obligation.category,
      due_date: obligation.next_due,
      obligation_id: obligation.id,
      completed_at: new Date().toISOString(),
    });
  }
  const updated = await mutation.update('obligations', obligation.id, { next_due: nextDue });
  return { obligation: updated, history };
}
