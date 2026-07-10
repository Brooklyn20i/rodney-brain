import { useMemo, useRef, useState } from 'react';
import { useCadence } from '../../lib/store';
import type { WorkItem } from '../../lib/types';
import { ScreenHeader, EmptyState } from '../../components/bits';
import { StatTile } from '../../components/StatTile';
import { QuickAdd } from '../../components/QuickAdd';
import { TaskList, MeetingActionRow } from './TaskList';
import type { TaskGroup } from './TaskList';
import { TaskDetailPanel } from './TaskDetailPanel';
import { todayStr, addDaysStr, priorityScore, isOverdue, isDueToday, fmtDM, TYPE_LABEL } from '../../lib/util';
import { bucketForDue } from '../../lib/dateBuckets';
import { createMeetingActionFiler } from '../../lib/meetingActions';
import { collectOpenMeetingActions, isFiledTask, isAgentTask, isUserTask } from '../../lib/tasks';
import type { OpenMeetingAction, PushTarget } from '../../lib/tasks';

type Lane = 'all' | 'mine' | 'waiting' | 'delegated';
type GroupBy = 'due' | 'priority' | 'person' | 'project' | 'type';
type DateFilter = 'all' | 'overdue' | 'today' | 'week' | 'none';

const LANE_OPTS: { v: Lane; label: string }[] = [
  { v: 'all', label: 'All' }, { v: 'mine', label: 'Mine' },
  { v: 'waiting', label: 'Waiting' }, { v: 'delegated', label: 'Delegated' },
];
const GROUP_OPTS: { v: GroupBy; label: string }[] = [
  { v: 'due', label: 'Due date' }, { v: 'priority', label: 'Priority' },
  { v: 'person', label: 'Person' }, { v: 'project', label: 'Project' },
  { v: 'type', label: 'Type' },
];

const PRI_META: Record<string, { label: string; color: string; rank: number }> = {
  high: { label: 'High priority', color: 'var(--red)', rank: 0 },
  medium: { label: 'Medium priority', color: 'var(--orange)', rank: 1 },
  low: { label: 'Low priority', color: 'var(--text3)', rank: 2 },
};

const inLane = (w: WorkItem, lane: Lane): boolean => {
  switch (lane) {
    case 'mine': return isFiledTask(w) && w.type !== 'waitingFor';
    case 'waiting': return isFiledTask(w) && w.type === 'waitingFor';
    case 'delegated': return !w.done && isAgentTask(w);
    default: return !w.done && !w.inboxed && (isUserTask(w) || isAgentTask(w));
  }
};

