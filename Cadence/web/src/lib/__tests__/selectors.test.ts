import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  getTodoGroups, getWaitingOnOthers, getHotThisWeek, getKobeHandling,
  getLoadSummary, ACTIVE_LOAD_CAP, getDecideItems,
  horizonBucket, getHorizonMarkers, getProjectTopActions, inferHealthReason,
  groupProjectsByPortfolio, getHealthEvidence,
  getCalendarEvents, groupEventsByDate, getDataHygieneIssues,
} from '../selectors';
import { todayStr, addDaysStr } from '../util';
import type { WorkItem, Project, Milestone, ProjectUpdate, Decision } from '../types';

// Deterministic clock so todayStr()/addDaysStr() are stable across runs.
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 5, 20)); // 2026-06-20 local
});

// ── Fixture factories ─────────────────────────────────────────────────────────
const wi = (o: Partial<WorkItem>): WorkItem => ({
  id: 'w' + Math.random().toString(36).slice(2, 7), owner_id: 'o', title: 'T',
  type: 'task', priority: 'medium', due_date: null, project_id: null, person_id: null,
  notes: '', done: false, inboxed: false, source: '', completed_at: null,
  created_at: '2026-06-01', updated_at: '2026-06-01', deleted_at: null, ...o,
}) as WorkItem;

const proj = (o: Partial<Project>): Project => ({
  id: 'p1', owner_id: 'o', name: 'Project', goal: '', status: 'active', health: 'green',
  owner: 'you', target_date: null, next_action: '', color: '#000',
  created_at: '2026-06-01', updated_at: '2026-06-01', deleted_at: null, ...o,
}) as Project;

const ms = (o: Partial<Milestone>): Milestone => ({
  id: 'm1', owner_id: 'o', project_id: 'p1', title: 'MS', due_date: null, done: false,
  created_at: '2026-06-01', updated_at: '2026-06-01', deleted_at: null, ...o,
}) as Milestone;

const upd = (o: Partial<ProjectUpdate>): ProjectUpdate => ({
  id: 'u1', owner_id: 'o', project_id: 'p1', text: '', health: null, author: 'you',
  created_at: '2026-06-01', updated_at: '2026-06-01', deleted_at: null, ...o,
}) as ProjectUpdate;

const dec = (o: Partial<Decision>): Decision => ({
  id: 'd1', owner_id: 'o', title: 'Decision', status: 'pending', due_date: null,
  context: '', outcome: '', created_at: '2026-06-01', updated_at: '2026-06-01', deleted_at: null, ...o,
}) as Decision;

// ── getTodoGroups ──────────────────────────────────────────────────────────────
describe('getTodoGroups', () => {
  it('buckets in-lane tasks into Overdue / Today / This week / Later in order', () => {
    const items = [
      wi({ id: 'over', due_date: addDaysStr(-1) }),
      wi({ id: 'today', due_date: todayStr() }),
      wi({ id: 'wk', due_date: addDaysStr(4) }),
      wi({ id: 'later', due_date: addDaysStr(30) }),
      wi({ id: 'nodue', due_date: null }),
    ];
    const g = getTodoGroups(items);
    expect(g.map((x) => x.key)).toEqual(['overdue', 'today', 'week', 'later']);
    expect(g.find((x) => x.key === 'overdue')!.items.map((w) => w.id)).toEqual(['over']);
    // no-due items fall into Later alongside far-future ones
    expect(g.find((x) => x.key === 'later')!.items.map((w) => w.id).sort()).toEqual(['later', 'nodue']);
  });

  it('excludes waitingFor, decisions, delegated tasks and done items, but keeps agent-created provenance', () => {
    const items = [
      wi({ id: 'wait', type: 'waitingFor' }),
      wi({ id: 'decide', type: 'decision' }),
      wi({ id: 'kobe', source: 'for:kobe' }),
      wi({ id: 'agent', source: 'agent:kobe' }),
      wi({ id: 'done', done: true }),
      wi({ id: 'keep' }),
    ];
    const ids = getTodoGroups(items).flatMap((g) => g.items.map((w) => w.id));
    expect(ids.sort()).toEqual(['agent', 'keep']);
  });

  it('omits empty groups', () => {
    expect(getTodoGroups([wi({ due_date: todayStr() })]).map((g) => g.key)).toEqual(['today']);
  });
});

