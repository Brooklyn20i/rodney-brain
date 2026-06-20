import React, { useMemo, useState, useEffect } from 'react';
import { useCadence } from '../lib/store';
import type { Project, Milestone, ProjectUpdate, ProjectStatus, Health, WorkItem, ProjectPhase, RaidItem, Stakeholder, Note } from '../lib/types';
import { Modal, Due } from '../components/bits';
import { ScreenHeader } from '../components/bits';
import { ItemModal } from '../components/ItemModal';
import { healthIcon, fmtDate, fmtDMY, isOverdue, todayStr } from '../lib/util';
import {
  readStrategy, priorityList, kpiList, getPillar, getKpi,
  addPriority, renamePriority, removePriority, movePriority,
  STRATEGY_NOTE_TITLE, uid, emptyWinState,
} from '../lib/strategy';
import type { StrategyContent, WinState } from '../lib/strategy';

const WIN_STATE_TITLE = '__win_state__';

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

function useWinState() {
  const { data, insert, update } = useCadence();
  const note = useMemo(() => data.notes.filter((n) => n.title === WIN_STATE_TITLE)
    .sort((a, b) => (b.updated_at || '').localeCompare(a.updated_at || ''))[0], [data.notes]);
  const state: WinState = useMemo(() => {
    if (!note) return emptyWinState();
    try { return { ...emptyWinState(), ...JSON.parse(note.body || '{}') }; }
    catch { return emptyWinState(); }
  }, [note]);
  const save = (mut: (s: WinState) => WinState) => {
    const body = JSON.stringify(mut(state));
    if (note) update('notes', note.id, { body } as Partial<Note>);
    else insert('notes', { title: WIN_STATE_TITLE, body } as Partial<Note>);
  };
  return { state, save };
}

// ── Strategy / Priorities modal ────────────────────────────────────────────
function PriorityRow({ p, idx, total, strategy, save }: { p: { id: string; name: string }; idx: number; total: number; strategy: StrategyContent; save: (s: StrategyContent) => void }) {
  const [name, setName] = useState(p.name);
  useEffect(() => { setName(p.name); }, [p.name]);
  return (
    <div className="priority-edit-row">
      <input type="text" value={name}
        onChange={(e) => setName(e.target.value)}
        onBlur={() => { if (name.trim() && name !== p.name) save(renamePriority(strategy, p.id, name.trim())); }} />
      <button className="btn-icon" disabled={idx === 0} onClick={() => save(movePriority(strategy, p.id, -1))}>↑</button>
      <button className="btn-icon" disabled={idx === total - 1} onClick={() => save(movePriority(strategy, p.id, 1))}>↓</button>
      <button className="btn-icon" onClick={() => save(removePriority(strategy, p.id))}>✕</button>
    </div>
  );
}

