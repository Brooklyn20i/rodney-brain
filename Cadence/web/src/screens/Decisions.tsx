import React, { useMemo, useState } from 'react';
import { useCadence } from '../lib/store';
import type { Decision, DecisionStatus } from '../lib/types';
import { EmptyState, ScreenHeader, Modal } from '../components/bits';
import { fmtDate } from '../lib/util';

function NewDecision({ onClose }: { onClose: () => void }) {
  const { insert, logActivity } = useCadence();
  const [title, setTitle] = useState('');
  const [context, setContext] = useState('');
  const [due, setDue] = useState('');
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (!title.trim()) return;
    setBusy(true);
    try {
      await insert('decisions', { title: title.trim(), context: context.trim(), status: 'pending', due_date: due || null, outcome: '' } as Partial<Decision>);
      logActivity('add_decision', title.trim());
      onClose();
    } finally { setBusy(false); }
  };

  return (
    <Modal title="New Decision" onClose={onClose}
      footer={<>
        <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Add decision'}</button>
      </>}>
      <div className="form-group"><label className="field">Decision to make</label>
        <input type="text" autoFocus value={title} onChange={(e) => setTitle(e.target.value)} /></div>
      <div className="form-group"><label className="field">Context</label>
        <textarea value={context} onChange={(e) => setContext(e.target.value)} placeholder="What's at stake, options…" /></div>
      <div className="form-group"><label className="field">Decide by</label>
        <input type="date" value={due} onChange={(e) => setDue(e.target.value)} /></div>
    </Modal>
  );
}

function DecideModal({ decision, onClose }: { decision: Decision; onClose: () => void }) {
  const { update, logActivity } = useCadence();
  const [outcome, setOutcome] = useState(decision.outcome || '');
  const [busy, setBusy] = useState(false);

  const decide = async (status: DecisionStatus) => {
    setBusy(true);
    try {
      await update('decisions', decision.id, { status, outcome: outcome.trim() } as Partial<Decision>);
      logActivity('decide', `${decision.title}: ${status}`);
      onClose();
    } finally { setBusy(false); }
  };

  return (
    <Modal title={decision.title} onClose={onClose}
      footer={<>
        <button className="btn btn-secondary" onClick={() => decide('deferred')} disabled={busy}>Defer</button>
        <button className="btn btn-primary" onClick={() => decide('decided')} disabled={busy}>Mark decided</button>
      </>}>
      {decision.context && <p className="card-meta" style={{ marginBottom: 12 }}>{decision.context}</p>}
      <div className="form-group"><label className="field">Outcome</label>
        <textarea autoFocus value={outcome} onChange={(e) => setOutcome(e.target.value)} placeholder="What did you decide and why?" /></div>
    </Modal>
  );
}

const GROUPS: { status: DecisionStatus; label: string; color: string }[] = [
  { status: 'pending', label: 'Pending', color: 'var(--purple)' },
  { status: 'deferred', label: 'Deferred', color: 'var(--orange)' },
  { status: 'decided', label: 'Decided', color: 'var(--green)' },
];

export function Decisions({ onMenu }: { onMenu?: () => void }) {
  const { data } = useCadence();
  const [creating, setCreating] = useState(false);
  const [deciding, setDeciding] = useState<Decision | null>(null);
  const pending = useMemo(() => data.decisions.filter((d) => d.status === 'pending').length, [data]);

  return (
    <>
      <ScreenHeader title="Decisions" subtitle={`${pending} pending`} onMenu={onMenu}>
        <button className="btn btn-primary" onClick={() => setCreating(true)}>+ New Decision</button>
      </ScreenHeader>
      <div className="screen-content">
        {data.decisions.length === 0 && <EmptyState icon="⚖️" title="No decisions tracked" sub="Capture the calls you need to make." />}
        {GROUPS.map(({ status, label, color }) => {
          const items = data.decisions.filter((d) => d.status === status)
            .sort((a, b) => (a.due_date || '').localeCompare(b.due_date || ''));
          if (!items.length) return null;
          return (
            <React.Fragment key={status}>
              <div className="section-header"><h2>{label}</h2><span className="section-count" style={{ background: color }}>{items.length}</span></div>
              <div className="row-list">
                {items.map((d) => (
                  <button className="card card-compact card-clickable" key={d.id} onClick={() => setDeciding(d)}>
                    <div className="card-row" style={{ alignItems: 'flex-start' }}>
                      <div style={{ flex: 1, textAlign: 'left' }}>
                        <div className="card-title">{d.title}</div>
                        {d.outcome && <p className="card-meta" style={{ marginTop: 2 }}>→ {d.outcome}</p>}
                      </div>
                      {d.due_date && status === 'pending' && <span className="card-meta">{fmtDate(d.due_date)}</span>}
                    </div>
                  </button>
                ))}
              </div>
            </React.Fragment>
          );
        })}
      </div>
      {creating && <NewDecision onClose={() => setCreating(false)} />}
      {deciding && <DecideModal decision={deciding} onClose={() => setDeciding(null)} />}
    </>
  );
}
