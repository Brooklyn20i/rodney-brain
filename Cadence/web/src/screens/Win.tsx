import React, { useMemo, useState } from 'react';
import { useCadence } from '../lib/store';
import type { Note, Project, Health } from '../lib/types';
import { ScreenHeader } from '../components/bits';
import {
  emptyStrategy, strategyConfigured, pillarList, kpiList, getKpi,
  emptyWinState, uid, STATUS_META,
} from '../lib/strategy';
import type { StrategyContent, WinState, InitiativeStatus, KpiContent } from '../lib/strategy';

const STRATEGY_TITLE = '__win_strategy__';
const STATE_TITLE = '__win_state__';
const todayISO = () => new Date().toISOString().slice(0, 10);
const QUARTER_DAYS = 90;
const healthToStatus = (h: Health): InitiativeStatus => h === 'green' ? 'onTrack' : h === 'amber' ? 'atRisk' : 'stalled';

// A project, viewed through the strategy lens (projects ARE initiatives).
interface InitView { id: string; name: string; pillarId: string; kpiIds: string[]; owner: string; status: InitiativeStatus; nextAction: string; }
const toInit = (p: Project): InitView => ({
  id: p.id, name: p.name, pillarId: p.pillar_id || '', kpiIds: p.kpi_ids || [],
  owner: p.owner || '', status: healthToStatus(p.health), nextAction: p.next_action || '',
});

function useSynced<T extends object>(title: string, empty: () => T) {
  const { data, insert, update } = useCadence();
  const note = useMemo(() => data.notes.filter((n) => n.title === title)
    .sort((a, b) => (b.updated_at || '').localeCompare(a.updated_at || ''))[0], [data.notes, title]);
  const { value, parseError } = useMemo(() => {
    if (!note) return { value: empty(), parseError: false };
    try { return { value: { ...empty(), ...JSON.parse(note.body || '{}') } as T, parseError: false }; }
    catch { return { value: empty(), parseError: true }; }
  }, [note]);
  const save = (mut: (v: T) => T) => {
    if (note && parseError) throw new Error(`${title} record is corrupted — refusing to overwrite`);
    const body = JSON.stringify(mut(value));
    if (note) update('notes', note.id, { body } as Partial<Note>); else insert('notes', { title, body } as Partial<Note>);
  };
  return { value, parseError, save };
}

function StrategySetup({ current, onImport }: { current: StrategyContent; onImport: (s: StrategyContent, inits?: any[]) => void }) {
  const [text, setText] = useState(current && strategyConfigured(current) ? JSON.stringify({ strategy: current }, null, 2) : '');
  const [err, setErr] = useState('');
  const load = () => {
    try {
      const parsed = JSON.parse(text);
      const strat = (parsed.strategy ?? parsed) as StrategyContent;
      if (!strat || typeof strat !== 'object') throw new Error('Not a strategy object');
      onImport({ ...emptyStrategy(), ...strat }, Array.isArray(parsed.initiatives) ? parsed.initiatives : undefined);
    } catch (e: any) { setErr(e?.message || 'Could not parse'); }
  };
  return (
    <div className="screen-content">
      <div className="win-aspiration-bar"><small>Set up WIN</small><p>Your strategy stays private — paste it once and it's stored only in your account, never in the app's code. Any initiatives become Projects.</p></div>
      <p className="card-meta" style={{ margin: '12px 0 6px' }}>Paste your strategy JSON, then Load:</p>
      <textarea value={text} onChange={(e) => setText(e.target.value)} placeholder='{ "strategy": { "aspiration": "...", "pillars": {...}, "kpis": {...} }, "initiatives": [...] }'
        style={{ width: '100%', minHeight: 240, fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 12 }} />
      {err && <p style={{ color: 'var(--red)', fontSize: 12, marginTop: 6 }}>{err}</p>}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 10 }}>
        <button className="btn btn-primary" onClick={load}>Load strategy</button>
      </div>
    </div>
  );
}

type Tab = 'overview' | 'initiatives' | 'kpis' | 'review';

