// Pure data selectors for the Executive Control Cockpit.
// No React dependencies — data in, arrays out.

import type { WorkItem, Project, Activity, ProjectUpdate } from './types';
import { todayStr, addDaysStr, isOverdue } from './util';
import { isUserTask } from './tasks';

// ── Needs Rodney ──────────────────────────────────────────────────────────────
// Decisions + items explicitly needing Rodney's authority or input.
export function getNeedsRodney(items: WorkItem[]): WorkItem[] {
  return items.filter(isUserTask).filter((w) => {
    if (w.type === 'decision') return true;
    const text = (w.title + ' ' + (w.notes || '')).toLowerCase();
    return /\b(approve|approval|sign.?off|authoris|authorize|decide|escalat|authority|budget|review and)\b/.test(text)
      && w.priority !== 'low';
  });
}

// ── Hot this week ─────────────────────────────────────────────────────────────
// Open items due within the next 7 days, nearest first.
export function getHotThisWeek(items: WorkItem[]): WorkItem[] {
  const today = todayStr();
  const next7 = addDaysStr(7);
  return items
    .filter(isUserTask)
    .filter((w) => w.due_date && w.due_date >= today && w.due_date <= next7)
    .sort((a, b) => {
      if (a.due_date !== b.due_date) return a.due_date!.localeCompare(b.due_date!);
      const pri: Record<string, number> = { high: 0, medium: 1, low: 2 };
      return (pri[a.priority] ?? 1) - (pri[b.priority] ?? 1);
    });
}

// ── Blocked / risky ───────────────────────────────────────────────────────────
// Overdue items, risk/waitingFor types, items with blocking language.
export function getBlockedRisky(items: WorkItem[]): WorkItem[] {
  return items.filter(isUserTask).filter((w) => {
    if (w.type === 'risk') return true;
    if (w.type === 'waitingFor') return true;
    if (isOverdue(w.due_date)) return true;
    const text = (w.title + ' ' + (w.notes || '')).toLowerCase();
    return /\b(blocked|blocking|stuck|depends on|dependency|escalat)\b/.test(text);
  });
}

// ── Kobe handling ─────────────────────────────────────────────────────────────
// Items explicitly delegated to Kobe (source = 'for:kobe').
// NOT items merely created by Kobe (source = 'agent:kobe').
export function getKobeHandling(items: WorkItem[]): WorkItem[] {
  return items.filter((w) => !w.done && w.source === 'for:kobe');
}

// ── Active load (Responsibility #3) ───────────────────────────────────────────
// How much Rodney is personally carrying right now. "In your lane" = open,
// non-agent tasks that aren't waitingFor (waiting = owed by others, not a burden)
// and aren't delegated to Kobe. Surfaced so over-ownership is visible, not silent.
export const ACTIVE_LOAD_CAP = 7; // soft threshold; tune in one line

export interface LoadSummary {
  active: number;   // open, in Rodney's lane
  overdue: number;  // subset of active that is overdue
  waiting: number;  // owed by others (waitingFor)
  kobe: number;     // delegated to Kobe (for:kobe)
  overCap: boolean; // active > ACTIVE_LOAD_CAP
}

export function getLoadSummary(items: WorkItem[]): LoadSummary {
  const inLane = items.filter((w) => isUserTask(w) && w.type !== 'waitingFor');
  const active = inLane.length;
  const overdue = inLane.filter((w) => isOverdue(w.due_date)).length;
  const waiting = items.filter((w) => isUserTask(w) && w.type === 'waitingFor').length;
  const kobe = items.filter((w) => !w.done && w.source === 'for:kobe').length;
  return { active, overdue, waiting, kobe, overCap: active > ACTIVE_LOAD_CAP };
}

// ── Why it matters ────────────────────────────────────────────────────────────
// One-line control interpretation for a cockpit card. Deterministic, no AI.
// Returns '' when the section label + chips already say it (hotThisWeek) — the
// caller renders nothing for empty strings, keeping the cockpit calm, not busier.
export type ControlBucket = 'needsRodney' | 'hotThisWeek' | 'blockedRisky' | 'kobeHandling';

const BLOCKING_LANG = /\b(blocked|blocking|stuck|depends on|dependency|escalat)\b/;

