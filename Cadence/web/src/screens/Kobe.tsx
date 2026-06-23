import { useMemo, useState } from 'react';
import { useCadence } from '../lib/store';
import { ScreenHeader } from '../components/bits';
import { ItemModal } from '../components/ItemModal';
import type { WorkItem } from '../lib/types';
import { fmtDM, fmtDMY } from '../lib/util';

type Tab = 'for_kobe' | 'brief' | 'from_kobe' | 'activity';

const fmtAction = (s: string) =>
  s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

export function Kobe({ onMenu }: { onMenu?: () => void }) {
  const { data } = useCadence();
  const [modal, setModal] = useState<WorkItem | 'new' | null>(null);
  const [tab, setTab] = useState<Tab>('for_kobe');

  const kobeAssigned = useMemo(
    () =>
      data.work_items
        .filter((w) => w.source === 'for:kobe' && !w.done && !w.deleted_at)
        .sort((a, b) => b.created_at.localeCompare(a.created_at)),
    [data.work_items],
  );

  const kobeNotes = useMemo(
    () =>
      data.notes
        .filter((n) => (n.folder || '').startsWith('__kobe__') && n.folder !== '__kobe_inbox__' && n.folder !== '__kobe_reply__')
        .sort((a, b) => b.updated_at.localeCompare(a.updated_at)),
    [data.notes],
  );

  const kobeTasks = useMemo(
    () =>
      data.work_items
        .filter((w) => w.source === 'agent:kobe' && !w.done && !w.deleted_at)
        .sort((a, b) => b.updated_at.localeCompare(a.updated_at)),
    [data.work_items],
  );

  const kobeActivity = useMemo(
    () => data.activity.filter((a) => a.actor.startsWith('agent:')),
    [data.activity],
  );

  const latestBrief = kobeNotes[0] ?? null;
  const olderNotes = kobeNotes.slice(1);

  const taskRow = (w: WorkItem) => {
    const person = w.person_id ? data.people.find((p) => p.id === w.person_id) : null;
    const project = w.project_id ? data.projects.find((p) => p.id === w.project_id) : null;
    return (
      <button key={w.id} className="kobe-task-row" onClick={() => setModal(w)}>
        <span className="kobe-task-title">{w.title}</span>
        <div className="kobe-task-meta">
          {person && <span className="tag tag-person">{person.name}</span>}
          {project && <span className="tag tag-project">{project.name}</span>}
          {w.due_date && <span className="kobe-task-due">{fmtDM(w.due_date)}</span>}
        </div>
      </button>
    );
  };

  return (
    <>
      <ScreenHeader title="Kobe" onMenu={onMenu} />
      <div className="kobe-screen">
        <div className="kobe-tabs">
          <button className={`kobe-tab${tab === 'for_kobe' ? ' active' : ''}`} onClick={() => setTab('for_kobe')}>
            For Kobe
            {kobeAssigned.length > 0 && <span className="kobe-tab-count">{kobeAssigned.length}</span>}
          </button>
          <button className={`kobe-tab${tab === 'brief' ? ' active' : ''}`} onClick={() => setTab('brief')}>
            Briefings
            {kobeNotes.length > 0 && <span className="kobe-tab-count">{kobeNotes.length}</span>}
          </button>
          <button className={`kobe-tab${tab === 'from_kobe' ? ' active' : ''}`} onClick={() => setTab('from_kobe')}>
            From Kobe
            {kobeTasks.length > 0 && <span className="kobe-tab-count">{kobeTasks.length}</span>}
          </button>
          <button className={`kobe-tab${tab === 'activity' ? ' active' : ''}`} onClick={() => setTab('activity')}>
            Activity Log
          </button>
        </div>

        {/* ── For Kobe ── */}
        {tab === 'for_kobe' && (
          <div className="kobe-panel">
            <div className="kobe-panel-actions">
              <button className="btn btn-primary" onClick={() => setModal('new')}>+ Task for Kobe</button>
            </div>
            {kobeAssigned.length === 0 ? (
              <div className="empty-state">
                <div className="icon">⚡</div>
                <p>No tasks for Kobe</p>
                <small>Add non-urgent tasks here. Kobe checks this regularly and actions them without interrupting you.</small>
              </div>
            ) : (
              <div className="kobe-task-list">{kobeAssigned.map(taskRow)}</div>
            )}
          </div>
        )}

        {/* ── Briefings ── */}
        {tab === 'brief' && (
          <div className="kobe-panel">
            {!latestBrief ? (
              <div className="empty-state">
                <div className="icon">⚡</div>
                <p>No briefings yet</p>
                <small>Ask Kobe to write a morning brief —<br />it will appear here.</small>
              </div>
            ) : (
              <>
                <div className="kobe-brief-card">
                  <div className="kobe-brief-header">
                    <span className="kobe-brief-title">{latestBrief.title}</span>
                    <span className="kobe-brief-time">{fmtDM(latestBrief.updated_at)}</span>
                  </div>
                  <div className="kobe-brief-body" dangerouslySetInnerHTML={{ __html: latestBrief.body || '<p>No content.</p>' }} />
                </div>
                {olderNotes.length > 0 && (
                  <div className="kobe-older-notes">
                    <div className="kobe-section-label">Earlier</div>
                    {olderNotes.map((n) => (
                      <div key={n.id} className="kobe-note-row">
                        <span className="kobe-note-title">{n.title}</span>
                        <span className="kobe-note-time">{fmtDM(n.updated_at)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* ── Activity Log ── */}
        {tab === 'activity' && (
          <div className="kobe-panel">
            {kobeActivity.length === 0 ? (
              <div className="empty-state">
                <div className="icon">📋</div>
                <p>No activity yet</p>
                <small>Actions Kobe takes in Cadence will appear here.</small>
              </div>
            ) : (
              <div className="kobe-activity-list">
                {kobeActivity.map((a) => (
                  <div key={a.id} className="kobe-activity-row">
                    <div className="kobe-activity-dot" />
                    <div className="kobe-activity-body">
                      <div className="kobe-activity-action">{fmtAction(a.action)}</div>
                      {a.detail && <div className="kobe-activity-detail">{a.detail}</div>}
                    </div>
                    <div className="kobe-activity-time" title={a.created_at}>
                      {fmtDMY(a.created_at.slice(0, 10))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── From Kobe ── */}
        {tab === 'from_kobe' && (
          <div className="kobe-panel">
            {kobeTasks.length === 0 ? (
              <div className="empty-state">
                <div className="icon">◎</div>
                <p>Nothing from Kobe yet</p>
                <small>Tasks Kobe creates on your behalf appear here.</small>
              </div>
            ) : (
              <div className="kobe-task-list">{kobeTasks.map(taskRow)}</div>
            )}
          </div>
        )}
      </div>

      {modal !== null && (
        <ItemModal
          existing={modal !== 'new' ? modal : undefined}
          defaults={modal === 'new' ? { source: 'for:kobe', inboxed: false } as any : undefined}
          onClose={() => setModal(null)}
        />
      )}
    </>
  );
}