// ── getWaitingOnOthers ─────────────────────────────────────────────────────────
describe('getWaitingOnOthers', () => {
  it('returns only open waitingFor items', () => {
    const items = [
      wi({ id: 'w', type: 'waitingFor' }),
      wi({ id: 'wd', type: 'waitingFor', done: true }),
      wi({ id: 'task' }),
    ];
    expect(getWaitingOnOthers(items).map((w) => w.id)).toEqual(['w']);
  });
});

// ── getDecideItems ─────────────────────────────────────────────────────────────
describe('getDecideItems', () => {
  it('surfaces pending decisions from work items and the decisions table without a migration', () => {
    const items = [
      wi({ id: 'wi-decision', title: 'Choose vendor', type: 'decision', due_date: addDaysStr(2) }),
      wi({ id: 'normal', title: 'Normal task' }),
      wi({ id: 'done-decision', type: 'decision', done: true }),
      wi({ id: 'deleted-decision', type: 'decision', deleted_at: '2026-06-10' }),
    ];
    const decisions = [
      dec({ id: 'd-pending', title: 'Approve plan', due_date: todayStr() }),
      dec({ id: 'd-decided', title: 'Old decision', status: 'decided' }),
    ];
    expect(getDecideItems(items, decisions).map((d) => d.title)).toEqual(['Approve plan', 'Choose vendor']);
  });
});

// ── getHotThisWeek ─────────────────────────────────────────────────────────────
describe('getHotThisWeek', () => {
  it('includes items due today through +7, excludes overdue and +8', () => {
    const items = [
      wi({ id: 'today', due_date: todayStr() }),
      wi({ id: 'in7', due_date: addDaysStr(7) }),
      wi({ id: 'over', due_date: addDaysStr(-1) }),
      wi({ id: 'in8', due_date: addDaysStr(8) }),
      wi({ id: 'nodue', due_date: null }),
    ];
    const ids = getHotThisWeek(items).map((w) => w.id);
    expect(ids).toContain('today');
    expect(ids).toContain('in7');
    expect(ids).not.toContain('over');
    expect(ids).not.toContain('in8');
    expect(ids).not.toContain('nodue');
  });
  it('sorts by due date ascending', () => {
    const items = [wi({ id: 'b', due_date: addDaysStr(5) }), wi({ id: 'a', due_date: addDaysStr(2) })];
    expect(getHotThisWeek(items).map((w) => w.id)).toEqual(['a', 'b']);
  });
});

// ── getKobeHandling ────────────────────────────────────────────────────────────
describe('getKobeHandling', () => {
  it('includes for:kobe, excludes agent:kobe and done', () => {
    expect(getKobeHandling([wi({ source: 'for:kobe' })])).toHaveLength(1);
    expect(getKobeHandling([wi({ source: 'agent:kobe' })])).toHaveLength(0);
    expect(getKobeHandling([wi({ source: 'for:kobe', done: true })])).toHaveLength(0);
  });
});

// ── getLoadSummary ─────────────────────────────────────────────────────────────
describe('getLoadSummary', () => {
  it('counts in-lane active, overdue subset, waiting and kobe separately', () => {
    const items = [
      wi({ id: 'a1', due_date: addDaysStr(2) }),
      wi({ id: 'a2', due_date: addDaysStr(-1) }), // overdue, still active
      wi({ id: 'wait', type: 'waitingFor' }),
      wi({ id: 'kobe', source: 'for:kobe' }),
      wi({ id: 'agent', source: 'agent:kobe' }), // provenance only, still in Rodney's lane
    ];
    const s = getLoadSummary(items);
    expect(s.active).toBe(3);
    expect(s.overdue).toBe(1);
    expect(s.waiting).toBe(1);
    expect(s.kobe).toBe(1);
  });
  it('flags overCap only above the cap', () => {
    const under = Array.from({ length: ACTIVE_LOAD_CAP }, () => wi({}));
    const over = Array.from({ length: ACTIVE_LOAD_CAP + 1 }, () => wi({}));
    expect(getLoadSummary(under).overCap).toBe(false);
    expect(getLoadSummary(over).overCap).toBe(true);
  });
});

