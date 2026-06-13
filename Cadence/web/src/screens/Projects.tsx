import React, { useMemo, useState } from 'react';
import { useCadence } from '../lib/store';
import type { Project, Milestone, ProjectUpdate, ProjectStatus, Health, WorkItem } from '../lib/types';
import { EmptyState, ScreenHeader, Modal } from '../components/bits';
import { healthIcon, fmtDate, todayStr } from '../lib/util';

const STATUSES: ProjectStatus[] = ['active', 'onHold', 'completed'];
const HEALTHS: Health[] = ['green', 'amber', 'red'];
const STATUS_LABEL: Record<ProjectStatus, string> = { active: 'Active', onHold: 'On Hold', completed: 'Completed' };

function NewProject({ onClose }: { onClose: () => void }) {
  const { insert, logActivity } = useCadence();
  const [name, setName] = useState('');
  const [goal, setGoal] = useState('');
  const [status, setStatus] = useState<ProjectStatus>('active');
  const [health, setHealth] = useState<Health>('green');
  const [target, setTarget] = useState('');
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (!name.trim()) return;
    setBusy(true);
    try {
      await insert('projects', {
        name: name.trim(), goal: goal.trim(), status, health,
        owner: 'you', target_date: target || null, next_action: '', color: '#1B5E9E',
      } as Partial<Project>);
      logActivity('add_project', name.trim());
      onClose();
    } finally { setBusy(false); }
  };

  return (
    <Modal title="New Project" onClose={onClose}
      footer={<>
        <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Create project'}</button>
      </>}>
      <div className="form-group">
        <label className="field">Name</label>
        <input type="text" autoFocus value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div className="form-group">
        <label className="field">Goal</label>
        <textarea value={goal} onChange={(e) => setGoal(e.target.value)} placeholder="What does done look like?" />
      </div>
      <div className="form-row">
        <div className="form-group">
          <label className="field">Status</label>
          <select value={status} onChange={(e) => setStatus(e.target.value as ProjectStatus)}>
            {STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
          </select>
        </div>
        <div className="form-group">
          <label className="field">Health</label>
          <select value={health} onChange={(e) => setHealth(e.target.value as Health)}>
            {HEALTHS.map((h) => <option key={h} value={h}>{h}</option>)}
          </select>
        </div>
      </div>
      <div className="form-group">
        <label className="field">Target date</label>
        <input type="date" value={target} onChange={(e) => setTarget(e.target.value)} />
      </div>
    </Modal>
  );
}

