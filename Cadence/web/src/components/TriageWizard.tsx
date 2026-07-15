import { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useCadence } from '../lib/store';
import type { Note, Person, WorkItem } from '../lib/types';
import { getTriageQueue } from '../lib/selectors';
import { reassignPrimaryPerson, reassignPrimaryProject } from '../lib/tasks';
import { useAgendaQueue } from '../lib/agendaQueue';
import { initials } from '../lib/util';

type Stage = 'main' | 'person' | 'direction' | 'project';

// The triage ritual: polish the title, add context and a date, then ONE tap
// sends it home. Person filing asks the ledger question (I owe them / they owe
// me / raise at next 1:1) and can create the person on the spot.
//
// Two ways in: "Start triage" walks the whole deck card by card; a single
// item's Triage button (itemId) handles just that one and closes.
export function TriageWizard({ onClose, itemId }: { onClose: () => void; itemId?: string }) {
  const { data, insert, update, remove, logActivity } = useCadence();
  const { enqueue } = useAgendaQueue();

  // Snapshot the queue at open so filing doesn't reshuffle the deck; each card
  // resolves live by id (skips anything already handled elsewhere).
  const [ids] = useState(() =>
    itemId ? [itemId] : getTriageQueue(data.work_items).map((w) => w.id));
  const [idx, setIdx] = useState(0);
  const [filed, setFiled] = useState(0);
  const [skipped, setSkipped] = useState(0);
  const [stage, setStage] = useState<Stage>('main');
  const [pickedPerson, setPickedPerson] = useState<Person | null>(null);
  const [newPersonName, setNewPersonName] = useState('');
  const [busy, setBusy] = useState(false);

  const item = useMemo(
    () => (idx < ids.length ? data.work_items.find((w) => w.id === ids[idx] && w.inboxed && !w.deleted_at && !w.done) : undefined),
    [data.work_items, ids, idx],
  );

  // Editable enrichment fields, re-seeded per card via key={item.id} below.
  const [title, setTitle] = useState('');
  const [notes, setNotes] = useState('');
  const [due, setDue] = useState('');
  const [seededId, setSeededId] = useState<string | null>(null);
  if (item && seededId !== item.id) {
    setSeededId(item.id);
    setTitle(item.title);
    setNotes(item.notes || '');
    setDue(item.due_date || '');
    setStage('main');
    setPickedPerson(null);
    setNewPersonName('');
  }

  const people = data.people.filter((p) => !p.type || p.type === 'person');
  const projects = data.projects.filter((p) => p.status === 'active' && !p.deleted_at);

  const advance = (outcome: 'filed' | 'skipped') => {
    // Single-item mode: the job is done the moment this card is handled.
    if (itemId) { onClose(); return; }
    if (outcome === 'filed') setFiled((n) => n + 1);
    else setSkipped((n) => n + 1);
    setIdx((i) => i + 1);
    setStage('main');
    setPickedPerson(null);
  };

  // Every destination applies the enrichment edits in the same write.
  const edits = (): Partial<WorkItem> => ({
    title: title.trim() || item!.title,
    notes,
    due_date: due || null,
  });

  const act = async (fn: () => Promise<unknown>) => {
    if (busy || !item) return;
    setBusy(true);
    try { await fn(); advance('filed'); } finally { setBusy(false); }
  };

  const toMyTasks = () => act(async () => {
    await update('work_items', item!.id, { ...edits(), inboxed: false, type: 'task' } as Partial<WorkItem>);
    logActivity('triage_my_task', title);
  });

  const toPerson = (person: Person, direction: 'iOwe' | 'theyOwe' | 'agenda') => act(async () => {
    await update('work_items', item!.id, {
      ...edits(),
      inboxed: false,
      type: direction === 'theyOwe' ? 'waitingFor' : 'task',
      person_id: person.id,
      related_entities: reassignPrimaryPerson(item!.related_entities, item!.person_id, person),
    } as Partial<WorkItem>);
    if (direction === 'agenda') {
      await enqueue(person.id, { title: title.trim() || item!.title, notes, source_item_id: item!.id });
    }
    logActivity('triage_person', `${title} → ${person.name}`);
  });

  const createPersonAndPick = async () => {
    const name = newPersonName.trim();
    if (!name) return;
    const row = await insert('people', { name, role: '', email: '', notes: '', type: 'person' } as Partial<Person>);
    const created = row as Person | undefined;
    if (created?.id) {
      setPickedPerson(created);
      setNewPersonName('');
      setStage('direction');
    }
  };

  const toProject = (project: { id: string; name: string }) => act(async () => {
    await update('work_items', item!.id, {
      ...edits(),
      inboxed: false,
      project_id: project.id,
      related_entities: reassignPrimaryProject(item!.related_entities, item!.project_id, project),
    } as Partial<WorkItem>);
    logActivity('triage_project', `${title} → ${project.name}`);
  });

  const toNote = () => act(async () => {
    await insert('notes', { title: title.trim() || item!.title, body: notes } as Partial<Note>);
    await remove('work_items', item!.id);
    logActivity('triage_note', title);
  });

  const toBin = () => act(async () => {
    await remove('work_items', item!.id);
    logActivity('triage_bin', title);
  });

  const done = idx >= ids.length || !ids.length;

  return createPortal(
    <div className="wizard-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="wizard-sheet" role="dialog" aria-label="Triage captures">
        <div className="wizard-hdr">
          <span className="wizard-title">
            {done ? 'Triage complete' : `Card ${Math.min(idx + 1, ids.length)} of ${ids.length}`}
          </span>
          <button className="btn btn-secondary btn-sm" onClick={onClose}>✕ Close</button>
        </div>

        {done ? (
          <div className="wizard-done">
            <div style={{ fontSize: 40 }}>✓</div>
            <p>{filed} filed · {skipped} skipped</p>
            <small>Everything captured today has a home.</small>
            <button className="btn btn-primary" onClick={onClose}>Done</button>
          </div>
        ) : !item ? (
          // Card was handled elsewhere (another device, the tray) — move on.
          <div className="wizard-done">
            <p>This capture was already handled.</p>
            <button className="btn btn-primary" onClick={() => advance('skipped')}>Next →</button>
          </div>
        ) : (
          <div className="wizard-card" key={item.id}>
            <input className="wizard-card-title" value={title} onChange={(e) => setTitle(e.target.value)} />
            <textarea className="wizard-card-notes" value={notes} rows={3}
              placeholder="Add the context you'll need later…"
              onChange={(e) => setNotes(e.target.value)} />
            <label className="wizard-card-due">
              Due <input type="date" value={due} onChange={(e) => setDue(e.target.value)} />
            </label>

            {stage === 'main' && (
              <div className="wizard-dests">
                <button className="wizard-dest" disabled={busy} onClick={toMyTasks}>
                  ◎ My tasks
                </button>
                <button className="wizard-dest" disabled={busy} onClick={() => setStage('person')}>
                  ✦ Person…
                </button>
                <button className="wizard-dest" disabled={busy} onClick={() => setStage('project')}>
                  ▤ Project…
                </button>
                <button className="wizard-dest" disabled={busy} onClick={toNote}>
                  ✎ Make it a note
                </button>
                <button className="wizard-dest wizard-dest-bin" disabled={busy} onClick={toBin}>
                  🗑 Bin
                </button>
                <button className="wizard-dest wizard-dest-skip" disabled={busy} onClick={() => advance('skipped')}>
                  Skip →
                </button>
              </div>
            )}

            {stage === 'person' && (
              <div className="wizard-picker">
                <div className="send-picker-section">Who?</div>
                <div className="wizard-picker-list">
                  {people.map((p) => (
                    <button key={p.id} className="send-picker-option"
                      onClick={() => { setPickedPerson(p); setStage('direction'); }}>
                      <span className="avatar avatar-sm" style={{ background: p.color || '#3A7CA5' }}>{initials(p.name)}</span>
                      {p.name}
                    </button>
                  ))}
                </div>
                <div className="wizard-new-person">
                  <input type="text" placeholder="+ New person…" value={newPersonName}
                    onChange={(e) => setNewPersonName(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') void createPersonAndPick(); }} />
                  {newPersonName.trim() && (
                    <button className="btn btn-secondary btn-sm" onClick={() => void createPersonAndPick()}>Create</button>
                  )}
                </div>
                <button className="btn btn-ghost btn-sm" onClick={() => setStage('main')}>← Back</button>
              </div>
            )}

            {stage === 'direction' && pickedPerson && (
              <div className="wizard-picker">
                <div className="send-picker-section">With {pickedPerson.name.split(' ')[0]} this is…</div>
                <button className="wizard-dest" disabled={busy} onClick={() => toPerson(pickedPerson, 'iOwe')}>
                  📥 Something I owe them
                </button>
                <button className="wizard-dest" disabled={busy} onClick={() => toPerson(pickedPerson, 'theyOwe')}>
                  📤 Something they owe me
                </button>
                <button className="wizard-dest" disabled={busy} onClick={() => toPerson(pickedPerson, 'agenda')}>
                  🗓 Raise at the next 1:1
                </button>
                <button className="btn btn-ghost btn-sm" onClick={() => setStage('person')}>← Back</button>
              </div>
            )}

            {stage === 'project' && (
              <div className="wizard-picker">
                <div className="send-picker-section">Which project?</div>
                <div className="wizard-picker-list">
                  {projects.length === 0 && <p className="ledger-empty">No active projects.</p>}
                  {projects.map((p) => (
                    <button key={p.id} className="send-picker-option" onClick={() => toProject(p)}>
                      <span style={{ color: p.color || 'var(--accent)' }}>▤</span> {p.name}
                    </button>
                  ))}
                </div>
                <button className="btn btn-ghost btn-sm" onClick={() => setStage('main')}>← Back</button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
