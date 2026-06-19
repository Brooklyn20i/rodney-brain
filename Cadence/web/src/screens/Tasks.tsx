import React, { useMemo, useState } from 'react';
import { useCadence } from '../lib/store';
import type { Note, WorkItem } from '../lib/types';
import { TaskRow, ScreenHeader, EmptyState } from '../components/bits';
import { ItemModal } from '../components/ItemModal';
import { QuickAdd } from '../components/QuickAdd';
import { todayStr, addDaysStr, priorityScore, isOverdue, isDueToday, fmtDM, TYPE_LABEL } from '../lib/util';
import { parseMeeting } from '../lib/meetingData';
import { collectOpenMeetingActions, buildTaskFromAction } from '../lib/tasks';
import type { OpenMeetingAction, PushTarget } from '../lib/tasks';

// ── Grouping ──────────────────────────────────────────────────────────────────
type GroupBy = 'due' | 'priority' | 'person' | 'project' | 'type';
type DateFilter = 'all' | 'overdue' | 'today' | 'week' | 'none';

const GROUP_OPTS: { v: GroupBy; label: string }[] = [
  { v: 'due', label: 'Due date' }, { v: 'priority', label: 'Priority' },
  { v: 'person', label: 'Person' }, { v: 'project', label: 'Project' },
  { v: 'type', label: 'Type' },
];
const FILTER_OPTS: { v: DateFilter; label: string }[] = [
  { v: 'all', label: 'All' }, { v: 'overdue', label: 'Overdue' },
  { v: 'today', label: 'Today' }, { v: 'week', label: 'This week' },
  { v: 'none', label: 'No date' },
];

interface Group { key: string; label: string; color: string; items: WorkItem[]; }

function dueBucket(due: string | null): { key: string; label: string; color: string; rank: number } {
  if (!due) return { key: 'none', label: 'No date', color: 'var(--text3)', rank: 4 };
  const today = todayStr();
  if (due < today) return { key: 'overdue', label: 'Overdue', color: 'var(--red)', rank: 0 };
  if (due === today) return { key: 'today', label: 'Today', color: 'var(--orange)', rank: 1 };
  if (due <= addDaysStr(7)) return { key: 'week', label: 'This week', color: 'var(--accent)', rank: 2 };
  return { key: 'later', label: 'Later', color: 'var(--purple)', rank: 3 };
}

const PRI_META: Record<string, { label: string; color: string; rank: number }> = {
  high: { label: 'High priority', color: 'var(--red)', rank: 0 },
  medium: { label: 'Medium priority', color: 'var(--orange)', rank: 1 },
  low: { label: 'Low priority', color: 'var(--text3)', rank: 2 },
};

