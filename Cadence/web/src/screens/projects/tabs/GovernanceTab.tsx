import { useMemo, useState } from 'react';
import { useCadence } from '../../../lib/store';
import type { Project, ProjectUpdate, Health, WorkItem, RaidItem, Stakeholder } from '../../../lib/types';
import { ItemModal } from '../../../components/ItemModal';
import { healthIcon, fmtDMY } from '../../../lib/util';
import { HEALTH_OPTIONS } from '../../../lib/health';
import { isLinkedToProject } from '../../../lib/tasks';

const RAID_KINDS: RaidItem['kind'][] = ['risk', 'assumption', 'issue', 'dependency'];
const RAID_LABEL: Record<RaidItem['kind'], string> = { risk: 'Risk', assumption: 'Assumption', issue: 'Issue', dependency: 'Dependency' };
const RACI_LABEL: Record<Stakeholder['raci'], string> = { R: 'Responsible', A: 'Accountable', C: 'Consulted', I: 'Informed' };

// Status updates — post a new one (optionally moving health) + history.
function Updates({ project }: { project: Project }) {
  const { data, insert, update, logActivity } = useCadence();
  const updates = useMemo(() => data.project_updates.filter((u) => u.project_id === project.id)
    .sort((a, b) => b.created_at.localeCompare(a.created_at)), [data.project_updates, project.id]);
  const [text, setText] = useState('');
  const [health, setHealth] = useState<'' | Health>('');
  const [busy, setBusy] = useState(false);

  const post = async () => {
    if (!text.trim()) return;
    setBusy(true);
    try {
      await insert('project_updates', { project_id: project.id, text: text.trim(), health: health || project.health, author: 'you' } as Partial<ProjectUpdate>);
      if (health) await update('projects', project.id, { health } as Partial<Project>);
      logActivity('project_update', project.name);
      setText(''); setHealth('');
    } finally { setBusy(false); }
  };

  return (
    <div className="detail-section">
      <h3>Status updates</h3>
      <div className="proj-update-form">
        <textarea className="proj-update-textarea" value={text}
          placeholder="What's the latest? What moved, what's blocked, what's next?"
          onChange={(e) => setText(e.target.value)} rows={4} />
        <div className="proj-update-controls">
          <select value={health} onChange={(e) => setHealth(e.target.value as Health | '')} style={{ flex: 1 }}>
            <option value="">— health unchanged —</option>
            {HEALTH_OPTIONS.map((h) => <option key={h.v} value={h.v}>{h.label}</option>)}
          </select>
          <button className="btn btn-primary" onClick={post} disabled={busy || !text.trim()}>
            {busy ? 'Posting…' : 'Post Update'}
          </button>
        </div>
      </div>
      {updates.length > 0
        ? updates.map((u) => (
          <div className="update-row" key={u.id}>
            <div className="ur-date">
              {fmtDMY(u.created_at)}
              {u.health ? ' · ' + healthIcon(u.health) : ''}
            </div>
            <div className="ur-text">{u.text}</div>
          </div>
        ))
        : <p style={{ color: 'var(--text3)', fontSize: 13, textAlign: 'center', padding: '20px 0' }}>No updates yet — post the first one above.</p>}
    </div>
  );
}

