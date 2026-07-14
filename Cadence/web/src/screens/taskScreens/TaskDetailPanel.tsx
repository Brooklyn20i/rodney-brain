import { useEffect, useState } from 'react';
import { useCadence } from '../../lib/store';
import type { ItemType, Priority, WorkItem, RelatedEntity } from '../../lib/types';
import { EntityLinkPicker } from '../../components/EntityLinkPicker';
import { RaiseAt1on1Button } from '../../components/RaiseAt1on1Button';
import { BallControl } from '../../components/BallControl';
import type { BallState } from '../../components/BallControl';
import type { LedgerDirection } from '../../components/LedgerDirectionToggle';
import { TaskNotesEditor } from '../../components/TaskNotesEditor';
import { TaskUpdates } from '../../components/TaskUpdates';
import { TypeTag, PriTag } from '../../components/bits';
import { todayStr, addDaysStr, fmtDMY, TYPE_LABEL } from '../../lib/util';
import type { Comment } from '../../lib/types';

const TYPES: { v: ItemType; label: string }[] = [
  { v: 'task', label: 'Task' },
  { v: 'followUp', label: 'Follow Up' }, { v: 'waitingFor', label: 'Waiting For' },
  { v: 'risk', label: 'Risk' }, { v: 'action', label: 'Meeting Action' },
  { v: 'decision', label: 'Decision' },
];
const PRIORITIES: Priority[] = ['high', 'medium', 'low'];

