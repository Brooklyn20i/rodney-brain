import { useMemo, useState, useEffect, useRef } from 'react';
import { useCadence } from '../lib/store';
import { ScreenHeader } from '../components/bits';
import { isOverdue, fmtHeaderDate, todayStr } from '../lib/util';

export function Review({ onMenu }: { onMenu?: () => void }) {
  const { data, insert, update } = useCadence();
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const reviewNoteRef = useRef<string | null>(null);
  // Holds the in-flight create so two saves that fire before the first insert
  // resolves share one note instead of each creating a duplicate __review__.
  const creatingRef = useRef<Promise<string> | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    // Deterministically pick the oldest live note if duplicates already exist,
    // so the checklist can't split between reloads.
    const reviewNote = data.notes
      .filter((n) => n.title === '__review__' && !n.deleted_at)
      .sort((a, b) => (a.created_at || '').localeCompare(b.created_at || ''))[0];
    if (reviewNote) {
      reviewNoteRef.current = reviewNote.id;
      try {
        const saved = JSON.parse(reviewNote.body || '{}');
        if (saved && typeof saved === 'object') setChecked(saved);
      } catch { /* ignore */ }
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Persist the checklist to the single __review__ system note. The first save
  // creates the note behind an in-flight guard; any save that races it waits on
  // the same create and then writes its own latest state (last write wins) —
  // never a second note.
  const persist = async (next: Record<string, boolean>) => {
    const body = JSON.stringify(next);
    if (reviewNoteRef.current) {
      await update('notes', reviewNoteRef.current, { body } as any);
      return;
    }
    if (!creatingRef.current) {
      creatingRef.current = insert('notes', { title: '__review__', body, folder: '' } as any)
        .then((n) => { reviewNoteRef.current = n.id; return n.id; })
        .catch((e) => { creatingRef.current = null; throw e; }); // let a transient failure retry
    }
    const id = await creatingRef.current;
    await update('notes', id, { body } as any);
  };

  const toggle = (k: string) => {
    setChecked((c) => {
      const next = { ...c, [k]: !c[k] };
      // Debounce-save to the __review__ system note.
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => { persist(next).catch(() => {}); }, 1000);
      return next;
    });
  };

  const counts = useMemo(() => {
    // Exclude soft-deleted rows so counts match WeeklyReview and don't inflate.
    const open = data.work_items.filter((w) => !w.done && !w.deleted_at);
    return {
      inbox: open.filter((w) => w.inboxed).length,
      overdue: open.filter((w) => isOverdue(w.due_date)).length,
      decisions: data.decisions.filter((d) => d.status === 'pending' && !d.deleted_at).length + open.filter((w) => w.type === 'decision').length,
      waiting: open.filter((w) => w.type === 'waitingFor').length,
    };
  }, [data]);

  const sections: { title: string; items: string[] }[] = [
    { title: '📥 Process Quick Capture', items: [`Clear ${counts.inbox} quick capture item(s)`] },
    { title: '⚠️ Overdue Items', items: [`Review ${counts.overdue} overdue item(s)`] },
    { title: '⚖ Open Decisions', items: [`${counts.decisions} decision(s) pending`] },
    { title: '▤ Projects Review', items: ['Review each active project', 'Check for stale projects (>2 weeks)', 'Identify next actions for blocked projects'] },
    { title: '✦ Waiting On Others', items: [`Follow up on ${counts.waiting} outstanding item(s)`] },
    { title: '📅 Next Week', items: ['Schedule focus time for top 3 priorities', 'Block time for deep work', 'Review upcoming deadlines'] },
  ];

  const dateLabel = fmtHeaderDate(todayStr());

  return (
    <>
      <ScreenHeader title="Weekly Review" subtitle={dateLabel} onMenu={onMenu} />
      <div className="screen-content">
        <div style={{ background: 'linear-gradient(135deg,#EBF3FD,#F0F6FF)', border: '1px solid #C8DEF5', borderRadius: 'var(--radius)', padding: '16px 20px', marginBottom: 16 }}>
          <small style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.8px', textTransform: 'uppercase', color: 'var(--accent)', display: 'block', marginBottom: 4 }}>Weekly Review Checklist</small>
          <p style={{ fontSize: 15, fontWeight: 600 }}>Systematically review your commitments and capture new ones.</p>
        </div>
        {sections.map((s, si) => {
          const allDone = s.items.every((_, ii) => checked[`${si}-${ii}`]);
          return (
            <div className="review-section" key={si}>
              <div className="review-section-header">
                <strong style={{ fontSize: 14 }}>{s.title}</strong>
                <span className={`tag ${allDone ? 'tag-action' : 'tag-followUp'}`}>{allDone ? 'Done' : 'Pending'}</span>
              </div>
              <div className="review-section-body">
                {s.items.map((it, ii) => {
                  const k = `${si}-${ii}`;
                  return (
                    <label className={`review-check-item ${checked[k] ? 'done' : ''}`} key={ii}>
                      <input type="checkbox" checked={!!checked[k]} onChange={() => toggle(k)} />
                      <span>{it}</span>
                    </label>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
