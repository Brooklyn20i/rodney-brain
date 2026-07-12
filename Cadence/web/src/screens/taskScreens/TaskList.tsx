import React, { useState } from 'react';
import { useCadence } from '../../lib/store';
import type { WorkItem } from '../../lib/types';
import { TypeTag, PriTag, Due } from '../../components/bits';
import { fmtDM, initials, isOverdue } from '../../lib/util';
import { isAgentCreated } from '../../lib/tasks';
import type { OpenMeetingAction, PushTarget } from '../../lib/tasks';

export interface TaskGroup { key: string; label: string; color: string; items: WorkItem[]; }

// A single row in the hub's master list. Checkbox completes inline; clicking
// the body selects the task into the detail panel (no modal round-trip).
function HubTaskRow({ w, selected, onSelect, pinned, onTogglePin }: {
  w: WorkItem; selected: boolean; onSelect: (w: WorkItem) => void;
  pinned?: boolean; onTogglePin?: (w: WorkItem) => void;
}) {
  const { data, update } = useCadence();
  const proj = data.projects.find((p) => p.id === w.project_id);
  const person = data.people.find((p) => p.id === w.person_id);
  const entities = w.related_entities && w.related_entities.length > 0 ? w.related_entities : null;
  const toggle = () => update('work_items', w.id, {
    done: !w.done, completed_at: !w.done ? new Date().toISOString() : null,
  } as Partial<WorkItem>);

  return (
    <div className={`card card-compact task-hub-row${selected ? ' selected' : ''}`}>
      <div className="card-row">
        <input type="checkbox" checked={w.done} onChange={toggle}
          style={{ width: 16, height: 16, accentColor: 'var(--accent)' }} />
        <div style={{ flex: 1, cursor: 'pointer', minWidth: 0 }} onClick={() => onSelect(w)}>
          <div className={`card-title ${w.done ? 'checkbox-done' : ''}`}>{w.title}</div>
          <div style={{ display: 'flex', gap: 6, marginTop: 4, alignItems: 'center', flexWrap: 'wrap' }}>
            <TypeTag type={w.type} /><PriTag priority={w.priority} />
            {isAgentCreated(w) && <span className="tag tag-note-link">Agent-created</span>}
            {entities ? (
              <>
                {entities.slice(0, 3).map((re) => (
                  <span key={re.id} className={`tag tag-${re.type === 'person' ? 'action' : re.type === 'project' ? 'info' : 'note-link'}`}>
                    {re.type === 'note' && '📝 '}{re.name}
                  </span>
                ))}
                {entities.length > 3 && <span className="tag">+{entities.length - 3}</span>}
              </>
            ) : (
              <>
                {proj && <span className="tag tag-info">{proj.name}</span>}
                {person && <span className="tag tag-action">{person.name}</span>}
              </>
            )}
            <Due date={w.due_date} />
          </div>
        </div>
        {onTogglePin && (
          <button
            className={`pin-star${pinned ? ' pinned' : ''}`}
            title={pinned ? "Unpin from Today's focus" : "Pin to Today's focus"}
            onClick={(e) => { e.stopPropagation(); onTogglePin(w); }}
          >{pinned ? '★' : '☆'}</button>
        )}
      </div>
    </div>
  );
}

// Inline quick-add at the bottom of each group; Enter adds a filed task with
// the group's implied due date (e.g. adding under "Today" pre-fills today).
function GroupQuickAdd({ due, onAdd }: { due: string | null; onAdd: (title: string, due: string | null) => void }) {
  const [text, setText] = useState('');
  const submit = () => {
    const t = text.trim();
    if (!t) return;
    onAdd(t, due);
    setText('');
  };
  return (
    <input
      className="task-group-quickadd"
      type="text"
      placeholder="+ Add task…"
      value={text}
      onChange={(e) => setText(e.target.value)}
      onKeyDown={(e) => { if (e.key === 'Enter') submit(); }}
      onBlur={() => { if (text.trim()) submit(); }}
    />
  );
}

