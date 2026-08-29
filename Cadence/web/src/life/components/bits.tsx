import React from 'react';

// Life's presentational primitives — same markup/classes as the other
// domains' bits so the shared shell CSS applies unchanged.

export function ScreenHeader({
  title,
  subtitle,
  onMenu,
  children,
}: {
  title: string;
  subtitle?: string;
  onMenu?: () => void;
  children?: React.ReactNode;
}) {
  return (
    <div className="screen-header">
      <button className="menu-btn" onClick={onMenu} aria-label="Open menu">
        ☰
      </button>
      <div className="header-left">
        <h1>{title}</h1>
        {subtitle && <div className="subtitle">{subtitle}</div>}
      </div>
      <div className="header-actions">{children}</div>
    </div>
  );
}

export function Card({
  title,
  children,
  className,
  actions,
}: {
  title?: string;
  children: React.ReactNode;
  className?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className={`cf-card ${className ?? ''}`}>
      {(title || actions) && (
        <div className="cf-card-head">
          {title && <div className="cf-card-title">{title}</div>}
          {actions && <div className="cf-card-actions">{actions}</div>}
        </div>
      )}
      {children}
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
