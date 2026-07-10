import { useState } from 'react';
import { useCadence } from '../../lib/store';
import type { Project, ProjectStatus, Health } from '../../lib/types';
import { Modal } from '../../components/bits';
import { HEALTH_OPTIONS } from '../../lib/health';
import { knownPortfolios } from '../../lib/selectors';
import { priorityList, kpiList } from '../../lib/strategy';
import type { StrategyContent } from '../../lib/strategy';

const COLORS = ['#1B5E9E', '#6B3FA0', '#1A7F37', '#E07D00', '#D93025', '#0E7490'];

export function ProjectModal({ existing, strategy, onClose }: { existing?: Project; strategy: StrategyContent; onClose: () => void }) {
  const { data, insert, update, logActivity } = useCadence();
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
  const [portfolio, setPortfolio] = useState(existing?.portfolio || '');
  const [pillarId, setPillarId] = useState(existing?.pillar_id || '');
  const [kpiIds, setKpiIds] = useState<string[]>(existing?.kpi_ids || []);
  const [busy, setBusy] = useState(false);
  const toggleKpi = (id: string) => setKpiIds((k) => k.includes(id) ? k.filter((x) => x !== id) : [...k, id]);
  const portfolios = knownPortfolios(data.projects);

  const save = async () => {
    if (!name.trim()) return;
    setBusy(true);
    try {
      // Missing-column tolerance (pre-migration DBs) lives in the store's
      // dropMissingColumn retry — no per-field try/catch needed here.
      const body = {
        name: name.trim(), goal, status, health, owner,
        target_date: target || null, next_action: nextAction, color,
        portfolio: portfolio.trim() || null,
        pillar_id: pillarId, kpi_ids: kpiIds,
      } as Partial<Project>;
      if (existing) await update('projects', existing.id, body);
      else await insert('projects', body);
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
            {HEALTH_OPTIONS.map((h) => <option key={h.v} value={h.v}>{h.label}</option>)}
          </select></div>
      </div>
      <div className="form-row">
        <div className="form-group"><label>Owner</label>
          <input type="text" value={owner} placeholder="Who's accountable?" onChange={(e) => setOwner(e.target.value)} /></div>
        <div className="form-group"><label>Target Date</label>
          <input type="date" value={target} onChange={(e) => setTarget(e.target.value)} /></div>
      </div>
      <div className="form-group"><label>Portfolio</label>
        <input type="text" list="portfolio-suggestions" value={portfolio}
          placeholder="e.g. RAPID Portfolio, Strategic" onChange={(e) => setPortfolio(e.target.value)} />
        <datalist id="portfolio-suggestions">
          {portfolios.map((p) => <option key={p} value={p} />)}
        </datalist>
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
