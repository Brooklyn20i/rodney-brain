import React, { useMemo, useState } from 'react';
import { useCadence } from '../lib/store';
import type { Project, Milestone, ProjectUpdate, ProjectStatus, Health, WorkItem } from '../lib/types';
import { ScreenHeader, Modal, Due } from '../components/bits';
import { ItemModal } from '../components/ItemModal';
import { healthIcon, fmtDate } from '../lib/util';

const STATUSES: ProjectStatus[] = ['active', 'onHold', 'completed'];
const HEALTHS: { v: Health; label: string }[] = [
  { v: 'green', label: '🟢 On track' }, { v: 'amber', label: '🟠 At risk' }, { v: 'red', label: '🔴 Off track' },
];
const HEALTH_PILL: Record<Health, [string, string]> = { green: ['health-green', 'On track'], amber: ['health-amber', 'At risk'], red: ['health-red', 'Off track'] };
const COLORS = ['#1B5E9E', '#6B3FA0', '#1A7F37', '#E07D00', '#D93025', '#0E7490'];

function ProjectModal({ existing, onClose }: { existing?: Project; onClose: () => void }) {
  const { insert, update, logActivity } = useCadence();
  const [name, setName] = useState(existing?.name || '');
  const [goal, setGoal] = useState(existing?.goal || '');
  const [status, setStatus] = useState<ProjectStatus>(existing?.status || 'active');
  const [health, setHealth] = useState<Health>(existing?.health || 'green');
  const [owner, setOwner] = useState(existing?.owner || 'you');
  const [target, setTarget] = useState(existing?.target_date || '');
  const [nextAction, setNextAction] = useState(existing?.next_action || '');
  const [color, setColor] = useState(existing?.color || '#1B5E9E');
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (!name.trim()) return;
    setBusy(true);
    try {
      const patch = { name: name.trim(), goal, status, health, owner, target_date: target || null, next_action: nextAction, color } as Partial<Project>;
      if (existing) await update('projects', existing.id, patch);
      else await insert('projects', patch);
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

function WorkItemRow({ w, onEdit }: { w: WorkItem; onEdit: (w: WorkItem) => void }) {
  const { update } = useCadence();
  return (
    <div className="work-item-row">
      <input type="checkbox" checked={w.done} onChange={() => update('work_items', w.id, { done: !w.done, completed_at: !w.done ? new Date().toISOString() : null } as Partial<WorkItem>)} />
      <span className={`wi-title ${w.done ? 'done' : ''}`}>{w.title}</span>
      <Due date={w.due_date} />
      <button className="btn-icon" onClick={() => onEdit(w)}>✎</button>
    </div>
  );
}

function Detail({ project, onEditProject }: { project: Project; onEditProject: () => void }) {
  const { data, insert, update, remove } = useCadence();
  const milestones = data.milestones.filter((m) => m.project_id === project.id);
  const updates = data.project_updates.filter((u) => u.project_id === project.id).sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 8);
  const items = data.work_items.filter((w) => w.project_id === project.id);
  const open = items.filter((w) => !w.done);
  const closed = items.filter((w) => w.done);
  const links = data.links.filter((l) => l.parent_type === 'project' && l.parent_id === project.id);
  const pct = milestones.length ? Math.round(milestones.filter((m) => m.done).length / milestones.length * 100) : 0;
  const [posting, setPosting] = useState(false);
  const [addingItem, setAddingItem] = useState(false);
  const [editingItem, setEditingItem] = useState<WorkItem | null>(null);
  const [mTitle, setMTitle] = useState('');
  const [pill, pillLabel] = HEALTH_PILL[project.health];

  const addMilestone = async () => {
    if (!mTitle.trim()) return;
    await insert('milestones', { project_id: project.id, title: mTitle.trim(), due_date: null, done: false } as Partial<Milestone>);
    setMTitle('');
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
          {project.goal && <p style={{ fontStyle: 'italic', color: 'var(--text2)', fontSize: 14, marginTop: 10 }}>{project.goal}</p>}
          <div style={{ display: 'flex', gap: 16, marginTop: 10, fontSize: 12, color: 'var(--text2)', flexWrap: 'wrap' }}>
            <span><strong>Owner:</strong> {project.owner || '—'}</span>
            <span><strong>Target:</strong> {project.target_date ? fmtDate(project.target_date) : '—'}</span>
            <span><strong>Progress:</strong> {pct}%</span>
          </div>
          {project.next_action && <div style={{ background: 'var(--blue-bg)', borderRadius: 8, padding: '8px 12px', marginTop: 10, fontSize: 13 }}><strong>Next:</strong> {project.next_action}</div>}
          <div className="progress-bar"><div className="progress-bar-fill" style={{ width: pct + '%' }} /></div>
        </div>

        <div className="detail-section">
          <h3>Milestones ({milestones.filter((m) => m.done).length}/{milestones.length})</h3>
          {milestones.length ? milestones.map((m) => (
            <div className="milestone-row" key={m.id}>
              <input type="checkbox" checked={m.done} onChange={() => update('milestones', m.id, { done: !m.done } as Partial<Milestone>)} />
              <span className={`ms-title ${m.done ? 'done' : ''}`}>{m.title}</span>
              {m.due_date && <span className="card-meta">{fmtDate(m.due_date)}</span>}
              <button className="btn-icon" onClick={() => remove('milestones', m.id)}>✕</button>
            </div>
          )) : <small style={{ color: 'var(--text3)' }}>No milestones yet</small>}
          <div className="form-row" style={{ marginTop: 8 }}>
            <input type="text" placeholder="Add milestone…" value={mTitle} onChange={(e) => setMTitle(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') addMilestone(); }} />
            <button className="btn btn-ghost btn-sm" onClick={addMilestone}>+ Add</button>
          </div>
        </div>

        <div className="detail-section">
          <h3>Open Items ({open.length})</h3>
          {open.length ? open.map((w) => <WorkItemRow key={w.id} w={w} onEdit={setEditingItem} />) : <small style={{ color: 'var(--text3)' }}>No open items</small>}
        </div>

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
          )) : <small style={{ color: 'var(--text3)' }}>No files linked. Ask your agent to attach a Drive file, or add a URL.</small>}
        </div>

        {closed.length > 0 && (
          <div className="detail-section">
            <h3>Completed ({closed.length})</h3>
            {closed.map((w) => <WorkItemRow key={w.id} w={w} onEdit={setEditingItem} />)}
          </div>
        )}
      </div>
      {posting && <UpdateModal project={project} onClose={() => setPosting(false)} />}
      {addingItem && <ItemModal defaults={{ project_id: project.id }} onClose={() => setAddingItem(false)} />}
      {editingItem && <ItemModal existing={editingItem} onClose={() => setEditingItem(null)} />}
    </div>
  );
}

