import React, { useMemo, useState } from 'react';
import { useCadence } from '../lib/store';
import type { Note } from '../lib/types';
import { ScreenHeader } from '../components/bits';
import {
  WIN_TITLE, WIN_TAGLINE, WIN_ASPIRATION, WIN_CORE_MESSAGE, WIN_OPERATING_RULE,
  WIN_PILLARS, WIN_SHIFTS, WIN_KPIS, emptyWinState,
} from '../lib/strategy';
import type { WinState } from '../lib/strategy';

export const WIN_STATE_TITLE = '__win_state__';

function useWinState(): [WinState, (next: Partial<WinState>) => void] {
  const { data, insert, update } = useCadence();
  const stateNote = data.notes.find((n) => n.title === WIN_STATE_TITLE);
  const state = useMemo<WinState>(() => {
    try { return { ...emptyWinState(), ...JSON.parse(stateNote?.body || '{}') }; }
    catch { return emptyWinState(); }
  }, [stateNote]);

  const setState = (next: Partial<WinState>) => {
    const merged: WinState = {
      shifts: { ...state.shifts, ...(next.shifts || {}) },
      kpis: { ...state.kpis, ...(next.kpis || {}) },
      links: { ...state.links, ...(next.links || {}) },
    };
    const body = JSON.stringify(merged);
    if (stateNote) update('notes', stateNote.id, { body } as Partial<Note>);
    else insert('notes', { title: WIN_STATE_TITLE, body } as Partial<Note>);
  };
  return [state, setState];
}

function Bar({ pct, color }: { pct: number; color: string }) {
  return (
    <div className="win-bar"><div className="win-bar-fill" style={{ width: `${Math.max(0, Math.min(100, pct))}%`, background: color }} /></div>
  );
}

export function Win({ onMenu }: { onMenu?: () => void }) {
  const { data } = useCadence();
  const [state, setState] = useWinState();
  const projects = useMemo(() => data.projects.filter((p) => p.status === 'active'), [data.projects]);
  const linkedCount = projects.filter((p) => state.links[p.id]).length;

  // local edit buffers so we save on blur, not every keystroke
  const [kpiDraft, setKpiDraft] = useState<Record<string, string>>({});

  return (
    <>
      <ScreenHeader title="WIN" subtitle="Commercial Technology Strategy" onMenu={onMenu} />
      <div className="screen-content">

        {/* Hero */}
        <div className="win-hero">
          <div className="win-hero-tag">{WIN_TAGLINE}</div>
          <h2>{WIN_TITLE}</h2>
          <div className="win-aspiration">
            <small>Winning Aspiration</small>
            <p>{WIN_ASPIRATION}</p>
          </div>
          <p className="win-core">{WIN_CORE_MESSAGE}</p>
        </div>

        {/* Scoreboard */}
        <div className="section-header"><h2>Scoreboard</h2><span className="section-count" style={{ background: 'var(--accent)' }}>{WIN_KPIS.length}</span></div>
        <div className="win-kpi-grid">
          {WIN_KPIS.map((k) => {
            const raw = kpiDraft[k.id] ?? state.kpis[k.id] ?? '';
            const cur = parseFloat(raw);
            const pct = k.target && !isNaN(cur)
              ? ((cur - (k.baseline || 0)) / (k.target - (k.baseline || 0))) * 100
              : 0;
            return (
              <div className={`win-kpi ${k.headline ? 'headline' : ''}`} key={k.id}>
                {k.headline && <span className="win-kpi-flag">Headline KPI</span>}
                <div className="win-kpi-name">{k.name}</div>
                <div className="win-kpi-proves">{k.proves}</div>
                <div className="win-kpi-input-row">
                  <input
                    className="win-kpi-input"
                    placeholder={k.target ? '—' : 'e.g. per workflow'}
                    value={raw}
                    onChange={(e) => setKpiDraft((d) => ({ ...d, [k.id]: e.target.value }))}
                    onBlur={() => setState({ kpis: { [k.id]: raw } })}
                  />
                  {k.unit && <span className="win-kpi-unit">{k.unit}</span>}
                  <span className="win-kpi-target">target {k.targetLabel}</span>
                </div>
                {k.target ? <Bar pct={pct} color={pct >= 100 ? 'var(--green)' : 'var(--accent)'} /> : null}
              </div>
            );
          })}
        </div>

        {/* Where we play */}
        <div className="section-header"><h2>Where We Play</h2><span className="section-count" style={{ background: 'var(--purple)' }}>{WIN_PILLARS.length}</span></div>
        <div className="win-pillars">
          {WIN_PILLARS.map((p, i) => (
            <div className="win-pillar" key={p.id}>
              <div className="win-pillar-num">{i + 1}</div>
              <div><div className="win-pillar-name">{p.name}</div><div className="win-pillar-detail">{p.detail}</div></div>
            </div>
          ))}
        </div>

        {/* How we win — the shifts */}
        <div className="section-header"><h2>How We Win — The Shifts</h2></div>
        {WIN_SHIFTS.map((s) => {
          const pct = state.shifts[s.id] ?? 0;
          return (
            <div className="win-shift" key={s.id}>
              <div className="win-shift-row">
                <span className="win-shift-from">{s.from}</span>
                <span className="win-shift-arrow">→</span>
                <span className="win-shift-to">{s.to}</span>
              </div>
              <div className="win-shift-control">
                <input type="range" min={0} max={100} value={pct}
                  onChange={(e) => setState({ shifts: { [s.id]: Number(e.target.value) } })} />
                <span className="win-shift-pct">{pct}%</span>
              </div>
            </div>
          );
        })}

        {/* Initiatives → KPIs */}
        <div className="section-header"><h2>Initiatives → Outcomes</h2>
          <span className="section-count" style={{ background: linkedCount === projects.length ? 'var(--green)' : 'var(--orange)' }}>{linkedCount}/{projects.length}</span>
        </div>
        <p className="win-rule"><strong>Operating rule:</strong> {WIN_OPERATING_RULE}</p>
        {projects.length === 0 ? (
          <p className="card-meta">No active projects yet. Initiatives are your active Projects — add them in Projects and link each to the KPI it moves.</p>
        ) : projects.map((p) => {
          const linked = state.links[p.id] || '';
          return (
            <div className="win-initiative" key={p.id}>
              <span className="win-init-dot" style={{ background: p.color || 'var(--accent)' }} />
              <div className="win-init-name">{p.name}</div>
              {!linked && <span className="win-init-warn">⚠ No KPI</span>}
              <select className="win-init-select" value={linked} onChange={(e) => setState({ links: { [p.id]: e.target.value } })}>
                <option value="">— Link a KPI —</option>
                {WIN_KPIS.map((k) => <option key={k.id} value={k.id}>{k.name}</option>)}
              </select>
            </div>
          );
        })}
        <p className="win-foot">If an initiative does not move a KPI, it should not be prioritised.</p>
      </div>
    </>
  );
}
