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