function StrategyModal({ strategy, save, onClose }: { strategy: StrategyContent; save: (s: StrategyContent) => void; onClose: () => void }) {
  const [addingPriority, setAddingPriority] = useState('');
  const [addingKpi, setAddingKpi] = useState('');
  const [addingKpiTarget, setAddingKpiTarget] = useState('');
  const priorities = priorityList(strategy);
  const kpis = kpiList(strategy);

  const addPri = () => {
    if (addingPriority.trim()) { save(addPriority(strategy, addingPriority)); setAddingPriority(''); }
  };
  const addKpi = () => {
    if (!addingKpi.trim()) return;
    const id = uid();
    save({ ...strategy, kpis: { ...strategy.kpis, [id]: { name: addingKpi.trim(), proves: '', targetLabel: addingKpiTarget.trim() || '', target: parseFloat(addingKpiTarget) || null, unit: '', headline: false } } });
    setAddingKpi(''); setAddingKpiTarget('');
  };
  const removeKpi = (id: string) => {
    const next = { ...strategy.kpis }; delete next[id];
    save({ ...strategy, kpis: next });
  };

  return (
    <Modal title="Strategy" onClose={onClose}
      footer={<button className="btn btn-primary" onClick={onClose}>Done</button>}>
      <div className="form-group">
        <label>Priorities <span style={{ color: 'var(--text3)', fontWeight: 400 }}>— group projects by theme</span></label>
        {priorities.length === 0 && <small style={{ color: 'var(--text3)', display: 'block', marginBottom: 8 }}>E.g. "Grow Revenue", "Build the Team", "Operational Excellence"</small>}
        {priorities.map((p, idx) => (
          <PriorityRow key={p.id} p={p} idx={idx} total={priorities.length} strategy={strategy} save={save} />
        ))}
        <div className="form-row" style={{ marginTop: 8, gap: 6 }}>
          <input type="text" placeholder="Add priority…" value={addingPriority}
            onChange={(e) => setAddingPriority(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') addPri(); }} />
          <button className="btn btn-ghost btn-sm" onClick={addPri}>+ Add</button>
        </div>
      </div>
      <div className="form-group" style={{ marginTop: 16 }}>
        <label>Scoreboard KPIs <span style={{ color: 'var(--text3)', fontWeight: 400 }}>— outcomes you track</span></label>
        {kpis.length === 0 && <small style={{ color: 'var(--text3)', display: 'block', marginBottom: 8 }}>E.g. "Revenue", "Headcount", "NPS"</small>}
        {kpis.map((k) => (
          <div className="priority-edit-row" key={k.id}>
            <span style={{ flex: 1, fontSize: 14 }}>{k.name}{k.targetLabel ? <span style={{ color: 'var(--text3)', marginLeft: 6 }}>/ {k.targetLabel}</span> : ''}</span>
            <button className="btn-icon" onClick={() => removeKpi(k.id)}>✕</button>
          </div>
        ))}
        <div className="form-row" style={{ marginTop: 8, gap: 6 }}>
          <input type="text" placeholder="KPI name…" value={addingKpi}
            onChange={(e) => setAddingKpi(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') addKpi(); }} style={{ flex: 2 }} />
          <input type="text" placeholder="Target (e.g. €10m)" value={addingKpiTarget}
            onChange={(e) => setAddingKpiTarget(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') addKpi(); }} style={{ flex: 1, minWidth: 0 }} />
          <button className="btn btn-ghost btn-sm" onClick={addKpi}>+ Add</button>
        </div>
      </div>
    </Modal>
  );
}

// ── Scoreboard (full-width view) ───────────────────────────────────────────
function KpiScorecard({ kpi, readings, projects, onAdd }: {
  kpi: { id: string; name: string; targetLabel: string; target: number | null; unit?: string };
  readings: { date: string; value: number }[];
  projects: Project[];
  onAdd: (r: { date: string; value: number }) => void;
}) {
  const [date, setDate] = useState(todayStr());
  const [val, setVal] = useState('');
  const latest = readings.length ? readings[readings.length - 1] : null;
  const prev = readings.length > 1 ? readings[readings.length - 2] : null;
  const pct = kpi.target && latest ? Math.max(0, Math.min(100, (latest.value / kpi.target) * 100)) : 0;
  const trend = latest && prev ? latest.value - prev.value : null;
  const linked = projects.filter((p) => (p.kpi_ids || []).includes(kpi.id) && p.status !== 'completed');
  const add = () => { const v = parseFloat(val); if (isNaN(v)) return; onAdd({ date, value: v }); setVal(''); };

  return (
    <div className="kpi-scorecard">
      <div className="kpi-sc-head">
        <span className="kpi-sc-name">{kpi.name}</span>
        {kpi.targetLabel && <span className="kpi-sc-target">Target: {kpi.targetLabel}</span>}
        {latest && (
          <span className="kpi-sc-val">
            {latest.value}{kpi.unit || ''}
            {trend !== null && <span className={`kpi-trend ${trend >= 0 ? 'up' : 'down'}`}>{trend >= 0 ? ' ▲' : ' ▼'}{Math.abs(trend)}{kpi.unit || ''}</span>}
          </span>
        )}
      </div>
      {kpi.target && latest && (
        <div className="win-bar"><div className="win-bar-fill" style={{ width: `${pct}%`, background: pct >= 100 ? 'var(--green)' : 'var(--accent)' }} /></div>
      )}
      {linked.length > 0 && (
        <div className="kpi-sc-projects">
          {linked.map((p) => <span key={p.id} className="kpi-sc-proj">{healthIcon(p.health)} {p.name}</span>)}
        </div>
      )}
      <div className="kpi-sc-log">
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        <input type="text" placeholder={`value${kpi.unit ? ' (' + kpi.unit + ')' : ''}`} value={val}
          onChange={(e) => setVal(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') add(); }} />
        <button className="btn btn-secondary btn-sm" onClick={add}>Log</button>
      </div>
      {readings.length > 1 && (
        <div className="kpi-sc-history">
          {[...readings].reverse().slice(0, 5).map((r, i) => (
            <span key={i} className="kpi-sc-reading">{r.date.slice(5)}: {r.value}{kpi.unit || ''}</span>
          ))}
        </div>
      )}
    </div>
  );
}

function ScoreboardView({ strategy, winState, saveWinState }: { strategy: StrategyContent; winState: WinState; saveWinState: (mut: (s: WinState) => WinState) => void }) {
  const { data } = useCadence();
  const kpis = kpiList(strategy);
  if (!kpis.length) {
    return (
      <div className="proj-empty">
        <div className="icon" style={{ fontSize: 32 }}>◎</div>
        <p>No KPIs yet</p>
        <small>Add KPIs via Strategy to track your key outcomes here.</small>
      </div>
    );
  }
  return (
    <div className="scoreboard-grid">
      {kpis.map((k) => (
        <KpiScorecard key={k.id} kpi={k}
          readings={winState.readings[k.id] || []}
          projects={data.projects}
          onAdd={(r) => saveWinState((s) => ({ ...s, readings: { ...s.readings, [k.id]: [...(s.readings[k.id] || []), r].sort((a, b) => a.date.localeCompare(b.date)) } }))} />
      ))}
    </div>
  );
}

// ── Project card ───────────────────────────────────────────────────────────
const HEALTH_COLOR: Record<Health, string> = { green: 'var(--green)', amber: 'var(--orange)', red: 'var(--red)' };

function ProjectCard({ project, onClick, strategy }: { project: Project; onClick: () => void; strategy: StrategyContent }) {
  const { data } = useCadence();
  const updates = useMemo(() => data.project_updates.filter((u) => u.project_id === project.id)
    .sort((a, b) => b.created_at.localeCompare(a.created_at)), [data.project_updates, project.id]);
  const openCount = useMemo(() => data.work_items.filter((w) => w.project_id === project.id && !w.done).length, [data.work_items, project.id]);
  const milestones = useMemo(() => data.milestones.filter((m) => m.project_id === project.id), [data.milestones, project.id]);
  const pct = milestones.length ? Math.round(milestones.filter((m) => m.done).length / milestones.length * 100) : 0;
  const lastUpdate = updates[0] || null;
  const pillar = project.pillar_id ? getPillar(strategy, project.pillar_id) : undefined;

  const daysSince = lastUpdate
    ? Math.floor((Date.now() - new Date(lastUpdate.created_at).getTime()) / 86400000)
    : null;
  const stale = daysSince !== null && daysSince > 7;

  return (
    <button className="proj-card" onClick={onClick}>
      <div className="proj-card-stripe" style={{ background: HEALTH_COLOR[project.health] }} />
      <div className="proj-card-body">
        <div className="proj-card-row1">
          <span className="proj-card-name">{project.name}</span>
          {pillar && <span className="tag tag-decision" style={{ flexShrink: 0 }}>{pillar.name}</span>}
        </div>
        {lastUpdate
          ? <p className="proj-card-snippet">{lastUpdate.text}</p>
          : <p className="proj-card-snippet proj-card-no-update">No status updates yet</p>}
        <div className="proj-card-meta">
          {daysSince !== null
            ? <span className={stale ? 'proj-stale' : ''}>{daysSince === 0 ? 'Updated today' : `${daysSince}d ago`}{stale ? ' ⚠' : ''}</span>
            : <span style={{ color: 'var(--text3)' }}>Never updated</span>}
          {openCount > 0 && <span>{openCount} open</span>}
          {milestones.length > 0 && <span>{pct}% done</span>}
          {project.target_date && <span>{fmtDate(project.target_date)}</span>}
        </div>
        {project.next_action && (
          <div className="proj-card-next">→ {project.next_action}</div>
        )}
      </div>
    </button>
  );
}

// ── Project sheet tabs ─────────────────────────────────────────────────────
const HEALTHS: { v: Health; label: string }[] = [
  { v: 'green', label: '🟢 On track' }, { v: 'amber', label: '🟠 At risk' }, { v: 'red', label: '🔴 Off track' },
];

function UpdateTab({ project }: { project: Project }) {
  const { data, insert, update, logActivity } = useCadence();
  const updates = useMemo(() => data.project_updates.filter((u) => u.project_id === project.id)
    .sort((a, b) => b.created_at.localeCompare(a.created_at)), [data.project_updates, project.id]);
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
      setText(''); setHealth('');
    } finally { setBusy(false); }
  };

  return (
    <div>
      <div className="proj-update-form">
        <textarea className="proj-update-textarea" value={text}
          placeholder="What's the latest? What moved, what's blocked, what's next?"
          onChange={(e) => setText(e.target.value)} rows={4} />
        <div className="proj-update-controls">
          <select value={health} onChange={(e) => setHealth(e.target.value as Health | '')} style={{ flex: 1 }}>
            <option value="">— health unchanged —</option>
            {HEALTHS.map((h) => <option key={h.v} value={h.v}>{h.label}</option>)}
          </select>
          <button className="btn btn-primary" onClick={post} disabled={busy || !text.trim()}>
            {busy ? 'Posting…' : 'Post Update'}
          </button>
        </div>
      </div>
      {updates.length > 0
        ? updates.map((u) => (
          <div className="update-row" key={u.id}>
            <div className="ur-date">
              {fmtDMY(u.created_at)}
              {u.health ? ' · ' + healthIcon(u.health) : ''}
            </div>
            <div className="ur-text">{u.text}</div>
          </div>
        ))
        : <p style={{ color: 'var(--text3)', fontSize: 13, textAlign: 'center', padding: '20px 0' }}>No updates yet — post the first one above.</p>}
    </div>
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

function PlanTab({ project, strategy }: { project: Project; strategy: StrategyContent }) {
  const { data, insert, update, remove } = useCadence();
  const milestones = useMemo(() => data.milestones.filter((m) => m.project_id === project.id), [data.milestones, project.id]);
  const phases = useMemo(() => data.project_phases.filter((p) => p.project_id === project.id).sort((a, b) => a.sort - b.sort), [data.project_phases, project.id]);
  const items = useMemo(() => data.work_items.filter((w) => w.project_id === project.id && !w.done), [data.work_items, project.id]);
  const [addingItem, setAddingItem] = useState(false);
  const [editingItem, setEditingItem] = useState<WorkItem | null>(null);
  const [mTitle, setMTitle] = useState('');
  const [mDate, setMDate] = useState('');
  const [mErr, setMErr] = useState('');
  const [nextAction, setNextAction] = useState(project.next_action || '');
  useEffect(() => { setNextAction(project.next_action || ''); }, [project.next_action]);
  const pct = milestones.length ? Math.round(milestones.filter((m) => m.done).length / milestones.length * 100) : 0;
  const pillar = project.pillar_id ? getPillar(strategy, project.pillar_id) : undefined;
  const linkedKpis = (project.kpi_ids || []).map((id) => getKpi(strategy, id)?.name).filter(Boolean);

  const addMilestone = async () => {
    if (!mTitle.trim()) return;
    setMErr('');
    try {
      await insert('milestones', { project_id: project.id, title: mTitle.trim(), due_date: mDate || null, done: false } as Partial<Milestone>);
      setMTitle(''); setMDate('');
    } catch { setMErr('Failed to add milestone — check connection'); }
  };

  return (
    <div>
      {/* Summary row */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
        {pillar && <span className="tag tag-decision">◎ {pillar.name}</span>}
        {linkedKpis.map((n) => <span className="tag tag-info" key={n}>{n}</span>)}
        <span className="tag" style={{ background: 'var(--surface2)', color: 'var(--text2)' }}>{project.owner || 'No owner'}</span>
        {project.target_date && <span className="tag" style={{ background: 'var(--surface2)', color: 'var(--text2)' }}>📅 {fmtDate(project.target_date)}</span>}
      </div>

      {project.goal && <p style={{ fontStyle: 'italic', color: 'var(--text2)', fontSize: 14, marginBottom: 14, lineHeight: 1.5 }}>{project.goal}</p>}

      <div style={{ background: 'var(--blue-bg)', borderRadius: 8, padding: '8px 12px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
        <strong style={{ fontSize: 13, color: 'var(--accent)', flexShrink: 0 }}>→ Next:</strong>
        <input
          type="text"
          value={nextAction}
          placeholder="The single next step…"
          onChange={(e) => setNextAction(e.target.value)}
          onBlur={() => update('projects', project.id, { next_action: nextAction } as Partial<Project>)}
          style={{ flex: 1, background: 'transparent', border: 'none', fontSize: 14, color: 'var(--text)', outline: 'none', fontFamily: 'inherit', minWidth: 0 }}
        />
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

// ── Advanced sub-components ────────────────────────────────────────────────
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

const RAID_KINDS: RaidItem['kind'][] = ['risk', 'assumption', 'issue', 'dependency'];
const RAID_LABEL: Record<RaidItem['kind'], string> = { risk: 'Risk', assumption: 'Assumption', issue: 'Issue', dependency: 'Dependency' };
const RACI_LABEL: Record<Stakeholder['raci'], string> = { R: 'Responsible', A: 'Accountable', C: 'Consulted', I: 'Informed' };

function Phases({ project, phases, milestones }: { project: Project; phases: ProjectPhase[]; milestones: Milestone[] }) {
  const { insert, remove } = useCadence();
  const [name, setName] = useState('');
  const [addErr, setAddErr] = useState('');
  const add = async () => {
    if (!name.trim()) return;
    setAddErr('');
    try {
      await insert('project_phases', { project_id: project.id, name: name.trim(), sort: phases.length, start_date: null, end_date: null } as Partial<ProjectPhase>);
      setName('');
    } catch (e: any) {
      const msg = String(e?.message || e || '');
      setAddErr(/does not exist|relation|no such/i.test(msg)
        ? 'Phases not available — run migration 0006 in Supabase'
        : 'Could not save — tap Add to try again');
    }
  };
  return (
    <div className="detail-section">
      <h3>Phases / Workstreams</h3>
      {phases.map((ph) => <PhaseRow key={ph.id} ph={ph} milestones={milestones} onRemove={() => remove('project_phases', ph.id)} />)}
      {!phases.length && <small style={{ color: 'var(--text3)' }}>No phases yet</small>}
      {addErr && <small style={{ color: 'var(--red)', display: 'block', marginTop: 4 }}>{addErr}</small>}
      <div className="form-row" style={{ marginTop: 8 }}>
        <input type="text" placeholder="Add phase (e.g. Discovery)…" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') add(); }} />
        <button className="btn btn-ghost btn-sm" onClick={add}>+ Add</button>
      </div>
    </div>
  );
}

function Stakeholders({ project, rows }: { project: Project; rows: Stakeholder[] }) {
  const { data, insert, remove } = useCadence();
  const [personId, setPersonId] = useState('');
  const [name, setName] = useState('');
  const [raci, setRaci] = useState<Stakeholder['raci']>('I');
  const [addErr, setAddErr] = useState('');
  const add = async () => {
    const pname = personId ? (data.people.find((p) => p.id === personId)?.name || '') : name.trim();
    if (!pname) return;
    setAddErr('');
    try {
      await insert('stakeholders', { project_id: project.id, person_id: personId || null, name: pname, raci } as Partial<Stakeholder>);
      setPersonId(''); setName('');
    } catch (e: any) {
      const msg = String(e?.message || e || '');
      setAddErr(/does not exist|relation|no such/i.test(msg)
        ? 'Stakeholders not available — run migration 0006 in Supabase'
        : 'Could not save — tap Add to try again');
    }
  };
  return (
    <div className="detail-section">
      <h3>Stakeholders (RACI)</h3>
      {rows.map((s) => (
        <div className="work-item-row" key={s.id}>
          <span className={`raci-badge raci-${s.raci}`}>{s.raci}</span>
          <span className="wi-title">{s.name}</span>
          <span className="card-meta">{RACI_LABEL[s.raci]}</span>
          <button className="btn-icon" onClick={() => remove('stakeholders', s.id)}>✕</button>
        </div>
      ))}
      {!rows.length && <small style={{ color: 'var(--text3)' }}>No stakeholders yet</small>}
      {addErr && <small style={{ color: 'var(--red)', display: 'block', marginTop: 4 }}>{addErr}</small>}
      <div className="form-row" style={{ marginTop: 8, gap: 6 }}>
        <select value={personId} onChange={(e) => setPersonId(e.target.value)}>
          <option value="">Person…</option>
          {data.people.filter((p) => !p.type || p.type === 'person').map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
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

function Raid({ project, rows }: { project: Project; rows: RaidItem[] }) {
  const { insert, update, remove } = useCadence();
  const [kind, setKind] = useState<RaidItem['kind']>('risk');
  const [text, setText] = useState('');
  const [severity, setSeverity] = useState<RaidItem['severity']>('medium');
  const [addErr, setAddErr] = useState('');
  const add = async () => {
    if (!text.trim()) return;
    setAddErr('');
    try {
      await insert('raid_items', { project_id: project.id, kind, text: text.trim(), severity, status: 'open', owner: '' } as Partial<RaidItem>);
      setText('');
    } catch (e: any) {
      const msg = String(e?.message || e || '');
      setAddErr(/does not exist|relation|no such/i.test(msg)
        ? 'RAID log not available — run migration 0006 in Supabase'
        : 'Could not save — tap Add to try again');
    }
  };
  const openItems = rows.filter((r) => r.status === 'open');
  return (
    <div className="detail-section">
      <h3>RAID ({openItems.length} open)</h3>
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
      {!rows.length && <small style={{ color: 'var(--text3)' }}>No RAID items</small>}
      {addErr && <small style={{ color: 'var(--red)', display: 'block', marginTop: 4 }}>{addErr}</small>}
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

function Timeline({ project, phases, milestones }: { project: Project; phases: ProjectPhase[]; milestones: Milestone[] }) {
  const events = useMemo(() => {
    const ev: { date: string; label: string; kind: string; done?: boolean }[] = [];
    phases.forEach((p) => {
      if (p.start_date) ev.push({ date: p.start_date, label: `${p.name} starts`, kind: 'phase' });
      if (p.end_date) ev.push({ date: p.end_date, label: `${p.name} ends`, kind: 'phase' });
    });
    milestones.forEach((m) => { if (m.due_date) ev.push({ date: m.due_date, label: m.title, kind: 'milestone', done: m.done }); });
    if (project.target_date) ev.push({ date: project.target_date, label: 'Project target', kind: 'target' });
    return ev.sort((a, b) => a.date.localeCompare(b.date));
  }, [phases, milestones, project.target_date]);
  if (!events.length) return null;
  return (
    <div className="detail-section">
      <h3>Timeline</h3>
      {events.map((e) => (
        <div className="tl-row" key={`${e.date}-${e.label}`}>
          <span className={`tl-dot ${e.kind}`} />
          <span className={`tl-date ${isOverdue(e.date) && !e.done ? 'tl-overdue' : ''}`}>{fmtDate(e.date)}</span>
          <span className={`tl-label ${e.done ? 'done' : ''}`}>{e.label}{e.done ? ' ✓' : ''}</span>
        </div>
      ))}
    </div>
  );
}

function AdvancedTab({ project, onEdit }: { project: Project; onEdit: () => void }) {
  const { data } = useCadence();
  const [editingItem, setEditingItem] = useState<WorkItem | null>(null);
  const phases = useMemo(() => data.project_phases.filter((p) => p.project_id === project.id).sort((a, b) => a.sort - b.sort), [data.project_phases, project.id]);
  const milestones = useMemo(() => data.milestones.filter((m) => m.project_id === project.id), [data.milestones, project.id]);
  const raid = useMemo(() => data.raid_items.filter((r) => r.project_id === project.id), [data.raid_items, project.id]);
  const stake = useMemo(() => data.stakeholders.filter((s) => s.project_id === project.id), [data.stakeholders, project.id]);
  const links = useMemo(() => data.links.filter((l) => l.parent_type === 'project' && l.parent_id === project.id), [data.links, project.id]);
  const closed = useMemo(() => data.work_items.filter((w) => w.project_id === project.id && w.done), [data.work_items, project.id]);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
        <button className="btn btn-secondary btn-sm" onClick={onEdit}>Edit project</button>
      </div>
      <Phases project={project} phases={phases} milestones={milestones} />
      <Timeline project={project} phases={phases} milestones={milestones} />
      <Stakeholders project={project} rows={stake} />
      <Raid project={project} rows={raid} />
      {(links.length > 0) && (
        <div className="detail-section">
          <h3>Files &amp; Links</h3>
          {links.map((l) => <div className="link-row" key={l.id}>🔗 <a href={l.url} target="_blank" rel="noreferrer">{l.title || l.url}</a></div>)}
        </div>
      )}
      {closed.length > 0 && (
        <div className="detail-section">
          <h3>Completed ({closed.length})</h3>
          {closed.map((w) => <WorkItemRow key={w.id} w={w} phases={phases} onEdit={setEditingItem} />)}
        </div>
      )}
      {editingItem && <ItemModal existing={editingItem} onClose={() => setEditingItem(null)} />}
    </div>
  );
}

// ── Full-screen project detail (push navigation) ──────────────────────────
const HEALTH_PILL: Record<Health, [string, string]> = {
  green: ['health-green', 'On track'], amber: ['health-amber', 'At risk'], red: ['health-red', 'Off track'],
};

function ProjectDetail({ project, strategy, onBack, onEdit, onMenu }: {
  project: Project; strategy: StrategyContent;
  onBack: () => void; onEdit: () => void; onMenu?: () => void;
}) {
  const [tab, setTab] = useState<'update' | 'plan' | 'advanced'>('update');
  const [pill, pillLabel] = HEALTH_PILL[project.health];
  return (
    <>
      <div className="screen-header">
        <button className="menu-btn" onClick={onMenu} aria-label="Open menu">☰</button>
        <div className="header-left" style={{ flex: 1, minWidth: 0 }}>
          <button className="proj-back-btn" onClick={onBack}>← Projects</button>
          <h1 style={{ fontSize: 17, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{project.name}</h1>
        </div>
        <div className="header-actions">
          <button className="btn btn-secondary btn-sm" onClick={onEdit}>Edit</button>
        </div>
      </div>
      <div className="proj-detail-screen">
        <div className="proj-detail-inner">
          <div className="proj-detail-top">
            <span className={`health-pill ${pill}`}>{healthIcon(project.health)} {pillLabel}</span>
          </div>
          <div className="proj-detail-tabs">
            {(['update', 'plan', 'advanced'] as const).map((t) => (
              <button key={t} className={`proj-sheet-tab ${tab === t ? 'active' : ''}`} onClick={() => setTab(t)}>
                {t === 'update' ? 'Update' : t === 'plan' ? 'Plan' : 'Advanced'}
              </button>
            ))}
          </div>
          <div className="proj-detail-body">
            {tab === 'update' && <UpdateTab project={project} />}
            {tab === 'plan' && <PlanTab project={project} strategy={strategy} />}
            {tab === 'advanced' && <AdvancedTab project={project} onEdit={onEdit} />}
          </div>
        </div>
      </div>
    </>
  );
}

// ── Project create / edit modal ────────────────────────────────────────────
const COLORS = ['#1B5E9E', '#6B3FA0', '#1A7F37', '#E07D00', '#D93025', '#0E7490'];
const STATUSES: ProjectStatus[] = ['active', 'onHold', 'completed'];

function ProjectModal({ existing, strategy, onClose }: { existing?: Project; strategy: StrategyContent; onClose: () => void }) {
  const { insert, update, logActivity } = useCadence();
  const priorities = priorityList(strategy);
  const kpis = kpiList(strategy);
  const [name, setName] = useState(existing?.name || '');
  const [goal, setGoal] = useState(existing?.goal || '');
  const [status, setStatus] = useState<ProjectStatus>(existing?.status || 'active');
  const [health, setHealth] = useState<Health>(existing?.health || 'green');
  const [owner, setOwner] = useState(existing?.owner || 'you');
  const [target, setTarget] = useState(existing?.target_date || '');
  const [nextAction, setNextAction] = useState(existing?.next_action || '');
  const [color, setColor] = useState(existing?.color || '#1B5E9E');
  const [pillarId, setPillarId] = useState(existing?.pillar_id || '');
  const [kpiIds, setKpiIds] = useState<string[]>(existing?.kpi_ids || []);
  const [busy, setBusy] = useState(false);
  const toggleKpi = (id: string) => setKpiIds((k) => k.includes(id) ? k.filter((x) => x !== id) : [...k, id]);

  const save = async () => {
    if (!name.trim()) return;
    setBusy(true);
    try {
      const full = { name: name.trim(), goal, status, health, owner, target_date: target || null, next_action: nextAction, color, pillar_id: pillarId, kpi_ids: kpiIds } as Partial<Project>;
      const write = async (body: Partial<Project>) => { if (existing) await update('projects', existing.id, body); else await insert('projects', body); };
      try { await write(full); }
      catch (e: any) {
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
      {priorities.length > 0 && (
        <div className="form-group"><label>Priority</label>
          <select value={pillarId} onChange={(e) => setPillarId(e.target.value)}>
            <option value="">— None —</option>
            {priorities.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select></div>
      )}
      {kpis.length > 0 && (
        <div className="form-group"><label>KPIs this project moves</label>
          <div className="win-kpi-pick">
            {kpis.map((k) => <button key={k.id} type="button" className={`win-kpi-chip ${kpiIds.includes(k.id) ? 'on' : ''}`} onClick={() => toggleKpi(k.id)}>{k.name}</button>)}
          </div>
        </div>
      )}
      <div className="form-group"><label>Colour</label>
        <select value={color} onChange={(e) => setColor(e.target.value)}>
          {COLORS.map((c) => <option key={c} value={c}>{c}</option>)}
        </select></div>
    </Modal>
  );
}

// ── Group health roll-up ───────────────────────────────────────────────────
function HealthRoll({ items }: { items: Project[] }) {
  const mix = { green: 0, amber: 0, red: 0 } as Record<Health, number>;
  items.filter((p) => p.status !== 'completed').forEach((p) => mix[p.health]++);
  if (!mix.green && !mix.amber && !mix.red) return null;
  return (
    <span className="proj-roll">
      {mix.green > 0 && <span className="win-pill on">{mix.green} on track</span>}
      {mix.amber > 0 && <span className="win-pill risk">{mix.amber} at risk</span>}
      {mix.red > 0 && <span className="win-pill stall">{mix.red} off track</span>}
    </span>
  );
}

// ── Main screen ────────────────────────────────────────────────────────────
const STATUS_LABEL: Record<ProjectStatus, string> = { active: 'Active', onHold: 'On Hold', completed: 'Completed' };

export function Projects({ onMenu }: { onMenu?: () => void }) {
  const { data } = useCadence();
  const { strategy, save } = useStrategy();
  const { state: winState, save: saveWinState } = useWinState();
  const priorities = useMemo(() => priorityList(strategy), [strategy]);

  const [view, setView] = useState<'list' | 'scoreboard' | 'detail'>('list');
  const [groupBy, setGroupBy] = useState<'priority' | 'status'>(() => priorities.length ? 'priority' : 'status');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Project | null>(null);
  const [editStrategy, setEditStrategy] = useState(false);

  useEffect(() => {
    if (groupBy === 'priority' && !priorities.length) setGroupBy('status');
  }, [priorities.length, groupBy]);

  const selected = selectedId ? (data.projects.find((p) => p.id === selectedId) || null) : null;
  const byName = (a: Project, b: Project) => a.name.localeCompare(b.name);

  const groups = useMemo(() => {
    const all = [...data.projects];
    if (groupBy === 'priority' && priorities.length) {
      const out = priorities.map((pr) => ({
        key: pr.id, label: pr.name, items: all.filter((p) => p.pillar_id === pr.id).sort(byName),
      }));
      const unassigned = all.filter((p) => !p.pillar_id || !priorities.some((pr) => pr.id === p.pillar_id)).sort(byName);
      if (unassigned.length) out.push({ key: '__none__', label: 'No priority', items: unassigned });
      return out.filter((g) => g.items.length);
    }
    return STATUSES.map((s) => ({
      key: s, label: STATUS_LABEL[s], items: all.filter((p) => p.status === s).sort(byName),
    })).filter((g) => g.items.length);
  }, [data.projects, groupBy, priorities]);

  // Full-screen detail view — replaces the list entirely (push navigation)
  if (view === 'detail' && selected) {
    return (
      <>
        <ProjectDetail
          project={selected}
          strategy={strategy}
          onMenu={onMenu}
          onBack={() => { setView('list'); setSelectedId(null); }}
          onEdit={() => setEditing(selected)}
        />
        {editing && <ProjectModal existing={editing} strategy={strategy} onClose={() => setEditing(null)} />}
      </>
    );
  }

  return (
    <>
      <ScreenHeader title="Projects" onMenu={onMenu} />
      <div className="proj-screen">
        <div className="proj-toolbar">
          <div className="seg">
            <button className={view === 'list' ? 'on' : ''} onClick={() => setView('list')}>Projects</button>
            <button className={view === 'scoreboard' ? 'on' : ''} onClick={() => setView('scoreboard')}>Scoreboard</button>
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {view === 'list' && (
              <div className="seg">
                <button className={groupBy === 'priority' ? 'on' : ''} onClick={() => setGroupBy('priority')}>Priority</button>
                <button className={groupBy === 'status' ? 'on' : ''} onClick={() => setGroupBy('status')}>Status</button>
              </div>
            )}
            <button className="btn btn-ghost btn-sm" onClick={() => setEditStrategy(true)}>Strategy</button>
            <button className="btn btn-primary btn-sm" onClick={() => setCreating(true)}>+ New</button>
          </div>
        </div>

        <div className="proj-list">
          <div className="proj-content-wrap">
            {view === 'scoreboard' ? (
              <ScoreboardView strategy={strategy} winState={winState} saveWinState={saveWinState} />
            ) : data.projects.length === 0 ? (
              <div className="proj-empty"><div className="icon">▤</div><p>No projects yet</p></div>
            ) : groupBy === 'priority' && !priorities.length ? (
              <div className="proj-empty">
                <p>Add priorities to group projects by theme.</p>
                <button className="btn btn-secondary btn-sm" style={{ marginTop: 8 }} onClick={() => setEditStrategy(true)}>Set up strategy</button>
              </div>
            ) : (
              groups.map((g) => (
                <React.Fragment key={g.key}>
                  <div className="proj-group-hdr">
                    <span className="proj-group-name">{g.label}</span>
                    <span className="proj-group-count">{g.items.length}</span>
                    <HealthRoll items={g.items} />
                  </div>
                  {g.items.map((p) => (
                    <ProjectCard key={p.id} project={p} strategy={strategy}
                      onClick={() => { setSelectedId(p.id); setView('detail'); }} />
                  ))}
                </React.Fragment>
              ))
            )}
          </div>
        </div>
      </div>

      {creating && <ProjectModal strategy={strategy} onClose={() => setCreating(false)} />}
      {editing && <ProjectModal existing={editing} strategy={strategy} onClose={() => setEditing(null)} />}
      {editStrategy && <StrategyModal strategy={strategy} save={save} onClose={() => setEditStrategy(false)} />}
    </>
  );
}
