import React, { useMemo, useState } from 'react';
import { useCadence } from '../lib/store';
import type { WorkItem } from '../lib/types';
import { TaskRow, EmptyState, ScreenHeader } from '../components/bits';
import { ItemModal } from '../components/ItemModal';
import { QuickAdd } from '../components/QuickAdd';
import { TriageWizard } from '../components/TriageWizard';
import { priorityScore } from '../lib/util';
import { isUserTask } from '../lib/tasks';
import { bucketForDue, DUE_BUCKETS, DUE_BUCKET_ORDER } from '../lib/dateBuckets';
import type { DueBucketKey } from '../lib/dateBuckets';

const BUCKETS = DUE_BUCKET_ORDER.map((k) => DUE_BUCKETS[k]);

export function Inbox({ onMenu }: { onMenu?: () => void }) {
  const { data } = useCadence();
  const [editing, setEditing] = useState<WorkItem | null>(null);
  const [adding, setAdding] = useState(false);
  // 'all' = the card-by-card deck; an id = triage just that one task.
  const [wizard, setWizard] = useState<null | 'all' | string>(null);

  // The Inbox is the triage queue: every unprocessed capture (inboxed),
  // INCLUDING ones already tagged with a person or project — capturing is
  // deliberately separate from filing. The card-by-card wizard is the filing
  // ritual; this list is the glanceable overview behind it.
  const grouped = useMemo(() => {
    const open = data.work_items.filter((w) => isUserTask(w) && w.inboxed);
    const grouped: Record<DueBucketKey, WorkItem[]> = { overdue: [], today: [], week: [], later: [], none: [] };
    open.forEach((w) => grouped[bucketForDue(w.due_date).key].push(w));
    (['overdue', 'today', 'week', 'later'] as DueBucketKey[]).forEach((k) =>
      grouped[k].sort((a, b) => (a.due_date || '').localeCompare(b.due_date || '')));
    grouped.none.sort((a, b) => priorityScore(b) - priorityScore(a));
    return grouped;
  }, [data]);

  const totalOpen = BUCKETS.reduce((n, b) => n + grouped[b.key].length, 0);

  return (
    <>
      <ScreenHeader title="Inbox" subtitle="Unprocessed captures — triage each into its home" onMenu={onMenu}>
        <button className="btn btn-secondary" onClick={() => setAdding(true)}>+ Capture task</button>
        {totalOpen > 0 && (
          <button className="btn btn-primary" onClick={() => setWizard('all')}>
            Triage all ({totalOpen})
          </button>
        )}
      </ScreenHeader>
      <div className="screen-content">
        {totalOpen === 0 ? (
          <EmptyState icon="✓" title="Inbox is clear" sub="Nothing to triage. New quick captures land here." />
        ) : BUCKETS.map(({ key, label, color }) => {
          const items = grouped[key];
          if (!items.length) return null;
          return (
            <React.Fragment key={key}>
              <div className="section-header"><h2>{label}</h2><span className="section-count" style={{ background: color }}>{items.length}</span></div>
              {items.map((w) => (
                <div key={w.id} className="inbox-triage-row">
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <TaskRow w={w} onEdit={setEditing} />
                  </div>
                  <button className="btn btn-secondary btn-sm inbox-row-triage"
                    title="Triage this task now"
                    onClick={() => setWizard(w.id)}>Triage →</button>
                </div>
              ))}
            </React.Fragment>
          );
        })}
      </div>

      {adding && <QuickAdd onClose={() => setAdding(false)} />}
      {editing && <ItemModal existing={editing} onClose={() => setEditing(null)} />}
      {wizard && (
        <TriageWizard
          itemId={wizard === 'all' ? undefined : wizard}
          onClose={() => setWizard(null)}
        />
      )}
    </>
  );
}
