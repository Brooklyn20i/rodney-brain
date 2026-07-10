import { useMemo, useState, useEffect, useRef } from 'react';
import { useCadence } from '../lib/store';
import { ScreenHeader } from '../components/bits';
import { fmtHeaderDate, todayStr } from '../lib/util';
import { getDataHygieneIssues, getDecideItems, getKobeHandling, getLoadSummary, getWaitingOnOthers } from '../lib/selectors';
import { isFiledTask, isLinkedToProject, isUserTask } from '../lib/tasks';
import type { Project, WorkItem } from '../lib/types';

type ReviewTone = 'blue' | 'orange' | 'teal' | 'purple' | 'muted' | 'red';

function ReviewQueueCard({ title, count, hint, tone }: { title: string; count: number; hint: string; tone: ReviewTone }) {
  return (
    <div className={`review-queue-card ${tone}`}>
      <div className="review-queue-count">{count}</div>
      <div className="review-queue-copy">
        <strong>{title}</strong>
        <span>{hint}</span>
      </div>
    </div>
  );
}

function projectAttention(projects: Project[], workItems: WorkItem[]) {
  const active = projects.filter((p) => p.status === 'active' && !p.deleted_at);
  return active
    .map((p) => {
      const linked = workItems.filter((w) => isFiledTask(w) && isLinkedToProject(w, p.id));
      const waiting = linked.filter((w) => w.type === 'waitingFor').length;
      const decisions = linked.filter((w) => w.type === 'decision').length;
      const needsAttention = p.health === 'red' || p.health === 'amber' || !p.next_action || waiting > 0 || decisions > 0;
      const reason = [
        (p.health === 'red' || p.health === 'amber') && `${p.health} health`,
        !p.next_action && 'no next action',
        decisions > 0 && `${decisions} decision${decisions === 1 ? '' : 's'}`,
        waiting > 0 && `${waiting} waiting`,
      ].filter(Boolean).join(' · ');
      return { project: p, reason: reason || 'on track', linked: linked.length, needsAttention };
    })
    .filter((p) => p.needsAttention)
    .sort((a, b) => {
      const healthRank: Record<string, number> = { red: 0, amber: 1, green: 2 };
      return (healthRank[a.project.health || 'green'] ?? 3) - (healthRank[b.project.health || 'green'] ?? 3) || a.project.name.localeCompare(b.project.name);
    });
}

const LEGACY_REVIEW_SECTION_IDS = [
  'quick-capture',
  'do-now',
  'decide',
  'projects-attention',
  'waiting',
  'with-kobe',
  'capture-clear',
];

