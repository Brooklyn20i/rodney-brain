import { useState } from 'react';
import { useCadence } from '../lib/store';
import { readRaiseList, useRaiseList } from '../lib/raiseList';
import { initials } from '../lib/util';
import type { WorkItem } from '../lib/types';

// One-tap "raise this at the next 1:1" from anywhere a task is visible. A
// TOGGLE on the task itself: the id is flagged in the person's raise list, and
// the same record groups under "Next 1:1" at the top of their page — no copy,
// no separate agenda. If the task has no person, a picker chooses whom to
// raise it with (and links them so the flag has a page to live on).
export function RaiseAt1on1Button({ task, compact }: { task: WorkItem; compact?: boolean }) {
  const { data, update } = useCadence();
  const { raise, toggle } = useRaiseList();
  const [open, setOpen] = useState(false);

  const people = data.people.filter((p) => !p.type || p.type === 'person');

  const knownPerson = task.person_id
    || (task.related_entities || []).find((re) => re.type === 'person')?.id
    || null;

  const raised = knownPerson
    ? readRaiseList(data.notes, data.work_items, knownPerson).includes(task.id)
    : false;

  const raiseWith = async (personId: string) => {
    setOpen(false);
    // Link the person (never moving the ball) so the flag survives the prune
    // and the task shows on their page under "Involved" + "Next 1:1".
    if (!isLinked(task, personId)) {
      const p = data.people.find((x) => x.id === personId);
      if (p) {
        await update('work_items', task.id, {
          related_entities: [...(task.related_entities || []), { type: 'person', id: p.id, name: p.name }],
        } as Partial<WorkItem>);
      }
    }
    await raise(personId, task.id);
  };

  const label = raised ? '✓ On 1:1 list' : compact ? '🗓 1:1' : '🗓 Raise at next 1:1';

  return (
    <div style={{ position: 'relative', display: 'inline-flex' }}>
      <button
        className={`btn btn-ghost btn-sm raise-1on1-btn${raised ? ' active' : ''}`}
        title={raised ? 'Remove from next 1:1' : "Flag for this person's next 1:1"}
        aria-pressed={raised}
        onClick={() => (knownPerson ? void toggle(knownPerson, task.id) : setOpen((s) => !s))}
      >{label}</button>
      {open && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 49 }} onClick={() => setOpen(false)} />
          <div className="action-send-picker">
            <div className="send-picker-section">Raise with…</div>
            {people.map((p) => (
              <button key={p.id} className="send-picker-option" onClick={() => void raiseWith(p.id)}>
                <span className="avatar avatar-sm" style={{ background: p.color || '#3A7CA5' }}>{initials(p.name)}</span>
                {p.name}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

const isLinked = (task: WorkItem, personId: string): boolean =>
  task.person_id === personId ||
  (task.related_entities || []).some((re) => re.type === 'person' && re.id === personId);
