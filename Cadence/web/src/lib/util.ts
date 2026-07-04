import type { WorkItem, Priority, Health } from './types';

// ── Local-timezone date helpers ───────────────────────────────────────────────
// new Date().toISOString() returns UTC. In Germany (UTC+2 CEST) that gives the
// wrong calendar date for the first 2 hours after midnight. All "today" logic
// must use local date components instead.

export function localDateStr(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export const todayStr = () => localDateStr();

export const addDaysStr = (n: number): string => {
  const d = new Date();
  d.setDate(d.getDate() + n); // setDate operates in local time
  return localDateStr(d);
};

// ── Month-grid helpers (calendar) ─────────────────────────────────────────────
// All local-time so the grid lines up with localDateStr()/todayStr() elsewhere.

// A 6×7 matrix of YYYY-MM-DD strings for the month containing `anchor`, weeks
// starting Monday (en-AU/European convention, matching the DD/MM formatters).
// Always 42 cells so the grid height never jumps between months; leading and
// trailing cells spill into the neighbouring months.
export function monthGrid(anchor: Date): string[][] {
  const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
  const mondayOffset = (first.getDay() + 6) % 7; // Sun=0→6, Mon=1→0 … Sat=6→5
  const weeks: string[][] = [];
  for (let w = 0; w < 6; w++) {
    const row: string[] = [];
    for (let d = 0; d < 7; d++) {
      const cell = new Date(first.getFullYear(), first.getMonth(), 1 - mondayOffset + w * 7 + d);
      row.push(localDateStr(cell));
    }
    weeks.push(row);
  }
  return weeks;
}

// First-of-month `Date`, `delta` months from `anchor` (negative = earlier).
export const addMonths = (anchor: Date, delta: number): Date =>
  new Date(anchor.getFullYear(), anchor.getMonth() + delta, 1);

// "July 2026" — the only place month names appear (the grid needs a heading).
export const fmtMonthYear = (d: Date): string =>
  d.toLocaleDateString('en-AU', { month: 'long', year: 'numeric' });

export const isSameMonth = (iso: string, anchor: Date): boolean =>
  iso.slice(0, 7) === localDateStr(anchor).slice(0, 7);

// ── en-AU numeric display formatters ─────────────────────────────────────────
// Using 'en-AU' gives DD/MM — never month names ("Jun", "June").
// Appending T12:00:00 to bare YYYY-MM-DD strings prevents a one-day shift
// when the browser parses the date near UTC midnight.

const auDate = (iso: string, opts: Intl.DateTimeFormatOptions): string =>
  new Date(iso.length === 10 ? iso + 'T12:00:00' : iso).toLocaleDateString('en-AU', opts);

export const fmtDM       = (iso: string) => auDate(iso, { day: '2-digit', month: '2-digit' });                                     // 16/06
export const fmtDMY      = (iso: string) => auDate(iso, { day: '2-digit', month: '2-digit', year: 'numeric' });                    // 16/06/2026
export const fmtWeekDM   = (iso: string) => auDate(iso, { weekday: 'short', day: '2-digit', month: '2-digit' });                   // Tue 16/06
export const fmtWeekDMY  = (iso: string) => auDate(iso, { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' });  // Tue 16/06/2026
export const fmtHeaderDate = (iso: string) => auDate(iso, { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' }); // Tuesday, 16/06/2026

// ── Derived helpers ───────────────────────────────────────────────────────────
export const isOverdue  = (d: string | null) => !!d && d < todayStr();
export const isDueToday = (d: string | null) => d === todayStr();

// Relative "Today / Tomorrow / 3d / 16/06" label used on work item cards.
export function fmtDate(d: string | null): string {
  if (!d) return '';
  // Use noon so parsing never crosses a day boundary in any timezone.
  const t = new Date(d + 'T12:00:00');
  const now = new Date(); now.setHours(12, 0, 0, 0);
  const diff = Math.round((t.getTime() - now.getTime()) / 86400000);
  if (diff < 0) return `Overdue ${Math.abs(diff)}d`;
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  if (diff < 7) return `${diff}d`;
  const sameYear = t.getFullYear() === new Date().getFullYear();
  return t.toLocaleDateString('en-AU', { day: '2-digit', month: '2-digit', ...(sameYear ? {} : { year: 'numeric' }) });
}

// ── Priority scoring ──────────────────────────────────────────────────────────
export function priorityScore(w: WorkItem): number {
  let s = 0;
  if (isOverdue(w.due_date)) s += 100;
  else if (isDueToday(w.due_date)) s += 50;
  s += { high: 60, medium: 40, low: 20 }[w.priority] ?? 20;
  if (w.type === 'decision' || w.type === 'risk') s += 15;
  return s;
}

export const healthIcon = (h: Health) => ({ green: '🟢', amber: '🟠', red: '🔴' }[h] || '🟢');

export const TYPE_LABEL: Record<string, string> = {
  task: 'Task', decision: 'Decision', followUp: 'Follow Up',
  waitingFor: 'Waiting For', risk: 'Risk', action: 'Action',
};

export const priLabel = (p: Priority) => p[0].toUpperCase() + p.slice(1);

export const AVATAR_COLORS = [
  '#1B5E9E', '#1A7F37', '#6B3FA0', '#C0392B',
  '#B9770E', '#0E7490', '#BE2D6E', '#2C3E50',
];

export function autoColor(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}
