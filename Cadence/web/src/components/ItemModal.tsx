import { useState } from 'react';
import { useCadence } from '../lib/store';
import type { ItemType, Priority, WorkItem, RelatedEntity } from '../lib/types';
import { Modal } from './bits';

const TYPES: { v: ItemType; label: string }[] = [
  { v: 'task', label: 'Task' },
  { v: 'followUp', label: 'Follow Up' }, { v: 'waitingFor', label: 'Waiting For' },
  { v: 'risk', label: 'Risk' }, { v: 'action', label: 'Meeting Action' },
];
const PRIORITIES: Priority[] = ['high', 'medium', 'low'];

export function ItemModal({ existing, defaults, onClose }: {
  existing?: WorkItem; defaults?: Partial<WorkItem>; onClose: () => void;
}) {
  const { data, insert, update, logActivity, session } = useCadence();
  const base = existing || defaults || {};
  const [title, setTitle] = useState(base.title || '');
  const [type, setType] = useState<ItemType>((base.type as ItemType) || 'task');
  const [priority, setPriority] = useState<Priority>((base.priority as Priority) || 'medium');
  const [due, setDue] = useState(base.due_date || '');
  const [notes, setNotes] = useState(base.notes || '');
  const [picker, setPicker] = useState<null | 'person' | 'project' | 'note'>(null);
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

  const people = data.people.filter((p) => !p.type || p.type === 'person');
  const myEmail = session?.user?.email?.toLowerCase();
  const mePerson = myEmail ? people.find((p) => p.email?.toLowerCase() === myEmail) : null;
  const meetingNotes = data.notes
    .filter((n) => n.folder?.startsWith('__mtg__'))
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .slice(0, 40);

  const addLink = (entity: RelatedEntity) => {
    setLinks((prev) => prev.some((l) => l.id === entity.id) ? prev : [...prev, entity]);
    setPicker(null);
  };
  const removeLink = (id: string) => setLinks((prev) => prev.filter((l) => l.id !== id));

  const save = async () => {
    if (!title.trim()) return;
    setBusy(true);
    try {
      const person_id = links.find((l) => l.type === 'person')?.id || null;
      const project_id = links.find((l) => l.type === 'project')?.id || null;
      const filed = !!(person_id || project_id || due);
      const patch = {
        title: title.trim(), type, priority, due_date: due || null,
        project_id, person_id,
        related_entities: links,
        notes,
      } as Partial<WorkItem>;
      if (existing) {
        await update('work_items', existing.id, { ...patch, ...(filed ? { inboxed: false } : {}) } as Partial<WorkItem>);
        logActivity('edit_item', title.trim());
      } else {
        await insert('work_items', { ...patch, inboxed: filed ? false : ((base as any).inboxed ?? true), source: (base as any).source || 'you' } as Partial<WorkItem>);
        logActivity('add_item', title.trim());
      }
      onClose();
    } finally { setBusy(false); }
  };

  const renderChip = (re: RelatedEntity) => {
    const icon = re.type === 'person' ? '👤' : re.type === 'project' ? '▤' : '📝';
    return (
      <span key={re.id} className={`link-chip link-chip-${re.type}`}>
        {icon} {re.name}
        <button className="link-chip-remove" onClick={() => removeLink(re.id)} title="Remove">✕</button>
      </span>
    );
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
        <div className="link-chips-area">
          {links.length > 0 && (
            <div className="link-chips-list">
              {links.map(renderChip)}
            </div>
          )}
          <div className="link-add-row">
            {/* Person picker */}
            <div style={{ position: 'relative' }}>
              <button className="link-add-btn" onClick={() => setPicker((p) => p === 'person' ? null : 'person')}>+ Person</button>
              {picker === 'person' && (
                <>
                  <div style={{ position: 'fixed', inset: 0, zIndex: 49 }} onClick={() => setPicker(null)} />
                  <div className="link-picker">
                    {mePerson && (
                      <button className={`link-picker-option link-picker-me${links.some((l) => l.id === mePerson.id) ? ' selected' : ''}`}
                        onClick={() => links.some((l) => l.id === mePerson.id) ? (removeLink(mePerson.id), setPicker(null)) : addLink({ type: 'person', id: mePerson.id, name: mePerson.name })}>
                        ★ Me ({mePerson.name})
                        {links.some((l) => l.id === mePerson.id) && <span className="link-picker-check">✓</span>}
                      </button>
                    )}
                    {people.map((p) => {
                      const sel = links.some((l) => l.id === p.id);
                      return (
                        <button key={p.id} className={`link-picker-option${sel ? ' selected' : ''}`}
                          onClick={() => sel ? (removeLink(p.id), setPicker(null)) : addLink({ type: 'person', id: p.id, name: p.name })}>
                          <span className="avatar" style={{ background: p.color || '#3A7CA5', width: 20, height: 20, fontSize: 9, flexShrink: 0 }}>
                            {p.name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('')}
                          </span>
                          {p.name}
                          {sel && <span className="link-picker-check">✓</span>}
                        </button>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
            {/* Project picker */}
            <div style={{ position: 'relative' }}>
              <button className="link-add-btn" onClick={() => setPicker((p) => p === 'project' ? null : 'project')}>+ Project</button>
              {picker === 'project' && (
                <>
                  <div style={{ position: 'fixed', inset: 0, zIndex: 49 }} onClick={() => setPicker(null)} />
                  <div className="link-picker">
                    {data.projects.filter((p) => !p.deleted_at).map((p) => {
                      const sel = links.some((l) => l.id === p.id);
                      return (
                        <button key={p.id} className={`link-picker-option${sel ? ' selected' : ''}`}
                          onClick={() => sel ? (removeLink(p.id), setPicker(null)) : addLink({ type: 'project', id: p.id, name: p.name })}>
                          <span style={{ color: p.color || 'var(--accent)', fontSize: 11 }}>▤</span>
                          {p.name}
                          {sel && <span className="link-picker-check">✓</span>}
                        </button>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
            {/* Meeting note picker */}
            <div style={{ position: 'relative' }}>
              <button className="link-add-btn" onClick={() => setPicker((p) => p === 'note' ? null : 'note')}>+ Meeting</button>
              {picker === 'note' && (
                <>
                  <div style={{ position: 'fixed', inset: 0, zIndex: 49 }} onClick={() => setPicker(null)} />
                  <div className="link-picker">
                    {meetingNotes.length === 0 && (
                      <div style={{ padding: '8px 12px', color: 'var(--text3)', fontSize: 13 }}>No meeting notes yet</div>
                    )}
                    {meetingNotes.map((n) => {
                      const sel = links.some((l) => l.id === n.id);
                      return (
                        <button key={n.id} className={`link-picker-option${sel ? ' selected' : ''}`}
                          onClick={() => sel ? (removeLink(n.id), setPicker(null)) : addLink({ type: 'note', id: n.id, name: n.title })}>
                          📝 {n.title}
                          {sel && <span className="link-picker-check">✓</span>}
                        </button>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="form-group"><label>Notes</label>
        <textarea value={notes} placeholder="Context, links, details…" onChange={(e) => setNotes(e.target.value)} />
      </div>
    </Modal>
  );
}
