import { useMemo, useState } from 'react';
import { useCadence } from '../../lib/store';
import type { WorkItem } from '../../lib/types';
import { ScreenHeader } from '../../components/bits';
import { QuickAdd } from '../../components/QuickAdd';
import { CommitmentsBoard } from './CommitmentsBoard';
import { TaskSlideOver } from './TaskSlideOver';
import { TodayStrip } from '../../components/TodayStrip';
import { TriageTray } from '../../components/TriageTray';
import { addDaysStr, fmtDM } from '../../lib/util';
import { getCommitments } from '../../lib/selectors';
import { useDayPlan } from '../../lib/dayPlan';

// Home: Rodney's two questions on one dense screen — "what's my day?" (the
// meetings strip, fresh captures, Today's focus) and "what are my
// commitments?" (the board: my own to-dos vs what I owe people vs what
// they owe me). The task editor is a slide-over so the board keeps the
// full width.
export function Home({ onMenu, onNavigate }: {
  onMenu?: () => void;
  onNavigate?: (screen: string, id?: string | null) => void;
}) {
  const { data, insert, update } = useCadence();
  const { pinned, pin, unpin, move } = useDayPlan();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [doneOpen, setDoneOpen] = useState(false);

  const commitments = useMemo(() => getCommitments(data.work_items), [data.work_items]);

  const recentlyDone = useMemo(() => {
    const doneSince = addDaysStr(-14);
    return data.work_items
      .filter((w) => !w.deleted_at && w.done && (w.completed_at || '').slice(0, 10) >= doneSince)
      .sort((a, b) => (b.completed_at || '').localeCompare(a.completed_at || ''));
  }, [data.work_items]);

  const selected = selectedId ? data.work_items.find((w) => w.id === selectedId) || null : null;

  // Hand-picked plan for the day, in Rodney's order (useDayPlan prunes
  // done/deleted ids on read).
  const pinnedItems = pinned
    .map((id) => data.work_items.find((w) => w.id === id))
    .filter((w): w is WorkItem => !!w);
  const pinnedSet = new Set(pinned);

  const toggleDone = (w: WorkItem) => update('work_items', w.id, {
    done: !w.done, completed_at: !w.done ? new Date().toISOString() : null,
  } as Partial<WorkItem>);

  const subtitle = `${commitments.open} open · ${commitments.overdue} overdue · ${commitments.dueToday} due today`;

  return (
    <>
      <ScreenHeader title="Home" subtitle={subtitle} onMenu={onMenu}>
        <button className="btn btn-primary" onClick={() => setAdding(true)}>+ Capture task</button>
      </ScreenHeader>

      <div className="home-scroll">
        {/* Do I have meetings today? Answered before anything else. */}
        <TodayStrip onNavigate={onNavigate} />

        {/* The combined cockpit: fresh captures to shape sit right here, one
            tap from filing. It's the same queue as the Inbox screen — a
            preview of it — so "Open Inbox →" leads to the full triage view. */}
        <TriageTray onEdit={(w) => setSelectedId(w.id)} onOpenInbox={() => onNavigate?.('inbox')} />

        {pinnedItems.length > 0 && (
          <div className="detail-section day-plan" aria-label="Today's focus">
            <h3>★ Today's focus
              <span className="section-count" style={{ background: 'var(--accent)', marginLeft: 8 }}>{pinnedItems.length}</span>
            </h3>
            {pinnedItems.map((w, i) => (
              <div key={w.id} className={`work-item-row day-plan-row${selectedId === w.id ? ' selected' : ''}`}>
                <input type="checkbox" checked={w.done} onChange={() => toggleDone(w)}
                  style={{ width: 16, height: 16, accentColor: 'var(--accent)' }} />
                <span className="wi-title" style={{ flex: 1, cursor: 'pointer', minWidth: 0 }}
                  onClick={() => setSelectedId(w.id)}>{w.title}</span>
                <button className="btn btn-ghost btn-sm" title="Move up" disabled={i === 0}
                  onClick={() => move(w.id, -1)}>↑</button>
                <button className="btn btn-ghost btn-sm" title="Move down" disabled={i === pinnedItems.length - 1}
                  onClick={() => move(w.id, 1)}>↓</button>
                <button className="pin-star pinned" title="Unpin from Today's focus"
                  onClick={() => unpin(w.id)}>★</button>
              </div>
            ))}
          </div>
        )}

        <CommitmentsBoard
          commitments={commitments}
          people={data.people}
          selectedId={selectedId}
          onSelect={(w) => setSelectedId(w.id)}
          onQuickAddTodo={(title) => insert('work_items', {
            title, type: 'task', priority: 'medium', due_date: null,
            person_id: null, inboxed: false, source: 'you',
          } as Partial<WorkItem>)}
          pinnedIds={pinnedSet}
          onTogglePin={(w) => { if (pinnedSet.has(w.id)) void unpin(w.id); else void pin(w.id); }}
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

      {selected && <TaskSlideOver task={selected} onClose={() => setSelectedId(null)} />}
      {adding && <QuickAdd onClose={() => setAdding(false)} />}
    </>
  );
}

// Transitional alias — the shim at screens/Tasks.tsx and older tests import
// `Tasks`; the screen itself is Home now.
export { Home as Tasks };