export function Projects({ onMenu }: { onMenu?: () => void }) {
  const { data } = useCadence();
  const [selected, setSelected] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Project | null>(null);

  const sorted = useMemo(() => [...data.projects].sort((a, b) =>
    STATUSES.indexOf(a.status) - STATUSES.indexOf(b.status) || a.name.localeCompare(b.name)), [data]);
  const project = data.projects.find((p) => p.id === selected) || null;

  return (
    <>
      <ScreenHeader title="Projects" onMenu={onMenu} />
      <div className="split-view">
        <div className="split-left">
          <div className="split-panel-header"><h3>Projects</h3><button className="btn btn-primary btn-sm" onClick={() => setCreating(true)}>+ New</button></div>
          <div className="split-panel-body">
            {sorted.length ? sorted.map((p) => {
              const open = data.work_items.filter((w) => w.project_id === p.id && !w.done).length;
              const ms = data.milestones.filter((m) => m.project_id === p.id);
              const pct = ms.length ? Math.round(ms.filter((m) => m.done).length / ms.length * 100) : 0;
              return (
                <button className={`project-item ${selected === p.id ? 'selected' : ''}`} key={p.id} onClick={() => setSelected(p.id)}>
                  <span className="project-dot" style={{ background: p.color || 'var(--accent)' }} />
                  <div className="project-info">
                    <div className="project-name">{p.name}</div>
                    <div className="project-meta">{healthIcon(p.health)} {open} open · {pct}% done{p.target_date ? ' · ' + fmtDate(p.target_date) : ''}</div>
                    <div className="progress-bar"><div className="progress-bar-fill" style={{ width: pct + '%' }} /></div>
                  </div>
                </button>
              );
            }) : <div className="empty-state"><div className="icon">▤</div><p>No projects yet</p></div>}
          </div>
        </div>
        {project ? <Detail project={project} onEditProject={() => setEditing(project)} /> : (
          <div className="split-right"><div className="empty-state" style={{ margin: 'auto' }}><div className="icon">▤</div><p>Select a project</p></div></div>
        )}
      </div>
      {creating && <ProjectModal onClose={() => setCreating(false)} />}
      {editing && <ProjectModal existing={editing} onClose={() => setEditing(null)} />}
    </>
  );
}
