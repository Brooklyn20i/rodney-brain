import { useState } from 'react';
import { useCadence } from '../lib/store';
import type { WorkItem, Note } from '../lib/types';
import { getTriageQueue } from '../lib/selectors';
import { reassignPrimaryPerson, reassignPrimaryProject } from '../lib/tasks';
import { fmtDM } from '../lib/util';

// Triage tray — pinned on Today. Everything captured via Global Capture /
// Quick Add (inboxed) queues here until Rodney shapes it: file it as his own
// task, mark it Waiting / owed by others, attach it to a project, turn it into
// a note, or dismiss it. Same population as the Inbox screen (which stays the
// full-width triage surface); this is the zero-navigation view of it.
export function TriageTray({ onEdit, onOpenInbox }: {
  onEdit: (w: WorkItem) => void;
  onOpenInbox?: () => void;
}) {
  const { data, update, insert, remove, logActivity, canEdit } = useCadence();
  // One picker open at a time, anchored to a specific capture row.
  const [picker, setPicker] = useState<null | { id: string; kind: 'person' | 'project' }>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const queue = getTriageQueue(data.work_items);
  const people = data.people.filter((p) => !p.type || p.type === 'person');
  const projects = data.projects.filter((p) => p.status === 'active' && !p.deleted_at);

  const act = async (w: WorkItem, fn: () => Promise<unknown>) => {
    if (busyId) return;
    setBusyId(w.id);
    setPicker(null);
    try { await fn(); } finally { setBusyId(null); }
  };

  // File as Rodney's own task (Filed Work → shows under Needs Rodney / Do now).
  const fileAsMine = (w: WorkItem) => act(w, async () => {
    await update('work_items', w.id, { inboxed: false, type: 'task' } as Partial<WorkItem>);
    logActivity('triage_my_task', w.title);
  });

  // Waiting / owed by others — optionally pinned to the person who owes it.
  const fileAsWaiting = (w: WorkItem, person: { id: string; name: string } | null) => act(w, async () => {
    await update('work_items', w.id, {
      inboxed: false,
      type: 'waitingFor',
      person_id: person ? person.id : w.person_id,
      related_entities: person
        ? reassignPrimaryPerson(w.related_entities, w.person_id, person)
        : w.related_entities || [],
    } as Partial<WorkItem>);
    logActivity('triage_waiting', w.title);
  });

  const fileToProject = (w: WorkItem, project: { id: string; name: string }) => act(w, async () => {
    await update('work_items', w.id, {
      inboxed: false,
      project_id: project.id,
      related_entities: reassignPrimaryProject(w.related_entities, w.project_id, project),
    } as Partial<WorkItem>);
    logActivity('triage_project', w.title);
  });

  // Not actionable — keep the content as a note, retire the work item.
  const convertToNote = (w: WorkItem) => act(w, async () => {
    await insert('notes', { title: w.title, body: w.notes || '' } as Partial<Note>);
    await remove('work_items', w.id);
    logActivity('triage_note', w.title);
  });

  const dismiss = (w: WorkItem) => act(w, async () => {
    await update('work_items', w.id, {
      inboxed: false, done: true, completed_at: new Date().toISOString(),
    } as Partial<WorkItem>);
    logActivity('triage_dismiss', w.title);
  });

  return (
    <div className="cockpit-section triage-tray" data-testid="triage-tray">
      <div className="cockpit-section-hdr">
        <span className="cockpit-section-label">Inbox — to triage</span>
        {queue.length > 0 && (
          <span className="cockpit-section-count" style={{ background: 'var(--orange)' }}>{queue.length}</span>
        )}
        {onOpenInbox && queue.length > 0 && (
          <button className="triage-open-inbox" onClick={onOpenInbox}>Open Inbox →</button>
        )}
      </div>

      {queue.length === 0 ? (
        <div className="cockpit-empty">Nothing to triage — anything you capture with ＋ Capture lands here.</div>
      ) : (
        <div className="cockpit-section-body">
          {queue.map((w) => {
            const person = data.people.find((p) => p.id === w.person_id);
            const project = data.projects.find((p) => p.id === w.project_id);
            const busy = busyId === w.id;
            return (
              <div key={w.id} className="triage-row">
                <div className="triage-row-main" onClick={() => onEdit(w)} role="button" tabIndex={0}
                  onKeyDown={(e) => { if (e.key === 'Enter') onEdit(w); }}>
                  <div className="triage-row-title">{w.title}</div>
                  {(person || project || w.due_date) && (
                    <div className="triage-row-meta">
                      {person && <span className="cockpit-meta-chip cockpit-chip-person">{person.name}</span>}
                      {project && <span className="cockpit-meta-chip cockpit-chip-proj">{project.name}</span>}
                      {w.due_date && <span className="cockpit-meta-chip cockpit-chip-plain">📅 {fmtDM(w.due_date)}</span>}
                    </div>
                  )}
                </div>

                {canEdit && (
                  <div className="triage-actions">
                    <button className="btn btn-ghost btn-sm" disabled={busy}
                      title="File as your own task — shows under Needs Rodney / Do now"
                      onClick={() => fileAsMine(w)}>My task</button>

                    <div style={{ position: 'relative' }}>
                      <button className="btn btn-ghost btn-sm" disabled={busy}
                        title="File as Waiting / owed by others"
                        onClick={() => setPicker((p) => p?.id === w.id && p.kind === 'person' ? null : { id: w.id, kind: 'person' })}>
                        Waiting…
                      </button>
                      {picker?.id === w.id && picker.kind === 'person' && (
                        <>
                          <div style={{ position: 'fixed', inset: 0, zIndex: 49 }} onClick={() => setPicker(null)} />
                          <div className="action-send-picker">
                            <button className="send-picker-option" onClick={() => fileAsWaiting(w, null)}>
                              No one specific
                            </button>
                            {people.map((p) => (
                              <button key={p.id} className="send-picker-option" onClick={() => fileAsWaiting(w, p)}>
                                👤 {p.name}
                              </button>
                            ))}
                          </div>
                        </>
                      )}
                    </div>

                    <div style={{ position: 'relative' }}>
                      <button className="btn btn-ghost btn-sm" disabled={busy}
                        title="File into a project"
                        onClick={() => setPicker((p) => p?.id === w.id && p.kind === 'project' ? null : { id: w.id, kind: 'project' })}>
                        Project…
                      </button>
                      {picker?.id === w.id && picker.kind === 'project' && (
                        <>
                          <div style={{ position: 'fixed', inset: 0, zIndex: 49 }} onClick={() => setPicker(null)} />
                          <div className="action-send-picker">
                            {projects.length === 0 && <div className="cockpit-empty" style={{ padding: '8px 12px' }}>No active projects</div>}
                            {projects.map((p) => (
                              <button key={p.id} className="send-picker-option" onClick={() => fileToProject(w, p)}>
                                <span style={{ color: p.color || 'var(--accent)' }}>▤</span> {p.name}
                              </button>
                            ))}
                          </div>
                        </>
                      )}
                    </div>

                    <button className="btn btn-ghost btn-sm" disabled={busy}
                      title="Keep as a note — not actionable work"
                      onClick={() => convertToNote(w)}>Note</button>

                    <button className="btn btn-ghost btn-sm triage-dismiss" disabled={busy}
                      title="Dismiss — mark done and clear from the tray"
                      onClick={() => dismiss(w)}>✕</button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