// ── horizonBucket ──────────────────────────────────────────────────────────────
describe('horizonBucket', () => {
  it('buckets by distance from today', () => {
    expect(horizonBucket(addDaysStr(-1))).toBe('overdue');
    expect(horizonBucket(todayStr())).toBe('week');
    expect(horizonBucket(addDaysStr(7))).toBe('week');
    expect(horizonBucket(addDaysStr(8))).toBe('fortnight');
    expect(horizonBucket(addDaysStr(21))).toBe('fortnight');
    expect(horizonBucket(addDaysStr(22))).toBe('month');
    expect(horizonBucket(addDaysStr(45))).toBe('month');
    expect(horizonBucket(addDaysStr(46))).toBe('later');
  });
});

// ── getHorizonMarkers ──────────────────────────────────────────────────────────
describe('getHorizonMarkers', () => {
  it('builds milestone, target and meeting markers, sorted by date', () => {
    const projects = [proj({ id: 'p1', name: 'Alpha', target_date: addDaysStr(10), health: 'amber' })];
    const milestones = [
      ms({ id: 'm1', project_id: 'p1', title: 'Kickoff', due_date: addDaysStr(3) }),
      ms({ id: 'mDone', project_id: 'p1', due_date: addDaysStr(4), done: true }), // excluded
      ms({ id: 'mOrphan', project_id: 'pX', due_date: addDaysStr(5) }), // no active project, excluded
    ];
    const meetings = [{ personId: 'pe1', name: 'Bob', date: addDaysStr(1) }];
    const out = getHorizonMarkers(projects, milestones, meetings);
    expect(out.map((m) => m.kind)).toEqual(['meeting', 'milestone', 'target']); // date order: +1,+3,+10
    expect(out.find((m) => m.kind === 'target')!.severity).toBe('amber');
  });
  it('flags overdue milestones red and excludes inactive-project targets', () => {
    const projects = [proj({ id: 'p1', status: 'onHold', target_date: addDaysStr(10) })];
    const milestones = [ms({ project_id: 'p1', due_date: addDaysStr(2) })];
    // onHold project → no column, milestone + target both excluded
    expect(getHorizonMarkers(projects, milestones, [])).toHaveLength(0);
  });
});

// ── getProjectTopActions ───────────────────────────────────────────────────────
describe('getProjectTopActions', () => {
  it('returns open items for the project, priority then due, limited', () => {
    const items = [
      wi({ id: 'lo', project_id: 'p1', priority: 'low' }),
      wi({ id: 'hi', project_id: 'p1', priority: 'high' }),
      wi({ id: 'done', project_id: 'p1', priority: 'high', done: true }),
      wi({ id: 'other', project_id: 'p2', priority: 'high' }),
    ];
    const out = getProjectTopActions('p1', items, 2);
    expect(out.map((w) => w.id)).toEqual(['hi', 'lo']);
  });
});

// ── inferHealthReason ──────────────────────────────────────────────────────────
describe('inferHealthReason', () => {
  it('short-circuits green', () => {
    expect(inferHealthReason(proj({ health: 'green' }), [], [])).toBe('On track');
  });
  it('reads keyword branches from the latest update', () => {
    const p = proj({ id: 'p1', health: 'red' });
    expect(inferHealthReason(p, [upd({ text: 'we are blocked', created_at: '2026-06-10' })], [])).toBe('Blocked');
    expect(inferHealthReason(p, [upd({ text: 'a dependency slipped', created_at: '2026-06-10' })], [])).toBe('Dependency issue');
  });
  it('falls back to overdue count when no updates', () => {
    const p = proj({ id: 'p1', health: 'amber' });
    const items = [wi({ project_id: 'p1', due_date: addDaysStr(-1) })];
    expect(inferHealthReason(p, [], items)).toMatch(/overdue/);
  });
});

