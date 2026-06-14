import React, { useMemo, useState } from 'react';
import { useCadence } from '../lib/store';
import type { Note } from '../lib/types';
import { ScreenHeader } from '../components/bits';
import {
  WIN_ASPIRATION, WIN_OPERATING_RULE, WIN_PILLARS, WIN_KPIS, WIN_SEED_INITIATIVES,
  STATUS_META, getPillar, getKpi, emptyWinState, uid,
} from '../lib/strategy';
import type { WinState, Initiative, InitiativeStatus, Review } from '../lib/strategy';

export const WIN_STATE_TITLE = '__win_state__';
const todayISO = () => new Date().toISOString().slice(0, 10);
const QUARTER_DAYS = 90;

function useWinState(): [WinState, (mut: (s: WinState) => WinState) => void] {
  const { data, insert, update } = useCadence();
  const stateNote = data.notes.find((n) => n.title === WIN_STATE_TITLE);
  const state = useMemo<WinState>(() => {
    try { return { ...emptyWinState(), ...JSON.parse(stateNote?.body || '{}') }; }
    catch { return emptyWinState(); }
  }, [stateNote]);
  const apply = (mut: (s: WinState) => WinState) => {
    const next = mut(state);
    const body = JSON.stringify(next);
    if (stateNote) update('notes', stateNote.id, { body } as Partial<Note>);
    else insert('notes', { title: WIN_STATE_TITLE, body } as Partial<Note>);
  };
  return [state, apply];
}

const StatusDot = ({ s }: { s: InitiativeStatus }) => (
  <span className="win-dot" style={{ background: STATUS_META[s].dot }} title={STATUS_META[s].label} />
);

