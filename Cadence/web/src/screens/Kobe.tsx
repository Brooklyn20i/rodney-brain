import { useMemo, useState } from 'react';
import { useCadence } from '../lib/store';
import { ScreenHeader } from '../components/bits';
import { ItemModal } from '../components/ItemModal';
import type { WorkItem } from '../lib/types';
import { fmtDM } from '../lib/util';

export function Kobe({ onMenu }: { onMenu?: () => void }) {
  const { data } = useCadence();
  const [modal, setModal] = useState<WorkItem | null>(null);
  const [tab, setTab] = useState<'brief' | 'work'>('brief');

  // Notes Kobe has written — folder starts with __kobe__
  const kobeNotes = useMemo(
    () =>
      data.notes
        .filter((n) => (n.folder || '').startsWith('__kobe__'))
        .sort((a, b) => b.updated_at.localeCompare(a.updated_at)),
    [data.notes],
  );

  // Tasks Kobe created (source = 'agent:kobe') that are still open
  const kobeTasks = useMemo(
    () =>
      data.work_items
        .filter((w) => w.source === 'agent:kobe' && !w.done && !w.deleted_at)
        .sort((a, b) => b.updated_at.localeCompare(a.updated_at)),
    [data.work_items],
  );

  const latestBrief = kobeNotes[0] ?? null;
  const olderNotes = kobeNotes.slice(1);

  return (
    <>
      <ScreenHeader title="Kobe" onMenu={onMenu} />
      <div className="kobe-screen">
        <div className="kobe-tabs">
          <button className={`kobe-tab${tab === 'brief' ? ' active' : ''}`} onClick={() => setTab('brief')}>
            Briefings {kobeNotes.length > 0 && <span className="kobe-tab-count">{kobeNotes.length}</span>}
          </button>
          <button className={`kobe-tab${tab === 'work' ? ' active' : ''}`} onClick={() => setTab('work')}>
            Open tasks {kobeTasks.length > 0 && <span className="kobe-tab-count">{kobeTasks.length}</span>}
          </button>
        </div>

        {tab === 'brief' && (
          <div className="kobe-panel">
            {!latestBrief ? (
              <div className="empty-state">
                <div className="icon">⚡</div>
                <p>No briefings yet</p>
                <small>Ask Kobe via Telegram to write a morning brief —<br />it will appear here.</small>
              </div>
            ) : (
              <>
                <div className="kobe-brief-card">
                  <div className="kobe-brief-header">
                    <span className="kobe-brief-title">{latestBrief.title}</span>
                    <span className="kobe-brief-time">{fmtDM(latestBrief.updated_at)}</span>
                  </div>
                  <div
                    className="kobe-brief-body"
                    // Kobe writes HTML via RichEditor-compatible format
                    dangerouslySetInnerHTML={{ __html: latestBrief.body || '<p>No content.</p>' }}
                  />
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

        {tab === 'work' && (
          <div className="kobe-panel">
            {kobeTasks.length === 0 ? (
              <div className="empty-state">
                <div className="icon">◎</div>
                <p>No open tasks from Kobe</p>
                <small>Tasks Kobe creates on your behalf appear here.</small>
              </div>
            ) : (
              <div className="kobe-task-list">
                {kobeTasks.map((w) => {
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
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {modal && <ItemModal existing={modal} onClose={() => setModal(null)} />}
    </>
  );
}
