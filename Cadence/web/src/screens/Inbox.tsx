import React, { useMemo, useState } from 'react';
import { useCadence } from '../lib/store';
import type { WorkItem } from '../lib/types';
import { TaskRow, EmptyState, ScreenHeader } from '../components/bits';
import { ItemModal } from '../components/ItemModal';
import { QuickAdd } from '../components/QuickAdd';
import { todayStr, addDaysStr, priorityScore } from '../lib/util';
import { isFiled, isUserTask } from '../lib/tasks';

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
  if (due <= addDaysStr(7)) return 'week';
  return 'later';
}

export function Inbox({ onMenu }: { onMenu?: () => void }) {
  const { data, update } = useCadence();
  const [editing, setEditing] = useState<WorkItem | null>(null);
  const [adding, setAdding] = useState(false);

  // The Inbox is the triage queue: unprocessed user-facing captures (inboxed)
  // that haven't been given a person or project yet. Filing happens by adding
  // one of those homes (or by explicitly marking the item as triaged).
  const grouped = useMemo(() => {
    // Triage queue = inboxed AND still without a filing home (person/project).
    // The `!isFiled` guard keeps legacy items (older captures that were flagged
    // inboxed but already have a person or project) out of the triage pile.
    const open = data.work_items.filter((w) => isUserTask(w) && w.inboxed && !isFiled(w));
    const grouped: Record<BucketKey, WorkItem[]> = { overdue: [], today: [], week: [], later: [], none: [] };
    open.forEach((w) => grouped[bucketOf(w.due_date)].push(w));
    (['overdue', 'today', 'week', 'later'] as BucketKey[]).forEach((k) =>
      grouped[k].sort((a, b) => (a.due_date || '').localeCompare(b.due_date || '')));
    grouped.none.sort((a, b) => priorityScore(b) - priorityScore(a));
    return grouped;
  }, [data]);

  const totalOpen = BUCKETS.reduce((n, b) => n + grouped[b.key].length, 0);
  const file = (w: WorkItem) => update('work_items', w.id, { inboxed: false } as Partial<WorkItem>);

  return (
    <>
      <ScreenHeader title="Inbox" subtitle="Unprocessed captures — file each to Tasks" onMenu={onMenu}>
        <button className="btn btn-primary" onClick={() => setAdding(true)}>+ Add Task</button>
      </ScreenHeader>
      <div className="screen-content">
        {totalOpen === 0 ? (
          <EmptyState icon="✓" title="Inbox zero" sub="Nothing to triage. New quick captures land here." />
        ) : BUCKETS.map(({ key, label, color }) => {
          const items = grouped[key];
          if (!items.length) return null;
          return (
            <React.Fragment key={key}>
              <div className="section-header"><h2>{label}</h2><span className="section-count" style={{ background: color }}>{items.length}</span></div>
              {items.map((w) => (
                <div key={w.id} className="inbox-triage-row">
                  <div style={{ flex: 1, minWidth: 0 }}><TaskRow w={w} onEdit={setEditing} /></div>
                  <button className="btn btn-ghost btn-sm inbox-file-btn" title="Mark as filed — remove from Inbox"
                    onClick={() => file(w)}>Done triaging</button>
                </div>
              ))}
            </React.Fragment>
          );
        })}
      </div>

      {adding && <QuickAdd onClose={() => setAdding(false)} />}
      {editing && <ItemModal existing={editing} onClose={() => setEditing(null)} />}
    </>
  );
}
