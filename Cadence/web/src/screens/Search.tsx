import React, { useMemo, useState } from 'react';
import { useCadence } from '../lib/store';
import { EmptyState, ScreenHeader } from '../components/bits';

interface Hit { id: string; kind: string; title: string; sub?: string; }

export function Search({ onMenu }: { onMenu?: () => void }) {
  const { data } = useCadence();
  const [q, setQ] = useState('');

  const hits = useMemo<Hit[]>(() => {
    const term = q.trim().toLowerCase();
    if (term.length < 2) return [];
    const m = (s?: string) => !!s && s.toLowerCase().includes(term);
    const out: Hit[] = [];
    data.work_items.forEach((w) => { if (m(w.title) || m(w.notes)) out.push({ id: w.id, kind: 'Task', title: w.title, sub: w.done ? 'Done' : 'Open' }); });
    data.projects.forEach((p) => { if (m(p.name) || m(p.goal)) out.push({ id: p.id, kind: 'Project', title: p.name, sub: p.goal }); });
    data.people.forEach((p) => { if (m(p.name) || m(p.role) || m(p.email)) out.push({ id: p.id, kind: 'Person', title: p.name, sub: p.role }); });
    data.decisions.forEach((d) => { if (m(d.title) || m(d.context) || m(d.outcome)) out.push({ id: d.id, kind: 'Decision', title: d.title, sub: d.status }); });
    data.notes.forEach((n) => { if (m(n.title) || m(n.body)) out.push({ id: n.id, kind: 'Note', title: n.title, sub: n.body.slice(0, 80) }); });
    data.outbox.forEach((e) => { if (m(e.subject) || m(e.body) || m(e.to)) out.push({ id: e.id, kind: 'Email', title: e.subject || '(no subject)', sub: e.to }); });
    return out;
  }, [q, data]);

  return (
    <>
      <ScreenHeader title="Search" onMenu={onMenu} />
      <div className="screen-content">
        <div className="form-group">
          <input type="text" autoFocus value={q} placeholder="Search everything…" onChange={(e) => setQ(e.target.value)} />
        </div>
        {q.trim().length < 2 ? (
          <EmptyState icon="🔍" title="Search across Cadence" sub="Tasks, projects, people, decisions, notes and emails." />
        ) : hits.length === 0 ? (
          <EmptyState icon="🤷" title="No matches" sub={`Nothing found for “${q.trim()}”.`} />
        ) : (
          <div className="row-list">
            {hits.map((h) => (
              <div className="card card-compact" key={h.kind + h.id}>
                <div className="card-row">
                  <span className="tag tag-task">{h.kind}</span>
                  <div style={{ flex: 1 }}>
                    <div className="card-title">{h.title}</div>
                    {h.sub && <p className="card-meta" style={{ marginTop: 2 }}>{h.sub}</p>}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
