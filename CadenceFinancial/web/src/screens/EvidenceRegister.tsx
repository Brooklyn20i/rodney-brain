import { useCadenceFinancial } from '../lib/store';
import { ScreenHeader, Card } from '../components/bits';
import { EVIDENCE_GRADE_LABEL, STRONG_EVIDENCE_GRADES, fmtDMY } from '../lib/util';

export function EvidenceRegister({ onMenu }: { onMenu: () => void }) {
  const { data } = useCadenceFinancial();
  const sorted = [...data.evidence_items].sort((a, b) => {
    const aWeak = STRONG_EVIDENCE_GRADES.has(a.grade) ? 1 : 0;
    const bWeak = STRONG_EVIDENCE_GRADES.has(b.grade) ? 1 : 0;
    if (aWeak !== bWeak) return aWeak - bWeak; // weak/missing first
    return b.period.localeCompare(a.period);
  });
  const missingCount = data.evidence_items.filter((e) => !STRONG_EVIDENCE_GRADES.has(e.grade)).length;

  return (
    <>
      <ScreenHeader title="Evidence Register" subtitle="Every number, its evidence grade, and what's missing or stale." onMenu={onMenu}>
        {missingCount > 0 && <span className="grade-tag grade-weak">{missingCount} need attention</span>}
      </ScreenHeader>
      <div className="screen-content">
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
                      <span className={`grade-tag ${STRONG_EVIDENCE_GRADES.has(e.grade) ? 'grade-strong' : 'grade-weak'}`}>
                        {EVIDENCE_GRADE_LABEL[e.grade] ?? e.grade}
                      </span>
                    </td>
                    <td>{e.status}</td>
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
