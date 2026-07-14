import { useState } from 'react';
import { useCadence } from '../lib/store';
import type { ItemType, Priority, WorkItem, RelatedEntity, Comment } from '../lib/types';
import { Modal } from './bits';
import { EntityLinkPicker } from './EntityLinkPicker';
import { BallControl } from './BallControl';
import type { LedgerDirection } from './LedgerDirectionToggle';
import { TaskNotesEditor } from './TaskNotesEditor';
import { TaskUpdates } from './TaskUpdates';

const TYPES: { v: ItemType; label: string }[] = [
  { v: 'task', label: 'Task' },
  { v: 'followUp', label: 'Follow Up' }, { v: 'waitingFor', label: 'Waiting For' },
  { v: 'risk', label: 'Risk' }, { v: 'action', label: 'Meeting Action' },
];
const PRIORITIES: Priority[] = ['high', 'medium', 'low'];

export function ItemModal({ existing, defaults, onClose }: {
  existing?: WorkItem; defaults?: Partial<WorkItem>; onClose: () => void;
}) {
  const { data, insert, update, logActivity } = useCadence();
  const base = existing || defaults || {};
  const [title, setTitle] = useState(base.title || '');
  const [type, setType] = useState<ItemType>((base.type as ItemType) || 'task');
  const [priority, setPriority] = useState<Priority>((base.priority as Priority) || 'medium');
  const [due, setDue] = useState(base.due_date || '');
  const [notes, setNotes] = useState(base.notes || '');
  const [busy, setBusy] = useState(false);

  // Build initial links from related_entities (preferred) or from person_id/project_id
  const [links, setLinks] = useState<RelatedEntity[]>(() => {
    const re = base.related_entities;
    if (re && re.length > 0) return re;
    const seed: RelatedEntity[] = [];
    if (base.person_id) {
      const p = data.people.find((p) => p.id === base.person_id);
      if (p) seed.push({ type: 'person', id: p.id, name: p.name });
    }
    if (base.project_id) {
      const p = data.projects.find((p) => p.id === base.project_id);
      if (p) seed.push({ type: 'project', id: p.id, name: p.name });
    }
    return seed;
  });

  // "Who has the ball": the counterparty among the linked people. Falls back
  // to the first linked person when the current holder gets unlinked.
  const [counterpartyId, setCounterpartyId] = useState<string | null>(base.person_id || null);
  const linkedPeople = links.filter((l) => l.type === 'person');
  const effectiveCounterparty =
    linkedPeople.find((l) => l.id === counterpartyId)?.id || linkedPeople[0]?.id || null;
  const direction: LedgerDirection = type === 'waitingFor' ? 'theyOwe' : 'iOwe';

  const save = async () => {
    if (!title.trim()) return;
    setBusy(true);
    try {
      const person_id = effectiveCounterparty;
      const project_id = links.find((l) => l.type === 'project')?.id || null;
      const filed = !!(person_id || project_id || due);
      const patch = {
        title: title.trim(), type, priority, due_date: due || null,
        project_id, person_id,
        related_entities: links,
        notes,
      } as Partial<WorkItem>;
      if (existing) {
        // Editing an inboxed Quick Capture should not silently file it just
        // because Rodney adds a due date/person/project while clarifying it.
        // Only explicit triage actions should clear `inboxed`.
        const filingPatch = filed && !existing.inboxed ? { inboxed: false } : {};
        await update('work_items', existing.id, { ...patch, ...filingPatch } as Partial<WorkItem>);
        // A handoff (new counterparty or flipped direction) goes on the record.
        const oldDir: LedgerDirection = existing.type === 'waitingFor' ? 'theyOwe' : 'iOwe';
        const holder = linkedPeople.find((l) => l.id === person_id);
        if (holder && (person_id !== existing.person_id || (type !== existing.type && (type === 'waitingFor' || existing.type === 'waitingFor')))) {
          const newDir: LedgerDirection = type === 'waitingFor' ? 'theyOwe' : 'iOwe';
          if (person_id !== existing.person_id || newDir !== oldDir) {
            const text = newDir === 'theyOwe' ? `→ ${holder.name} owes me` : `→ I owe ${holder.name}`;
            await insert('comments', { work_item_id: existing.id, text, author: 'system' } as Partial<Comment>);
            logActivity('swap_direction', text);
          }
        }
        logActivity('edit_item', title.trim());
      } else {
        await insert('work_items', { ...patch, inboxed: filed ? false : ((base as any).inboxed ?? true), source: (base as any).source || 'you' } as Partial<WorkItem>);
        logActivity('add_item', title.trim());
      }
      onClose();
    } finally { setBusy(false); }
  };

  return (
    <Modal title={existing ? 'Edit Item' : 'New Item'} onClose={onClose}
      footer={<>
        <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
      </>}>
      <div className="form-group">
        <label>Title</label>
        <input type="text" autoFocus value={title} placeholder="What needs to happen?"
          onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') save(); }} />
      </div>
      {linkedPeople.length > 0 && (
        <div className="form-group">
          <label>Ledger — who has the ball</label>
          <BallControl
            people={linkedPeople.map((l) => ({ id: l.id, name: l.name }))}
            counterpartyId={effectiveCounterparty}
            direction={direction}
            onChange={({ counterpartyId: cid, direction: d }) => {
              setCounterpartyId(cid);
              setType(d === 'theyOwe' ? 'waitingFor' : 'task');
            }}
          />
        </div>
      )}

      <div className="form-row">
        <div className="form-group"><label>Type</label>
          <select value={type} onChange={(e) => setType(e.target.value as ItemType)}>
            {TYPES.map((t) => <option key={t.v} value={t.v}>{t.label}</option>)}
          </select>
        </div>
        <div className="form-group"><label>Priority</label>
          <select value={priority} onChange={(e) => setPriority(e.target.value as Priority)}>
            {PRIORITIES.map((p) => <option key={p} value={p}>{p[0].toUpperCase() + p.slice(1)}</option>)}
          </select>
        </div>
      </div>
      <div className="form-group">
        <label>Due Date</label>
        <input type="date" value={due} onChange={(e) => setDue(e.target.value)} />
      </div>

      {/* Multi-link section */}
      <div className="form-group">
        <label>Links — people, projects &amp; meetings</label>
        <EntityLinkPicker links={links} onChange={setLinks} />
      </div>

      <TaskNotesEditor initial={base.notes || ''} onDraftChange={setNotes} compact />

      {existing && <TaskUpdates workItemId={existing.id} createdAt={existing.created_at} />}
    </Modal>
  );
}
