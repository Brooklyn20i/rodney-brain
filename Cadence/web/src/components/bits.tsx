import React from 'react';
import type { WorkItem } from '../lib/types';
import { fmtDate, isOverdue, isDueToday, TYPE_LABEL, priLabel } from '../lib/util';

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

export function EmptyState({ icon, title, sub }: { icon: string; title: string; sub?: string }) {
  return (
    <div className="empty-state">
      <div className="icon">{icon}</div>
      <p style={{ fontSize: 15, fontWeight: 500 }}>{title}</p>
      {sub && <small style={{ color: 'var(--text3)' }}>{sub}</small>}
    </div>
  );
}