export function Tasks({ onMenu }: { onMenu?: () => void }) {
  const { data, insert, update } = useCadence();
  const [groupBy, setGroupBy] = useState<GroupBy>('due');
  const [filter, setFilter] = useState<DateFilter>('all');
  const [editing, setEditing] = useState<WorkItem | null>(null);
  const [adding, setAdding] = useState(false);

  const openActions = useMemo(() => collectOpenMeetingActions(data.notes), [data.notes]);

  const { groups, counts } = useMemo(() => {
    const open = data.work_items.filter((w) => !w.done);
    const counts = {
      total: open.length,
      overdue: open.filter((w) => isOverdue(w.due_date)).length,
      today: open.filter((w) => isDueToday(w.due_date)).length,
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

    const byKey = new Map<string, Group & { rank: number }>();
    const add = (key: string, label: string, color: string, rank: number, w: WorkItem) => {
      let g = byKey.get(key);
      if (!g) { g = { key, label, color, rank, items: [] }; byKey.set(key, g); }
      g.items.push(w);
    };

    for (const w of filtered) {
      if (groupBy === 'due') {
        const b = dueBucket(w.due_date); add(b.key, b.label, b.color, b.rank, w);
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

    // Sort items within each group, then order the groups themselves.
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
    return { groups, counts };
  }, [data, groupBy, filter, openActions]);

  // File a meeting action into the task system (carrying its due date + owner),
  // then mark it pushed in the source note so it stops showing as "needs filing".
  const fileAction = async (action: OpenMeetingAction, target: PushTarget | null) => {
    await insert('work_items', buildTaskFromAction(action, action.noteTitle, target) as Partial<WorkItem>);
    const note = data.notes.find((n) => n.id === action.noteId);
    if (note) {
      const { data: parsed } = parseMeeting(note.body);
      const label = target ? target.name : (action.owner_person_id ? 'your tasks' : 'Inbox');
      const updated = parsed.actions.map((a) =>
        a.id === action.id ? { ...a, pushed: true, pushed_to: label } : a);
      await update('notes', action.noteId, { body: JSON.stringify({ ...parsed, actions: updated }) } as Partial<Note>);
    }
  };

  const people = useMemo(() => data.people.filter((p) => !p.type || p.type === 'person'), [data.people]);
  const projects = useMemo(() => data.projects.filter((p) => !p.deleted_at), [data.projects]);

  const subtitle = `${counts.total} open · ${counts.overdue} overdue · ${counts.today} due today`
    + (counts.unfiled ? ` · ${counts.unfiled} to file from meetings` : '');

  return (
    <>
      <ScreenHeader title="Tasks" subtitle={subtitle} onMenu={onMenu}>
        <button className="btn btn-primary" onClick={() => setAdding(true)}>+ Add Task</button>
      </ScreenHeader>

      <div className="hub-toolbar">
        <div className="hub-seg-group">
          <span className="hub-seg-label">Group</span>
          {GROUP_OPTS.map((o) => (
            <button key={o.v} className={`hub-seg ${groupBy === o.v ? 'active' : ''}`}
              onClick={() => setGroupBy(o.v)}>{o.label}</button>
          ))}
        </div>
        <div className="hub-seg-group">
          <span className="hub-seg-label">Show</span>
          {FILTER_OPTS.map((o) => (
            <button key={o.v} className={`hub-seg ${filter === o.v ? 'active' : ''}`}
              onClick={() => setFilter(o.v)}>{o.label}</button>
          ))}
        </div>
      </div>

      <div className="screen-content">
        {/* Unfiled meeting actions — the anti-"lost in meetings" surface. */}
        {openActions.length > 0 && (
          <>
            <div className="section-header">
              <h2>From meetings — needs filing</h2>
              <span className="section-count" style={{ background: 'var(--purple)' }}>{openActions.length}</span>
            </div>
            {openActions.map((a) => (
              <MeetingActionRow key={`${a.noteId}-${a.id}`} action={a}
                people={people} projects={projects} onFile={fileAction} />
            ))}
          </>
        )}

        {groups.length === 0 && openActions.length === 0 && (
          <EmptyState icon="✓" title="No open tasks" sub="Capture one with + Add Task or enjoy the clear deck" />
        )}

        {groups.map((g) => (
          <React.Fragment key={g.key}>
            <div className="section-header">
              <h2>{g.label}</h2>
              <span className="section-count" style={{ background: g.color }}>{g.items.length}</span>
            </div>
            {g.items.map((w) => <TaskRow key={w.id} w={w} onEdit={setEditing} />)}
          </React.Fragment>
        ))}
      </div>

      {adding && <QuickAdd onClose={() => setAdding(false)} />}
      {editing && <ItemModal existing={editing} onClose={() => setEditing(null)} />}
    </>
  );
}

// ── Unfiled meeting-action row with a one-tap assign picker ────────────────────
function MeetingActionRow({ action, people, projects, onFile }: {
  action: OpenMeetingAction;
  people: { id: string; name: string; color?: string }[];
  projects: { id: string; name: string; color?: string }[];
  onFile: (action: OpenMeetingAction, target: PushTarget | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const overdue = !!action.due && isOverdue(action.due);

  return (
    <div className="card card-compact">
      <div className="card-row" style={{ alignItems: 'flex-start' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="card-title">{action.title}</div>
          <div style={{ display: 'flex', gap: 6, marginTop: 4, alignItems: 'center', flexWrap: 'wrap' }}>
            <span className="tag tag-info" style={{ maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>🗓 {action.noteTitle}</span>
            {action.due && <span className={overdue ? 'due-overdue' : 'due-normal'} style={{ fontSize: 12 }}>{overdue ? 'Overdue · ' : 'Due '}{fmtDM(action.due)}</span>}
          </div>
        </div>
        <div style={{ position: 'relative', flexShrink: 0 }}>
          <button className="action-send-btn" onClick={() => setOpen((s) => !s)}>File →</button>
          {open && (
            <>
              <div style={{ position: 'fixed', inset: 0, zIndex: 49 }} onClick={() => setOpen(false)} />
              <div className="action-send-picker">
                <div className="send-picker-section">Assign to a person</div>
                {people.map((p) => (
                  <button key={p.id} className="send-picker-option"
                    onClick={() => { onFile(action, { id: p.id, type: 'person', name: p.name }); setOpen(false); }}>
                    <span className="avatar" style={{ background: p.color || '#3A7CA5', width: 22, height: 22, fontSize: 9, flexShrink: 0 }}>
                      {p.name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('')}
                    </span>
                    {p.name}
                  </button>
                ))}
                {projects.length > 0 && <div className="send-picker-section">Add to a project</div>}
                {projects.map((p) => (
                  <button key={p.id} className="send-picker-option"
                    onClick={() => { onFile(action, { id: p.id, type: 'project', name: p.name }); setOpen(false); }}>
                    <span style={{ color: p.color || 'var(--accent)', fontSize: 12 }}>▤</span>
                    {p.name}
                  </button>
                ))}
                <div className="send-picker-section">Or</div>
                <button className="send-picker-option"
                  onClick={() => { onFile(action, null); setOpen(false); }}>
                  ↓ Send to my tasks
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
