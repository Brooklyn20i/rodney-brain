import { useState } from 'react';
import { useCadenceFinancial } from '../lib/store';
import { ScreenHeader, Card } from '../components/bits';
import { EVIDENCE_GRADE_LABEL, STRONG_EVIDENCE_GRADES, fmtDMY } from '../lib/util';
import type { EvidenceGrade, EvidenceStatus } from '../lib/types';

const STATUSES: EvidenceStatus[] = ['received', 'partial', 'missing', 'accepted'];

export function EvidenceRegister({ onMenu }: { onMenu: () => void }) {
  const { data, insert, update } = useCadenceFinancial();
  const [showForm, setShowForm] = useState(false);
  const [item, setItem] = useState('');
  const [period, setPeriod] = useState('');
  const [grade, setGrade] = useState<EvidenceGrade>('screenshot');
  const [source, setSource] = useState('');
  const [notes, setNotes] = useState('');

  const sorted = [...data.evidence_items].sort((a, b) => {
    const aWeak = STRONG_EVIDENCE_GRADES.has(a.grade) ? 1 : 0;
    const bWeak = STRONG_EVIDENCE_GRADES.has(b.grade) ? 1 : 0;
    if (aWeak !== bWeak) return aWeak - bWeak; // weak/missing first
    return b.period.localeCompare(a.period);
  });
  const missingCount = data.evidence_items.filter((e) => !STRONG_EVIDENCE_GRADES.has(e.grade)).length;

  const addEvidence = async () => {
    if (!item.trim() || !/^\d{4}-\d{2}$/.test(period.trim())) return;
    await insert('evidence_items', {
      item: item.trim(),
      period: period.trim(),
      grade,
      status: grade === 'stale_carry_forward' ? 'missing' : 'received',
      source: source.trim(),
      notes: notes.trim(),
    });
    setItem('');
    setSource('');
    setNotes('');
    setShowForm(false);
  };

  return (
    <>
      <ScreenHeader title="Evidence Register" subtitle="Every number, its evidence grade, and what's missing or stale." onMenu={onMenu}>
        {missingCount > 0 && <span className="grade-tag grade-weak">{missingCount} need attention</span>}
        <button className="btn btn-primary btn-sm" onClick={() => setShowForm((s) => !s)}>
          {showForm ? 'Cancel' : '+ New evidence'}
        </button>
      </ScreenHeader>
      <div className="screen-content">
        {showForm && (
          <Card title="New evidence item">
            <div className="wizard-grid">
              <div className="form-group">
                <label className="field">Item</label>
                <input type="text" value={item} placeholder="e.g. Super statement" onChange={(e) => setItem(e.target.value)} />
              </div>
              <div className="form-group">
                <label className="field">Period (YYYY-MM)</label>
                <input type="text" value={period} placeholder="2026-08" onChange={(e) => setPeriod(e.target.value)} />
              </div>
              <div className="form-group">
                <label className="field">Grade</label>
                <select value={grade} onChange={(e) => setGrade(e.target.value as EvidenceGrade)}>
                  {Object.entries(EVIDENCE_GRADE_LABEL).map(([k, label]) => (
                    <option key={k} value={k}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label className="field">Source</label>
                <input type="text" value={source} placeholder="e.g. Provider statement" onChange={(e) => setSource(e.target.value)} />
              </div>
              <div className="form-group">
                <label className="field">Notes</label>
                <input type="text" value={notes} onChange={(e) => setNotes(e.target.value)} />
              </div>
            </div>
            <button className="btn btn-primary" onClick={addEvidence}>
              Add evidence
            </button>
          </Card>
        )}

        <Card>
          <div className="cf-table-wrap">
            <table className="cf-table">
              <thead>
                <tr>
                  <th>Item</th>
                  <th>Period</th>
                  <th>Grade</th>
                  <th>Status</th>
                  <th>Source</th>
                  <th>Notes</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((e) => (
                  <tr key={e.id}>
                    <td>{e.item}</td>
                    <td>{e.period}</td>
                    <td>
                      <select
                        className="wizard-grade"
                        value={e.grade}
                        onChange={(ev) => update('evidence_items', e.id, { grade: ev.target.value as EvidenceGrade })}
                      >
                        {Object.entries(EVIDENCE_GRADE_LABEL).map(([k, label]) => (
                          <option key={k} value={k}>
                            {label}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <select
                        className="wizard-grade"
                        value={e.status}
                        onChange={(ev) => update('evidence_items', e.id, { status: ev.target.value as EvidenceStatus })}
                      >
                        {STATUSES.map((s) => (
                          <option key={s} value={s}>
                            {s}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td style={{ textAlign: 'left', fontSize: 12 }}>{e.source}</td>
                    <td style={{ textAlign: 'left', color: 'var(--text2)', fontSize: 12 }}>{e.notes}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {sorted.length === 0 && <p style={{ fontSize: 13, color: 'var(--text2)' }}>No evidence logged yet.</p>}
        </Card>
        <Card title="Grade legend">
          <ul style={{ listStyle: 'none', display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {Object.entries(EVIDENCE_GRADE_LABEL).map(([key, label]) => (
              <li key={key}>
                <span className={`grade-tag ${STRONG_EVIDENCE_GRADES.has(key) ? 'grade-strong' : 'grade-weak'}`}>{label}</span>
              </li>
            ))}
          </ul>
          <p style={{ fontSize: 11, color: 'var(--text3)', marginTop: 10 }}>
            Generated {fmtDMY(new Date().toISOString())} · screenshot/statement/broker/tax grades are
            treated as strong; market-repriced, stale, assumption and user-stated-scenario grades
            are flagged for follow-up.
          </p>
        </Card>
      </div>
    </>
  );
}
