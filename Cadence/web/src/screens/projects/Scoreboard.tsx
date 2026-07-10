import { useState, useEffect } from 'react';
import { useCadence } from '../../lib/store';
import type { Project } from '../../lib/types';
import { Modal } from '../../components/bits';
import { healthIcon, todayStr } from '../../lib/util';
import {
  priorityList, kpiList, addPriority, renamePriority, removePriority, movePriority, uid,
} from '../../lib/strategy';
import type { StrategyContent, WinState } from '../../lib/strategy';

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

export function StrategyModal({ strategy, save, onClose }: { strategy: StrategyContent; save: (s: StrategyContent) => void; onClose: () => void }) {
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

export function ScoreboardView({ strategy, winState, saveWinState }: { strategy: StrategyContent; winState: WinState; saveWinState: (mut: (s: WinState) => WinState) => void }) {
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
