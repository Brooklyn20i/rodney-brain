import React from 'react';

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
}: {
  title?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`cf-card ${className ?? ''}`}>
      {title && <div className="cf-card-title">{title}</div>}
      {children}
    </div>
  );
}

export function Metric({
  label,
  value,
  delta,
  tone,
}: {
  label: string;
  value: string;
  delta?: string;
  tone?: 'good' | 'bad' | 'neutral';
}) {
  return (
    <div className="cf-metric">
      <div className="cf-metric-label">{label}</div>
      <div className="cf-metric-value">{value}</div>
      {delta && <div className={`cf-metric-delta cf-tone-${tone ?? 'neutral'}`}>{delta}</div>}
    </div>
  );
}

export function GradeTag({ label }: { label: string }) {
  return <span className="grade-tag">{label}</span>;
}