// The unified Task Hub: every open task in one place — lanes (Mine / Waiting /
// Delegated), clickable stat tiles as date filters, grouped master list with
// inline quick-add, and an edit-in-place detail panel (People's split view).
export function Tasks({ onMenu }: { onMenu?: () => void }) {
  const { data, insert, update } = useCadence();
  const [lane, setLane] = useState<Lane>('all');
  const [groupBy, setGroupBy] = useState<GroupBy>('due');
  const [filter, setFilter] = useState<DateFilter>('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [doneOpen, setDoneOpen] = useState(false);

  const openActions = useMemo(() => collectOpenMeetingActions(data.notes), [data.notes]);

  const { groups, counts, recentlyDone } = useMemo(() => {
    const open = data.work_items.filter((w) => !w.deleted_at && inLane(w, lane));
    const counts = {
      total: open.length,
      overdue: open.filter((w) => isOverdue(w.due_date)).length,
      today: open.filter((w) => isDueToday(w.due_date)).length,
      week: open.filter((w) => !!w.due_date && w.due_date > todayStr() && w.due_date <= addDaysStr(7)).length,
      none: open.filter((w) => !w.due_date).length,
      unfiled: openActions.length,
    };

    // Date filter applies before grouping.
    const filtered = open.filter((w) => {
      if (filter === 'all') return true;
      if (filter === 'overdue') return isOverdue(w.due_date);
      if (filter === 'today') return isDueToday(w.due_date);
      if (filter === 'week') return !!w.due_date && w.due_date >= todayStr() && w.due_date <= addDaysStr(7);
      if (filter === 'none') return !w.due_date;
      return true;
    });

    const byKey = new Map<string, TaskGroup & { rank: number }>();
    const add = (key: string, label: string, color: string, rank: number, w: WorkItem) => {
      let g = byKey.get(key);
      if (!g) { g = { key, label, color, rank, items: [] }; byKey.set(key, g); }
      g.items.push(w);
    };

    for (const w of filtered) {
      if (groupBy === 'due') {
        const b = bucketForDue(w.due_date); add(b.key, b.label, b.color, b.rank, w);
      } else if (groupBy === 'priority') {
        const m = PRI_META[w.priority] || PRI_META.low; add(w.priority, m.label, m.color, m.rank, w);
      } else if (groupBy === 'type') {
        add(w.type, TYPE_LABEL[w.type] || 'Task', 'var(--accent)', 0, w);
      } else if (groupBy === 'person') {
        if (w.person_id) {
          const p = data.people.find((x) => x.id === w.person_id);
          add(w.person_id, p?.name || 'Unknown person', 'var(--teal)', 0, w);
        } else add('_none', 'Unassigned', 'var(--text3)', 99, w);
      } else if (groupBy === 'project') {
        if (w.project_id) {
          const p = data.projects.find((x) => x.id === w.project_id);
          add(w.project_id, p?.name || 'Unknown project', 'var(--accent)', 0, w);
        } else add('_none', 'No project', 'var(--text3)', 99, w);
      }
    }

    const groups = [...byKey.values()];
    for (const g of groups) {
      if (groupBy === 'due') {
        g.items.sort((a, b) => g.key === 'none'
          ? priorityScore(b) - priorityScore(a)
          : (a.due_date || '').localeCompare(b.due_date || ''));
      } else {
        g.items.sort((a, b) => priorityScore(b) - priorityScore(a));
      }
    }
    groups.sort((a, b) => a.rank - b.rank || a.label.localeCompare(b.label));

    const doneSince = addDaysStr(-14);
    const recentlyDone = data.work_items
      .filter((w) => !w.deleted_at && w.done && (w.completed_at || '').slice(0, 10) >= doneSince)
      .sort((a, b) => (b.completed_at || '').localeCompare(a.completed_at || ''));

    return { groups, counts, recentlyDone };
  }, [data, lane, groupBy, filter, openActions]);

  // Keep the filer reading the freshest notes even across re-renders.
  const notesRef = useRef(data.notes);
  notesRef.current = data.notes;
  const filerRef = useRef<ReturnType<typeof createMeetingActionFiler> | null>(null);
  if (!filerRef.current) filerRef.current = createMeetingActionFiler({ insert, update });
  const fileAction = (action: OpenMeetingAction, target: PushTarget | null) =>
    filerRef.current!(() => notesRef.current, action, target);

  const quickAddDueFor = (groupKey: string): string | null | undefined => {
    if (groupBy !== 'due') return null; // group semantics handled in onQuickAdd
    switch (groupKey) {
      case 'today': return todayStr();
      case 'week': return addDaysStr(1);
      case 'later': return addDaysStr(14);
      case 'none': return null;
      default: return undefined; // no quick-add under Overdue
    }
  };

  const onQuickAdd = (title: string, due: string | null, groupKey: string) => {
    const row: Partial<WorkItem> = {
      title, type: 'task', priority: 'medium', due_date: due,
      inboxed: false, source: 'you',
    };
    if (groupBy === 'person' && groupKey !== '_none') {
      const p = data.people.find((x) => x.id === groupKey);
      if (p) { row.person_id = p.id; row.related_entities = [{ type: 'person', id: p.id, name: p.name }]; }
    } else if (groupBy === 'project' && groupKey !== '_none') {
      const p = data.projects.find((x) => x.id === groupKey);
      if (p) { row.project_id = p.id; row.related_entities = [{ type: 'project', id: p.id, name: p.name }]; }
    } else if (groupBy === 'priority') {
      row.priority = groupKey as WorkItem['priority'];
    } else if (groupBy === 'type') {
      row.type = groupKey as WorkItem['type'];
    }
    insert('work_items', row);
  };

  const people = useMemo(() => data.people.filter((p) => !p.type || p.type === 'person'), [data.people]);
  const projects = useMemo(() => data.projects.filter((p) => !p.deleted_at), [data.projects]);
  const selected = selectedId ? data.work_items.find((w) => w.id === selectedId) || null : null;

  const subtitle = `${counts.total} open · ${counts.overdue} overdue · ${counts.today} due today`
    + (counts.unfiled ? ` · ${counts.unfiled} to file from meetings` : '');

  const tile = (key: DateFilter, num: number, label: string, tone: 'default' | 'red' | 'orange' = 'default') => (
    <StatTile num={num} label={label} tone={tone} active={filter === key}
      onClick={() => setFilter(filter === key ? 'all' : key)} />
  );

  return (
    <>
      <ScreenHeader title="Tasks" subtitle={subtitle} onMenu={onMenu}>
        <button className="btn btn-primary" onClick={() => setAdding(true)}>+ Capture task</button>
      </ScreenHeader>

      <div className="hub-toolbar">
        <div className="hub-seg-group">
          <span className="hub-seg-label">Lane</span>
          {LANE_OPTS.map((o) => (
            <button key={o.v} className={`hub-seg ${lane === o.v ? 'active' : ''}`}
              onClick={() => setLane(o.v)}>{o.label}</button>
          ))}
        </div>
        <div className="hub-seg-group">
          <span className="hub-seg-label">Group</span>
          {GROUP_OPTS.map((o) => (
            <button key={o.v} className={`hub-seg ${groupBy === o.v ? 'active' : ''}`}
              onClick={() => setGroupBy(o.v)}>{o.label}</button>
          ))}
        </div>
      </div>

      <div className="split-view task-hub">
        <div className="split-left task-hub-left">
          <div className="split-panel-body">
            <div className="hub-stats" aria-label="Task filters">
              {tile('overdue', counts.overdue, 'Overdue', counts.overdue ? 'red' : 'default')}
              {tile('today', counts.today, 'Today', counts.today ? 'orange' : 'default')}
              {tile('week', counts.week, 'This week')}
              {tile('none', counts.none, 'No date')}
            </div>

            {/* Unfiled meeting actions — the anti-"lost in meetings" surface. */}
            {openActions.length > 0 && (
              <>
                <div className="section-header">
                  <h2>Meeting actions to file</h2>
                  <span className="section-count" style={{ background: 'var(--purple)' }}>{openActions.length}</span>
                </div>
                {openActions.map((a) => (
                  <MeetingActionRow key={`${a.noteId}-${a.id}`} action={a}
                    people={people} projects={projects} onFile={fileAction} />
                ))}
              </>
            )}

            {groups.length === 0 && openActions.length === 0 && (
              <EmptyState icon="✓" title="Tasks are clear" sub="Capture a task when needed; quick captures land in the Inbox for triage." />
            )}

            <TaskList
              groups={groups}
              selectedId={selectedId}
              onSelect={(w) => setSelectedId(w.id)}
              quickAddDueFor={quickAddDueFor}
              onQuickAdd={onQuickAdd}
            />

            {recentlyDone.length > 0 && (
              <div className="detail-section" style={{ marginTop: 16 }}>
                <h3 style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }} onClick={() => setDoneOpen((o) => !o)}>
                  ✓ Recently Done
                  <span className="section-count" style={{ background: 'var(--green)' }}>{recentlyDone.length}</span>
                  <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text3)', fontWeight: 400 }}>
                    Last 14 days {doneOpen ? '▴' : '▾'}</span>
                </h3>
                {doneOpen && recentlyDone.map((w) => (
                  <div key={w.id} className="work-item-row" style={{ opacity: 0.65 }}>
                    <span style={{ color: 'var(--green)', fontSize: 13 }}>✓</span>
                    <span className="wi-title done" style={{ flex: 1 }}>{w.title}</span>
                    <span style={{ fontSize: 11, color: 'var(--text3)' }}>{w.completed_at ? fmtDM(w.completed_at) : ''}</span>
                    <button className="btn btn-ghost btn-sm" title="Reopen"
                      onClick={() => update('work_items', w.id, { done: false, completed_at: null } as Partial<WorkItem>)}>↩</button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {selected
          ? <TaskDetailPanel task={selected} onClose={() => setSelectedId(null)} />
          : (
            <div className="split-right task-hub-empty">
              <div className="empty-state" style={{ margin: 'auto' }}>
                <div className="icon">◎</div>
                <p>Select a task</p>
                <small style={{ color: 'var(--text3)' }}>Edit it in place — no modal, no page change.</small>
              </div>
            </div>
          )}
      </div>

      {adding && <QuickAdd onClose={() => setAdding(false)} />}
    </>
  );
}
