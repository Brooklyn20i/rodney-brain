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
  // Single pass (no indexOf) — this renders ~1000-point series, so O(n²) here
  // would freeze the "All" range.
  const avgSegs: string[] = [];
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    if (p.avg == null) continue;
    avgSegs.push(`${avgSegs.length === 0 ? 'M' : 'L'}${x(i).toFixed(1)} ${y(p.avg).toFixed(1)}`);
  }
  const avgPath = avgSegs.join(' ');
  const areaPath = `${rawPath} L${W} ${H} L0 ${H} Z`;
  const last = points[points.length - 1];
  return (
    <div className={`trend-line trend-${tone}`} style={{ height }}>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" width="100%" height="100%"
        role="img"
        aria-label={`Trend line, ${points.length} points: latest ${Math.round(last.value)}, ranging ${Math.round(min)} to ${Math.round(max)}.`}>

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

// "Nice" axis ticks: round step (…, 0.5, 1, 2, 5, …) covering [min,max] with
// roughly `target` lines, so a weight axis reads 75, 76, 77 not 75.3, 76.8.
function niceTicks(min: number, max: number, target = 5): number[] {
  const span = max - min || 1;
  const raw = span / target;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const norm = raw / mag;
  const step = (norm >= 5 ? 5 : norm >= 2 ? 2 : norm >= 1 ? 1 : 0.5) * mag;
  const first = Math.ceil(min / step - 1e-9) * step;
  const ticks: number[] = [];
  for (let v = first; v <= max + 1e-9; v += step) ticks.push(Math.round(v * 100) / 100);
  return ticks.length ? ticks : [min, max];
}

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const isoOf = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

// X-axis ticks: for short windows, a few evenly-spaced "3 Jul" dates; for long
// ones, month starts subsampled to ~6 labels — the MacroFactor treatment.
function axisDateTicks(startISO: string, endISO: string): { date: string; label: string }[] {
  const start = new Date(startISO + 'T12:00:00');
  const end = new Date(endISO + 'T12:00:00');
  const spanDays = (end.getTime() - start.getTime()) / 86400000;
  const out: { date: string; label: string }[] = [];
  if (spanDays <= 0) return [{ date: startISO, label: `${start.getDate()} ${MON[start.getMonth()]}` }];
  if (spanDays <= 45) {
    const n = Math.min(5, Math.max(2, Math.round(spanDays / 7) + 1));
    for (let i = 0; i < n; i++) {
      const d = new Date(start.getTime() + (spanDays * i) / (n - 1) * 86400000);
      out.push({ date: isoOf(d), label: `${d.getDate()} ${MON[d.getMonth()]}` });
    }
  } else {
    const months: Date[] = [];
    let m = new Date(start.getFullYear(), start.getMonth(), 1);
    if (m < start) m = new Date(start.getFullYear(), start.getMonth() + 1, 1);
    while (m <= end) {
      months.push(new Date(m));
      m = new Date(m.getFullYear(), m.getMonth() + 1, 1);
    }
    const stepM = Math.max(1, Math.ceil(months.length / 6));
    months.forEach((mm, i) => {
      if (i % stepM === 0) out.push({ date: isoOf(mm), label: MON[mm.getMonth()] });
    });
  }
  return out;
}

// MacroFactor-style weight trend: the noisy scale line under a bold smoothed
// trend line, with gentle gridlines, weight ticks on the right and month/date
// labels along the bottom. Self-contained SVG (labels are <text>, so they stay
// crisp and the chart scales responsively by aspect ratio).
export function WeightTrendChart({ points }: { points: { date: string; weight_kg: number; trend: number }[] }) {
  if (points.length < 2) {
    return <div className="trend-empty">Not enough weigh-ins in this range yet.</div>;
  }
  const W = 700;
  const H = 340;
  const mL = 10;
  const mR = 46;
  const mT = 14;
  const mB = 32;
  const plotW = W - mL - mR;
  const plotH = H - mT - mB;

  const t0 = new Date(points[0].date + 'T12:00:00').getTime();
  const t1 = new Date(points[points.length - 1].date + 'T12:00:00').getTime();
  const tSpan = t1 - t0 || 1;
  const tx = (iso: string) => mL + ((new Date(iso + 'T12:00:00').getTime() - t0) / tSpan) * plotW;

  const vals = points.flatMap((p) => [p.weight_kg, p.trend]);
  let vMin = Math.min(...vals);
  let vMax = Math.max(...vals);
  const pad = Math.max(0.3, (vMax - vMin) * 0.12);
  vMin -= pad;
  vMax += pad;
  const ticks = niceTicks(vMin, vMax, 5);
  vMin = Math.min(vMin, ticks[0]);
  vMax = Math.max(vMax, ticks[ticks.length - 1]);
  const vSpan = vMax - vMin || 1;
  const vy = (v: number) => mT + (1 - (v - vMin) / vSpan) * plotH;

  const scalePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${tx(p.date).toFixed(1)} ${vy(p.weight_kg).toFixed(1)}`).join(' ');
  const trendPath = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${tx(p.date).toFixed(1)} ${vy(p.trend).toFixed(1)}`).join(' ');
  const last = points[points.length - 1];
  const xticks = axisDateTicks(points[0].date, last.date);
  const fmtTick = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(1));

  return (
    <div className="wt-chart">
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" preserveAspectRatio="xMidYMid meet" role="img"
        aria-label={`Weight trend, ${points[0].date} to ${last.date}: trend ${last.trend.toFixed(1)} kg, ${(last.trend - points[0].trend >= 0 ? 'up ' : 'down ') + Math.abs(last.trend - points[0].trend).toFixed(1)} kg over the range.`}>
        {ticks.map((t) => (
          <g key={t}>
            <line className="wt-grid" x1={mL} x2={W - mR} y1={vy(t)} y2={vy(t)} />
            <text className="wt-ylabel" x={W - mR + 8} y={vy(t) + 6}>
              {fmtTick(t)}
            </text>
          </g>
        ))}
        {xticks.map((xt, i) => {
          const px = tx(xt.date);
          const anchor = px < mL + plotW * 0.06 ? 'start' : px > mL + plotW * 0.94 ? 'end' : 'middle';
          return (
            <text key={i} className="wt-xlabel" x={px} y={H - 8} textAnchor={anchor}>
              {xt.label}
            </text>
          );
        })}
        <path className="wt-scale" d={scalePath} />
        <path className="wt-trend" d={trendPath} />
        <circle className="wt-dot" cx={tx(last.date)} cy={vy(last.trend)} r="6" />
      </svg>
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
