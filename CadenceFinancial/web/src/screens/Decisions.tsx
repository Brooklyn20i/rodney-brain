import { useState } from 'react';
import { useCadenceFinancial } from '../lib/store';
import { ScreenHeader, Card } from '../components/bits';
import { APPROVAL_STATUS_LABEL, OWNER_LENS_LABEL, fmtDMY } from '../lib/util';
import type { DecisionApprovalStatus, OwnerLens } from '../lib/types';

export function Decisions({ onMenu }: { onMenu: () => void }) {
  const { data, insert, update } = useCadenceFinancial();
  const [showForm, setShowForm] = useState(false);
  const [question, setQuestion] = useState('');
  const [area, setArea] = useState('');
  const [lens, setLens] = useState<OwnerLens>('rodney');

  const sorted = [...data.decisions].sort((a, b) => {
    const order: DecisionApprovalStatus[] = ['open', 'blocked', 'clarified', 'approved', 'implemented'];
    return order.indexOf(a.approval_status) - order.indexOf(b.approval_status);
  });

  const addDecision = async () => {
    if (!question.trim()) return;
    await insert('decisions', {
      decision_area: area.trim() || 'General',
      question: question.trim(),
      options: '',
      recommended_position: '',
      approval_status: 'open',
      owner_lens: lens,
      decision_date: null,
      evidence_link: '',
      follow_up_action: '',
    });
    setQuestion('');
    setArea('');
    setShowForm(false);
  };

  const resolve = (id: string) => update('decisions', id, { approval_status: 'approved', decision_date: new Date().toISOString().slice(0, 10) });

  return (
    <>
      <ScreenHeader title="Needs Rodney" subtitle="Decisions, missing approvals and evidence gates." onMenu={onMenu}>
        <button className="btn btn-primary btn-sm" onClick={() => setShowForm((s) => !s)}>
          {showForm ? 'Cancel' : '+ New decision'}
        </button>
      </ScreenHeader>
      <div className="screen-content">
        {showForm && (
          <Card title="New decision">
            <div className="form-group">
              <label className="field">Decision area</label>
              <input type="text" value={area} placeholder="e.g. Liquidity policy" onChange={(e) => setArea(e.target.value)} />
            </div>
            <div className="form-group">
              <label className="field">Question</label>
              <input type="text" value={question} placeholder="What needs deciding?" onChange={(e) => setQuestion(e.target.value)} />
            </div>
            <div className="form-group" style={{ maxWidth: 260 }}>
              <label className="field">Owner lens</label>
              <select value={lens} onChange={(e) => setLens(e.target.value as OwnerLens)}>
                {Object.entries(OWNER_LENS_LABEL).map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
            <button className="btn btn-primary" onClick={addDecision}>
              Add decision
            </button>
          </Card>
        )}

        {sorted.length === 0 ? (
          <Card>Nothing needs Rodney right now.</Card>
        ) : (
          sorted.map((d) => (
            <Card key={d.id}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                <div>
                  <span className={`grade-tag status-${d.approval_status}`}>{APPROVAL_STATUS_LABEL[d.approval_status] ?? d.approval_status}</span>{' '}
                  <span className="grade-tag">{OWNER_LENS_LABEL[d.owner_lens] ?? d.owner_lens}</span>
                  <div style={{ fontWeight: 700, marginTop: 8 }}>{d.decision_area}</div>
                  <div style={{ fontSize: 14, marginTop: 2 }}>{d.question}</div>
                  {d.recommended_position && (
                    <div style={{ fontSize: 13, color: 'var(--text2)', marginTop: 6 }}>
                      Recommended: {d.recommended_position}
                    </div>
                  )}
                  {d.follow_up_action && (
                    <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 4 }}>Next: {d.follow_up_action}</div>
                  )}
                  {d.decision_date && (
                    <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 4 }}>Decided {fmtDMY(d.decision_date)}</div>
                  )}
                </div>
                {d.approval_status !== 'approved' && d.approval_status !== 'implemented' && (
                  <button className="btn btn-secondary btn-sm" onClick={() => resolve(d.id)}>
                    Mark approved
                  </button>
                )}
              </div>
            </Card>
          ))
        )}
      </div>
    </>
  );
}
