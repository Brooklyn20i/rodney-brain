import React, { useMemo, useState } from 'react';
import { useCadence } from '../lib/store';
import type { Note } from '../lib/types';
import { ScreenHeader } from '../components/bits';
import {
  emptyStrategy, strategyConfigured, pillarList, kpiList, getKpi,
  emptyWinState, uid, STATUS_META,
} from '../lib/strategy';
import type { StrategyContent, WinState, Initiative, InitiativeStatus, KpiContent } from '../lib/strategy';

const STRATEGY_TITLE = '__win_strategy__';
const STATE_TITLE = '__win_state__';
const todayISO = () => new Date().toISOString().slice(0, 10);
const QUARTER_DAYS = 90;

// Shared synced-record hook: dedupes duplicate records (keeps newest),
// guards against corrupt JSON, and refuses to overwrite a corrupted record
// (so a transient parse failure can never wipe your data).
function useSynced<T extends object>(title: string, empty: () => T) {
  const { data, insert, update } = useCadence();
  const note = useMemo(() => {
    const matches = data.notes.filter((n) => n.title === title)
      .sort((a, b) => (b.updated_at || '').localeCompare(a.updated_at || ''));
    return matches[0];
  }, [data.notes, title]);

  const { value, parseError } = useMemo(() => {
    if (!note) return { value: empty(), parseError: false };
    try { return { value: { ...empty(), ...JSON.parse(note.body || '{}') } as T, parseError: false }; }
    catch { return { value: empty(), parseError: true }; }
  }, [note]);

  const save = (mut: (v: T) => T) => {
    if (note && parseError) throw new Error(`${title} record is corrupted — refusing to overwrite`);
    const body = JSON.stringify(mut(value));
    if (note) update('notes', note.id, { body } as Partial<Note>);
    else insert('notes', { title, body } as Partial<Note>);
  };
  return { value, parseError, save };
}

const StatusDot = ({ s }: { s: InitiativeStatus }) => (
  <span className="win-dot" style={{ background: STATUS_META[s].dot }} title={STATUS_META[s].label} />
);

// ── Setup / import (keeps confidential content out of source) ────────────────
function StrategySetup({ current, onImport }: { current: StrategyContent; onImport: (s: StrategyContent, inits?: Initiative[]) => void }) {
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
      <div className="win-aspiration-bar"><small>Set up WIN</small><p>Your strategy stays private — paste it in once and it's stored only in your account, never in the app's code.</p></div>
      <p className="card-meta" style={{ margin: '12px 0 6px' }}>Paste your strategy JSON (Claude can hand you this privately), then Load:</p>
      <textarea value={text} onChange={(e) => setText(e.target.value)} placeholder='{ "strategy": { "aspiration": "...", "pillars": {...}, "kpis": {...} } }'
        style={{ width: '100%', minHeight: 240, fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 12 }} />
      {err && <p style={{ color: 'var(--red)', fontSize: 12, marginTop: 6 }}>{err}</p>}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 10 }}>
        <button className="btn btn-primary" onClick={load}>Load strategy</button>
      </div>
    </div>
  );
}

