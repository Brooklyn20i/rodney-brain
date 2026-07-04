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

// Line/area trend chart for long histories (handles hundreds–thousands of
// daily points where bars would be unreadable). Plots the raw series faintly
// and an optional rolling-baseline line on top; y-range hugs the data (not
// zero) so real variation is visible. No chart dependency.
export function TrendLine({
  points,
  height = 120,
  tone = 'accent',
  showArea = true,
}: {
  points: { date: string; value: number; avg?: number }[];
  height?: number;
  tone?: 'accent' | 'good' | 'bad' | 'teal';
  showArea?: boolean;
}) {
  if (points.length < 2) {
    return <div className="trend-empty">Not enough data in this range yet.</div>;
  }
  const W = 640;
  const H = 200;
  const padY = 16;
  const values = points.flatMap((p) => [p.value, ...(p.avg != null ? [p.avg] : [])]);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const x = (i: number) => (i / (points.length - 1)) * W;
  const y = (v: number) => padY + (1 - (v - min) / span) * (H - padY * 2);
  const rawPath = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)} ${y(p.value).toFixed(1)}`).join(' ');
  const avgPts = points.filter((p) => p.avg != null);
  const avgPath = avgPts
    .map((p) => {
      const i = points.indexOf(p);
      return `${i === points.indexOf(avgPts[0]) ? 'M' : 'L'}${x(i).toFixed(1)} ${y(p.avg!).toFixed(1)}`;
    })
    .join(' ');
  const areaPath = `${rawPath} L${W} ${H} L0 ${H} Z`;
  const last = points[points.length - 1];
  return (
    <div className={`trend-line trend-${tone}`} style={{ height }}>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" width="100%" height="100%">
        {showArea && <path className="trend-area" d={areaPath} />}
        <path className="trend-raw" d={rawPath} vectorEffect="non-scaling-stroke" />
        {avgPath && <path className="trend-avg" d={avgPath} vectorEffect="non-scaling-stroke" />}
        <circle className="trend-dot" cx={x(points.length - 1)} cy={y(last.value)} r="4" vectorEffect="non-scaling-stroke" />
      </svg>
      <div className="trend-axis">
        <span>{Math.round(max)}</span>
        <span>{Math.round(min)}</span>
      </div>
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
