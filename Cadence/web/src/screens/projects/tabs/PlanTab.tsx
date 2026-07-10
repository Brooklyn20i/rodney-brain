import { useEffect, useMemo, useState } from 'react';
import { useCadence } from '../../../lib/store';
import type { Project, Milestone, WorkItem, ProjectPhase } from '../../../lib/types';
import { Due } from '../../../components/bits';
import { ItemModal } from '../../../components/ItemModal';
import { fmtDate, isOverdue } from '../../../lib/util';
import { isLinkedToProject } from '../../../lib/tasks';
import { ProjectGantt } from '../../../components/Gantt';

function WorkItemRow({ w, phases, onEdit }: { w: WorkItem; phases: ProjectPhase[]; onEdit: (w: WorkItem) => void }) {
  const { update } = useCadence();
  return (
    <div className="work-item-row">
      <input type="checkbox" checked={w.done} onChange={() => update('work_items', w.id, { done: !w.done, completed_at: !w.done ? new Date().toISOString() : null } as Partial<WorkItem>)} />
      <span className={`wi-title ${w.done ? 'done' : ''}`}>{w.title}</span>
      {phases.length > 0 && (
        <select className="phase-mini" value={w.phase_id || ''} onChange={(e) => update('work_items', w.id, { phase_id: e.target.value || null } as Partial<WorkItem>)}>
          <option value="">— phase —</option>
          {phases.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      )}
      <Due date={w.due_date} />
      <button className="btn-icon" onClick={() => onEdit(w)}>✎</button>
    </div>
  );
}

function PhaseRow({ ph, milestones, onRemove }: { ph: ProjectPhase; milestones: Milestone[]; onRemove: () => void }) {
  const { update } = useCadence();
  const [name, setName] = useState(ph.name);
  useEffect(() => { setName(ph.name); }, [ph.name]);
  const ms = milestones.filter((m) => m.phase_id === ph.id);
  const done = ms.filter((m) => m.done).length;
  return (
    <div className="phase-card">
      <div className="phase-head">
        <input className="phase-name" value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => { if (name.trim() && name !== ph.name) update('project_phases', ph.id, { name: name.trim() } as Partial<ProjectPhase>); }} />
        <button className="btn-icon" onClick={onRemove}>✕</button>
      </div>
      <div className="phase-dates">
        <label>Start <input type="date" value={ph.start_date || ''} onChange={(e) => update('project_phases', ph.id, { start_date: e.target.value || null } as Partial<ProjectPhase>)} /></label>
        <label>End <input type="date" value={ph.end_date || ''} onChange={(e) => update('project_phases', ph.id, { end_date: e.target.value || null } as Partial<ProjectPhase>)} /></label>
        {ms.length > 0 && <span className="phase-prog">{done}/{ms.length} milestones</span>}
      </div>
    </div>
  );
}

