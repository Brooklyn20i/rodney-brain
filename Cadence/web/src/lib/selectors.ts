// Pure data selectors for the Executive Control Cockpit.
// No React dependencies — data in, arrays out.

import type { CadenceData, WorkItem, Project, ProjectUpdate, Milestone, Decision } from './types';
import { todayStr, addDaysStr, isOverdue, TYPE_LABEL } from './util';
import { bucketForDue } from './dateBuckets';
import { isAgentCreated, isAgentTask, isFiledTask, isLinkedToProject } from './tasks';

// ── Rodney's to-do ────────────────────────────────────────────────────────────
// The one clear list: Rodney's own open work, ranked by when it's due. Pure and
// deterministic — grouped by date only, no keyword guessing. "In his lane" means
// his own task (isUserTask excludes delegated items) that isn't a waitingFor
// (owed by others) or decision (its own lane). `agent:kobe` is provenance only,
// so it remains in Rodney's lane unless it is explicitly `for:kobe`.
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
  const mine = items.filter((w) => isFiledTask(w) && w.type !== 'waitingFor' && w.type !== 'decision');
  const overdue: WorkItem[] = [], dueToday: WorkItem[] = [], week: WorkItem[] = [], later: WorkItem[] = [];
  for (const w of mine) {
    // No-date items ride in "later" — the cockpit has no separate no-date lane.
    const bucket = bucketForDue(w.due_date).key;
    if (bucket === 'overdue') overdue.push(w);
    else if (bucket === 'today') dueToday.push(w);
    else if (bucket === 'week') week.push(w);
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
    .filter((w) => isFiledTask(w) && w.type === 'waitingFor')
    .sort(byDueThenPri);
}

// Decisions Rodney needs to make. Uses both current data shapes safely:
// - work_items.type === 'decision' (editable like any other work item)
// - decisions.status === 'pending' (legacy/dedicated decision records)
// No model migration: this is a read-only cockpit lane over existing data.
export interface DecideItem {
  id: string;
  title: string;
  due_date: string | null;
  source: 'work_item' | 'decision';
  workItem?: WorkItem;
  decision?: Decision;
}

export function getDecideItems(items: WorkItem[], decisions: Decision[] = []): DecideItem[] {
  const fromWorkItems = items
    .filter((w) => isFiledTask(w) && w.type === 'decision' && !w.deleted_at)
    .map((w) => ({ id: `wi:${w.id}`, title: w.title, due_date: w.due_date, source: 'work_item' as const, workItem: w }));
  const fromDecisions = decisions
    .filter((d) => d.status === 'pending' && !d.deleted_at)
    .map((d) => ({ id: `d:${d.id}`, title: d.title, due_date: d.due_date, source: 'decision' as const, decision: d }));
  return [...fromWorkItems, ...fromDecisions]
    .sort((a, b) => (a.due_date || '9999').localeCompare(b.due_date || '9999') || a.title.localeCompare(b.title));
}

