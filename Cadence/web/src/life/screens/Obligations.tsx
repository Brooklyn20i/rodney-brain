import { useState } from 'react';
import { useCadenceLife } from '../lib/store';
import { ScreenHeader, Card, EmptyState } from '../components/bits';
import {
  CATEGORY_ICON,
  CATEGORY_LABEL,
  LIFE_CATEGORIES,
  type LifeCategory,
  type Obligation,
} from '../lib/types';
import { cadenceLabel, dueLabel, dueState, fmtAmount, fmtDay, rollForward, todayLocalISO } from '../lib/lifeCalc';

const CADENCES: { months: number; label: string }[] = [
  { months: 1, label: 'Monthly' },
  { months: 3, label: 'Quarterly' },
  { months: 6, label: 'Half-yearly' },
  { months: 12, label: 'Yearly' },
  { months: 24, label: 'Every 2 years' },
  { months: 60, label: 'Every 5 years' },
  { months: 120, label: 'Every 10 years' },
];

type Draft = {
  name: string;
  category: LifeCategory;
  cadence_months: number;
  next_due: string;
  lead_days: number;
  amount: string;
  notes: string;
};

const emptyDraft = (today: string): Draft => ({
  name: '',
  category: 'bills',
  cadence_months: 12,
  next_due: today,
  lead_days: 14,
  amount: '',
  notes: '',
});

// The obligations register: everything that comes back — BAS, rego,
// insurance, passport. Stores only the NEXT date and the cycle; Done ✓
// rolls forward and logs history, so nothing is generated and nothing rots.
export function Obligations({ onMenu }: { onMenu: () => void }) {
  const { data, insert, update, remove } = useCadenceLife();
  const today = todayLocalISO();

  const obligations = data.obligations
    .filter((o) => !o.deleted_at)
    .sort((a, b) => a.next_due.localeCompare(b.next_due));

  const [editing, setEditing] = useState<string | 'new' | null>(null);
  const [draft, setDraft] = useState<Draft>(() => emptyDraft(today));
  const set = (patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch }));

  const startNew = () => {
    setDraft(emptyDraft(today));
    setEditing('new');
  };
  const startEdit = (ob: Obligation) => {
    setDraft({
      name: ob.name,
      category: ob.category,
      cadence_months: ob.cadence_months,
      next_due: ob.next_due,
      lead_days: ob.lead_days,
      amount: ob.amount != null ? String(ob.amount) : '',
      notes: ob.notes,
    });
    setEditing(ob.id);
  };

  const saveDraft = async () => {
    const name = draft.name.trim();
    if (!name || !/^\d{4}-\d{2}-\d{2}$/.test(draft.next_due)) return;
    const row = {
      name,
      category: draft.category,
      cadence_months: draft.cadence_months,
      next_due: draft.next_due,
      lead_days: Math.max(0, Math.round(draft.lead_days)),
      amount: draft.amount.trim() === '' ? null : Number(draft.amount),
      notes: draft.notes,
    };
    if (editing === 'new') await insert('obligations', row);
    else if (editing) await update('obligations', editing, row);
    setEditing(null);
  };

  const completeObligation = async (ob: Obligation) => {
    await insert('life_items', {
      title: ob.name,
      notes: '',
      status: 'done',
      category: ob.category,
      due_date: ob.next_due,
      obligation_id: ob.id,
      completed_at: new Date().toISOString(),
    });
    await update('obligations', ob.id, { next_due: rollForward(ob, today) });
  };

  const form = (
    <Card title={editing === 'new' ? 'New obligation' : 'Edit obligation'}>
      <div className="form-grid">
        <div>
          <label className="field">Name</label>
          <input type="text" aria-label="Obligation name" value={draft.name} placeholder="e.g. Car rego" onChange={(e) => set({ name: e.target.value })} />
        </div>
        <div>
          <label className="field">Category</label>
          <select aria-label="Obligation category" value={draft.category} onChange={(e) => set({ category: e.target.value as LifeCategory })}>
            {LIFE_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {CATEGORY_LABEL[c]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="field">Repeats</label>
          <select aria-label="Obligation cadence" value={draft.cadence_months} onChange={(e) => set({ cadence_months: Number(e.target.value) })}>
            {CADENCES.map((c) => (
              <option key={c.months} value={c.months}>
                {c.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="field">Next due</label>
          <input type="date" aria-label="Next due date" value={draft.next_due} onChange={(e) => set({ next_due: e.target.value })} />
        </div>
        <div>
          <label className="field">Remind (days before)</label>
          <input type="number" aria-label="Lead days" min={0} value={draft.lead_days} onChange={(e) => set({ lead_days: Number(e.target.value) })} />
        </div>
        <div>
          <label className="field">Typical cost ($, optional)</label>
          <input type="number" aria-label="Typical cost" inputMode="decimal" value={draft.amount} onChange={(e) => set({ amount: e.target.value })} />
        </div>
        <div>
          <label className="field">Notes</label>
          <input type="text" aria-label="Obligation notes" value={draft.notes} onChange={(e) => set({ notes: e.target.value })} />
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button className="btn btn-primary" onClick={() => void saveDraft()} disabled={!draft.name.trim()}>
          {editing === 'new' ? 'Add obligation' : 'Save changes'}
        </button>
        <button className="btn btn-secondary" onClick={() => setEditing(null)}>
          Cancel
        </button>
      </div>
    </Card>
  );

  return (
    <>
      <ScreenHeader title="Obligations & renewals" subtitle="Everything that comes back — tracked so nothing lapses." onMenu={onMenu}>
        <button className="btn btn-primary btn-sm" onClick={startNew}>
          + New obligation
        </button>
      </ScreenHeader>
      <div className="screen-content">
        {editing && form}
        {obligations.length === 0 && !editing ? (
          <EmptyState
            icon="↺"
            title="No obligations tracked yet"
            sub="Add the things that come back — BAS, rego, insurance, passport — and they'll surface on time."
          />
        ) : (
          obligations.length > 0 && (
            <Card title="Register">
              <div className="life-rows">
                {obligations.map((ob) => {
                  const state = dueState(ob, today);
                  return (
                    <div key={ob.id} className="life-row">
                      <span className="life-row-icon">{CATEGORY_ICON[ob.category]}</span>
                      <div className="life-row-main">
                        <span className="life-row-title">{ob.name}</span>
                        <span className="life-row-sub">
                          {cadenceLabel(ob.cadence_months)} · next {fmtDay(ob.next_due)}
                          {ob.amount != null ? ` · ${fmtAmount(ob.amount)}` : ''}
                          {ob.notes ? ` · ${ob.notes}` : ''}
                        </span>
                      </div>
                      <span className={`life-due ${state === 'upcoming' ? '' : state === 'overdue' ? 'overdue' : 'due'}`}>
                        {dueLabel(ob.next_due, today)}
                      </span>
                      {state !== 'upcoming' && (
                        <button className="btn btn-primary btn-sm" onClick={() => void completeObligation(ob)}>
                          Done ✓
                        </button>
                      )}
                      <button className="btn btn-secondary btn-sm" aria-label={`Edit ${ob.name}`} onClick={() => startEdit(ob)}>
                        ✎
                      </button>
                      <button className="btn btn-danger btn-sm" aria-label={`Delete ${ob.name}`} onClick={() => void remove('obligations', ob.id)}>
                        ✕
                      </button>
                    </div>
                  );
                })}
              </div>
            </Card>
          )
        )}
      </div>
    </>
  );
}