// ── Initiative add/edit form ────────────────────────────────────────────────
function InitiativeForm({ existing, onSave, onCancel }: {
  existing?: Initiative; onSave: (i: Initiative) => void; onCancel: () => void;
}) {
  const [name, setName] = useState(existing?.name || '');
  const [pillarId, setPillarId] = useState(existing?.pillarId || '');
  const [kpiIds, setKpiIds] = useState<string[]>(existing?.kpiIds || []);
  const [owner, setOwner] = useState(existing?.owner || '');
  const [status, setStatus] = useState<InitiativeStatus>(existing?.status || 'onTrack');
  const [nextAction, setNextAction] = useState(existing?.nextAction || '');
  const [stoppedFor, setStoppedFor] = useState(existing?.stoppedFor || '');

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
        <input type="text" autoFocus value={name} placeholder="e.g. Negotiation Support Platform" onChange={(e) => setName(e.target.value)} /></div>
      <div className="form-row">
        <div className="form-group"><label>Pillar (where it plays)</label>
          <select value={pillarId} onChange={(e) => setPillarId(e.target.value)}>
            <option value="">— Unassigned —</option>
            {WIN_PILLARS.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select></div>
        <div className="form-group"><label>Owner</label>
          <input type="text" value={owner} placeholder="Who's accountable" onChange={(e) => setOwner(e.target.value)} /></div>
      </div>
      <div className="form-group"><label>KPIs it moves</label>
        <div className="win-kpi-pick">
          {WIN_KPIS.map((k) => (
            <button key={k.id} type="button" className={`win-kpi-chip ${kpiIds.includes(k.id) ? 'on' : ''}`} onClick={() => toggleKpi(k.id)}>{k.name}</button>
          ))}
        </div>
        {kpiIds.length === 0 && <small style={{ color: 'var(--orange)' }}>⚠ Serves no KPI — per your rule, it shouldn't be prioritised.</small>}
      </div>
      <div className="form-row">
        <div className="form-group"><label>Status</label>
          <select value={status} onChange={(e) => setStatus(e.target.value as InitiativeStatus)}>
            <option value="onTrack">On track</option><option value="atRisk">At risk</option><option value="stalled">Stalled</option>
          </select></div>
        <div className="form-group"><label>Next action</label>
          <input type="text" value={nextAction} placeholder="The next concrete step" onChange={(e) => setNextAction(e.target.value)} /></div>
      </div>
      {!existing && (
        <div className="form-group"><label>One in, one out — what stops to make room?</label>
          <input type="text" value={stoppedFor} placeholder="What you're stopping or deferring (your operating rule)" onChange={(e) => setStoppedFor(e.target.value)} /></div>
      )}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
        <button className="btn btn-secondary btn-sm" onClick={onCancel}>Cancel</button>
        <button className="btn btn-primary btn-sm" onClick={save}>{existing ? 'Save' : 'Add initiative'}</button>
      </div>
    </div>
  );
}

// ── Tabs ────────────────────────────────────────────────────────────────────
type Tab = 'overview' | 'initiatives' | 'kpis' | 'review';

export function Win({ onMenu }: { onMenu?: () => void }) {
  const [state, apply] = useWinState();
  const [tab, setTab] = useState<Tab>('overview');
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const inits = state.initiatives;
  const saveInit = (i: Initiative) => {
    apply((s) => {
      const exists = s.initiatives.some((x) => x.id === i.id);
      return { ...s, initiatives: exists ? s.initiatives.map((x) => x.id === i.id ? i : x) : [...s.initiatives, i] };
    });
    setAdding(false); setEditingId(null);
  };
  const removeInit = (id: string) => apply((s) => ({ ...s, initiatives: s.initiatives.filter((x) => x.id !== id) }));
  const seed = () => apply((s) => ({
    ...s,
    initiatives: [...s.initiatives, ...WIN_SEED_INITIATIVES.map((si) => ({
      id: uid(), name: si.name, pillarId: si.pillarId, kpiIds: si.kpiIds,
      owner: '', status: 'onTrack' as InitiativeStatus, nextAction: '', stoppedFor: '', createdAt: new Date().toISOString(),
    }))],
  }));

  // ── derived signals ──
  const orphans = inits.filter((i) => i.kpiIds.length === 0);
  const stalled = inits.filter((i) => i.status === 'stalled');
  const emptyPillars = WIN_PILLARS.filter((p) => !inits.some((i) => i.pillarId === p.id));
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

        {/* ── OVERVIEW ── */}
        {tab === 'overview' && <>
          <div className="win-aspiration-bar"><small>Winning Aspiration</small><p>{WIN_ASPIRATION}</p></div>

          {(orphans.length > 0 || stalled.length > 0 || emptyPillars.length > 0 || reviewOverdue) && (
            <div className="section-header"><h2>Needs your attention</h2></div>
          )}
          {reviewOverdue && <div className="win-alert"><span>📅</span> {lastReview ? `Review overdue — last run ${lastReview.date}` : 'No strategy review logged yet — run your first one'} <button className="btn btn-sm btn-ghost" onClick={() => setTab('review')}>Review →</button></div>}
          {emptyPillars.map((p) => <div className="win-alert" key={p.id}><span>⚠</span> <b>{p.name}</b> is a named priority with no initiative behind it.</div>)}
          {orphans.map((i) => <div className="win-alert" key={i.id}><span>⚠</span> <b>{i.name}</b> serves no KPI — shouldn't be prioritised.</div>)}
          {stalled.map((i) => <div className="win-alert" key={i.id}><span>🔴</span> <b>{i.name}</b> is stalled{i.owner ? ` · ${i.owner}` : ''}.</div>)}

          <div className="section-header"><h2>Pillar Health</h2><span className="section-count" style={{ background: 'var(--purple)' }}>{WIN_PILLARS.length}</span></div>
          {WIN_PILLARS.map((p) => {
            const pin = inits.filter((i) => i.pillarId === p.id);
            const statusMix = { onTrack: 0, atRisk: 0, stalled: 0 } as Record<InitiativeStatus, number>;
            pin.forEach((i) => statusMix[i.status]++);
            return (
              <div className="win-pillar-health" key={p.id} onClick={() => setTab('initiatives')}>
                <div className="win-ph-name">{p.name}</div>
                <div className="win-ph-meta">
                  {pin.length === 0 ? <span style={{ color: 'var(--red)' }}>No initiatives</span> : <>
                    <span>{pin.length} initiative{pin.length > 1 ? 's' : ''}</span>
                    {statusMix.onTrack > 0 && <span className="win-pill on">{statusMix.onTrack} on track</span>}
                    {statusMix.atRisk > 0 && <span className="win-pill risk">{statusMix.atRisk} at risk</span>}
                    {statusMix.stalled > 0 && <span className="win-pill stall">{statusMix.stalled} stalled</span>}
                  </>}
                </div>
              </div>
            );
          })}

          <div className="section-header"><h2>KPI Snapshot</h2></div>
          <div className="win-kpi-grid">
            {WIN_KPIS.map((k) => {
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

        {/* ── INITIATIVES ── */}
        {tab === 'initiatives' && <>
          <p className="win-rule"><strong>Operating rule:</strong> {WIN_OPERATING_RULE}</p>
          <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
            <button className="btn btn-primary btn-sm" onClick={() => { setAdding(true); setEditingId(null); }}>+ Add initiative</button>
            {inits.length === 0 && <button className="btn btn-secondary btn-sm" onClick={seed}>Add starter set from my document</button>}
          </div>
          {adding && <InitiativeForm onSave={saveInit} onCancel={() => setAdding(false)} />}

          {inits.length === 0 && !adding && <p className="card-meta">No initiatives yet. Add your own, or pull the starter set straight from section 6.2 of your document.</p>}

          {WIN_PILLARS.map((p) => {
            const pin = inits.filter((i) => i.pillarId === p.id);
            if (!pin.length) return null;
            return (
              <React.Fragment key={p.id}>
                <div className="section-header"><h2>{p.name}</h2><span className="section-count" style={{ background: 'var(--purple)' }}>{pin.length}</span></div>
                {pin.map((i) => <InitiativeCard key={i.id} i={i} editing={editingId === i.id} onEdit={() => setEditingId(i.id)} onSave={saveInit} onCancelEdit={() => setEditingId(null)} onRemove={() => removeInit(i.id)} />)}
              </React.Fragment>
            );
          })}
          {inits.some((i) => !i.pillarId) && <>
            <div className="section-header"><h2>Unassigned pillar</h2></div>
            {inits.filter((i) => !i.pillarId).map((i) => <InitiativeCard key={i.id} i={i} editing={editingId === i.id} onEdit={() => setEditingId(i.id)} onSave={saveInit} onCancelEdit={() => setEditingId(null)} onRemove={() => removeInit(i.id)} />)}
          </>}
        </>}

        {/* ── KPI TRAJECTORY ── */}
        {tab === 'kpis' && <>
          <p className="card-meta" style={{ marginBottom: 12 }}>Log a reading whenever you have one. Definitions and targets are yours, from the document.</p>
          {WIN_KPIS.map((k) => <KpiTracker key={k.id} kpiId={k.id} readings={state.readings[k.id] || []}
            onAdd={(r) => apply((s) => ({ ...s, readings: { ...s.readings, [k.id]: [...(s.readings[k.id] || []), r].sort((a, b) => a.date.localeCompare(b.date)) } }))}
            onRemove={(idx) => apply((s) => ({ ...s, readings: { ...s.readings, [k.id]: (s.readings[k.id] || []).filter((_, j) => j !== idx) } }))} />)}
        </>}

        {/* ── REVIEW ── */}
        {tab === 'review' && <ReviewTab state={state} apply={apply} nextReviewDue={nextReviewDue} reviewOverdue={reviewOverdue} />}
      </div>
    </>
  );
}

function InitiativeCard({ i, editing, onEdit, onSave, onCancelEdit, onRemove }: {
  i: Initiative; editing: boolean; onEdit: () => void; onSave: (i: Initiative) => void; onCancelEdit: () => void; onRemove: () => void;
}) {
  if (editing) return <InitiativeForm existing={i} onSave={onSave} onCancel={onCancelEdit} />;
  return (
    <div className="win-init-card">
      <div className="win-init-head">
        <StatusDot s={i.status} />
        <span className="win-init-title">{i.name}</span>
        {i.kpiIds.length === 0 && <span className="win-init-warn">⚠ No KPI</span>}
        <button className="btn-icon" onClick={onEdit}>✎</button>
      </div>
      <div className="win-init-tags">
        {i.kpiIds.map((id) => <span className="tag tag-info" key={id}>{getKpi(id)?.name}</span>)}
        {i.owner && <span className="tag tag-action">{i.owner}</span>}
        <span className="tag" style={{ background: 'var(--surface2)', color: STATUS_META[i.status].dot }}>{STATUS_META[i.status].label}</span>
      </div>
      {i.nextAction && <div className="win-init-next">→ {i.nextAction}</div>}
      {i.stoppedFor && <div className="win-init-trade">⇄ Made room by: {i.stoppedFor}</div>}
      <button className="btn btn-sm btn-ghost" style={{ color: 'var(--red)', padding: '2px 0' }} onClick={onRemove}>Remove</button>
    </div>
  );
}

function KpiTracker({ kpiId, readings, onAdd, onRemove }: {
  kpiId: string; readings: { date: string; value: number }[];
  onAdd: (r: { date: string; value: number }) => void; onRemove: (idx: number) => void;
}) {
  const k = getKpi(kpiId)!;
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
          <div className="win-kpi-track-def">{k.proves} · target {k.targetLabel}</div>
        </div>
        <div className="win-kpi-track-now">
          {latest ? <><b>{latest.value}{k.unit || ''}</b>{trend !== null && <span className={`win-trend ${trend >= 0 ? 'up' : 'down'}`}>{trend >= 0 ? '▲' : '▼'} {Math.abs(trend)}{k.unit || ''}</span>}</> : <span style={{ color: 'var(--text3)' }}>no data</span>}
        </div>
      </div>
      {k.target ? <div className="win-bar"><div className="win-bar-fill" style={{ width: `${Math.max(0, Math.min(100, pct))}%`, background: pct >= 100 ? 'var(--green)' : 'var(--accent)' }} /></div> : null}
      {readings.length > 0 && (
        <div className="win-readings">
          {readings.map((r, idx) => (
            <span className="win-reading" key={idx}>{r.date}: <b>{r.value}{k.unit || ''}</b><button onClick={() => onRemove(idx)}>✕</button></span>
          ))}
        </div>
      )}
      <div className="win-kpi-add">
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        <input type="number" placeholder={`value${k.unit ? ' (' + k.unit + ')' : ''}`} value={val} onChange={(e) => setVal(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') add(); }} />
        <button className="btn btn-secondary btn-sm" onClick={add}>Log</button>
      </div>
    </div>
  );
}

function ReviewTab({ state, apply, nextReviewDue, reviewOverdue }: {
  state: WinState; apply: (mut: (s: WinState) => WinState) => void; nextReviewDue: string | null; reviewOverdue: boolean;
}) {
  const [summary, setSummary] = useState('');
  const log = () => {
    if (!summary.trim()) return;
    const r: Review = { id: uid(), date: todayISO(), summary: summary.trim() };
    apply((s) => ({ ...s, reviews: [r, ...s.reviews] }));
    setSummary('');
  };
  return (
    <>
      <div className={`win-review-status ${reviewOverdue ? 'due' : ''}`}>
        {nextReviewDue ? <>Next review due <b>{nextReviewDue}</b> {reviewOverdue && '· overdue'}</> : 'No review logged yet · cadence: quarterly (Council)'}
      </div>
      <div className="section-header"><h2>Run a review</h2><span className="note" style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text3)' }}>walk each pillar, capture the decisions</span></div>
      <div className="win-form">
        <p className="card-meta" style={{ marginBottom: 8 }}>Update initiative statuses on the Initiatives tab as you go, then capture what was decided here:</p>
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
          <button className="btn btn-sm btn-ghost" style={{ color: 'var(--red)', padding: '2px 0' }} onClick={() => apply((s) => ({ ...s, reviews: s.reviews.filter((x) => x.id !== r.id) }))}>Delete</button>
        </div>
      ))}
    </>
  );
}