// Plan tab: the visual timeline plus everything that shapes it — phases,
// milestones and the project's open items. (Next action lives on Overview,
// via the single NextActionEditor.)
export function PlanTab({ project }: { project: Project }) {
  const { data, insert, update, remove } = useCadence();
  const milestones = useMemo(() => data.milestones.filter((m) => m.project_id === project.id), [data.milestones, project.id]);
  const phases = useMemo(() => data.project_phases.filter((p) => p.project_id === project.id).sort((a, b) => a.sort - b.sort), [data.project_phases, project.id]);
  // Inboxed captures tagged with this project still wait in the Inbox for
  // triage — they surface here only once filed.
  const items = useMemo(() => data.work_items.filter((w) =>
    isLinkedToProject(w, project.id) && !w.done && !w.inboxed
  ), [data.work_items, project.id]);
  const [addingItem, setAddingItem] = useState(false);
  const [editingItem, setEditingItem] = useState<WorkItem | null>(null);
  const [mTitle, setMTitle] = useState('');
  const [mDate, setMDate] = useState('');
  const [mErr, setMErr] = useState('');
  const [phaseName, setPhaseName] = useState('');
  const [phaseErr, setPhaseErr] = useState('');
  const pct = milestones.length ? Math.round(milestones.filter((m) => m.done).length / milestones.length * 100) : 0;

  const addMilestone = async () => {
    if (!mTitle.trim()) return;
    setMErr('');
    try {
      await insert('milestones', { project_id: project.id, title: mTitle.trim(), due_date: mDate || null, done: false } as Partial<Milestone>);
      setMTitle(''); setMDate('');
    } catch { setMErr('Could not save the milestone — try again.'); }
  };

  const addPhase = async () => {
    if (!phaseName.trim()) return;
    setPhaseErr('');
    try {
      await insert('project_phases', { project_id: project.id, name: phaseName.trim(), sort: phases.length, start_date: null, end_date: null } as Partial<ProjectPhase>);
      setPhaseName('');
    } catch { setPhaseErr('Could not save the phase — try again.'); }
  };

  return (
    <div>
      {/* Visual timeline — phases as bars, milestones as markers */}
      <div style={{ marginBottom: 18 }}>
        <strong style={{ fontSize: 13, display: 'block', marginBottom: 8 }}>Timeline</strong>
        <ProjectGantt phases={phases} milestones={milestones} items={items} targetDate={project.target_date} />
      </div>

      {/* Phases / workstreams shape the timeline, so they belong here. */}
      <div className="detail-section">
        <h3>Phases / Workstreams</h3>
        {phases.map((ph) => <PhaseRow key={ph.id} ph={ph} milestones={milestones} onRemove={() => remove('project_phases', ph.id)} />)}
        {!phases.length && <small style={{ color: 'var(--text3)' }}>No phases yet</small>}
        {phaseErr && <small style={{ color: 'var(--red)', display: 'block', marginTop: 4 }}>{phaseErr}</small>}
        <div className="form-row" style={{ marginTop: 8 }}>
          <input type="text" placeholder="Add phase (e.g. Discovery)…" value={phaseName} onChange={(e) => setPhaseName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') addPhase(); }} />
          <button className="btn btn-ghost btn-sm" onClick={addPhase}>+ Add</button>
        </div>
      </div>

      {milestones.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
            <strong style={{ fontSize: 13 }}>Milestones</strong>
            <span style={{ fontSize: 12, color: 'var(--text3)' }}>{milestones.filter((m) => m.done).length}/{milestones.length} · {pct}%</span>
          </div>
          <div className="progress-bar" style={{ marginBottom: 10 }}><div className="progress-bar-fill" style={{ width: pct + '%' }} /></div>
          {milestones.map((m) => (
            <div className="milestone-row" key={m.id}>
              <input type="checkbox" checked={m.done} onChange={() => update('milestones', m.id, { done: !m.done } as Partial<Milestone>)} />
              <span className={`ms-title ${m.done ? 'done' : ''}`}>{m.title}</span>
              {m.due_date && <span className={`card-meta ${isOverdue(m.due_date) && !m.done ? 'tl-overdue' : ''}`}>{fmtDate(m.due_date)}</span>}
              <button className="btn-icon" onClick={() => remove('milestones', m.id)}>✕</button>
            </div>
          ))}
        </div>
      )}
      <div className="form-row" style={{ gap: 6, flexWrap: 'wrap' }}>
        <input type="text" placeholder="Add milestone…" value={mTitle} onChange={(e) => setMTitle(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') addMilestone(); }} />
        <input type="date" value={mDate} onChange={(e) => setMDate(e.target.value)} style={{ maxWidth: 150 }} />
        <button className="btn btn-ghost btn-sm" onClick={addMilestone}>+ Milestone</button>
      </div>
      {mErr && <small style={{ color: 'var(--red)', display: 'block', marginTop: 4, marginBottom: 16 }}>{mErr}</small>}
      <div style={{ marginBottom: 20 }} />

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <strong style={{ fontSize: 13 }}>Open Items ({items.length})</strong>
        <button className="btn btn-ghost btn-sm" onClick={() => setAddingItem(true)}>+ Item</button>
      </div>
      {items.length
        ? items.map((w) => <WorkItemRow key={w.id} w={w} phases={phases} onEdit={setEditingItem} />)
        : <small style={{ color: 'var(--text3)' }}>No open items</small>}

      {addingItem && <ItemModal defaults={{ project_id: project.id }} onClose={() => setAddingItem(false)} />}
      {editingItem && <ItemModal existing={editingItem} onClose={() => setEditingItem(null)} />}
    </div>
  );
}
