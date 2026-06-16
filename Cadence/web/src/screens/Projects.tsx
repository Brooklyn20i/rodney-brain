import React, { useMemo, useState } from 'react';
import { useCadence } from '../lib/store';
import type { Project, Milestone, ProjectUpdate, ProjectStatus, Health, WorkItem, ProjectPhase, RaidItem, Stakeholder, Note } from '../lib/types';
import { ScreenHeader, Modal, Due } from '../components/bits';
import { ItemModal } from '../components/ItemModal';
import { healthIcon, fmtDate, isOverdue } from '../lib/util';
import {
  readStrategy, priorityList, getPillar, addPriority, renamePriority, removePriority,
  movePriority, STRATEGY_NOTE_TITLE,
} from '../lib/strategy';
import type { StrategyContent } from '../lib/strategy';

// The strategy note (private, synced) holds the user's aspiration + priorities.
// Projects is now the single home for strategy — no separate WIN screen.
function useStrategy() {
  const { data, insert, update } = useCadence();
  const note = useMemo(() => data.notes.filter((n) => n.title === STRATEGY_NOTE_TITLE)
    .sort((a, b) => (b.updated_at || '').localeCompare(a.updated_at || ''))[0], [data.notes]);
  const strategy = useMemo(() => readStrategy(data.notes), [data.notes]);
  const save = (next: StrategyContent) => {
    const body = JSON.stringify(next);
    if (note) update('notes', note.id, { body } as Partial<Note>);
    else insert('notes', { title: STRATEGY_NOTE_TITLE, body } as Partial<Note>);
  };
  return { strategy, save };
}

