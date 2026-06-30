import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  getTodoGroups, getWaitingOnOthers, getHotThisWeek, getKobeHandling,
  getLoadSummary, ACTIVE_LOAD_CAP,
  horizonBucket, getHorizonMarkers, getProjectTopActions, inferHealthReason,
  groupProjectsByPortfolio, getHealthEvidence,
} from '../selectors';
import { todayStr, addDaysStr } from '../util';
import type { WorkItem, Project, Milestone, ProjectUpdate } from '../types';

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

  it('excludes waitingFor, agent tasks and done items', () => {
    const items = [
      wi({ id: 'wait', type: 'waitingFor' }),
      wi({ id: 'kobe', source: 'for:kobe' }),
      wi({ id: 'done', done: true }),
      wi({ id: 'keep' }),
    ];
    const ids = getTodoGroups(items).flatMap((g) => g.items.map((w) => w.id));
    expect(ids).toEqual(['keep']);
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
      wi({ id: 'agent', source: 'agent:kobe' }), // not in lane, not counted as active
    ];
    const s = getLoadSummary(items);
    expect(s.active).toBe(2);
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