export function Win({ onMenu, onNavigate }: { onMenu?: () => void; onNavigate?: (id: string) => void }) {
  const { data, insert } = useCadence();
  const strat = useSynced<StrategyContent>(STRATEGY_TITLE, emptyStrategy);
  const win = useSynced<WinState>(STATE_TITLE, emptyWinState);
  const [tab, setTab] = useState<Tab>('overview');
  const [editStrategy, setEditStrategy] = useState(false);

  const strategy = strat.value;
  const state = win.value;

  const importStrategy = async (s: StrategyContent, inits?: any[]) => {
    strat.save(() => s);
    // Initiatives become Projects (the single source of truth)
    if (inits && inits.length) {
      for (const i of inits) {
        const full = { name: i.name, pillar_id: i.pillarId || '', kpi_ids: i.kpiIds || [], status: 'active', health: 'green', goal: '', owner: i.owner || '', next_action: '', color: '#1B5E9E' } as Partial<Project>;
        try { await insert('projects', full); }
        catch (e: any) { if (/pillar_id|kpi_ids|column/i.test(String(e?.message || e))) { const { pillar_id: _a, kpi_ids: _b, ...rest } = full as any; await insert('projects', rest); } else throw e; }
      }
    }
    setEditStrategy(false);
  };

  if (!strategyConfigured(strategy) || editStrategy) {
    return (<><ScreenHeader title="WIN" subtitle="Strategy setup" onMenu={onMenu} /><StrategySetup current={strategy} onImport={importStrategy} /></>);
  }

  const pillars = pillarList(strategy);
  const kpis = kpiList(strategy);
  const initiatives = data.projects.filter((p) => p.status !== 'completed' && !p.deleted_at).map(toInit);
  const orphans = initiatives.filter((i) => i.kpiIds.length === 0);
  const stalled = initiatives.filter((i) => i.status === 'stalled');
  const emptyPillars = pillars.filter((p) => !initiatives.some((i) => i.pillarId === p.id));
  const lastReview = state.reviews[0];
  const nextReviewDue = lastReview ? new Date(new Date(lastReview.date).getTime() + QUARTER_DAYS * 86400000).toISOString().slice(0, 10) : null;
  const reviewOverdue = nextReviewDue ? nextReviewDue < todayISO() : true;
  const latestReading = (kpiId: string) => { const r = state.readings[kpiId]; return r && r.length ? r[r.length - 1] : null; };

  return (
    <>
      <ScreenHeader title="WIN" subtitle="Strategy management" onMenu={onMenu} />
      <div className="win-tabs">
        {(['overview', 'initiatives', 'kpis', 'review'] as Tab[]).map((t) => (
          <button key={t} className={`win-tab ${tab === t ? 'active' : ''}`} onClick={() => setTab(t)}>
            {t === 'overview' ? 'Overview' : t === 'initiatives' ? 'Initiatives' : t === 'kpis' ? 'KPI Trajectory' : 'Review'}
          </button>
        ))}
      </div>
      <div className="screen-content">
        {(strat.parseError || win.parseError) && <div className="win-alert"><span>🔴</span> A WIN data record looks corrupted; editing is paused to protect your data.</div>}

        {tab === 'overview' && <>
          <div className="win-aspiration-bar"><small>Winning Aspiration</small><p>{strategy.aspiration}</p>
            <button className="btn btn-sm btn-ghost" style={{ color: '#9BC4F0', padding: '6px 0 0' }} onClick={() => setEditStrategy(true)}>Edit strategy</button></div>

          {(orphans.length || stalled.length || emptyPillars.length || reviewOverdue) ? <div className="section-header"><h2>Needs your attention</h2></div> : null}
          {reviewOverdue && <div className="win-alert"><span>📅</span> {lastReview ? `Review overdue — last run ${lastReview.date}` : 'No strategy review logged yet'} <button className="btn btn-sm btn-ghost" onClick={() => setTab('review')}>Review →</button></div>}
          {emptyPillars.map((p) => <div className="win-alert" key={p.id}><span>⚠</span> <b>{p.name}</b> is a named priority with no project.</div>)}
          {orphans.map((i) => <div className="win-alert" key={i.id}><span>⚠</span> <b>{i.name}</b> serves no KPI — link one in Projects.</div>)}
          {stalled.map((i) => <div className="win-alert" key={i.id}><span>🔴</span> <b>{i.name}</b> is off track{i.owner ? ` · ${i.owner}` : ''}.</div>)}

          <div className="section-header"><h2>Pillar Health</h2><span className="section-count" style={{ background: 'var(--purple)' }}>{pillars.length}</span></div>
          {pillars.map((p) => {
            const pin = initiatives.filter((i) => i.pillarId === p.id);
            const mix = { onTrack: 0, atRisk: 0, stalled: 0 } as Record<InitiativeStatus, number>;
            pin.forEach((i) => mix[i.status]++);
            return (
              <div className="win-pillar-health" key={p.id} onClick={() => setTab('initiatives')}>
                <div className="win-ph-name">{p.name}</div>
                <div className="win-ph-meta">
                  {pin.length === 0 ? <span style={{ color: 'var(--red)' }}>No projects</span> : <>
                    <span>{pin.length} project{pin.length > 1 ? 's' : ''}</span>
                    {mix.onTrack > 0 && <span className="win-pill on">{mix.onTrack} on track</span>}
                    {mix.atRisk > 0 && <span className="win-pill risk">{mix.atRisk} at risk</span>}
                    {mix.stalled > 0 && <span className="win-pill stall">{mix.stalled} off track</span>}
                  </>}
                </div>
              </div>
            );
          })}

          <div className="section-header"><h2>KPI Snapshot</h2></div>
          <div className="win-kpi-grid">
            {kpis.map((k) => {
              const lr = latestReading(k.id);
              const pct = k.target && lr ? ((lr.value - (k.baseline || 0)) / (k.target - (k.baseline || 0))) * 100 : 0;
              return (
                <div className="win-kpi-mini" key={k.id} onClick={() => setTab('kpis')}>
                  <div className="win-kpi-mini-name">{k.name}{k.headline && <span className="win-kpi-flag">Headline</span>}</div>
                  <div className="win-kpi-mini-val">{lr ? `${lr.value}${k.unit || ''}` : '—'} <span className="win-kpi-mini-target">/ {k.targetLabel}</span></div>
                  {k.target ? <div className="win-bar"><div className="win-bar-fill" style={{ width: `${Math.max(0, Math.min(100, pct))}%`, background: pct >= 100 ? 'var(--green)' : 'var(--accent)' }} /></div> : null}
                </div>
              );
            })}
          </div>
        </>}

        {tab === 'initiatives' && <>
          {strategy.operatingRule && <p className="win-rule"><strong>Operating rule:</strong> {strategy.operatingRule}</p>}
          <p className="card-meta" style={{ marginBottom: 12 }}>Initiatives are your <b>Projects</b>. {onNavigate && <button className="btn btn-sm btn-ghost" style={{ padding: 0 }} onClick={() => onNavigate('projects')}>Manage in Projects →</button>}</p>
          {initiatives.length === 0 && <p className="card-meta">No active projects yet. Create projects and link each to a pillar + KPI in Projects.</p>}
          {pillars.map((p) => {
            const pin = initiatives.filter((i) => i.pillarId === p.id);
            if (!pin.length) return null;
            return (
              <React.Fragment key={p.id}>
                <div className="section-header"><h2>{p.name}</h2><span className="section-count" style={{ background: 'var(--purple)' }}>{pin.length}</span></div>
                {pin.map((i) => <InitiativeView key={i.id} i={i} strategy={strategy} />)}
              </React.Fragment>
            );
          })}
          {initiatives.some((i) => !i.pillarId) && <>
            <div className="section-header"><h2>Unlinked to a pillar</h2></div>
            {initiatives.filter((i) => !i.pillarId).map((i) => <InitiativeView key={i.id} i={i} strategy={strategy} />)}
          </>}
        </>}

        {tab === 'kpis' && <>
          <p className="card-meta" style={{ marginBottom: 12 }}>Log a reading whenever you have one.</p>
          {kpis.map((k) => <KpiTracker key={k.id} kpi={k} readings={state.readings[k.id] || []}
            onAdd={(r) => win.save((s) => ({ ...s, readings: { ...s.readings, [k.id]: [...(s.readings[k.id] || []), r].sort((a, b) => a.date.localeCompare(b.date)) } }))}
            onRemove={(idx) => win.save((s) => ({ ...s, readings: { ...s.readings, [k.id]: (s.readings[k.id] || []).filter((_, j) => j !== idx) } }))} />)}
        </>}

        {tab === 'review' && <ReviewTab state={state} save={win.save} nextReviewDue={nextReviewDue} reviewOverdue={reviewOverdue} />}
      </div>
    </>
  );
}

