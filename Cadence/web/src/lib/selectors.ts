// Pure data selectors for the Executive Control Cockpit.
// No React dependencies — data in, arrays out.

import type { WorkItem, Project, ProjectUpdate, Milestone } from './types';
import { todayStr, addDaysStr, isOverdue } from './util';
import { isUserTask } from './tasks';

// ── Rodney's to-do ────────────────────────────────────────────────────────────
// The one clear list: Rodney's own open work, ranked by when it's due. Pure and
// deterministic — grouped by date only, no keyword guessing. "In his lane" means
// his own task (isUserTask excludes agent/Kobe items) that isn't a waitingFor
// (those are owed by others and live in their own section).
const PRI: Record<string, number> = { high: 0, medium: 1, low: 2 };
const byDueThenPri = (a: WorkItem, b: WorkItem) =>
  (a.due_date || '').localeCompare(b.due_date || '') || (PRI[a.priority] ?? 1) - (PRI[b.priority] ?? 1);
const byPriThenDue = (a: WorkItem, b: WorkItem) =>
  ((PRI[a.priority] ?? 1) - (PRI[b.priority] ?? 1)) || (a.due_date || '9999').localeCompare(b.due_date || '9999');

export interface TodoGroup {
  key: 'overdue' | 'today' | 'week' | 'later';
  label: string;
  tone: 'red' | 'orange' | 'blue' | 'muted';
  items: WorkItem[];
}

export function getTodoGroups(items: WorkItem[]): TodoGroup[] {
  const today = todayStr();
  const weekEnd = addDaysStr(7);
  const mine = items.filter((w) => isUserTask(w) && w.type !== 'waitingFor');
  const overdue: WorkItem[] = [], dueToday: WorkItem[] = [], week: WorkItem[] = [], later: WorkItem[] = [];
  for (const w of mine) {
    if (w.due_date && w.due_date < today) overdue.push(w);
    else if (w.due_date === today) dueToday.push(w);
    else if (w.due_date && w.due_date <= weekEnd) week.push(w);
    else later.push(w);
  }
  overdue.sort(byDueThenPri); dueToday.sort(byPriThenDue); week.sort(byDueThenPri); later.sort(byPriThenDue);
  const out: TodoGroup[] = [];
  if (overdue.length) out.push({ key: 'overdue', label: 'Overdue', tone: 'red', items: overdue });
  if (dueToday.length) out.push({ key: 'today', label: 'Today', tone: 'orange', items: dueToday });
  if (week.length) out.push({ key: 'week', label: 'This week', tone: 'blue', items: week });
  if (later.length) out.push({ key: 'later', label: 'Later', tone: 'muted', items: later });
  return out;
}

// Open items Rodney is waiting on someone else for — owed by others, not his to do.
export function getWaitingOnOthers(items: WorkItem[]): WorkItem[] {
  return items
    .filter((w) => isUserTask(w) && w.type === 'waitingFor')
    .sort(byDueThenPri);
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

// ── Horizon (Futuristic #4) ───────────────────────────────────────────────────
// Forward control points — milestones, project targets and upcoming 1:1s — on a
// single timeline, so the future Rodney is pulled toward is visible, not just
// today. Deliberately NOT every task due date (that's Hot This Week's job).
export type HorizonKind = 'milestone' | 'target' | 'meeting';
export type HorizonBucket = 'overdue' | 'week' | 'fortnight' | 'month' | 'later';

export interface HorizonMarker {
  id: string;
  kind: HorizonKind;
  title: string;
  subtitle: string;
  date: string;
  severity: 'red' | 'amber' | 'green' | 'neutral';
  refId: string;        // project id (milestone/target) or person id (meeting)
  nav: 'projects' | 'people';
}

export interface HorizonMeetingInput { personId: string; name: string; date: string; }

export function horizonBucket(date: string): HorizonBucket {
  const today = todayStr();
  if (date < today) return 'overdue';
  if (date <= addDaysStr(7)) return 'week';
  if (date <= addDaysStr(21)) return 'fortnight';
  if (date <= addDaysStr(45)) return 'month';
  return 'later';
}

export function getHorizonMarkers(
  projects: Project[],
  milestones: Milestone[],
  meetings: HorizonMeetingInput[],
): HorizonMarker[] {
  const active = projects.filter((p) => p.status === 'active' && !p.deleted_at);
  const projById = new Map(active.map((p) => [p.id, p]));
  const markers: HorizonMarker[] = [];

  for (const m of milestones) {
    if (m.done || m.deleted_at || !m.due_date) continue;
    const proj = projById.get(m.project_id);
    if (!proj) continue; // only surface milestones on active projects
    markers.push({
      id: 'ms:' + m.id, kind: 'milestone', title: m.title, subtitle: proj.name,
      date: m.due_date, severity: isOverdue(m.due_date) ? 'red' : 'neutral',
      refId: proj.id, nav: 'projects',
    });
  }

  for (const p of active) {
    if (!p.target_date) continue;
    markers.push({
      id: 'tg:' + p.id, kind: 'target', title: p.name,
      subtitle: p.next_action ? `Next: ${p.next_action}` : 'Project target',
      date: p.target_date, severity: (p.health as HorizonMarker['severity']) || 'neutral',
      refId: p.id, nav: 'projects',
    });
  }

  for (const mt of meetings) {
    markers.push({
      id: 'mt:' + mt.personId, kind: 'meeting', title: mt.name, subtitle: '1:1',
      date: mt.date, severity: 'neutral', refId: mt.personId, nav: 'people',
    });
  }

  return markers.sort((a, b) => a.date.localeCompare(b.date));
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

// ── Health evidence (Analytical #9) ───────────────────────────────────────────
// The raw numbers behind a project's health, so a status can be "proven" on
// demand rather than taken on trust. Same data inferHealthReason reads.
export interface HealthEvidence {
  latestUpdate: string | null;
  openTotal: number;
  overdue: number;
  highOpen: number;
  targetOverdue: boolean;
}

export function getHealthEvidence(
  project: Project,
  updates: ProjectUpdate[],
  items: WorkItem[],
): HealthEvidence {
  const latest = updates
    .filter((u) => u.project_id === project.id)
    .sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
  const open = items.filter((w) => w.project_id === project.id && !w.done);
  return {
    latestUpdate: latest?.text?.trim() || null,
    openTotal: open.length,
    overdue: open.filter((w) => isOverdue(w.due_date)).length,
    highOpen: open.filter((w) => w.priority === 'high').length,
    targetOverdue: isOverdue(project.target_date),
  };
}