// ── groupProjectsByPortfolio ───────────────────────────────────────────────────
describe('groupProjectsByPortfolio', () => {
  it('buckets RAPID, Strategic, Active, On Hold, Completed and drops deleted', () => {
    const projects = [
      proj({ id: '1', name: 'RAPID ITPPM', status: 'active' }),
      proj({ id: '2', name: 'ProMaCe Reset', status: 'active' }),
      proj({ id: '3', name: 'Random Thing', status: 'active' }),
      proj({ id: '4', name: 'Paused', status: 'onHold' }),
      proj({ id: '5', name: 'Done', status: 'completed' }),
      proj({ id: '6', name: 'Gone', status: 'active', deleted_at: '2026-06-01' }),
    ];
    const labels = groupProjectsByPortfolio(projects).map((g) => g.label);
    expect(labels).toEqual(['RAPID Portfolio', 'Strategic', 'Active', 'On Hold', 'Completed']);
  });

  it('prefers the explicit portfolio column over the legacy name heuristics', () => {
    const projects = [
      // Name matches the RAPID regex, but the column says otherwise — column wins.
      proj({ id: '1', name: 'RAPID ITPPM', portfolio: 'Ops Excellence', status: 'active' }),
      proj({ id: '2', name: 'Plain untagged project', status: 'active' }),
    ];
    const groups = groupProjectsByPortfolio(projects);
    expect(groups.map((g) => g.label)).toEqual(['Ops Excellence', 'Active']);
    expect(groups[0].projects[0].id).toBe('1');
  });

  it('falls back to name heuristics while portfolio is null (pre-migration rows)', () => {
    const projects = [
      proj({ id: '1', name: 'Tendering revamp', portfolio: null, status: 'active' }),
      proj({ id: '2', name: 'ProMaCe Reset', portfolio: '', status: 'active' }),
    ];
    const labels = groupProjectsByPortfolio(projects).map((g) => g.label);
    expect(labels).toEqual(['RAPID Portfolio', 'Strategic']);
  });

  it('keeps historical portfolios first and sorts new labels alphabetically', () => {
    const projects = [
      proj({ id: '1', name: 'Z', portfolio: 'Zeta Works', status: 'active' }),
      proj({ id: '2', name: 'A', portfolio: 'Alpha Bets', status: 'active' }),
      proj({ id: '3', name: 'S', portfolio: 'Strategic', status: 'active' }),
      proj({ id: '4', name: 'R', portfolio: 'RAPID Portfolio', status: 'active' }),
    ];
    const labels = groupProjectsByPortfolio(projects).map((g) => g.label);
    expect(labels).toEqual(['RAPID Portfolio', 'Strategic', 'Alpha Bets', 'Zeta Works']);
  });
});

// ── getHealthEvidence ──────────────────────────────────────────────────────────
describe('getHealthEvidence', () => {
  it('returns the latest update plus open/overdue/high counts and target flag', () => {
    const p = proj({ id: 'p1', target_date: addDaysStr(-3) });
    const items = [
      wi({ project_id: 'p1', priority: 'high', due_date: addDaysStr(-1) }),
      wi({ project_id: 'p1', priority: 'low', due_date: addDaysStr(5) }),
      wi({ project_id: 'p1', done: true }),
    ];
    const updates = [
      upd({ text: 'old', created_at: '2026-06-01' }),
      upd({ text: '  newest  ', created_at: '2026-06-15' }),
    ];
    const ev = getHealthEvidence(p, updates, items);
    expect(ev.latestUpdate).toBe('newest');
    expect(ev.openTotal).toBe(2);
    expect(ev.overdue).toBe(1);
    expect(ev.highOpen).toBe(1);
    expect(ev.targetOverdue).toBe(true);
  });
  it('returns null latestUpdate when none exist', () => {
    expect(getHealthEvidence(proj({}), [], []).latestUpdate).toBeNull();
  });
});