export function controlWhy(w: WorkItem, bucket: ControlBucket, personName?: string): string {
  switch (bucket) {
    case 'needsRodney':
      return w.type === 'decision'
        ? 'Decision required from you'
        : 'Your position needed before this moves';

    case 'blockedRisky': {
      if (w.type === 'waitingFor') {
        const first = personName?.trim().split(/\s+/)[0];
        return first
          ? `Waiting on ${first} — not yours to own yet`
          : 'Waiting on someone else — not yours to own yet';
      }
      if (w.type === 'risk') return 'Open risk, unresolved';
      if (isOverdue(w.due_date)) return 'Overdue and unmoved';
      const text = (w.title + ' ' + (w.notes || '')).toLowerCase();
      if (BLOCKING_LANG.test(text)) return 'Blocked — needs unsticking';
      return 'Flagged blocked or risky';
    }

    case 'kobeHandling':
      return "Kobe's to handle — no action unless it's blocked";

    case 'hotThisWeek':
    default:
      return '';
  }
}

// ── Recently changed ──────────────────────────────────────────────────────────
// Collapse routine noise; surface meaningful actions.
const NOISE = /^(view|open|close|session|login)/i;
export function getRecentlyChanged(activity: Activity[], limit = 8): Activity[] {
  return [...activity]
    .filter((a) => !NOISE.test(a.action))
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .slice(0, limit);
}

// ── Project grouping ──────────────────────────────────────────────────────────
export interface ProjectGroup {
  label: string;
  projects: Project[];
}

const isRapid = (p: Project) =>
  /\brapid\b|itppm|tendering|leadtime|substitution|approvals/i.test(p.name);

const isStrategic = (p: Project) =>
  /promace|commercial tech|strategy|transformation|reset/i.test(p.name);

export function groupProjectsByPortfolio(projects: Project[]): ProjectGroup[] {
  const notDeleted = projects.filter((p) => !p.deleted_at);
  const active = notDeleted.filter((p) => p.status === 'active');
  const onHold = notDeleted.filter((p) => p.status === 'onHold');
  const completed = notDeleted.filter((p) => p.status === 'completed');

  const rapid = active.filter(isRapid);
  const strategic = active.filter((p) => !isRapid(p) && isStrategic(p));
  const other = active.filter((p) => !isRapid(p) && !isStrategic(p));

  const groups: ProjectGroup[] = [];
  if (rapid.length) groups.push({ label: 'RAPID Portfolio', projects: rapid });
  if (strategic.length) groups.push({ label: 'Strategic', projects: strategic });
  if (other.length) groups.push({ label: 'Active', projects: other });
  if (onHold.length) groups.push({ label: 'On Hold', projects: onHold });
  if (completed.length) groups.push({ label: 'Completed', projects: completed });
  return groups;
}

// ── Project top actions ───────────────────────────────────────────────────────
const PRI_SCORE: Record<string, number> = { high: 0, medium: 1, low: 2 };

export function getProjectTopActions(projectId: string, items: WorkItem[], limit = 3): WorkItem[] {
  return items
    .filter((w) => !w.done && w.project_id === projectId)
    .sort((a, b) => {
      const dp = (PRI_SCORE[a.priority] ?? 1) - (PRI_SCORE[b.priority] ?? 1);
      if (dp !== 0) return dp;
      if (a.due_date && b.due_date) return a.due_date.localeCompare(b.due_date);
      return a.due_date ? -1 : b.due_date ? 1 : 0;
    })
    .slice(0, limit);
}

// ── Health reason ─────────────────────────────────────────────────────────────
// Derive a one-line reason from available data without AI.
export function inferHealthReason(
  project: Project,
  allUpdates: ProjectUpdate[],
  items: WorkItem[],
): string {
  if (project.health === 'green') return 'On track';

  const updates = allUpdates
    .filter((u) => u.project_id === project.id)
    .sort((a, b) => b.created_at.localeCompare(a.created_at));

  if (updates[0]?.text) {
    const t = updates[0].text.toLowerCase();
    if (/blocked|blocking/.test(t)) return 'Blocked';
    if (/depend/.test(t)) return 'Dependency issue';
    if (/decision|approve|sign.?off/.test(t)) return 'Decision needed';
    if (/resource|capacity/.test(t)) return 'Resource constraint';
    if (/risk|concern/.test(t)) return 'Risk flagged';
    if (/support/.test(t)) return 'Support needed';
    return updates[0].text.slice(0, 55) + (updates[0].text.length > 55 ? '…' : '');
  }

  const open = items.filter((w) => w.project_id === project.id && !w.done);
  const overdue = open.filter((w) => isOverdue(w.due_date));
  if (overdue.length) return `${overdue.length} overdue action${overdue.length > 1 ? 's' : ''}`;
  if (open.filter((w) => w.priority === 'high').length) return 'High-priority actions open';

  return project.health === 'red' ? 'Off track' : 'At risk';
}