function ProjectDetail({ project, onBack }: { project: Project; onBack: () => void }) {
  const { data, insert, update, remove, logActivity } = useCadence();
  const milestones = data.milestones.filter((m) => m.project_id === project.id);
  const updates = data.project_updates.filter((u) => u.project_id === project.id)
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
  const items = data.work_items.filter((w) => w.project_id === project.id && !w.done);
  const [mTitle, setMTitle] = useState('');
  const [mDue, setMDue] = useState('');
  const [upd, setUpd] = useState('');

  const addMilestone = async () => {
    if (!mTitle.trim()) return;
    await insert('milestones', { project_id: project.id, title: mTitle.trim(), due_date: mDue || null, done: false } as Partial<Milestone>);
    setMTitle(''); setMDue('');
  };
  const addUpdate = async () => {
    if (!upd.trim()) return;
    await insert('project_updates', { project_id: project.id, text: upd.trim(), health: project.health, author: 'you' } as Partial<ProjectUpdate>);
    logActivity('project_update', project.name);
    setUpd('');
  };

  return (
    <div className="screen-content">
      <button className="btn btn-ghost btn-sm" onClick={onBack} style={{ marginBottom: 12 }}>← All projects</button>

      <div className="card">
        <div className="card-row" style={{ alignItems: 'flex-start' }}>
          <span style={{ fontSize: 20 }}>{healthIcon(project.health)}</span>
          <div style={{ flex: 1 }}>
            <div className="card-title" style={{ fontSize: 18 }}>{project.name}</div>
            {project.goal && <p className="card-meta" style={{ marginTop: 4 }}>{project.goal}</p>}
            <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <span className="tag tag-task">{STATUS_LABEL[project.status]}</span>
              {project.target_date && <span className="card-meta">Target {fmtDate(project.target_date)}</span>}
            </div>
          </div>
          <select value={project.health}
            onChange={(e) => update('projects', project.id, { health: e.target.value as Health } as Partial<Project>)}
            style={{ width: 'auto' }}>
            {HEALTHS.map((h) => <option key={h} value={h}>{h}</option>)}
          </select>
        </div>
      </div>

      <div className="section-header"><h2>Milestones</h2><span className="section-count" style={{ background: 'var(--accent)' }}>{milestones.length}</span></div>
      <div className="row-list">
        {milestones.map((m) => (
          <div className="card card-compact" key={m.id}>
            <div className="card-row">
              <input type="checkbox" checked={m.done}
                onChange={() => update('milestones', m.id, { done: !m.done } as Partial<Milestone>)}
                style={{ width: 16, height: 16, accentColor: 'var(--accent)' }} />
              <span className="card-title" style={{ flex: 1, textDecoration: m.done ? 'line-through' : 'none', color: m.done ? 'var(--text2)' : 'inherit' }}>{m.title}</span>
              {m.due_date && <span className="card-meta">{fmtDate(m.due_date)}</span>}
              <button className="btn btn-sm btn-ghost" onClick={() => remove('milestones', m.id)}>✕</button>
            </div>
          </div>
        ))}
      </div>
      <div className="form-row" style={{ marginTop: 8 }}>
        <input type="text" placeholder="Add milestone…" value={mTitle}
          onChange={(e) => setMTitle(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') addMilestone(); }} />
        <input type="date" value={mDue} onChange={(e) => setMDue(e.target.value)} style={{ maxWidth: 150 }} />
        <button className="btn btn-secondary" onClick={addMilestone}>Add</button>
      </div>

      <div className="section-header"><h2>Open Work</h2><span className="section-count" style={{ background: 'var(--orange)' }}>{items.length}</span></div>
      <div className="row-list">
        {items.length ? items.map((w) => (
          <div className="card card-compact" key={w.id}><div className="card-row"><span className="card-title" style={{ flex: 1 }}>{w.title}</span>{w.due_date && <span className="card-meta">{fmtDate(w.due_date)}</span>}</div></div>
        )) : <div className="card-meta">No open work items.</div>}
      </div>

      <div className="section-header"><h2>Updates</h2><span className="section-count" style={{ background: 'var(--purple)' }}>{updates.length}</span></div>
      <div className="form-row" style={{ marginBottom: 10 }}>
        <input type="text" placeholder="Post an update…" value={upd}
          onChange={(e) => setUpd(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') addUpdate(); }} />
        <button className="btn btn-secondary" onClick={addUpdate}>Post</button>
      </div>
      <div className="row-list">
        {updates.map((u) => (
          <div className="card card-compact" key={u.id}>
            <p style={{ fontSize: 14 }}>{u.text}</p>
            <div className="card-meta" style={{ marginTop: 4 }}>{new Date(u.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} · {u.author}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function Projects({ onMenu }: { onMenu?: () => void }) {
  const { data } = useCadence();
  const [creating, setCreating] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);

  const sorted = useMemo(() => [...data.projects].sort((a, b) =>
    STATUSES.indexOf(a.status) - STATUSES.indexOf(b.status) || a.name.localeCompare(b.name)), [data]);
  const project = data.projects.find((p) => p.id === selected) || null;

  return (
    <>
      <ScreenHeader title={project ? project.name : 'Projects'} subtitle={project ? undefined : `${sorted.length} total`} onMenu={onMenu}>
        {!project && <button className="btn btn-primary" onClick={() => setCreating(true)}>+ New Project</button>}
      </ScreenHeader>
      {project ? <ProjectDetail project={project} onBack={() => setSelected(null)} /> : (
        <div className="screen-content">
          <div className="row-list">
            {sorted.length ? sorted.map((p) => {
              const open = data.work_items.filter((w) => w.project_id === p.id && !w.done).length;
              return (
                <button className="card card-clickable" key={p.id} onClick={() => setSelected(p.id)}>
                  <div className="card-row" style={{ alignItems: 'flex-start' }}>
                    <span style={{ fontSize: 18 }}>{healthIcon(p.health)}</span>
                    <div style={{ flex: 1, textAlign: 'left' }}>
                      <div className="card-title">{p.name}</div>
                      {p.goal && <p className="card-meta" style={{ marginTop: 2 }}>{p.goal}</p>}
                      <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                        <span className="tag tag-task">{STATUS_LABEL[p.status]}</span>
                        {open > 0 && <span className="card-meta">{open} open</span>}
                        {p.target_date && <span className="card-meta">· {fmtDate(p.target_date)}</span>}
                      </div>
                    </div>
                    <span style={{ color: 'var(--text3)' }}>›</span>
                  </div>
                </button>
              );
            }) : <EmptyState icon="📁" title="No projects yet" sub="Create one to start tracking work." />}
          </div>
        </div>
      )}
      {creating && <NewProject onClose={() => setCreating(false)} />}
    </>
  );
}