describe('getDataHygieneIssues', () => {
  it('surfaces review-only hygiene issues and separates owner/admin gates', () => {
    const issues = getDataHygieneIssues({
      work_items: [
        wi({ id: 'capture', title: 'Old capture', inboxed: true, created_at: addDaysStr(-9) }),
        wi({ id: 'loose', title: 'Loose filed work', inboxed: false }),
        wi({ id: 'wait', title: 'Waiting nobody', type: 'waitingFor' }),
        wi({ id: 'agent', title: 'Agent-created task', source: 'agent:kobe', person_id: 'p1' }),
        wi({ id: 'decision', title: 'Old decision task', type: 'decision', due_date: addDaysStr(-20), person_id: 'p1' }),
      ],
      projects: [
        proj({ id: 'missing', name: 'Missing control', next_action: '', owner: '', target_date: null }),
        proj({ id: 'stale', name: 'Stale project', next_action: 'Move', target_date: addDaysStr(20), updated_at: addDaysStr(-40) }),
      ],
      decisions: [dec({ id: 'd-old', title: 'Old table decision', due_date: addDaysStr(-21) })],
    });

    expect(issues.map((i) => i.kind)).toEqual(expect.arrayContaining([
      'stale-quick-capture', 'filed-without-home', 'waiting-without-link',
      'agent-provenance', 'stale-decision', 'project-missing-control', 'stale-project',
    ]));
    expect(issues.find((i) => i.id === 'agent-provenance:agent')!.detail).toMatch(/provenance only, not delegated ownership/);
    expect(issues.find((i) => i.id === 'project-missing-control:missing')!.gate).toBe('owner-admin-gated');
    expect(issues.find((i) => i.id === 'filed-without-home:loose')!.gate).toBe('routine');
  });

  it('does not flag fresh captures, completed/deleted records or correctly linked projects', () => {
    const issues = getDataHygieneIssues({
      work_items: [
        wi({ id: 'fresh', inboxed: true, created_at: addDaysStr(-1) }),
        wi({ id: 'done', done: true, inboxed: false }),
        wi({ id: 'deleted', deleted_at: todayStr(), inboxed: false }),
        wi({ id: 'linked-waiting', type: 'waitingFor', person_id: 'p1' }),
        wi({ id: 'delegated', title: 'With Kobe', source: 'for:kobe' }),
      ],
      projects: [proj({ id: 'ok', next_action: 'Call owner', owner: 'Rodney', target_date: addDaysStr(10), updated_at: todayStr() })],
      decisions: [dec({ id: 'future', due_date: addDaysStr(3) })],
    });
    expect(issues).toHaveLength(0);
  });
});

describe('getCalendarEvents', () => {
  it('emits a task event for each dated, non-deleted work item', () => {
    const items = [
      wi({ id: 'a', title: 'Ship it', due_date: '2026-06-25' }),
      wi({ id: 'b', title: 'No date', due_date: null }),        // skipped — no due date
      wi({ id: 'c', title: 'Gone', due_date: '2026-06-25', deleted_at: '2026-06-10' }), // skipped
    ];
    const events = getCalendarEvents(items, []);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ kind: 'task', title: 'Ship it', workItemId: 'a' });
  });

  it('flags an overdue open task but never a completed one', () => {
    const items = [
      wi({ id: 'a', title: 'Late', due_date: addDaysStr(-2) }),
      wi({ id: 'b', title: 'Late but done', due_date: addDaysStr(-2), done: true }),
    ];
    const [late, done] = getCalendarEvents(items, []).sort((x, y) => x.title.localeCompare(y.title));
    expect(late.overdue).toBe(true);
    expect(done.overdue).toBe(false);
    expect(done.done).toBe(true);
  });

  it('folds horizon markers in and orders a day meeting → milestone → task', () => {
    const day = '2026-06-25';
    const items = [wi({ id: 'a', title: 'Task', due_date: day })];
    const markers = getHorizonMarkers(
      [proj({ id: 'p1', status: 'active' })],
      [ms({ id: 'm1', project_id: 'p1', title: 'Milestone', due_date: day })],
      [{ personId: 'per1', name: 'Dana', date: day }],
    );
    const kinds = getCalendarEvents(items, markers)
      .filter((e) => e.date === day)
      .map((e) => e.kind);
    expect(kinds).toEqual(['meeting', 'milestone', 'task']);
  });

  it('groups events by their date string', () => {
    const items = [
      wi({ id: 'a', due_date: '2026-06-25' }),
      wi({ id: 'b', due_date: '2026-06-25' }),
      wi({ id: 'c', due_date: '2026-06-26' }),
    ];
    const map = groupEventsByDate(getCalendarEvents(items, []));
    expect(map.get('2026-06-25')).toHaveLength(2);
    expect(map.get('2026-06-26')).toHaveLength(1);
    expect(map.get('2026-06-27')).toBeUndefined();
  });
});