export function TaskList({ groups, selectedId, onSelect, quickAddDueFor, onQuickAdd, pinnedIds, onTogglePin }: {
  groups: TaskGroup[];
  selectedId: string | null;
  onSelect: (w: WorkItem) => void;
  // Given a group key, the due date an inline add under it should carry
  // (null = no date, undefined = no quick-add for this grouping).
  quickAddDueFor?: (groupKey: string) => string | null | undefined;
  onQuickAdd: (title: string, due: string | null, groupKey: string) => void;
  pinnedIds?: Set<string>;
  onTogglePin?: (w: WorkItem) => void;
}) {
  return (
    <>
      {groups.map((g) => {
        const due = quickAddDueFor?.(g.key);
        return (
          <React.Fragment key={g.key}>
            <div className="section-header">
              <h2>{g.label}</h2>
              <span className="section-count" style={{ background: g.color }}>{g.items.length}</span>
            </div>
            {g.items.map((w) => (
              <HubTaskRow key={w.id} w={w} selected={selectedId === w.id} onSelect={onSelect}
                pinned={pinnedIds?.has(w.id)} onTogglePin={onTogglePin} />
            ))}
            {due !== undefined && (
              <GroupQuickAdd due={due} onAdd={(title, d) => onQuickAdd(title, d, g.key)} />
            )}
          </React.Fragment>
        );
      })}
    </>
  );
}

// ── Unfiled meeting-action row with a one-tap assign picker ────────────────────
export function MeetingActionRow({ action, people, projects, onFile }: {
  action: OpenMeetingAction;
  people: { id: string; name: string; color?: string }[];
  projects: { id: string; name: string; color?: string }[];
  onFile: (action: OpenMeetingAction, target: PushTarget | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const overdue = !!action.due && isOverdue(action.due);

  return (
    <div className="card card-compact">
      <div className="card-row" style={{ alignItems: 'flex-start' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="card-title">{action.title}</div>
          <div style={{ display: 'flex', gap: 6, marginTop: 4, alignItems: 'center', flexWrap: 'wrap' }}>
            <span className="tag tag-info" style={{ maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>🗓 {action.noteTitle}</span>
            {action.due && <span className={overdue ? 'due-overdue' : 'due-normal'} style={{ fontSize: 12 }}>{overdue ? 'Overdue · ' : 'Due '}{fmtDM(action.due)}</span>}
          </div>
        </div>
        <div style={{ position: 'relative', flexShrink: 0 }}>
          <button className="action-send-btn" onClick={() => setOpen((s) => !s)}>File →</button>
          {open && (
            <>
              <div style={{ position: 'fixed', inset: 0, zIndex: 49 }} onClick={() => setOpen(false)} />
              <div className="action-send-picker">
                <div className="send-picker-section">Assign to a person</div>
                {people.map((p) => (
                  <button key={p.id} className="send-picker-option"
                    onClick={() => { onFile(action, { id: p.id, type: 'person', name: p.name }); setOpen(false); }}>
                    <span className="avatar avatar-sm" style={{ background: p.color || '#3A7CA5' }}>
                      {initials(p.name)}
                    </span>
                    {p.name}
                  </button>
                ))}
                {projects.length > 0 && <div className="send-picker-section">Add to a project</div>}
                {projects.map((p) => (
                  <button key={p.id} className="send-picker-option"
                    onClick={() => { onFile(action, { id: p.id, type: 'project', name: p.name }); setOpen(false); }}>
                    <span style={{ color: p.color || 'var(--accent)', fontSize: 12 }}>▤</span>
                    {p.name}
                  </button>
                ))}
                <div className="send-picker-section">Or</div>
                <button className="send-picker-option"
                  onClick={() => { onFile(action, null); setOpen(false); }}>
                  ↓ Send to Tasks
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
