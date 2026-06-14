import React, { useMemo, useState } from 'react';
import { useCadence } from '../lib/store';
import type { WorkItem } from '../lib/types';
import { TypeTag, PriTag, Due, EmptyState, ScreenHeader } from '../components/bits';
import { ItemModal } from '../components/ItemModal';
import { QuickAdd } from '../components/QuickAdd';
import { todayStr, priorityScore } from '../lib/util';

// Date helpers for bucketing
const addDays = (n: number) => { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };

type BucketKey = 'overdue' | 'today' | 'week' | 'later' | 'none';
const BUCKETS: { key: BucketKey; label: string; color: string }[] = [
  { key: 'overdue', label: 'Overdue', color: 'var(--red)' },
  { key: 'today', label: 'Today', color: 'var(--orange)' },
  { key: 'week', label: 'This Week', color: 'var(--accent)' },
  { key: 'later', label: 'Later', color: 'var(--purple)' },
  { key: 'none', label: 'No Date', color: 'var(--text3)' },
];

function bucketOf(due: string | null): BucketKey {
  if (!due) return 'none';
  const today = todayStr();
  if (due < today) return 'overdue';
  if (due === today) return 'today';
  if (due <= addDays(7)) return 'week';
  return 'later';
}

function Row({ w, onEdit }: { w: WorkItem; onEdit: (w: WorkItem) => void }) {
  const { data, update } = useCadence();
  const proj = data.projects.find((p) => p.id === w.project_id);
  const person = data.people.find((p) => p.id === w.person_id);
  const toggle = () => update('work_items', w.id, { done: !w.done, completed_at: !w.done ? new Date().toISOString() : null } as Partial<WorkItem>);
  return (
    <div className="card card-compact">
      <div className="card-row">
        <input type="checkbox" checked={w.done} onChange={toggle} style={{ width: 16, height: 16, accentColor: 'var(--accent)' }} />
        <div style={{ flex: 1, cursor: 'pointer', minWidth: 0 }} onClick={() => onEdit(w)}>
          <div className={`card-title ${w.done ? 'checkbox-done' : ''}`}>{w.title}</div>
          <div style={{ display: 'flex', gap: 6, marginTop: 4, alignItems: 'center', flexWrap: 'wrap' }}>
            <TypeTag type={w.type} /><PriTag priority={w.priority} />
            {proj && <span className="tag tag-info">{proj.name}</span>}
            {person && <span className="tag tag-action">{person.name}</span>}
            <Due date={w.due_date} />
          </div>
        </div>
      </div>
    </div>
  );
}

export function Inbox({ onMenu }: { onMenu?: () => void }) {
  const { data } = useCadence();
  const [editing, setEditing] = useState<WorkItem | null>(null);
  const [adding, setAdding] = useState(false);
  const [showDone, setShowDone] = useState(false);

  const { grouped, doneItems } = useMemo(() => {
    const open = data.work_items.filter((w) => !w.done);
    const grouped: Record<BucketKey, WorkItem[]> = { overdue: [], today: [], week: [], later: [], none: [] };
    open.forEach((w) => grouped[bucketOf(w.due_date)].push(w));
    // sort: dated buckets by date asc; no-date by priority score
    (['overdue', 'today', 'week', 'later'] as BucketKey[]).forEach((k) =>
      grouped[k].sort((a, b) => (a.due_date || '').localeCompare(b.due_date || '')));
    grouped.none.sort((a, b) => priorityScore(b) - priorityScore(a));
    const doneItems = data.work_items.filter((w) => w.done)
      .sort((a, b) => (b.completed_at || '').localeCompare(a.completed_at || ''));
    return { grouped, doneItems };
  }, [data]);

  const totalOpen = BUCKETS.reduce((n, b) => n + grouped[b.key].length, 0);

  return (
    <>
      <ScreenHeader title="Inbox" subtitle="All tasks, by date" onMenu={onMenu}>
        <button className="btn btn-primary" onClick={() => setAdding(true)}>+ Add Task</button>
      </ScreenHeader>
      <div className="screen-content">
        {totalOpen === 0 ? (
          <EmptyState icon="✓" title="No open tasks" sub="Add a task or enjoy the clear deck" />
        ) : BUCKETS.map(({ key, label, color }) => {
          const items = grouped[key];
          if (!items.length) return null;
          return (
            <React.Fragment key={key}>
              <div className="section-header"><h2>{label}</h2><span className="section-count" style={{ background: color }}>{items.length}</span></div>
              {items.map((w) => <Row key={w.id} w={w} onEdit={setEditing} />)}
            </React.Fragment>
          );
        })}

        {doneItems.length > 0 && (
          <>
            <button className="btn btn-ghost btn-sm" style={{ marginTop: 16 }} onClick={() => setShowDone((s) => !s)}>
              {showDone ? '▴ Hide' : '▾ Show'} completed ({doneItems.length})
            </button>
            {showDone && doneItems.map((w) => <Row key={w.id} w={w} onEdit={setEditing} />)}
          </>
        )}
      </div>

      {adding && <QuickAdd onClose={() => setAdding(false)} />}
      {editing && <ItemModal existing={editing} onClose={() => setEditing(null)} />}
    </>
  );
}
