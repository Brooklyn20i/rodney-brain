import type { WorkItem, Priority, Health } from './types';

export const todayStr = () => new Date().toISOString().slice(0, 10);
export const isOverdue = (d: string | null) => !!d && d < todayStr();
export const isDueToday = (d: string | null) => d === todayStr();

export function fmtDate(d: string | null): string {
  if (!d) return '';
  const t = new Date(d + 'T00:00:00');
  const now = new Date(); now.setHours(0, 0, 0, 0);
  const diff = Math.round((t.getTime() - now.getTime()) / 86400000);
  if (diff < 0) return `Overdue ${Math.abs(diff)}d`;
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  if (diff < 7) return `${diff}d`;
  return t.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

// Same prioritisation the agent uses (cadence_core.priority_score).
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
