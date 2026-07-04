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

export function Tag({ label, tone }: { label: string; tone?: 'good' | 'warn' | 'bad' | 'info' }) {
  const cls =
    tone === 'good' ? 'grade-strong' : tone === 'warn' ? 'grade-weak' : tone === 'bad' ? 'status-blocked' : '';
  return <span className={`grade-tag ${cls}`}>{label}</span>;
}

// Horizontal progress bar with an optional over-target state.
export function ProgressBar({ value, max, tone }: { value: number; max: number; tone?: 'accent' | 'over' }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div className="progress-track">
      <div
        className={`progress-fill ${tone === 'over' ? 'progress-over' : ''}`}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

// Minimal vertical bar chart, no chart dependency (same idea as Financial's
// cf-bar rows). Values are clamped to >= 0.
export function SparkBars({
  points,
  height = 56,
  formatTip,
}: {
  points: { label: string; value: number }[];
  height?: number;
  formatTip?: (p: { label: string; value: number }) => string;
}) {
  const max = Math.max(1, ...points.map((p) => p.value));
  return (
    <div className="spark-bars" style={{ height }}>
      {points.map((p, i) => (
        <div
          key={i}
          className="spark-bar"
          title={formatTip ? formatTip(p) : `${p.label}: ${p.value}`}
          style={{ height: `${Math.max(3, (Math.max(0, p.value) / max) * 100)}%` }}
        />
      ))}
    </div>
  );
}
