import React, { useMemo, useState } from 'react';
import { useCadence } from '../lib/store';
import { ScreenHeader } from '../components/bits';
import { isOverdue } from '../lib/util';

export function Review({ onMenu }: { onMenu?: () => void }) {
  const { data } = useCadence();
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const toggle = (k: string) => setChecked((c) => ({ ...c, [k]: !c[k] }));

  const counts = useMemo(() => {
    const open = data.work_items.filter((w) => !w.done);
    return {
      inbox: open.filter((w) => w.inboxed).length,
      overdue: open.filter((w) => isOverdue(w.due_date)).length,
      decisions: data.decisions.filter((d) => d.status === 'pending').length,
      waiting: open.filter((w) => w.type === 'waitingFor').length,
    };
  }, [data]);

  const sections: { title: string; items: string[] }[] = [
    { title: '📥 Process Inbox', items: [`Clear ${counts.inbox} inbox item(s)`] },
    { title: '⚠️ Overdue Items', items: [`Review ${counts.overdue} overdue item(s)`] },
    { title: '⚖ Open Decisions', items: [`${counts.decisions} decision(s) pending`] },
    { title: '▤ Projects Review', items: ['Review each active project', 'Check for stale projects (>2 weeks)', 'Identify next actions for blocked projects'] },
    { title: '✦ Waiting On Others', items: [`Follow up on ${counts.waiting} outstanding item(s)`] },
    { title: '📅 Next Week', items: ['Schedule focus time for top 3 priorities', 'Block time for deep work', 'Review upcoming deadlines'] },
  ];

  const dateLabel = new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

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
