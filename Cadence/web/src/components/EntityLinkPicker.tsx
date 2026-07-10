import { useState } from 'react';
import { useCadence } from '../lib/store';
import type { RelatedEntity } from '../lib/types';

// Multi-link chips + pickers for people / projects / meeting notes — extracted
// from ItemModal so the Tasks hub detail panel and the modal share one
// implementation. Controlled: the parent owns the links array.
export function EntityLinkPicker({ links, onChange }: {
  links: RelatedEntity[];
  onChange: (next: RelatedEntity[]) => void;
}) {
  const { data, session } = useCadence();
  const [picker, setPicker] = useState<null | 'person' | 'project' | 'note'>(null);

  const people = data.people.filter((p) => !p.type || p.type === 'person');
  const myEmail = session?.user?.email?.toLowerCase();
  const mePerson = myEmail ? people.find((p) => p.email?.toLowerCase() === myEmail) : null;
  const meetingNotes = data.notes
    .filter((n) => n.folder?.startsWith('__mtg__'))
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .slice(0, 40);

  const addLink = (entity: RelatedEntity) => {
    if (!links.some((l) => l.id === entity.id)) onChange([...links, entity]);
    setPicker(null);
  };
  const removeLink = (id: string) => onChange(links.filter((l) => l.id !== id));

  const renderChip = (re: RelatedEntity) => {
    const icon = re.type === 'person' ? '👤' : re.type === 'project' ? '▤' : '📝';
    return (
      <span key={re.id} className={`link-chip link-chip-${re.type}`}>
        {icon} {re.name}
        <button className="link-chip-remove" onClick={() => removeLink(re.id)} title="Remove">✕</button>
      </span>
    );
  };

  return (
    <div className="link-chips-area">
      {links.length > 0 && (
        <div className="link-chips-list">
          {links.map(renderChip)}
        </div>
      )}
      <div className="link-add-row">
        {/* Person picker */}
        <div style={{ position: 'relative' }}>
          <button className="link-add-btn" onClick={() => setPicker((p) => p === 'person' ? null : 'person')}>+ Person</button>
          {picker === 'person' && (
            <>
              <div style={{ position: 'fixed', inset: 0, zIndex: 49 }} onClick={() => setPicker(null)} />
              <div className="link-picker">
                {mePerson && (
                  <button className={`link-picker-option link-picker-me${links.some((l) => l.id === mePerson.id) ? ' selected' : ''}`}
                    onClick={() => links.some((l) => l.id === mePerson.id) ? (removeLink(mePerson.id), setPicker(null)) : addLink({ type: 'person', id: mePerson.id, name: mePerson.name })}>
                    ★ Me ({mePerson.name})
                    {links.some((l) => l.id === mePerson.id) && <span className="link-picker-check">✓</span>}
                  </button>
                )}
                {people.map((p) => {
                  const sel = links.some((l) => l.id === p.id);
                  return (
                    <button key={p.id} className={`link-picker-option${sel ? ' selected' : ''}`}
                      onClick={() => sel ? (removeLink(p.id), setPicker(null)) : addLink({ type: 'person', id: p.id, name: p.name })}>
                      <span className="avatar" style={{ background: p.color || '#3A7CA5', width: 20, height: 20, fontSize: 9, flexShrink: 0 }}>
                        {p.name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('')}
                      </span>
                      {p.name}
                      {sel && <span className="link-picker-check">✓</span>}
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </div>
        {/* Project picker */}
        <div style={{ position: 'relative' }}>
          <button className="link-add-btn" onClick={() => setPicker((p) => p === 'project' ? null : 'project')}>+ Project</button>
          {picker === 'project' && (
            <>
              <div style={{ position: 'fixed', inset: 0, zIndex: 49 }} onClick={() => setPicker(null)} />
              <div className="link-picker">
                {data.projects.filter((p) => !p.deleted_at).map((p) => {
                  const sel = links.some((l) => l.id === p.id);
                  return (
                    <button key={p.id} className={`link-picker-option${sel ? ' selected' : ''}`}
                      onClick={() => sel ? (removeLink(p.id), setPicker(null)) : addLink({ type: 'project', id: p.id, name: p.name })}>
                      <span style={{ color: p.color || 'var(--accent)', fontSize: 11 }}>▤</span>
                      {p.name}
                      {sel && <span className="link-picker-check">✓</span>}
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </div>
        {/* Meeting note picker */}
        <div style={{ position: 'relative' }}>
          <button className="link-add-btn" onClick={() => setPicker((p) => p === 'note' ? null : 'note')}>+ Meeting</button>
          {picker === 'note' && (
            <>
              <div style={{ position: 'fixed', inset: 0, zIndex: 49 }} onClick={() => setPicker(null)} />
              <div className="link-picker">
                {meetingNotes.length === 0 && (
                  <div style={{ padding: '8px 12px', color: 'var(--text3)', fontSize: 13 }}>No meeting notes yet</div>
                )}
                {meetingNotes.map((n) => {
                  const sel = links.some((l) => l.id === n.id);
                  return (
                    <button key={n.id} className={`link-picker-option${sel ? ' selected' : ''}`}
                      onClick={() => sel ? (removeLink(n.id), setPicker(null)) : addLink({ type: 'note', id: n.id, name: n.title })}>
                      📝 {n.title}
                      {sel && <span className="link-picker-check">✓</span>}
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
