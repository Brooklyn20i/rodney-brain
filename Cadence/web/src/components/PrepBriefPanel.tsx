import { useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import type { Person, WorkItem, Project, ProjectUpdate } from '../lib/types';
import type { AgendaItem, ActionItem } from '../lib/meetingData';
import { uid } from '../lib/meetingData';
import { inferHealthReason } from '../lib/selectors';
import { sanitizeHtml } from '../lib/sanitize';
import { isOverdue, fmtDM } from '../lib/util';
import { supabase } from '../lib/supabase';

const isPersonLinked = (w: { person_id: string | null; related_entities?: { type: string; id: string }[] }, id: string) =>
  w.person_id === id || (w.related_entities || []).some((re) => re.type === 'person' && re.id === id);

const HEALTH_COLOR: Record<string, string> = {
  green: 'var(--green)', amber: 'var(--orange)', red: 'var(--red)',
};

const PRI_DOT: Record<string, string> = {
  high: 'var(--red)', medium: 'var(--orange)', low: 'var(--text3)',
};

interface PrepBriefPanelProps {
  person: Person;
  agenda: AgendaItem[];
  carryForward: ActionItem[];
  deferredAgenda: AgendaItem[];
  workItems: WorkItem[];
  projects: Project[];
  projectUpdates: ProjectUpdate[];
  onAddToAgenda: (items: AgendaItem[]) => void;
  onClose: () => void;
}

export function PrepBriefPanel({
  person, agenda, carryForward, deferredAgenda,
  workItems, projects, projectUpdates, onAddToAgenda, onClose,
}: PrepBriefPanelProps) {
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [aceSent, setAceSent] = useState(false);
  const [aceBusy, setAceBusy] = useState(false);
  const [notesExpanded, setNotesExpanded] = useState(false);

  const alreadyInAgenda = useMemo(
    () => new Set(agenda.map((a) => a.title.toLowerCase())),
    [agenda],
  );

  // Open action items for this person, priority-sorted (top 5)
  const openItems = useMemo(() => {
    const PRI = { high: 0, medium: 1, low: 2 };
    return workItems
      .filter((w) => isPersonLinked(w, person.id) && !w.done)
      .sort((a, b) => {
        const dp = (PRI[a.priority as keyof typeof PRI] ?? 1) - (PRI[b.priority as keyof typeof PRI] ?? 1);
        if (dp !== 0) return dp;
        if (a.due_date && b.due_date) return a.due_date.localeCompare(b.due_date);
        return a.due_date ? -1 : b.due_date ? 1 : 0;
      })
      .slice(0, 5);
  }, [workItems, person.id]);

  // Projects linked to this person via open work items (max 3)
  const linkedProjects = useMemo(() => {
    const ids = new Set(
      workItems
        .filter((w) => isPersonLinked(w, person.id) && !w.done && w.project_id)
        .map((w) => w.project_id as string),
    );
    return projects
      .filter((p) => ids.has(p.id) && !p.deleted_at)
      .slice(0, 3);
  }, [workItems, projects, person.id]);

  const toggleCheck = (id: string) =>
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });

  const addChecked = () => {
    const toAdd: AgendaItem[] = [];
    // Deferred agenda items (checked)
    deferredAgenda.forEach((item) => {
      if (checked.has(`d:${item.id}`) && !alreadyInAgenda.has(item.title.toLowerCase())) {
        toAdd.push({ id: uid(), title: item.title, notes: item.notes || '', status: 'discuss' });
      }
    });
    if (toAdd.length > 0) onAddToAgenda(toAdd);
    setChecked(new Set());
  };

  const sendToAce = async () => {
    if (aceBusy) return;
    setAceBusy(true);
    const prompt = `Summarise what I should cover in my 1:1 with ${person.name} today. Include key open actions, any blockers, and suggested agenda items based on our recent history.`;
    await supabase.functions.invoke('ace-chat', { body: { message: prompt } });
    setAceBusy(false);
    setAceSent(true);
  };

  const hasFromLast = deferredAgenda.length > 0 || carryForward.length > 0;
  const checkedCount = checked.size;

  const personNotes = person.notes?.trim() || '';

  return createPortal(
    <>
      <div className="prep-backdrop" onClick={onClose} />
      <div className="prep-panel">
        <div className="prep-panel-hdr">
          <span className="prep-panel-title">✦ Meeting Prep · {person.name.split(' ')[0]}</span>
          <button className="btn btn-secondary btn-sm" onClick={onClose}>✕ Close</button>
        </div>

        <div className="prep-panel-body">

          {/* From last meeting */}
          <div className="prep-section">
            <div className="prep-section-hdr">⏭ From last meeting</div>
            {!hasFromLast && <div className="prep-empty">Nothing carried over</div>}

            {deferredAgenda.map((item) => {
              const id = `d:${item.id}`;
              const already = alreadyInAgenda.has(item.title.toLowerCase());
              return (
                <label key={id} className={`prep-row-check${already ? ' prep-row-done' : ''}`}>
                  <input
                    type="checkbox"
                    checked={checked.has(id) || already}
                    disabled={already}
                    onChange={() => toggleCheck(id)}
                    style={{ flexShrink: 0, marginTop: 2 }}
                  />
                  <span style={{ flex: 1, textDecoration: already ? 'line-through' : 'none', opacity: already ? 0.5 : 1 }}>
                    {item.title}
                    <span style={{ fontSize: 10, color: 'var(--orange)', marginLeft: 6, fontWeight: 700 }}>DEFERRED</span>
                  </span>
                </label>
              );
            })}

            {carryForward.map((item) => (
              <div key={item.id} className="prep-row">
                <span style={{ color: 'var(--text3)', flexShrink: 0 }}>→</span>
                <span style={{ flex: 1, fontSize: 13, color: 'var(--text2)' }}>
                  {item.title}
                  {item.due && (
                    <span style={{ marginLeft: 6, fontSize: 11, color: isOverdue(item.due) ? 'var(--red)' : 'var(--text3)' }}>
                      {isOverdue(item.due) ? 'Overdue · ' : ''}{fmtDM(item.due)}
                    </span>
                  )}
                </span>
              </div>
            ))}

            {checkedCount > 0 && (
              <button className="btn btn-primary btn-sm prep-add-btn" onClick={addChecked}>
                + Add {checkedCount} to agenda
              </button>
            )}
          </div>

          {/* Open action items */}
          <div className="prep-section">
            <div className="prep-section-hdr">
              📋 Open action items{openItems.length > 0 ? ` (${openItems.length})` : ''}
            </div>
            {openItems.length === 0
              ? <div className="prep-empty">No open items</div>
              : openItems.map((w) => (
                  <div key={w.id} className="prep-row">
                    <span className="prep-pri-dot" style={{ background: PRI_DOT[w.priority] || 'var(--text3)' }} />
                    <span style={{ flex: 1 }}>{w.title}</span>
                    {w.due_date && (
                      <span style={{ fontSize: 11, color: isOverdue(w.due_date) ? 'var(--red)' : 'var(--text3)', flexShrink: 0, marginLeft: 4 }}>
                        {fmtDM(w.due_date)}
                      </span>
                    )}
                  </div>
                ))
            }
          </div>

          {/* Linked projects */}
          {linkedProjects.length > 0 && (
            <div className="prep-section">
              <div className="prep-section-hdr">▤ Linked projects</div>
              {linkedProjects.map((p) => {
                const reason = inferHealthReason(p, projectUpdates, workItems);
                return (
                  <div key={p.id} className="prep-project-row">
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: HEALTH_COLOR[p.health] || 'var(--text3)', flexShrink: 0, display: 'inline-block' }} />
                    <span style={{ flex: 1, fontWeight: 600, fontSize: 13 }}>{p.name}</span>
                    {p.health !== 'green' && (
                      <span style={{ fontSize: 11, color: HEALTH_COLOR[p.health], flexShrink: 0 }}>{reason}</span>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Background notes */}
          {personNotes && (
            <div className="prep-section">
              <div className="prep-section-hdr">📝 Background</div>
              <div
                className="prep-notes-body"
                style={{ maxHeight: notesExpanded ? 'none' : 72, overflow: 'hidden' }}
                dangerouslySetInnerHTML={{ __html: sanitizeHtml(personNotes) }}
              />
              {personNotes.length > 200 && (
                <button className="prep-expand-btn" onClick={() => setNotesExpanded((v) => !v)}>
                  {notesExpanded ? 'Show less' : 'Show more'}
                </button>
              )}
            </div>
          )}

        </div>

        {/* Ace footer */}
        <div className="prep-ace-footer">
          {aceSent
            ? <div className="prep-ace-sent">✓ Brief sent — check the Ace screen</div>
            : <button className="prep-ace-btn" onClick={sendToAce} disabled={aceBusy}>
                {aceBusy ? 'Asking Ace…' : '✨ Ask Ace for summary'}
              </button>
          }
        </div>
      </div>
    </>,
    document.body,
  );
}
