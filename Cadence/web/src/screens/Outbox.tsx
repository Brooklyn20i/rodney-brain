import React, { useState } from 'react';
import { useCadence } from '../lib/store';
import type { OutboxEmail, EmailStatus } from '../lib/types';
import { EmptyState, ScreenHeader, Modal } from '../components/bits';
import { fmtDMY } from '../lib/util';

function Compose({ existing, onClose }: { existing?: OutboxEmail; onClose: () => void }) {
  const { data, insert, update, logActivity } = useCadence();
  const [to, setTo] = useState(existing?.to || '');
  const [cc, setCc] = useState(existing?.cc || '');
  const [subject, setSubject] = useState(existing?.subject || '');
  const [body, setBody] = useState(existing?.body || '');
  const [proj, setProj] = useState(existing?.related_project_id || '');
  const [busy, setBusy] = useState(false);
  const save = async () => {
    if (!subject.trim() && !to.trim()) return;
    setBusy(true);
    try {
      const patch = { to: to.trim(), cc: cc.trim(), subject: subject.trim(), body, related_project_id: proj || null } as Partial<OutboxEmail>;
      if (existing) await update('outbox', existing.id, patch);
      else await insert('outbox', { ...patch, status: 'queued', related_work_item_id: null, created_by: 'you', sent_at: null, sent_via: null } as Partial<OutboxEmail>);
      logActivity('compose_email', subject.trim());
      onClose();
    } finally { setBusy(false); }
  };
  return (
    <Modal title={existing ? 'Edit Email' : 'Compose Email'} onClose={onClose}
      footer={<><button className="btn btn-secondary" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Queue to send'}</button></>}>
      <div className="form-row">
        <div className="form-group"><label>To</label>
          <input type="text" autoFocus value={to} placeholder="name@example.com" onChange={(e) => setTo(e.target.value)} /></div>
        <div className="form-group"><label>Cc (optional)</label>
          <input type="text" value={cc} onChange={(e) => setCc(e.target.value)} /></div>
      </div>
      <div className="form-group"><label>Subject</label>
        <input type="text" value={subject} onChange={(e) => setSubject(e.target.value)} /></div>
      <div className="form-group"><label>Message</label>
        <textarea value={body} placeholder="Write your email…" style={{ minHeight: 160 }} onChange={(e) => setBody(e.target.value)} /></div>
      <div className="form-group"><label>Related project (optional)</label>
        <select value={proj} onChange={(e) => setProj(e.target.value)}>
          <option value="">None</option>
          {data.projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select></div>
      <div style={{ background: 'var(--blue-bg)', border: '1px solid #C8DEF5', borderRadius: 8, padding: '10px 12px', fontSize: 12, color: 'var(--text2)' }}>
        ✉ This is queued in your Outbox. Your agent (with Gmail access) sends it and marks it sent — it syncs to all your devices.
      </div>
    </Modal>
  );
}

const STATUS_TAG: Record<EmailStatus, string> = { queued: 'est-queued', sent: 'est-sent', draft: 'est-draft', cancelled: 'est-cancelled' };
const GROUPS: { key: string; label: string; color: string; match: (s: EmailStatus) => boolean }[] = [
  { key: 'queued', label: 'Queued', color: 'var(--accent)', match: (s) => s === 'queued' },
  { key: 'sent', label: 'Sent', color: 'var(--green)', match: (s) => s === 'sent' },
  { key: 'other', label: 'Other', color: 'var(--text3)', match: (s) => s === 'draft' || s === 'cancelled' },
];

export function Outbox({ onMenu }: { onMenu?: () => void }) {
  const { data, update, remove, logActivity } = useCadence();
  const [composing, setComposing] = useState(false);
  const [editing, setEditing] = useState<OutboxEmail | null>(null);

  const markSent = (m: OutboxEmail) => { update('outbox', m.id, { status: 'sent', sent_at: new Date().toISOString() } as Partial<OutboxEmail>); logActivity('email_sent', m.subject); };

  return (
    <>
      <ScreenHeader title="Outbox" onMenu={onMenu}>
        <button className="btn btn-primary" onClick={() => setComposing(true)}>+ Compose</button>
      </ScreenHeader>
      <div className="screen-content">
        <div className="card card-compact" style={{ background: 'var(--blue-bg)', border: '1px solid #C8DEF5' }}>
          <p style={{ fontSize: 13, color: 'var(--text2)' }}>Compose here — your agent (with Gmail access) sends it and marks it sent. It syncs across all your devices. <strong>Cadence never emails directly.</strong></p>
        </div>
        {data.outbox.length === 0 && <EmptyState icon="✉" title="Outbox empty" sub="Compose an email to queue it" />}
        {GROUPS.map((g) => {
          const items = data.outbox.filter((m) => g.match(m.status));
          if (!items.length) return null;
          return (
            <React.Fragment key={g.key}>
              <div className="section-header"><h2>{g.label}</h2><span className="section-count" style={{ background: g.color }}>{items.length}</span></div>
              {items.map((m) => (
                <div className="email-item" key={m.id}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="ei-subject">{m.subject || '(no subject)'}</div>
                      <div className="ei-to">To: {m.to || '—'}{m.cc ? ' · Cc: ' + m.cc : ''}</div>
                    </div>
                    <span className={`tag ${STATUS_TAG[m.status]}`}>{m.status}</span>
                  </div>
                  {m.body && <div className="ei-body">{m.body}</div>}
                  <div className="card-actions">
                    {m.status === 'queued' && <button className="btn btn-sm" style={{ background: 'var(--green-bg)', color: 'var(--green)' }} onClick={() => markSent(m)}>Mark sent</button>}
                    {m.status === 'queued' && <button className="btn btn-secondary btn-sm" onClick={() => setEditing(m)}>Edit</button>}
                    {m.status !== 'sent' && <button className="btn btn-danger btn-sm" onClick={() => remove('outbox', m.id)}>Delete</button>}
                  </div>
                  {m.status === 'sent' && m.sent_at && <div className="card-meta">Sent {fmtDMY(m.sent_at)} {new Date(m.sent_at).toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' })}{m.sent_via ? ' · ' + m.sent_via : ''}</div>}
                </div>
              ))}
            </React.Fragment>
          );
        })}
      </div>
      {composing && <Compose onClose={() => setComposing(false)} />}
      {editing && <Compose existing={editing} onClose={() => setEditing(null)} />}
    </>
  );
}