function Stakeholders({ project, rows }: { project: Project; rows: Stakeholder[] }) {
  const { data, insert, remove } = useCadence();
  const [personId, setPersonId] = useState('');
  const [name, setName] = useState('');
  const [raci, setRaci] = useState<Stakeholder['raci']>('I');
  const [addErr, setAddErr] = useState('');
  const add = async () => {
    const pname = personId ? (data.people.find((p) => p.id === personId)?.name || '') : name.trim();
    if (!pname) return;
    setAddErr('');
    try {
      await insert('stakeholders', { project_id: project.id, person_id: personId || null, name: pname, raci } as Partial<Stakeholder>);
      setPersonId(''); setName('');
    } catch { setAddErr('Could not save — try again.'); }
  };
  return (
    <div className="detail-section">
      <h3>Stakeholders (RACI)</h3>
      {rows.map((s) => (
        <div className="work-item-row" key={s.id}>
          <span className={`raci-badge raci-${s.raci}`}>{s.raci}</span>
          <span className="wi-title">{s.name}</span>
          <span className="card-meta">{RACI_LABEL[s.raci]}</span>
          <button className="btn-icon" onClick={() => remove('stakeholders', s.id)}>✕</button>
        </div>
      ))}
      {!rows.length && <small style={{ color: 'var(--text3)' }}>No stakeholders yet</small>}
      {addErr && <small style={{ color: 'var(--red)', display: 'block', marginTop: 4 }}>{addErr}</small>}
      <div className="form-row" style={{ marginTop: 8, gap: 6 }}>
        <select value={personId} onChange={(e) => setPersonId(e.target.value)}>
          <option value="">Person…</option>
          {data.people.filter((p) => !p.type || p.type === 'person').map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        {!personId && <input type="text" placeholder="or name" value={name} onChange={(e) => setName(e.target.value)} />}
        <select value={raci} onChange={(e) => setRaci(e.target.value as Stakeholder['raci'])} style={{ maxWidth: 140 }}>
          {(['R', 'A', 'C', 'I'] as const).map((r) => <option key={r} value={r}>{r} · {RACI_LABEL[r]}</option>)}
        </select>
        <button className="btn btn-ghost btn-sm" onClick={add}>+ Add</button>
      </div>
    </div>
  );
}

function Raid({ project, rows }: { project: Project; rows: RaidItem[] }) {
  const { insert, update, remove } = useCadence();
  const [kind, setKind] = useState<RaidItem['kind']>('risk');
  const [text, setText] = useState('');
  const [severity, setSeverity] = useState<RaidItem['severity']>('medium');
  const [addErr, setAddErr] = useState('');
  const add = async () => {
    if (!text.trim()) return;
    setAddErr('');
    try {
      await insert('raid_items', { project_id: project.id, kind, text: text.trim(), severity, status: 'open', owner: '' } as Partial<RaidItem>);
      setText('');
    } catch { setAddErr('Could not save — try again.'); }
  };
  const openItems = rows.filter((r) => r.status === 'open');
  return (
    <div className="detail-section">
      <h3>RAID ({openItems.length} open)</h3>
      {RAID_KINDS.map((k) => {
        const items = rows.filter((r) => r.kind === k);
        if (!items.length) return null;
        return (
          <div key={k} style={{ marginBottom: 8 }}>
            <div className="raid-kind">{RAID_LABEL[k]}s</div>
            {items.map((r) => (
              <div className={`raid-row ${r.status === 'closed' ? 'closed' : ''}`} key={r.id}>
                <span className={`sev-dot sev-${r.severity}`} title={r.severity} />
                <span className="raid-text">{r.text}</span>
                <button className="btn btn-ghost btn-sm" onClick={() => update('raid_items', r.id, { status: r.status === 'open' ? 'closed' : 'open' } as Partial<RaidItem>)}>{r.status === 'open' ? 'Close' : 'Reopen'}</button>
                <button className="btn-icon" onClick={() => remove('raid_items', r.id)}>✕</button>
              </div>
            ))}
          </div>
        );
      })}
      {!rows.length && <small style={{ color: 'var(--text3)' }}>No RAID items</small>}
      {addErr && <small style={{ color: 'var(--red)', display: 'block', marginTop: 4 }}>{addErr}</small>}
      <div className="form-row" style={{ marginTop: 8, gap: 6 }}>
        <select value={kind} onChange={(e) => setKind(e.target.value as RaidItem['kind'])} style={{ maxWidth: 130 }}>
          {RAID_KINDS.map((k) => <option key={k} value={k}>{RAID_LABEL[k]}</option>)}
        </select>
        <input type="text" placeholder="Describe…" value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') add(); }} />
        <select value={severity} onChange={(e) => setSeverity(e.target.value as RaidItem['severity'])} style={{ maxWidth: 110 }}>
          <option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option>
        </select>
        <button className="btn btn-ghost btn-sm" onClick={add}>+ Add</button>
      </div>
    </div>
  );
}

// Governance: the project's paper trail — status updates, RACI, RAID, links
// and completed work. (The old "Advanced" junk drawer, given a real name and
// the updates history it always should have held.)
export function GovernanceTab({ project }: { project: Project }) {
  const { data } = useCadence();
  const [editingItem, setEditingItem] = useState<WorkItem | null>(null);
  const raid = useMemo(() => data.raid_items.filter((r) => r.project_id === project.id), [data.raid_items, project.id]);
  const stake = useMemo(() => data.stakeholders.filter((s) => s.project_id === project.id), [data.stakeholders, project.id]);
  const links = useMemo(() => data.links.filter((l) => l.parent_type === 'project' && l.parent_id === project.id), [data.links, project.id]);
  const closed = useMemo(() => data.work_items.filter((w) => isLinkedToProject(w, project.id) && w.done), [data.work_items, project.id]);

  return (
    <div>
      <Updates project={project} />
      <Stakeholders project={project} rows={stake} />
      <Raid project={project} rows={raid} />
      {(links.length > 0) && (
        <div className="detail-section">
          <h3>Files &amp; Links</h3>
          {links.map((l) => <div className="link-row" key={l.id}>🔗 <a href={l.url} target="_blank" rel="noreferrer">{l.title || l.url}</a></div>)}
        </div>
      )}
      {closed.length > 0 && (
        <div className="detail-section">
          <h3>Completed ({closed.length})</h3>
          {closed.map((w) => (
            <div className="work-item-row" key={w.id} style={{ opacity: 0.65 }}>
              <span style={{ color: 'var(--green)', fontSize: 13 }}>✓</span>
              <span className="wi-title done" style={{ flex: 1 }}>{w.title}</span>
              <button className="btn-icon" onClick={() => setEditingItem(w)}>✎</button>
            </div>
          ))}
        </div>
      )}
      {editingItem && <ItemModal existing={editingItem} onClose={() => setEditingItem(null)} />}
    </div>
  );
}
