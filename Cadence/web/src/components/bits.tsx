import React from 'react';
import type { WorkItem } from '../lib/types';
import { fmtDate, isOverdue, isDueToday, TYPE_LABEL, priLabel } from '../lib/util';
import { useCadence } from '../lib/store';
import { isAgentCreated } from '../lib/tasks';

export const TypeTag = ({ type }: { type: WorkItem['type'] }) => (
  <span className={`tag tag-${type}`}>{TYPE_LABEL[type] || 'Task'}</span>
);
export const PriTag = ({ priority }: { priority: WorkItem['priority'] }) => (
  <span className={`tag pri-${priority}`}>{priLabel(priority)}</span>
);
export const Due = ({ date }: { date: string | null }) => {
  if (!date) return null;
  const cls = isOverdue(date) ? 'due-overdue' : isDueToday(date) ? 'due-today' : 'due-normal';
  return <span className={cls} style={{ fontSize: 12 }}>{fmtDate(date)}</span>;
};

const agentName = (source: string | null | undefined): string | null => {
  const m = /^(?:agent:)(.+)$/.exec(source || '');
  if (!m) return null;
  return m[1].replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
};

// Shared compact task row — one consistent task card across Inbox, Today and
// the Tasks hub. Checkbox completes inline; clicking the body opens the editor.
// Set `showPerson` to surface who a task belongs to (the Tasks hub wants this;
// the People screen, already scoped to a person, does not).
export function TaskRow({ w, onEdit, showPerson = true }: {
  w: WorkItem; onEdit: (w: WorkItem) => void; showPerson?: boolean;
}) {
  const { data, update } = useCadence();
  const proj = data.projects.find((p) => p.id === w.project_id);
  const person = data.people.find((p) => p.id === w.person_id);
  const toggle = () => update('work_items', w.id, {
    done: !w.done, completed_at: !w.done ? new Date().toISOString() : null,
  } as Partial<WorkItem>);

  // Show related_entities chips when present; fall back to primary person/project tags
  const entities = w.related_entities && w.related_entities.length > 0 ? w.related_entities : null;

  return (
    <div className="card card-compact">
      <div className="card-row">
        <input type="checkbox" checked={w.done} onChange={toggle}
          style={{ width: 16, height: 16, accentColor: 'var(--accent)' }} />
        <div style={{ flex: 1, cursor: 'pointer', minWidth: 0 }} onClick={() => onEdit(w)}>
          <div className={`card-title ${w.done ? 'checkbox-done' : ''}`}>{w.title}</div>
          <div style={{ display: 'flex', gap: 6, marginTop: 4, alignItems: 'center', flexWrap: 'wrap' }}>
            <TypeTag type={w.type} /><PriTag priority={w.priority} />
            {isAgentCreated(w) && <span className="tag tag-note-link">Created by {agentName(w.source) || 'agent'}</span>}
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
                {showPerson && person && <span className="tag tag-action">{person.name}</span>}
              </>
            )}
            <Due date={w.due_date} />
          </div>
        </div>
      </div>
    </div>
  );
}

export function EmptyState({ icon, title, sub }: { icon: string; title: string; sub?: string }) {
  return (
    <div className="empty-state">
      <div className="icon">{icon}</div>
      <p style={{ fontSize: 15, fontWeight: 500 }}>{title}</p>
      {sub && <small style={{ color: 'var(--text3)' }}>{sub}</small>}
    </div>
  );
}

// Shared screen header with the mobile hamburger built in, plus an optional
// action area on the right (buttons, etc.).
export function ScreenHeader({ title, subtitle, onMenu, children }: {
  title: string; subtitle?: string; onMenu?: () => void; children?: React.ReactNode;
}) {
  return (
    <div className="screen-header">
      <button className="menu-btn" onClick={onMenu} aria-label="Open menu">☰</button>
      <div className="header-left">
        <h1>{title}</h1>
        {subtitle && <div className="subtitle">{subtitle}</div>}
      </div>
      <div className="header-actions">{children}</div>
    </div>
  );
}

export function Modal({ title, onClose, children, footer, wide }: {
  title: string; onClose: () => void; children: React.ReactNode;
  footer?: React.ReactNode; wide?: boolean;
}) {
  return (
    <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal" style={wide ? { maxWidth: 640 } : undefined}>
        <div className="modal-header"><h2>{title}</h2><button className="modal-close" onClick={onClose}>✕</button></div>
        {children}
        {footer && <div className="modal-footer">{footer}</div>}
      </div>
    </div>
  );
}