function migrateReviewChecklistKeys(saved: Record<string, boolean>) {
  const migrated: Record<string, boolean> = {};
  for (const [key, value] of Object.entries(saved)) {
    const legacy = /^(\d+)-(\d+)$/.exec(key);
    if (legacy) {
      const sectionId = LEGACY_REVIEW_SECTION_IDS[Number(legacy[1])];
      if (sectionId) migrated[`${sectionId}-${legacy[2]}`] = value;
    } else {
      migrated[key] = value;
    }
  }
  return migrated;
}

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
        if (saved && typeof saved === 'object') setChecked(migrateReviewChecklistKeys(saved));
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

  const review = useMemo(() => {
    // Exclude soft-deleted rows so counts match WeeklyReview and don't inflate.
    const work = data.work_items.filter((w) => !w.deleted_at);
    const open = work.filter((w) => !w.done);
    const load = getLoadSummary(work);
    const projects = projectAttention(data.projects, work);
    return {
      quickCapture: open.filter((w) => isUserTask(w) && w.inboxed).length,
      doNow: load.active,
      overdue: load.overdue,
      decide: getDecideItems(work, data.decisions).length,
      waiting: getWaitingOnOthers(work).length,
      withKobe: getKobeHandling(work).length,
      projects,
      hygiene: getDataHygieneIssues({ work_items: work, projects: data.projects, decisions: data.decisions }),
    };
  }, [data]);

  const sections: { id: string; title: string; items: string[] }[] = [
    { id: 'do-now', title: '☀ Needs Rodney / Do now', items: [`Review ${review.doNow} item(s) in Rodney's lane${review.overdue ? `, including ${review.overdue} overdue` : ''}`] },
    { id: 'decide', title: '⚖ Decide', items: [`${review.decide} decision(s) pending`] },
    { id: 'waiting', title: '✦ Waiting / owed by others', items: [`Follow up on ${review.waiting} outstanding item(s)`] },
    { id: 'with-kobe', title: '⚡ With Kobe / delegated to Kobe', items: [`Check ${review.withKobe} delegated item(s)`] },
    { id: 'quick-capture', title: '📥 Inbox / untriaged', items: [`Clear ${review.quickCapture} untriaged capture(s)`] },
    { id: 'projects-attention', title: '▤ Projects needing attention', items: [`Review ${review.projects.length} active project(s) with amber/red health, no next action, decisions or waiting items`] },
    { id: 'capture-clear', title: '📅 Capture / clear', items: ['Capture anything still in your head', 'Close or defer anything that is not for this week'] },
  ];

  const dateLabel = fmtHeaderDate(todayStr());

  return (
    <>
      <ScreenHeader title="Review Mode" subtitle={`${dateLabel} · two-minute iPad scan`} onMenu={onMenu} />
      <div className="screen-content review-mode-content">
        <div className="review-hero">
          <div>
            <small>Work review queue</small>
            <p>Scan what needs Rodney, what is blocked, what Kobe owns, and what must be cleared.</p>
          </div>
          <div className="review-hero-action">Start at top →</div>
        </div>

        <div className="review-queue" aria-label="Compact work review queue">
          <ReviewQueueCard title="Needs Rodney / Do now" count={review.doNow} hint={review.overdue ? `${review.overdue} overdue` : 'your active lane'} tone={review.overdue ? 'red' : 'blue'} />
          <ReviewQueueCard title="Decide" count={review.decide} hint="pending decisions" tone="orange" />
          <ReviewQueueCard title="Waiting" count={review.waiting} hint="owed by others" tone="teal" />
          <ReviewQueueCard title="With Kobe" count={review.withKobe} hint="delegated to Kobe" tone="purple" />
          <ReviewQueueCard title="Inbox" count={review.quickCapture} hint="untriaged" tone="muted" />
          <ReviewQueueCard title="Projects" count={review.projects.length} hint="need attention" tone={review.projects.length ? 'orange' : 'muted'} />
          <ReviewQueueCard title="Data hygiene" count={review.hygiene.length} hint="needs review" tone={review.hygiene.length ? 'orange' : 'muted'} />
        </div>

        <div className="review-section" aria-label="Data hygiene review queue">
          <div className="review-section-header">
            <strong style={{ fontSize: 14 }}>Data hygiene</strong>
            <span className="tag tag-followUp">Review before fixing</span>
          </div>
          <div className="review-section-body">
            <p style={{ margin: '0 0 10px', color: 'var(--text2)', fontSize: 13 }}>
              Read-only queue for confusing Work records. Nothing here auto-rewrites live data.
            </p>
            {review.hygiene.length === 0 ? (
              <div className="review-project-empty">No hygiene items need review.</div>
            ) : (
              review.hygiene.slice(0, 8).map((issue) => (
                <div className="review-check-item" key={issue.id}>
                  <span>
                    <strong>{issue.title}</strong> — {issue.detail} <em>Open {issue.route}</em>
                  </span>
                  <span className={`tag ${issue.gate === 'owner-admin-gated' ? 'tag-risk' : 'tag-action'}`}>
                    {issue.gate === 'owner-admin-gated' ? 'Owner/admin gated' : 'Needs review'}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="review-project-strip">
          <div className="review-strip-header">
            <strong>Projects needing attention</strong>
            <span>{review.projects.length}</span>
          </div>
          {review.projects.length === 0 ? (
            <div className="review-project-empty">No project is flagging for review.</div>
          ) : (
            <div className="review-project-list">
              {review.projects.slice(0, 6).map(({ project, reason, linked }) => (
                <div className="review-project-pill" key={project.id}>
                  <span className={`review-health-dot ${project.health || 'green'}`} />
                  <strong>{project.name}</strong>
                  <span>{reason}</span>
                  {linked > 0 && <em>{linked} open</em>}
                </div>
              ))}
            </div>
          )}
        </div>
        {sections.map((s) => {
          const allDone = s.items.every((_, ii) => checked[`${s.id}-${ii}`]);
          return (
            <div className="review-section" key={s.id}>
              <div className="review-section-header">
                <strong style={{ fontSize: 14 }}>{s.title}</strong>
                <span className={`tag ${allDone ? 'tag-action' : 'tag-followUp'}`}>{allDone ? 'Done' : 'Pending'}</span>
              </div>
              <div className="review-section-body">
                {s.items.map((it, ii) => {
                  const k = `${s.id}-${ii}`;
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