// Right pane of the Tasks hub: edit-in-place, no modal round-trip. Every field
// writes through the optimistic store on change/blur, mirroring the People
// screen's click-to-edit convention.
export function TaskDetailPanel({ task, onClose }: { task: WorkItem; onClose: () => void }) {
  const { data, update, remove, insert, logActivity } = useCadence();

  const [title, setTitle] = useState(task.title);
  useEffect(() => { setTitle(task.title); }, [task.id, task.title]);

  // Links seed from related_entities, falling back to the denormalised ids —
  // same convention as ItemModal.
  const links: RelatedEntity[] = (() => {
    if (task.related_entities && task.related_entities.length > 0) return task.related_entities;
    const seed: RelatedEntity[] = [];
    if (task.person_id) {
      const p = data.people.find((p) => p.id === task.person_id);
      if (p) seed.push({ type: 'person', id: p.id, name: p.name });
    }
    if (task.project_id) {
      const p = data.projects.find((p) => p.id === task.project_id);
      if (p) seed.push({ type: 'project', id: p.id, name: p.name });
    }
    return seed;
  })();

  const patch = (p: Partial<WorkItem>) => update('work_items', task.id, p);

  const saveTitle = () => {
    const t = title.trim();
    if (t && t !== task.title) { patch({ title: t }); logActivity('edit_item', t); }
    else setTitle(task.title);
  };

  const setLinks = (next: RelatedEntity[]) => {
    // Keep person_id anchored to the ball holder if they're still linked;
    // otherwise fall back to the first linked person, as ItemModal.save does.
    const people = next.filter((l) => l.type === 'person');
    const keepCurrent = people.some((l) => l.id === task.person_id);
    patch({
      related_entities: next,
      person_id: keepCurrent ? task.person_id : people[0]?.id || null,
      project_id: next.find((l) => l.type === 'project')?.id || null,
    });
  };

  const toggleDone = () => patch({
    done: !task.done,
    completed_at: !task.done ? new Date().toISOString() : null,
  });

  // "Who has the ball": the task's linked people are the counterparty options;
  // person_id + type say who currently owes whom. Handoffs keep the same
  // record and log themselves into the updates thread.
  const linkedPeople = links.filter((l) => l.type === 'person');
  const direction: LedgerDirection = task.type === 'waitingFor' ? 'theyOwe' : 'iOwe';

  const applyBall = ({ counterpartyId, direction: d }: BallState) => {
    const p = linkedPeople.find((l) => l.id === counterpartyId);
    if (!p) return;
    if (counterpartyId === task.person_id && d === direction) return;
    patch({ person_id: counterpartyId, type: d === 'theyOwe' ? 'waitingFor' : 'task' });
    const text = d === 'theyOwe' ? `→ ${p.name} owes me` : `→ I owe ${p.name}`;
    insert('comments', { work_item_id: task.id, text, author: 'system' } as Partial<Comment>);
    logActivity('swap_direction', text);
  };

  const del = () => {
    if (!window.confirm('Delete this task?')) return;
    remove('work_items', task.id);
    onClose();
  };

  return (
    <div className="split-right task-detail" key={task.id}>
      <div className="task-detail-head">
        <label className="task-detail-done">
          <input type="checkbox" checked={task.done} onChange={toggleDone} />
          <span>{task.done ? 'Done' : 'Mark done'}</span>
        </label>
        <div className="task-detail-head-actions">
          <RaiseAt1on1Button task={task} compact />
          <button className="btn btn-ghost btn-sm" onClick={del} title="Delete task">🗑</button>
          <button className="btn btn-ghost btn-sm task-detail-close" onClick={onClose} title="Close">✕</button>
        </div>
      </div>

      <div className="task-detail-body">
        <textarea
          className={`task-detail-title${task.done ? ' done' : ''}`}
          value={title}
          rows={2}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={saveTitle}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); (e.target as HTMLTextAreaElement).blur(); } }}
        />
        <div className="task-detail-tags">
          <TypeTag type={task.type} /><PriTag priority={task.priority} />
          {task.source && task.source !== 'you' && <span className="tag">via {task.source}</span>}
        </div>

        {linkedPeople.length > 0 && (
          <div className="form-group">
            <label>Ledger — who has the ball</label>
            <BallControl
              people={linkedPeople.map((l) => ({ id: l.id, name: l.name }))}
              counterpartyId={task.person_id}
              direction={direction}
              onChange={applyBall}
            />
          </div>
        )}

        <div className="form-row">
          <div className="form-group"><label>Type</label>
            <select value={task.type} onChange={(e) => patch({ type: e.target.value as ItemType })}>
              {TYPES.map((t) => <option key={t.v} value={t.v}>{TYPE_LABEL[t.v] || t.label}</option>)}
            </select>
          </div>
          <div className="form-group"><label>Priority</label>
            <select value={task.priority} onChange={(e) => patch({ priority: e.target.value as Priority })}>
              {PRIORITIES.map((p) => <option key={p} value={p}>{p[0].toUpperCase() + p.slice(1)}</option>)}
            </select>
          </div>
        </div>

        <div className="form-group">
          <label>Due date</label>
          <input type="date" value={task.due_date || ''} onChange={(e) => patch({ due_date: e.target.value || null })} />
          <div className="task-detail-defer">
            <button className="btn btn-ghost btn-sm" onClick={() => patch({ due_date: todayStr() })}>Today</button>
            <button className="btn btn-ghost btn-sm" onClick={() => patch({ due_date: addDaysStr(1) })}>Tomorrow</button>
            <button className="btn btn-ghost btn-sm" onClick={() => patch({ due_date: addDaysStr(7) })}>+1 week</button>
            {task.due_date && <button className="btn btn-ghost btn-sm" onClick={() => patch({ due_date: null })}>Clear</button>}
          </div>
        </div>

        <div className="form-group">
          <label>Links — people, projects &amp; meetings</label>
          <EntityLinkPicker links={links} onChange={setLinks} />
        </div>

        {/* The panel remounts per task (key above), so the editor seeds once. */}
        <TaskNotesEditor
          initial={task.notes || ''}
          onAutosave={(html) => { if (html !== (task.notes || '')) patch({ notes: html }); }}
        />

        <TaskUpdates workItemId={task.id} createdAt={task.created_at} />

        <div className="task-detail-meta">
          {task.created_at && <>Created {fmtDMY(task.created_at)}</>}
          {task.completed_at && <> · completed {fmtDMY(task.completed_at)}</>}
        </div>
      </div>
    </div>
  );
}
