import React, { useMemo, useState } from 'react';
import { useCadence } from '../lib/store';
import { ScreenHeader } from '../components/bits';

interface Hit { id: string; tag: string; tagCls: string; title: string; meta?: string; }

export function Search({ onMenu }: { onMenu?: () => void }) {
  const { data } = useCadence();
  const [q, setQ] = useState('');

  const hits = useMemo<Hit[]>(() => {
    const term = q.trim().toLowerCase();
    if (!term) return [];
    const m = (s?: string) => !!s && s.toLowerCase().includes(term);
    const out: Hit[] = [];
    data.work_items.forEach((w) => { if (m(w.title) || m(w.notes)) out.push({ id: w.id, tag: 'Item', tagCls: 'tag-task', title: w.title, meta: w.done ? 'Done' : 'Open' }); });
    data.decisions.forEach((d) => { if (m(d.title) || m(d.context)) out.push({ id: d.id, tag: 'Decision', tagCls: 'tag-decision', title: d.title, meta: d.status }); });
    data.projects.forEach((p) => { if (m(p.name) || m(p.goal)) out.push({ id: p.id, tag: 'Project', tagCls: 'tag-info', title: p.name, meta: p.goal }); });
    data.people.forEach((p) => { if ((!p.type || p.type === 'person') && (m(p.name) || m(p.role))) out.push({ id: p.id, tag: 'Person', tagCls: 'tag-action', title: p.name, meta: p.role }); });
    data.people.forEach((p) => { if (p.type === 'meeting_group' && (m(p.name) || m(p.notes))) out.push({ id: p.id, tag: 'Meeting', tagCls: 'tag-info', title: p.name, meta: p.notes }); });
    return out;
  }, [q, data]);

  return (
    <>
      <ScreenHeader title="Search" onMenu={onMenu} />
      <div className="screen-content">
        <div className="search-bar-wrap">
          <input id="search-input" autoFocus value={q} placeholder="Search everything…" onChange={(e) => setQ(e.target.value)} />
        </div>
        {!q.trim() ? (
          <div className="empty-state"><div className="icon">⌕</div><p>Type to search</p><small>Searches items, decisions, projects and people</small></div>
        ) : hits.length === 0 ? (
          <div className="empty-state"><p>No results for "{q.trim()}"</p></div>
        ) : hits.map((h) => (
          <div className="search-result-item" key={h.tag + h.id}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <span className={`tag ${h.tagCls}`}>{h.tag}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="sr-title">{h.title}</div>
                {h.meta && <div className="sr-meta">{h.meta}</div>}
              </div>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