// ── Hot this week ─────────────────────────────────────────────────────────────
// Open items due within the next 7 days, nearest first.
export function getHotThisWeek(items: WorkItem[]): WorkItem[] {
  const today = todayStr();
  const next7 = addDaysStr(7);
  return items
    .filter(isFiledTask)
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
// non-delegated tasks that aren't waitingFor (waiting = owed by others, not a
// burden) and aren't delegated to Kobe. Surfaced so over-ownership is visible,
// not silent.
export const ACTIVE_LOAD_CAP = 7; // soft threshold; tune in one line

export interface LoadSummary {
  active: number;   // open, in Rodney's lane
  overdue: number;  // subset of active that is overdue
  waiting: number;  // owed by others (waitingFor)
  kobe: number;     // delegated to Kobe (for:kobe)
  overCap: boolean; // active > ACTIVE_LOAD_CAP
}

export function getLoadSummary(items: WorkItem[]): LoadSummary {
  const inLane = items.filter((w) => isFiledTask(w) && w.type !== 'waitingFor' && w.type !== 'decision');
  const active = inLane.length;
  const overdue = inLane.filter((w) => isOverdue(w.due_date)).length;
  const waiting = items.filter((w) => isFiledTask(w) && w.type === 'waitingFor').length;
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

// ── Calendar ──────────────────────────────────────────────────────────────────
// One flat, dated event stream for the month/agenda calendar. Tasks come from
// work_items with a due date (the primary content); milestones, project targets
// and 1:1s ride along on the HorizonMarkers already computed for the Horizon
// screen, so the two surfaces can never disagree about what's coming up.
export type CalendarKind = 'task' | 'milestone' | 'target' | 'meeting';

export interface CalendarEvent {
  id: string;
  date: string;                 // YYYY-MM-DD (local)
  kind: CalendarKind;
  title: string;
  subtitle: string;
  done: boolean;
  overdue: boolean;
  workItemId?: string;          // set for tasks → open the item editor
  nav?: 'projects' | 'people';  // set for markers → jump to their screen
  refId?: string;               // project id / person id for nav
}

const CAL_KIND_ORDER: Record<CalendarKind, number> = { meeting: 0, milestone: 1, target: 2, task: 3 };

export function getCalendarEvents(items: WorkItem[], markers: HorizonMarker[]): CalendarEvent[] {
  const out: CalendarEvent[] = [];

  for (const w of items) {
    if (w.deleted_at || !w.due_date) continue;
    out.push({
      id: 'wi:' + w.id, date: w.due_date, kind: 'task',
      title: w.title, subtitle: TYPE_LABEL[w.type] || 'Task',
      done: w.done, overdue: !w.done && isOverdue(w.due_date),
      workItemId: w.id,
    });
  }

  for (const m of markers) {
    out.push({
      id: m.id, date: m.date, kind: m.kind as CalendarKind,
      title: m.title, subtitle: m.subtitle,
      done: false, overdue: m.kind !== 'meeting' && isOverdue(m.date),
      nav: m.nav, refId: m.refId,
    });
  }

  // Sort by date, then by kind so a day's meetings sit above its tasks, then by
  // title for a stable order across renders.
  return out.sort((a, b) =>
    a.date.localeCompare(b.date) ||
    CAL_KIND_ORDER[a.kind] - CAL_KIND_ORDER[b.kind] ||
    a.title.localeCompare(b.title));
}

// Group events by their date string for O(1) day lookups in the grid.
export function groupEventsByDate(events: CalendarEvent[]): Map<string, CalendarEvent[]> {
  const map = new Map<string, CalendarEvent[]>();
  for (const e of events) {
    const bucket = map.get(e.date);
    if (bucket) bucket.push(e);
    else map.set(e.date, [e]);
  }
  return map;
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
    .filter((w) => !w.done && !w.inboxed && isLinkedToProject(w, projectId))
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

  const open = items.filter((w) => isLinkedToProject(w, project.id) && !w.done);
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
  const open = items.filter((w) => isLinkedToProject(w, project.id) && !w.done);
  return {
    latestUpdate: latest?.text?.trim() || null,
    openTotal: open.length,
    overdue: open.filter((w) => isOverdue(w.due_date)).length,
    highOpen: open.filter((w) => w.priority === 'high').length,
    targetOverdue: isOverdue(project.target_date),
  };
}

// ── Data hygiene review queue ─────────────────────────────────────────────────
// Read-only detection for confusing Work records. This deliberately returns
// review prompts, not repair instructions: the UI must route Rodney/Kobe to the
// relevant screen and never silently bulk-edit live records.
export type HygieneIssueKind =
  | 'stale-quick-capture'
  | 'filed-without-home'
  | 'project-missing-control'
  | 'waiting-without-link'
  | 'stale-decision'
  | 'stale-project'
  | 'agent-provenance';

export type HygieneIssueGate = 'routine' | 'owner-admin-gated';
export type HygieneIssueRoute = 'inbox' | 'tasks' | 'projects' | 'today' | 'kobe';

export interface HygieneIssue {
  id: string;
  kind: HygieneIssueKind;
  title: string;
  detail: string;
  gate: HygieneIssueGate;
  route: HygieneIssueRoute;
  refId: string;
}

const hasWorkHome = (w: Pick<WorkItem, 'person_id' | 'project_id' | 'related_entities'>) =>
  !!(w.person_id || w.project_id || (w.related_entities || []).some((e) => e.type === 'person' || e.type === 'project'));

const isOnOrBefore = (value: string | null | undefined, threshold: string) =>
  !!value && value.slice(0, 10) <= threshold;

export function getDataHygieneIssues(data: Pick<CadenceData, 'work_items' | 'projects' | 'decisions'>): HygieneIssue[] {
  const issues: HygieneIssue[] = [];
  const work = data.work_items.filter((w) => !w.deleted_at);
  const open = work.filter((w) => !w.done);
  const activeProjects = data.projects.filter((p) => p.status === 'active' && !p.deleted_at);
  const quickCaptureThreshold = addDaysStr(-7);
  const staleDecisionThreshold = addDaysStr(-14);
  const staleProjectThreshold = addDaysStr(-30);

  for (const w of open) {
    if (w.inboxed && isOnOrBefore(w.created_at, quickCaptureThreshold)) {
      issues.push({
        id: `stale-quick-capture:${w.id}`,
        kind: 'stale-quick-capture',
        title: w.title,
        detail: 'Inbox capture older than 7 days — review before filing or dismissing.',
        gate: 'routine',
        route: 'inbox',
        refId: w.id,
      });
    }

    if (!w.inboxed && !hasWorkHome(w) && !isAgentTask(w) && !isAgentCreated(w)) {
      issues.push({
        id: `filed-without-home:${w.id}`,
        kind: 'filed-without-home',
        title: w.title,
        detail: 'Filed task has no person or project home — choose where it belongs before tidying.',
        gate: 'routine',
        route: 'tasks',
        refId: w.id,
      });
    }

    if (w.type === 'waitingFor' && !hasWorkHome(w)) {
      issues.push({
        id: `waiting-without-link:${w.id}`,
        kind: 'waiting-without-link',
        title: w.title,
        detail: 'Waiting item has no person or project link — review who owns the follow-up.',
        gate: 'routine',
        route: 'today',
        refId: w.id,
      });
    }

    if (w.type === 'decision' && isOnOrBefore(w.due_date, staleDecisionThreshold)) {
      issues.push({
        id: `stale-decision-wi:${w.id}`,
        kind: 'stale-decision',
        title: w.title,
        detail: 'Decision is more than 14 days past due — owner decision needed before closing or deferring.',
        gate: 'owner-admin-gated',
        route: 'today',
        refId: w.id,
      });
    }

    if (isAgentCreated(w)) {
      issues.push({
        id: `agent-provenance:${w.id}`,
        kind: 'agent-provenance',
        title: w.title,
        detail: `${w.source} is provenance only, not delegated ownership — confirm it is in the right lane.`,
        gate: 'routine',
        route: 'tasks',
        refId: w.id,
      });
    }
  }

  for (const d of data.decisions.filter((d) => d.status === 'pending' && !d.deleted_at)) {
    if (isOnOrBefore(d.due_date, staleDecisionThreshold)) {
      issues.push({
        id: `stale-decision:${d.id}`,
        kind: 'stale-decision',
        title: d.title,
        detail: 'Pending decision is more than 14 days past due — owner decision needed before closing or deferring.',
        gate: 'owner-admin-gated',
        route: 'today',
        refId: d.id,
      });
    }
  }

  for (const p of activeProjects) {
    const missing = [!p.next_action?.trim() && 'next action', !p.owner?.trim() && 'owner', !p.target_date && 'target evidence'].filter(Boolean) as string[];
    if (missing.length) {
      issues.push({
        id: `project-missing-control:${p.id}`,
        kind: 'project-missing-control',
        title: p.name,
        detail: `Active project missing ${missing.join(' / ')} — review the Control sheet before fixing.`,
        gate: missing.includes('owner') ? 'owner-admin-gated' : 'routine',
        route: 'projects',
        refId: p.id,
      });
    }
    if (isOnOrBefore(p.updated_at, staleProjectThreshold)) {
      issues.push({
        id: `stale-project:${p.id}`,
        kind: 'stale-project',
        title: p.name,
        detail: 'Active project has not been updated for 30+ days — review status before changing it.',
        gate: 'owner-admin-gated',
        route: 'projects',
        refId: p.id,
      });
    }
  }

  return issues.sort((a, b) => {
    const gateRank = a.gate === b.gate ? 0 : a.gate === 'owner-admin-gated' ? -1 : 1;
    return gateRank || a.kind.localeCompare(b.kind) || a.title.localeCompare(b.title);
  });
}