function PrioritiesModal({ strategy, save, onClose }: { strategy: StrategyContent; save: (s: StrategyContent) => void; onClose: () => void }) {
  const [aspiration, setAspiration] = useState(strategy.aspiration || '');
  const [adding, setAdding] = useState('');
  const priorities = priorityList(strategy);
  const add = () => { if (adding.trim()) { save(addPriority({ ...strategy, aspiration }, adding)); setAdding(''); } };
  return (
    <Modal title="Priorities" onClose={onClose}
      footer={<button className="btn btn-primary" onClick={onClose}>Done</button>}>
      <div className="form-group"><label>Winning aspiration <span style={{ color: 'var(--text3)', fontWeight: 400 }}>(one line, optional)</span></label>
        <input type="text" value={aspiration} placeholder="What does winning look like?"
          onChange={(e) => setAspiration(e.target.value)}
          onBlur={() => { if ((strategy.aspiration || '') !== aspiration) save({ ...strategy, aspiration }); }} /></div>
      <div className="form-group"><label>Your priorities</label>
        {priorities.length === 0 && <small style={{ color: 'var(--text3)' }}>No priorities yet — add a few strategic themes to group your projects under.</small>}
        {priorities.map((p, idx) => (
          <div className="priority-edit-row" key={p.id}>
            <input type="text" value={p.name} onChange={(e) => save(renamePriority(strategy, p.id, e.target.value))} />
            <button className="btn-icon" disabled={idx === 0} onClick={() => save(movePriority(strategy, p.id, -1))}>↑</button>
            <button className="btn-icon" disabled={idx === priorities.length - 1} onClick={() => save(movePriority(strategy, p.id, 1))}>↓</button>
            <button className="btn-icon" onClick={() => save(removePriority(strategy, p.id))}>✕</button>
          </div>
        ))}
        <div className="form-row" style={{ marginTop: 8, gap: 6 }}>
          <input type="text" placeholder="Add priority (e.g. Grow the team)…" value={adding}
            onChange={(e) => setAdding(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') add(); }} />
          <button className="btn btn-ghost btn-sm" onClick={add}>+ Add</button>
        </div>
      </div>
      <p className="card-meta" style={{ color: 'var(--text3)', fontSize: 12 }}>
        Tag each project with a priority in its edit screen, then group Projects by priority to see strategy-to-execution health at a glance.
      </p>
    </Modal>
  );
}

const STATUSES: ProjectStatus[] = ['active', 'onHold', 'completed'];
const HEALTHS: { v: Health; label: string }[] = [
  { v: 'green', label: '🟢 On track' }, { v: 'amber', label: '🟠 At risk' }, { v: 'red', label: '🔴 Off track' },
];
const HEALTH_PILL: Record<Health, [string, string]> = { green: ['health-green', 'On track'], amber: ['health-amber', 'At risk'], red: ['health-red', 'Off track'] };
const COLORS = ['#1B5E9E', '#6B3FA0', '#1A7F37', '#E07D00', '#D93025', '#0E7490'];
const RAID_KINDS: RaidItem['kind'][] = ['risk', 'assumption', 'issue', 'dependency'];
const RAID_LABEL: Record<RaidItem['kind'], string> = { risk: 'Risk', assumption: 'Assumption', issue: 'Issue', dependency: 'Dependency' };
const RACI_LABEL: Record<Stakeholder['raci'], string> = { R: 'Responsible', A: 'Accountable', C: 'Consulted', I: 'Informed' };

function ProjectModal({ existing, onClose }: { existing?: Project; onClose: () => void }) {
  const { data, insert, update, logActivity } = useCadence();
  const strategy = useMemo(() => readStrategy(data.notes), [data.notes]);
  const priorities = priorityList(strategy);
  const [name, setName] = useState(existing?.name || '');
  const [goal, setGoal] = useState(existing?.goal || '');
  const [status, setStatus] = useState<ProjectStatus>(existing?.status || 'active');
  const [health, setHealth] = useState<Health>(existing?.health || 'green');
  const [owner, setOwner] = useState(existing?.owner || 'you');
  const [target, setTarget] = useState(existing?.target_date || '');
  const [nextAction, setNextAction] = useState(existing?.next_action || '');
  const [color, setColor] = useState(existing?.color || '#1B5E9E');
  const [pillarId, setPillarId] = useState(existing?.pillar_id || '');
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (!name.trim()) return;
    setBusy(true);
    try {
      // kpi_ids is no longer edited in the UI but preserved so existing links aren't lost.
      const full = { name: name.trim(), goal, status, health, owner, target_date: target || null, next_action: nextAction, color, pillar_id: pillarId, kpi_ids: existing?.kpi_ids || [] } as Partial<Project>;
      const write = async (body: Partial<Project>) => { if (existing) await update('projects', existing.id, body); else await insert('projects', body); };
      try { await write(full); }
      catch (e: any) {
        // Graceful fallback if migration 0006 (pillar_id/kpi_ids) isn't applied yet
        if (/pillar_id|kpi_ids|column/i.test(String(e?.message || e))) {
          const { pillar_id: _a, kpi_ids: _b, ...rest } = full as any; await write(rest);
        } else throw e;
      }
      logActivity(existing ? 'edit_project' : 'add_project', name.trim());
      onClose();
    } finally { setBusy(false); }
  };

  return (
    <Modal title={existing ? 'Edit Project' : 'New Project'} onClose={onClose}
      footer={<><button className="btn btn-secondary" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save'}</button></>}>
      <div className="form-group"><label>Name</label>
        <input type="text" autoFocus value={name} placeholder="Project name" onChange={(e) => setName(e.target.value)} /></div>
      <div className="form-group"><label>Goal / Outcome</label>
        <textarea value={goal} placeholder="What does done look like?" onChange={(e) => setGoal(e.target.value)} /></div>
      <div className="form-row">
        <div className="form-group"><label>Status</label>
          <select value={status} onChange={(e) => setStatus(e.target.value as ProjectStatus)}>
            <option value="active">Active</option><option value="onHold">On Hold</option><option value="completed">Completed</option>
          </select></div>
        <div className="form-group"><label>Health</label>
          <select value={health} onChange={(e) => setHealth(e.target.value as Health)}>
            {HEALTHS.map((h) => <option key={h.v} value={h.v}>{h.label}</option>)}
          </select></div>
      </div>
      <div className="form-row">
        <div className="form-group"><label>Owner</label>
          <input type="text" value={owner} placeholder="Who's accountable?" onChange={(e) => setOwner(e.target.value)} /></div>
        <div className="form-group"><label>Target Date</label>
          <input type="date" value={target} onChange={(e) => setTarget(e.target.value)} /></div>
      </div>
      <div className="form-group"><label>Next Action</label>
        <input type="text" value={nextAction} placeholder="The single next step" onChange={(e) => setNextAction(e.target.value)} /></div>

      <div className="form-group"><label>Priority</label>
        <select value={pillarId} onChange={(e) => setPillarId(e.target.value)}>
          <option value="">— None —</option>
          {priorities.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        {priorities.length === 0 && <small style={{ color: 'var(--text3)' }}>Add priorities from the Projects screen to group work by strategic theme.</small>}
      </div>
      <div className="form-group"><label>Colour</label>
        <select value={color} onChange={(e) => setColor(e.target.value)}>
          {COLORS.map((c) => <option key={c} value={c}>{c}</option>)}
        </select></div>
    </Modal>
  );
}

function UpdateModal({ project, onClose }: { project: Project; onClose: () => void }) {
  const { insert, update, logActivity } = useCadence();
  const [text, setText] = useState('');
  const [health, setHealth] = useState<'' | Health>('');
  const [busy, setBusy] = useState(false);
  const post = async () => {
    if (!text.trim()) return;
    setBusy(true);
    try {
      await insert('project_updates', { project_id: project.id, text: text.trim(), health: health || project.health, author: 'you' } as Partial<ProjectUpdate>);
      if (health) await update('projects', project.id, { health } as Partial<Project>);
      logActivity('project_update', project.name);
      onClose();
    } finally { setBusy(false); }
  };
  return (
    <Modal title="Post Status Update" onClose={onClose}
      footer={<><button className="btn btn-secondary" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" onClick={post} disabled={busy}>{busy ? 'Posting…' : 'Post'}</button></>}>
      <div className="form-group"><label>Update</label>
        <textarea autoFocus value={text} placeholder="What changed? What's the latest?" onChange={(e) => setText(e.target.value)} /></div>
      <div className="form-group"><label>Set health</label>
        <select value={health} onChange={(e) => setHealth(e.target.value as Health | '')}>
          <option value="">— leave unchanged —</option>
          {HEALTHS.map((h) => <option key={h.v} value={h.v}>{h.label}</option>)}
        </select></div>
    </Modal>
  );
}

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

// ── Phases / workstreams ───────────────────────────────────────────────────
function Phases({ project, phases, milestones }: { project: Project; phases: ProjectPhase[]; milestones: Milestone[] }) {
  const { insert, update, remove } = useCadence();
  const [name, setName] = useState('');
  const add = async () => {
    if (!name.trim()) return;
    await insert('project_phases', { project_id: project.id, name: name.trim(), sort: phases.length, start_date: null, end_date: null } as Partial<ProjectPhase>);
    setName('');
  };
  return (
    <div className="detail-section">
      <h3>Phases / Workstreams</h3>
      {phases.length ? phases.map((ph) => {
        const ms = milestones.filter((m) => m.phase_id === ph.id);
        const done = ms.filter((m) => m.done).length;
        return (
          <div className="phase-card" key={ph.id}>
            <div className="phase-head">
              <input className="phase-name" value={ph.name} onChange={(e) => update('project_phases', ph.id, { name: e.target.value } as Partial<ProjectPhase>)} />
              <button className="btn-icon" onClick={() => remove('project_phases', ph.id)}>✕</button>
            </div>
            <div className="phase-dates">
              <label>Start <input type="date" value={ph.start_date || ''} onChange={(e) => update('project_phases', ph.id, { start_date: e.target.value || null } as Partial<ProjectPhase>)} /></label>
              <label>End <input type="date" value={ph.end_date || ''} onChange={(e) => update('project_phases', ph.id, { end_date: e.target.value || null } as Partial<ProjectPhase>)} /></label>
              {ms.length > 0 && <span className="phase-prog">{done}/{ms.length} milestones</span>}
            </div>
          </div>
        );
      }) : <small style={{ color: 'var(--text3)' }}>No phases yet — group milestones &amp; tasks into stages.</small>}
      <div className="form-row" style={{ marginTop: 8 }}>
        <input type="text" placeholder="Add phase (e.g. Discovery)…" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') add(); }} />
        <button className="btn btn-ghost btn-sm" onClick={add}>+ Add</button>
      </div>
    </div>
  );
}

// ── Stakeholders / RACI ────────────────────────────────────────────────────
function Stakeholders({ project, rows }: { project: Project; rows: Stakeholder[] }) {
  const { data, insert, remove } = useCadence();
  const [personId, setPersonId] = useState('');
  const [name, setName] = useState('');
  const [raci, setRaci] = useState<Stakeholder['raci']>('I');
  const add = async () => {
    const pname = personId ? (data.people.find((p) => p.id === personId)?.name || '') : name.trim();
    if (!pname) return;
    await insert('stakeholders', { project_id: project.id, person_id: personId || null, name: pname, raci } as Partial<Stakeholder>);
    setPersonId(''); setName('');
  };
  return (
    <div className="detail-section">
      <h3>Stakeholders (RACI)</h3>
      {rows.length ? rows.map((s) => (
        <div className="work-item-row" key={s.id}>
          <span className={`raci-badge raci-${s.raci}`}>{s.raci}</span>
          <span className="wi-title">{s.name}</span>
          <span className="card-meta">{RACI_LABEL[s.raci]}</span>
          <button className="btn-icon" onClick={() => remove('stakeholders', s.id)}>✕</button>
        </div>
      )) : <small style={{ color: 'var(--text3)' }}>No stakeholders yet</small>}
      <div className="form-row" style={{ marginTop: 8, gap: 6 }}>
        <select value={personId} onChange={(e) => { setPersonId(e.target.value); }}>
          <option value="">Person…</option>
          {data.people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        {!personId && <input type="text" placeholder="or name" value={name} onChange={(e) => setName(e.target.value)} />}
        <select value={raci} onChange={(e) => setRaci(e.target.value as Stakeholder['raci'])} style={{ maxWidth: 140 }}>
          {(['R', 'A', 'C', 'I'] as const).map((r) => <option key={r} value={r}>{r} · {RACI_LABEL[r]}</option>)}
        </select>
        <button className="btn btn-ghost btn-sm" onClick={add}>+ Add</button>
      </div>
    </div>
  );
}

// ── RAID log ────────────────────────────────────────────────────────────────
function Raid({ project, rows }: { project: Project; rows: RaidItem[] }) {
  const { insert, update, remove } = useCadence();
  const [kind, setKind] = useState<RaidItem['kind']>('risk');
  const [text, setText] = useState('');
  const [severity, setSeverity] = useState<RaidItem['severity']>('medium');
  const add = async () => {
    if (!text.trim()) return;
    await insert('raid_items', { project_id: project.id, kind, text: text.trim(), severity, status: 'open', owner: '' } as Partial<RaidItem>);
    setText('');
  };
  const open = rows.filter((r) => r.status === 'open');
  return (
    <div className="detail-section">
      <h3>RAID — Risks, Assumptions, Issues, Dependencies ({open.length} open)</h3>
      {RAID_KINDS.map((k) => {
        const items = rows.filter((r) => r.kind === k);
        if (!items.length) return null;
        return (
          <div key={k} style={{ marginBottom: 8 }}>
            <div className="raid-kind">{RAID_LABEL[k]}s</div>
            {items.map((r) => (
              <div className={`raid-row ${r.status === 'closed' ? 'closed' : ''}`} key={r.id}>
                <span className={`sev-dot sev-${r.severity}`} title={r.severity} />
                <span className="raid-text">{r.text}</span>
                <button className="btn btn-ghost btn-sm" onClick={() => update('raid_items', r.id, { status: r.status === 'open' ? 'closed' : 'open' } as Partial<RaidItem>)}>{r.status === 'open' ? 'Close' : 'Reopen'}</button>
                <button className="btn-icon" onClick={() => remove('raid_items', r.id)}>✕</button>
              </div>
            ))}
          </div>
        );
      })}
      {rows.length === 0 && <small style={{ color: 'var(--text3)' }}>No RAID items logged</small>}
      <div className="form-row" style={{ marginTop: 8, gap: 6 }}>
        <select value={kind} onChange={(e) => setKind(e.target.value as RaidItem['kind'])} style={{ maxWidth: 130 }}>
          {RAID_KINDS.map((k) => <option key={k} value={k}>{RAID_LABEL[k]}</option>)}
        </select>
        <input type="text" placeholder="Describe…" value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') add(); }} />
        <select value={severity} onChange={(e) => setSeverity(e.target.value as RaidItem['severity'])} style={{ maxWidth: 110 }}>
          <option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option>
        </select>
        <button className="btn btn-ghost btn-sm" onClick={add}>+ Add</button>
      </div>
    </div>
  );
}

// ── Timeline (chronological key dates) ──────────────────────────────────────
function Timeline({ project, phases, milestones }: { project: Project; phases: ProjectPhase[]; milestones: Milestone[] }) {
  const events = useMemo(() => {
    const ev: { date: string; label: string; kind: string; done?: boolean }[] = [];
    phases.forEach((p) => { if (p.start_date) ev.push({ date: p.start_date, label: `${p.name} starts`, kind: 'phase' }); if (p.end_date) ev.push({ date: p.end_date, label: `${p.name} ends`, kind: 'phase' }); });
    milestones.forEach((m) => { if (m.due_date) ev.push({ date: m.due_date, label: m.title, kind: 'milestone', done: m.done }); });
    if (project.target_date) ev.push({ date: project.target_date, label: 'Project target', kind: 'target' });
    return ev.sort((a, b) => a.date.localeCompare(b.date));
  }, [phases, milestones, project.target_date]);
  if (!events.length) return null;
  return (
    <div className="detail-section">
      <h3>Timeline</h3>
      {events.map((e, i) => {
        const overdue = isOverdue(e.date) && !e.done;
        return (
          <div className="tl-row" key={i}>
            <span className={`tl-dot ${e.kind}`} />
            <span className={`tl-date ${overdue ? 'tl-overdue' : ''}`}>{fmtDate(e.date)}</span>
            <span className={`tl-label ${e.done ? 'done' : ''}`}>{e.label}{e.done ? ' ✓' : ''}</span>
          </div>
        );
      })}
    </div>
  );
}

function Detail({ project, onEditProject }: { project: Project; onEditProject: () => void }) {
  const { data, insert, update, remove } = useCadence();
  const strategy = useMemo(() => readStrategy(data.notes), [data.notes]);
  const phases = data.project_phases.filter((p) => p.project_id === project.id).sort((a, b) => a.sort - b.sort);
  const milestones = data.milestones.filter((m) => m.project_id === project.id);
  const updates = data.project_updates.filter((u) => u.project_id === project.id).sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 8);
  const items = data.work_items.filter((w) => w.project_id === project.id);
  const open = items.filter((w) => !w.done);
  const closed = items.filter((w) => w.done);
  const links = data.links.filter((l) => l.parent_type === 'project' && l.parent_id === project.id);
  const raid = data.raid_items.filter((r) => r.project_id === project.id);
  const stake = data.stakeholders.filter((s) => s.project_id === project.id);
  const pct = milestones.length ? Math.round(milestones.filter((m) => m.done).length / milestones.length * 100) : 0;
  const [posting, setPosting] = useState(false);
  const [addingItem, setAddingItem] = useState(false);
  const [editingItem, setEditingItem] = useState<WorkItem | null>(null);
  const [mTitle, setMTitle] = useState('');
  const [mDate, setMDate] = useState('');
  const [mPhase, setMPhase] = useState('');
  const [pill, pillLabel] = HEALTH_PILL[project.health];
  const pillar = project.pillar_id ? getPillar(strategy, project.pillar_id) : undefined;

  const addMilestone = async () => {
    if (!mTitle.trim()) return;
    await insert('milestones', { project_id: project.id, title: mTitle.trim(), due_date: mDate || null, done: false, phase_id: mPhase || null } as Partial<Milestone>);
    setMTitle(''); setMDate(''); setMPhase('');
  };

  return (
    <div className="split-right">
      <div className="split-panel-header">
        <h3>{project.name}</h3>
        <div style={{ display: 'flex', gap: 6 }}>
          <button className="btn btn-secondary btn-sm" onClick={onEditProject}>Edit</button>
          <button className="btn btn-primary btn-sm" onClick={() => setAddingItem(true)}>+ Item</button>
        </div>
      </div>
      <div className="split-panel-body">
        <div className="card">
          <div className="card-row" style={{ justifyContent: 'space-between' }}>
            <span className={`health-pill ${pill}`}>{healthIcon(project.health)} {pillLabel}</span>
            <button className="btn btn-ghost btn-sm" onClick={() => setPosting(true)}>Post update</button>
          </div>
          {pillar && (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 10 }}>
              <span className="tag tag-decision">◎ {pillar.name}</span>
            </div>
          )}
          {project.goal && <p style={{ fontStyle: 'italic', color: 'var(--text2)', fontSize: 14, marginTop: 10 }}>{project.goal}</p>}
          <div style={{ display: 'flex', gap: 16, marginTop: 10, fontSize: 12, color: 'var(--text2)', flexWrap: 'wrap' }}>
            <span><strong>Owner:</strong> {project.owner || '—'}</span>
            <span><strong>Target:</strong> {project.target_date ? fmtDate(project.target_date) : '—'}</span>
            <span><strong>Progress:</strong> {pct}%</span>
          </div>
          {project.next_action && <div style={{ background: 'var(--blue-bg)', borderRadius: 8, padding: '8px 12px', marginTop: 10, fontSize: 13 }}><strong>Next:</strong> {project.next_action}</div>}
          <div className="progress-bar"><div className="progress-bar-fill" style={{ width: pct + '%' }} /></div>
        </div>

        <Phases project={project} phases={phases} milestones={milestones} />

        <div className="detail-section">
          <h3>Milestones ({milestones.filter((m) => m.done).length}/{milestones.length})</h3>
          {milestones.length ? milestones.map((m) => {
            const ph = phases.find((p) => p.id === m.phase_id);
            return (
              <div className="milestone-row" key={m.id}>
                <input type="checkbox" checked={m.done} onChange={() => update('milestones', m.id, { done: !m.done } as Partial<Milestone>)} />
                <span className={`ms-title ${m.done ? 'done' : ''}`}>{m.title}</span>
                {ph && <span className="tag" style={{ background: 'var(--surface2)', color: 'var(--text2)' }}>{ph.name}</span>}
                {m.due_date && <span className={`card-meta ${isOverdue(m.due_date) && !m.done ? 'tl-overdue' : ''}`}>{fmtDate(m.due_date)}</span>}
                <button className="btn-icon" onClick={() => remove('milestones', m.id)}>✕</button>
              </div>
            );
          }) : <small style={{ color: 'var(--text3)' }}>No milestones yet</small>}
          <div className="form-row" style={{ marginTop: 8, gap: 6, flexWrap: 'wrap' }}>
            <input type="text" placeholder="Add milestone…" value={mTitle} onChange={(e) => setMTitle(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') addMilestone(); }} />
            <input type="date" value={mDate} onChange={(e) => setMDate(e.target.value)} style={{ maxWidth: 150 }} />
            {phases.length > 0 && <select value={mPhase} onChange={(e) => setMPhase(e.target.value)} style={{ maxWidth: 140 }}><option value="">— phase —</option>{phases.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>}
            <button className="btn btn-ghost btn-sm" onClick={addMilestone}>+ Add</button>
          </div>
        </div>

        <Timeline project={project} phases={phases} milestones={milestones} />

        <div className="detail-section">
          <h3>Open Items ({open.length})</h3>
          {open.length ? open.map((w) => <WorkItemRow key={w.id} w={w} phases={phases} onEdit={setEditingItem} />) : <small style={{ color: 'var(--text3)' }}>No open items</small>}
        </div>

        <Stakeholders project={project} rows={stake} />
        <Raid project={project} rows={raid} />

        <div className="detail-section">
          <h3>Status Updates</h3>
          {updates.length ? updates.map((u) => (
            <div className="update-row" key={u.id}>
              <div className="ur-date">{new Date(u.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} · {u.author}{u.health ? ' · ' + healthIcon(u.health) : ''}</div>
              <div className="ur-text">{u.text}</div>
            </div>
          )) : <small style={{ color: 'var(--text3)' }}>No updates posted yet</small>}
        </div>

        <div className="detail-section">
          <h3>Files &amp; Links</h3>
          {links.length ? links.map((l) => (
            <div className="link-row" key={l.id}>🔗 <a href={l.url} target="_blank" rel="noreferrer">{l.title || l.url}</a></div>
          )) : <small style={{ color: 'var(--text3)' }}>No files linked.</small>}
        </div>

        {closed.length > 0 && (
          <div className="detail-section">
            <h3>Completed ({closed.length})</h3>
            {closed.map((w) => <WorkItemRow key={w.id} w={w} phases={phases} onEdit={setEditingItem} />)}
          </div>
        )}
      </div>
      {posting && <UpdateModal project={project} onClose={() => setPosting(false)} />}
      {addingItem && <ItemModal defaults={{ project_id: project.id }} onClose={() => setAddingItem(false)} />}
      {editingItem && <ItemModal existing={editingItem} onClose={() => setEditingItem(null)} />}
    </div>
  );
}

const STATUS_LABEL: Record<ProjectStatus, string> = { active: 'Active', onHold: 'On Hold', completed: 'Completed' };

function HealthRoll({ items }: { items: Project[] }) {
  const mix = { green: 0, amber: 0, red: 0 } as Record<Health, number>;
  items.forEach((p) => { if (p.status !== 'completed') mix[p.health]++; });
  if (!mix.green && !mix.amber && !mix.red) return null;
  return (
    <span className="proj-roll">
      {mix.green > 0 && <span className="win-pill on">{mix.green} on track</span>}
      {mix.amber > 0 && <span className="win-pill risk">{mix.amber} at risk</span>}
      {mix.red > 0 && <span className="win-pill stall">{mix.red} off track</span>}
    </span>
  );
}

export function Projects({ onMenu }: { onMenu?: () => void }) {
  const { data } = useCadence();
  const { strategy, save } = useStrategy();
  const priorities = useMemo(() => priorityList(strategy), [strategy]);
  const [selected, setSelected] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Project | null>(null);
  const [editPriorities, setEditPriorities] = useState(false);
  const [groupBy, setGroupBy] = useState<'status' | 'priority'>(() => priorities.length ? 'priority' : 'status');

  const project = data.projects.find((p) => p.id === selected) || null;
  const byName = (a: Project, b: Project) => a.name.localeCompare(b.name);

  // Build the grouped list according to the active grouping.
  const groups = useMemo(() => {
    const all = [...data.projects];
    if (groupBy === 'priority' && priorities.length) {
      const out = priorities.map((pr) => ({
        key: pr.id, label: pr.name, roll: true,
        items: all.filter((p) => p.pillar_id === pr.id).sort(byName),
      }));
      const unassigned = all.filter((p) => !p.pillar_id || !priorities.some((pr) => pr.id === p.pillar_id)).sort(byName);
      if (unassigned.length) out.push({ key: '__none__', label: 'No priority', roll: true, items: unassigned });
      return out.filter((g) => g.items.length);
    }
    return STATUSES.map((s) => ({
      key: s, label: STATUS_LABEL[s], roll: false,
      items: all.filter((p) => p.status === s).sort(byName),
    })).filter((g) => g.items.length);
  }, [data.projects, groupBy, priorities]);

  const renderItem = (p: Project) => {
    const openCount = data.work_items.filter((w) => w.project_id === p.id && !w.done).length;
    const ms = data.milestones.filter((m) => m.project_id === p.id);
    const pct = ms.length ? Math.round(ms.filter((m) => m.done).length / ms.length * 100) : 0;
    return (
      <button className={`project-item ${selected === p.id ? 'selected' : ''}`} key={p.id} onClick={() => setSelected(p.id)}>
        <span className="project-dot" style={{ background: p.color || 'var(--accent)' }} />
        <div className="project-info">
          <div className="project-name">{p.name}</div>
          <div className="project-meta">{healthIcon(p.health)} {openCount} open · {pct}% done{p.target_date ? ' · ' + fmtDate(p.target_date) : ''}</div>
          <div className="progress-bar"><div className="progress-bar-fill" style={{ width: pct + '%' }} /></div>
        </div>
      </button>
    );
  };

  return (
    <>
      <ScreenHeader title="Projects" onMenu={onMenu} />
      <div className="split-view">
        <div className="split-left">
          <div className="split-panel-header"><h3>Projects</h3><button className="btn btn-primary btn-sm" onClick={() => setCreating(true)}>+ New</button></div>
          {strategy.aspiration && (
            <div className="proj-aspiration" onClick={() => setEditPriorities(true)} title="Edit priorities">◎ {strategy.aspiration}</div>
          )}
          <div className="proj-toolbar">
            <div className="seg">
              <button className={groupBy === 'status' ? 'on' : ''} onClick={() => setGroupBy('status')}>Status</button>
              <button className={groupBy === 'priority' ? 'on' : ''} onClick={() => setGroupBy('priority')}>Priority</button>
            </div>
            <button className="btn btn-ghost btn-sm" onClick={() => setEditPriorities(true)}>◎ Priorities</button>
          </div>
          <div className="split-panel-body">
            {data.projects.length === 0 ? <div className="empty-state"><div className="icon">▤</div><p>No projects yet</p></div> : (
              groupBy === 'priority' && !priorities.length ? (
                <div className="proj-hint">Add priorities to group your projects by strategic theme.
                  <button className="btn btn-secondary btn-sm" style={{ marginTop: 8 }} onClick={() => setEditPriorities(true)}>Set priorities</button>
                </div>
              ) : groups.map((g) => (
                <React.Fragment key={g.key}>
                  <div className="proj-group-hdr">
                    <span className="proj-group-name">{g.label}</span>
                    <span className="proj-group-count">{g.items.length}</span>
                    {g.roll && <HealthRoll items={g.items} />}
                  </div>
                  {g.items.map(renderItem)}
                </React.Fragment>
              ))
            )}
          </div>
        </div>
        {project ? <Detail project={project} onEditProject={() => setEditing(project)} /> : (
          <div className="split-right"><div className="empty-state" style={{ margin: 'auto' }}><div className="icon">▤</div><p>Select a project</p></div></div>
        )}
      </div>
      {creating && <ProjectModal onClose={() => setCreating(false)} />}
      {editing && <ProjectModal existing={editing} onClose={() => setEditing(null)} />}
      {editPriorities && <PrioritiesModal strategy={strategy} save={save} onClose={() => setEditPriorities(false)} />}
    </>
  );
}
