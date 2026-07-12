import { useState } from 'react';
import { useCadence } from '../lib/store';
import { useAgendaQueue } from '../lib/agendaQueue';
import { initials } from '../lib/util';
import type { WorkItem } from '../lib/types';

// One-tap "raise this at the next 1:1" from anywhere a task is visible.
// Queues the item (title + source_item_id, so the agenda row and the ledger
// row stay one record) into the person's hidden agenda queue; the meeting
// modal merges it when the next 1:1 opens. If the task has no person, a
// picker chooses whom to raise it with.
export function RaiseAt1on1Button({ task, compact }: { task: WorkItem; compact?: boolean }) {
  const { data } = useCadence();
  const { enqueue } = useAgendaQueue();
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<'idle' | 'queued' | 'duplicate'>('idle');

  const people = data.people.filter((p) => !p.type || p.type === 'person');

  const raise = async (personId: string) => {
    setOpen(false);
    const result = await enqueue(personId, {
      title: task.title,
      notes: task.notes || '',
      source_item_id: task.id,
    });
    setState(result === 'queued' ? 'queued' : 'duplicate');
    setTimeout(() => setState('idle'), 2000);
  };

  const label = state === 'queued' ? '✓ Queued' : state === 'duplicate' ? 'Already queued' : compact ? '🗓 1:1' : '🗓 Raise at next 1:1';

  const knownPerson = task.person_id
    || (task.related_entities || []).find((re) => re.type === 'person')?.id
    || null;

  return (
    <div style={{ position: 'relative', display: 'inline-flex' }}>
      <button
        className="btn btn-ghost btn-sm raise-1on1-btn"
        title="Add to this person's next 1:1 agenda"
        disabled={state !== 'idle'}
        onClick={() => (knownPerson ? void raise(knownPerson) : setOpen((s) => !s))}
      >{label}</button>
      {open && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 49 }} onClick={() => setOpen(false)} />
          <div className="action-send-picker">
            <div className="send-picker-section">Raise with…</div>
            {people.map((p) => (
              <button key={p.id} className="send-picker-option" onClick={() => void raise(p.id)}>
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
