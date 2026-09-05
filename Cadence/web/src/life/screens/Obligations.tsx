import { useRef, useState } from 'react';
import { useCadenceLife } from '../lib/store';
import { ScreenHeader, Card, EmptyState } from '../components/bits';
import {
  CATEGORY_ICON,
  CATEGORY_LABEL,
  LIFE_CATEGORIES,
  type LifeCategory,
  type Obligation,
} from '../lib/types';
import {
  cadenceLabel,
  dueLabel,
  dueState,
  fmtAmount,
  isValidLocalDate,
  parseNonNegativeAmount,
  parseNonNegativeInteger,
  parsePositiveInteger,
  todayLocalISO,
} from '../lib/lifeCalc';

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

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

function validateDraft(draft: Draft) {
  const name = draft.name.trim();
  if (!name) throw new Error('Obligation name is required.');
  if (!isValidLocalDate(draft.next_due)) throw new Error('Enter a real due date.');
  const cadence = parsePositiveInteger(draft.cadence_months, 'Frequency');
  if (cadence > 1200) throw new Error('Frequency must be 1200 months or less.');
  const lead = parseNonNegativeInteger(draft.lead_days, 'Lead days');
  if (lead > 3660) throw new Error('Lead days must be 3660 or less.');
  const amount = parseNonNegativeAmount(draft.amount);
  return {
    name,
    category: draft.category,
    cadence_months: cadence,
    next_due: draft.next_due,
    lead_days: lead,
    amount,
    notes: draft.notes,
  };
}

// The obligations register: everything that comes back — BAS, rego,
// insurance, passport. Stores only the NEXT date and the cycle; Done ✓ uses
// the atomic server renewal mutation so history and next_due move together.
export function Obligations({ onMenu }: { onMenu: () => void }) {
  const { data, insert, update, completeObligation, remove, loading, syncError } = useCadenceLife();
  const today = todayLocalISO();

  const obligations = data.obligations
    .filter((o) => !o.deleted_at)
    .sort((a, b) => a.next_due.localeCompare(b.next_due));

  const [editing, setEditing] = useState<string | 'new' | null>(null);
  const [draft, setDraft] = useState<Draft>(() => emptyDraft(today));
  const [localError, setLocalError] = useState<string | null>(null);
  const [busy, setBusy] = useState<Set<string>>(() => new Set());
  const busyRef = useRef<Set<string>>(new Set());
  const set = (patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch }));

  const startNew = () => {
    setLocalError(null);
    setDraft(emptyDraft(today));
    setEditing('new');
  };
  const startEdit = (ob: Obligation) => {
    setLocalError(null);
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
    let row: ReturnType<typeof validateDraft>;
    try {
      row = validateDraft(draft);
    } catch (error) {
      setLocalError(errorMessage(error, 'Invalid obligation'));
      return;
    }

    setLocalError(null);
    try {
      if (editing === 'new') await insert('obligations', row);
      else if (editing) await update('obligations', editing, row);
      setEditing(null);
    } catch (error) {
      setLocalError(errorMessage(error, 'Save failed'));
    }
  };

  const completeRenewal = async (ob: Obligation) => {
    const key = `${ob.id}:${ob.next_due}`;
    if (busyRef.current.has(key)) return;
    busyRef.current.add(key);
    setBusy((b) => new Set(b).add(key));
    setLocalError(null);
    try {
      await completeObligation(ob.id, ob.next_due, today);
    } catch (error) {
      setLocalError(errorMessage(error, 'Renewal completion failed'));
    } finally {
      busyRef.current.delete(key);
      setBusy((b) => {
        const next = new Set(b);
        next.delete(key);
        return next;
      });
    }
  };

  const deleteObligation = async (ob: Obligation) => {
    setLocalError(null);
    try {
      await remove('obligations', ob.id);
    } catch (error) {
      setLocalError(errorMessage(error, 'Delete failed'));
    }
  };

  const form = (
    <Card title={editing === 'new' ? 'New obligation' : 'Edit obligation'}>
      {localError && <div className="life-error">{localError}</div>}
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
          <input type="number" aria-label="Lead days" min={0} max={3660} value={draft.lead_days} onChange={(e) => set({ lead_days: Number(e.target.value) })} />
        </div>
        <div>
          <label className="field">Typical cost ($, optional)</label>
          <input type="number" aria-label="Typical cost" inputMode="decimal" min={0} value={draft.amount} onChange={(e) => set({ amount: e.target.value })} />
        </div>
        <div>
          <label className="field">Notes</label>
          <input type="text" aria-label="Obligation notes" value={draft.notes} onChange={(e) => set({ notes: e.target.value })} />
        </div>
      </div>
      <div className="life-shortcuts">
        <button className="btn btn-primary" onClick={() => void saveDraft()} disabled={!draft.name.trim()}>
          {editing === 'new' ? 'Add obligation' : 'Save obligation changes'}
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
        {!editing && (syncError || localError) && <div className="life-error">{syncError || localError}</div>}
        {!editing && loading && <div className="life-error">Life data is loading; do not treat an empty register as clear yet.</div>}
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
                  const key = `${ob.id}:${ob.next_due}`;
                  return (
                    <div key={ob.id} className="life-row">
                      <span className="life-row-icon">{CATEGORY_ICON[ob.category]}</span>
                      <div className="life-row-main">
                        <span className="life-row-title">{ob.name}</span>
                        <span className="life-row-sub">
                          {cadenceLabel(ob.cadence_months)} · Next due {ob.next_due}
                          {ob.amount != null ? ` · ${fmtAmount(ob.amount)}` : ''}
                          {ob.notes ? ` · ${ob.notes}` : ''}
                        </span>
                      </div>
                      <span className={`life-due ${state === 'upcoming' ? '' : state === 'overdue' ? 'overdue' : 'due'}`}>
                        {dueLabel(ob.next_due, today)}
                      </span>
                      {state !== 'upcoming' && (
                        <button
                          className="btn btn-primary btn-sm"
                          aria-label={`Complete ${ob.name} renewal`}
                          onClick={() => void completeRenewal(ob)}
                          disabled={busy.has(key)}
                        >
                          {busy.has(key) ? 'Completing…' : 'Done ✓'}
                        </button>
                      )}
                      <button className="btn btn-secondary btn-sm" aria-label={`Edit ${ob.name}`} onClick={() => startEdit(ob)}>
                        ✎
                      </button>
                      <button className="btn btn-danger btn-sm" aria-label={`Delete ${ob.name}`} onClick={() => void deleteObligation(ob)}>
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