function InitiativeView({ i, strategy }: { i: InitView; strategy: StrategyContent }) {
  return (
    <div className="win-init-card">
      <div className="win-init-head">
        <span className="win-dot" style={{ background: STATUS_META[i.status].dot }} />
        <span className="win-init-title">{i.name}</span>
        {i.kpiIds.length === 0 && <span className="win-init-warn">⚠ No KPI</span>}
      </div>
      <div className="win-init-tags">
        {i.kpiIds.map((id) => <span className="tag tag-info" key={id}>{getKpi(strategy, id)?.name || id}</span>)}
        {i.owner && <span className="tag tag-action">{i.owner}</span>}
        <span className="tag" style={{ background: 'var(--surface2)', color: STATUS_META[i.status].dot }}>{STATUS_META[i.status].label}</span>
      </div>
      {i.nextAction && <div className="win-init-next">→ {i.nextAction}</div>}
    </div>
  );
}

function KpiTracker({ kpi, readings, onAdd, onRemove }: {
  kpi: KpiContent & { id: string }; readings: { date: string; value: number }[];
  onAdd: (r: { date: string; value: number }) => void; onRemove: (idx: number) => void;
}) {
  const k = kpi;
  const [date, setDate] = useState(todayISO());
  const [val, setVal] = useState('');
  const latest = readings.length ? readings[readings.length - 1] : null;
  const prev = readings.length > 1 ? readings[readings.length - 2] : null;
  const pct = k.target && latest ? ((latest.value - (k.baseline || 0)) / (k.target - (k.baseline || 0))) * 100 : 0;
  const trend = latest && prev ? latest.value - prev.value : null;
  const add = () => { const v = parseFloat(val); if (isNaN(v)) return; onAdd({ date, value: v }); setVal(''); };
  return (
    <div className="win-kpi-track">
      <div className="win-kpi-track-head">
        <div>
          <div className="win-kpi-track-name">{k.name}{k.headline && <span className="win-kpi-flag">Headline</span>}</div>
          <div className="win-kpi-track-def">{k.proves}{k.targetLabel ? ` · target ${k.targetLabel}` : ''}</div>
        </div>
        <div className="win-kpi-track-now">
          {latest ? <><b>{latest.value}{k.unit || ''}</b>{trend !== null && <span className={`win-trend ${trend >= 0 ? 'up' : 'down'}`}>{trend >= 0 ? '▲' : '▼'} {Math.abs(trend)}{k.unit || ''}</span>}</> : <span style={{ color: 'var(--text3)' }}>no data</span>}
        </div>
      </div>
      {k.target ? <div className="win-bar"><div className="win-bar-fill" style={{ width: `${Math.max(0, Math.min(100, pct))}%`, background: pct >= 100 ? 'var(--green)' : 'var(--accent)' }} /></div> : null}
      {readings.length > 0 && <div className="win-readings">{readings.map((r, idx) => <span className="win-reading" key={idx}>{r.date}: <b>{r.value}{k.unit || ''}</b><button onClick={() => onRemove(idx)}>✕</button></span>)}</div>}
      <div className="win-kpi-add">
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        <input type="number" placeholder={`value${k.unit ? ' (' + k.unit + ')' : ''}`} value={val} onChange={(e) => setVal(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') add(); }} />
        <button className="btn btn-secondary btn-sm" onClick={add}>Log</button>
      </div>
    </div>
  );
}

function ReviewTab({ state, save, nextReviewDue, reviewOverdue }: {
  state: WinState; save: (mut: (s: WinState) => WinState) => void; nextReviewDue: string | null; reviewOverdue: boolean;
}) {
  const [summary, setSummary] = useState('');
  const log = () => {
    if (!summary.trim()) return;
    save((s) => ({ ...s, reviews: [{ id: uid(), date: todayISO(), summary: summary.trim() }, ...s.reviews] }));
    setSummary('');
  };
  return (
    <>
      <div className={`win-review-status ${reviewOverdue ? 'due' : ''}`}>
        {nextReviewDue ? <>Next review due <b>{nextReviewDue}</b> {reviewOverdue && '· overdue'}</> : 'No review logged yet · cadence: quarterly'}
      </div>
      <div className="section-header"><h2>Run a review</h2></div>
      <div className="win-form">
        <p className="card-meta" style={{ marginBottom: 8 }}>Update project health on the Projects screen, then capture what was decided:</p>
        <textarea value={summary} placeholder="What moved, what's stalled, trade-offs made, decisions taken…" onChange={(e) => setSummary(e.target.value)} style={{ minHeight: 100 }} />
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
          <button className="btn btn-primary btn-sm" onClick={log}>Log review ({todayISO()})</button>
        </div>
      </div>
      {state.reviews.length > 0 && <div className="section-header"><h2>Past reviews</h2><span className="section-count" style={{ background: 'var(--accent)' }}>{state.reviews.length}</span></div>}
      {state.reviews.map((r) => (
        <div className="win-review-entry" key={r.id}>
          <div className="win-review-date">{r.date}</div>
          <div className="win-review-summary">{r.summary}</div>
          <button className="btn btn-sm btn-ghost" style={{ color: 'var(--red)', padding: '2px 0' }} onClick={() => save((s) => ({ ...s, reviews: s.reviews.filter((x) => x.id !== r.id) }))}>Delete</button>
        </div>
      ))}
    </>
  );
}