function InitiativeForm({ existing, strategy, onSave, onCancel }: {
  existing?: Initiative; strategy: StrategyContent; onSave: (i: Initiative) => void; onCancel: () => void;
}) {
  const [name, setName] = useState(existing?.name || '');
  const [pillarId, setPillarId] = useState(existing?.pillarId || '');
  const [kpiIds, setKpiIds] = useState<string[]>(existing?.kpiIds || []);
  const [owner, setOwner] = useState(existing?.owner || '');
  const [status, setStatus] = useState<InitiativeStatus>(existing?.status || 'onTrack');
  const [nextAction, setNextAction] = useState(existing?.nextAction || '');
  const [stoppedFor, setStoppedFor] = useState(existing?.stoppedFor || '');
  const pillars = pillarList(strategy);
  const kpis = kpiList(strategy);
  const toggleKpi = (id: string) => setKpiIds((k) => k.includes(id) ? k.filter((x) => x !== id) : [...k, id]);
  const save = () => {
    if (!name.trim()) return;
    onSave({
      id: existing?.id || uid(), name: name.trim(), pillarId, kpiIds, owner: owner.trim(),
      status, nextAction: nextAction.trim(), stoppedFor: stoppedFor.trim(),
      createdAt: existing?.createdAt || new Date().toISOString(),
    });
  };
  return (
    <div className="win-form">
      <div className="form-group"><label>Initiative</label>
        <input type="text" autoFocus value={name} onChange={(e) => setName(e.target.value)} /></div>
      <div className="form-row">
        <div className="form-group"><label>Pillar</label>
          <select value={pillarId} onChange={(e) => setPillarId(e.target.value)}>
            <option value="">— Unassigned —</option>
            {pillars.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select></div>
        <div className="form-group"><label>Owner</label>
          <input type="text" value={owner} onChange={(e) => setOwner(e.target.value)} /></div>
      </div>
      <div className="form-group"><label>KPIs it moves</label>
        <div className="win-kpi-pick">
          {kpis.map((k) => <button key={k.id} type="button" className={`win-kpi-chip ${kpiIds.includes(k.id) ? 'on' : ''}`} onClick={() => toggleKpi(k.id)}>{k.name}</button>)}
        </div>
        {kpiIds.length === 0 && <small style={{ color: 'var(--orange)' }}>⚠ Serves no KPI — per your rule, it shouldn't be prioritised.</small>}
      </div>
      <div className="form-row">
        <div className="form-group"><label>Status</label>
          <select value={status} onChange={(e) => setStatus(e.target.value as InitiativeStatus)}>
            <option value="onTrack">On track</option><option value="atRisk">At risk</option><option value="stalled">Stalled</option>
          </select></div>
        <div className="form-group"><label>Next action</label>
          <input type="text" value={nextAction} onChange={(e) => setNextAction(e.target.value)} /></div>
      </div>
      {!existing && <div className="form-group"><label>One in, one out — what stops to make room?</label>
        <input type="text" value={stoppedFor} onChange={(e) => setStoppedFor(e.target.value)} /></div>}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
        <button className="btn btn-secondary btn-sm" onClick={onCancel}>Cancel</button>
        <button className="btn btn-primary btn-sm" onClick={save}>{existing ? 'Save' : 'Add initiative'}</button>
      </div>
    </div>
  );
}

type Tab = 'overview' | 'initiatives' | 'kpis' | 'review';

export function Win({ onMenu }: { onMenu?: () => void }) {
  const strat = useSynced<StrategyContent>(STRATEGY_TITLE, emptyStrategy);
  const win = useSynced<WinState>(STATE_TITLE, emptyWinState);
  const [tab, setTab] = useState<Tab>('overview');
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editStrategy, setEditStrategy] = useState(false);

  const strategy = strat.value;
  const state = win.value;

  if (!strategyConfigured(strategy) || editStrategy) {
    return (
      <>
        <ScreenHeader title="WIN" subtitle="Strategy setup" onMenu={onMenu} />
        <StrategySetup current={strategy} onImport={(s, inits) => {
          strat.save(() => s);
          if (inits && inits.length) win.save((w) => ({ ...w, initiatives: [...w.initiatives, ...inits] }));
          setEditStrategy(false);
        }} />
      </>
    );
  }

  const inits = state.initiatives;
  const pillars = pillarList(strategy);
  const kpis = kpiList(strategy);
  const saveInit = (i: Initiative) => {
    win.save((s) => {
      const exists = s.initiatives.some((x) => x.id === i.id);
      return { ...s, initiatives: exists ? s.initiatives.map((x) => x.id === i.id ? i : x) : [...s.initiatives, i] };
    });
    setAdding(false); setEditingId(null);
  };
  const removeInit = (id: string) => win.save((s) => ({ ...s, initiatives: s.initiatives.filter((x) => x.id !== id) }));

  const orphans = inits.filter((i) => i.kpiIds.length === 0);
  const stalled = inits.filter((i) => i.status === 'stalled');
  const emptyPillars = pillars.filter((p) => !inits.some((i) => i.pillarId === p.id));
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
        {(strat.parseError || win.parseError) && <div className="win-alert"><span>🔴</span> A WIN data record looks corrupted; editing is paused to protect your data. Tell Claude.</div>}

        {tab === 'overview' && <>
          <div className="win-aspiration-bar"><small>Winning Aspiration</small><p>{strategy.aspiration}</p>
            <button className="btn btn-sm btn-ghost" style={{ color: '#9BC4F0', padding: '6px 0 0' }} onClick={() => setEditStrategy(true)}>Edit strategy</button></div>

          {(orphans.length || stalled.length || emptyPillars.length || reviewOverdue) ? <div className="section-header"><h2>Needs your attention</h2></div> : null}
          {reviewOverdue && <div className="win-alert"><span>📅</span> {lastReview ? `Review overdue — last run ${lastReview.date}` : 'No strategy review logged yet'} <button className="btn btn-sm btn-ghost" onClick={() => setTab('review')}>Review →</button></div>}
          {emptyPillars.map((p) => <div className="win-alert" key={p.id}><span>⚠</span> <b>{p.name}</b> is a named priority with no initiative.</div>)}
          {orphans.map((i) => <div className="win-alert" key={i.id}><span>⚠</span> <b>{i.name}</b> serves no KPI.</div>)}
          {stalled.map((i) => <div className="win-alert" key={i.id}><span>🔴</span> <b>{i.name}</b> is stalled{i.owner ? ` · ${i.owner}` : ''}.</div>)}

          <div className="section-header"><h2>Pillar Health</h2><span className="section-count" style={{ background: 'var(--purple)' }}>{pillars.length}</span></div>
          {pillars.map((p) => {
            const pin = inits.filter((i) => i.pillarId === p.id);
            const mix = { onTrack: 0, atRisk: 0, stalled: 0 } as Record<InitiativeStatus, number>;
            pin.forEach((i) => mix[i.status]++);
            return (
              <div className="win-pillar-health" key={p.id} onClick={() => setTab('initiatives')}>
                <div className="win-ph-name">{p.name}</div>
                <div className="win-ph-meta">
                  {pin.length === 0 ? <span style={{ color: 'var(--red)' }}>No initiatives</span> : <>
                    <span>{pin.length} initiative{pin.length > 1 ? 's' : ''}</span>
                    {mix.onTrack > 0 && <span className="win-pill on">{mix.onTrack} on track</span>}
                    {mix.atRisk > 0 && <span className="win-pill risk">{mix.atRisk} at risk</span>}
                    {mix.stalled > 0 && <span className="win-pill stall">{mix.stalled} stalled</span>}
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
          <div style={{ marginBottom: 12 }}>
            <button className="btn btn-primary btn-sm" onClick={() => { setAdding(true); setEditingId(null); }}>+ Add initiative</button>
          </div>
          {adding && <InitiativeForm strategy={strategy} onSave={saveInit} onCancel={() => setAdding(false)} />}
          {inits.length === 0 && !adding && <p className="card-meta">No initiatives yet. Add your real initiatives and map each to a pillar + KPI.</p>}
          {pillars.map((p) => {
            const pin = inits.filter((i) => i.pillarId === p.id);
            if (!pin.length) return null;
            return (
              <React.Fragment key={p.id}>
                <div className="section-header"><h2>{p.name}</h2><span className="section-count" style={{ background: 'var(--purple)' }}>{pin.length}</span></div>
                {pin.map((i) => <InitiativeCard key={i.id} i={i} strategy={strategy} editing={editingId === i.id} onEdit={() => setEditingId(i.id)} onSave={saveInit} onCancelEdit={() => setEditingId(null)} onRemove={() => removeInit(i.id)} />)}
              </React.Fragment>
            );
          })}
          {inits.some((i) => !i.pillarId) && <>
            <div className="section-header"><h2>Unassigned</h2></div>
            {inits.filter((i) => !i.pillarId).map((i) => <InitiativeCard key={i.id} i={i} strategy={strategy} editing={editingId === i.id} onEdit={() => setEditingId(i.id)} onSave={saveInit} onCancelEdit={() => setEditingId(null)} onRemove={() => removeInit(i.id)} />)}
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

function InitiativeCard({ i, strategy, editing, onEdit, onSave, onCancelEdit, onRemove }: {
  i: Initiative; strategy: StrategyContent; editing: boolean; onEdit: () => void; onSave: (i: Initiative) => void; onCancelEdit: () => void; onRemove: () => void;
}) {
  if (editing) return <InitiativeForm existing={i} strategy={strategy} onSave={onSave} onCancel={onCancelEdit} />;
  return (
    <div className="win-init-card">
      <div className="win-init-head">
        <StatusDot s={i.status} />
        <span className="win-init-title">{i.name}</span>
        {i.kpiIds.length === 0 && <span className="win-init-warn">⚠ No KPI</span>}
        <button className="btn-icon" onClick={onEdit}>✎</button>
      </div>
      <div className="win-init-tags">
        {i.kpiIds.map((id) => <span className="tag tag-info" key={id}>{getKpi(strategy, id)?.name || id}</span>)}
        {i.owner && <span className="tag tag-action">{i.owner}</span>}
        <span className="tag" style={{ background: 'var(--surface2)', color: STATUS_META[i.status].dot }}>{STATUS_META[i.status].label}</span>
      </div>
      {i.nextAction && <div className="win-init-next">→ {i.nextAction}</div>}
      {i.stoppedFor && <div className="win-init-trade">⇄ Made room by: {i.stoppedFor}</div>}
      <button className="btn btn-sm btn-ghost" style={{ color: 'var(--red)', padding: '2px 0' }} onClick={onRemove}>Remove</button>
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
        <p className="card-meta" style={{ marginBottom: 8 }}>Update initiative statuses on the Initiatives tab, then capture what was decided:</p>
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
