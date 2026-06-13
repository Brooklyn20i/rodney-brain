import React, { useMemo, useState } from 'react';
import { useCadence } from '../lib/store';
import type { OutboxEmail, EmailStatus } from '../lib/types';
import { EmptyState, ScreenHeader, Modal } from '../components/bits';

function NewDraft({ onClose }: { onClose: () => void }) {
  const { insert, logActivity } = useCadence();
  const [to, setTo] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);

  const save = async (status: EmailStatus) => {
    if (!subject.trim() && !to.trim()) return;
    setBusy(true);
    try {
      await insert('outbox', {
        to: to.trim(), cc: '', subject: subject.trim(), body, status,
        related_project_id: null, related_work_item_id: null, created_by: 'you',
        sent_at: status === 'sent' ? new Date().toISOString() : null, sent_via: null,
      } as Partial<OutboxEmail>);
      logActivity('draft_email', subject.trim());
      onClose();
    } finally { setBusy(false); }
  };

  return (
    <Modal title="New Message" onClose={onClose} wide
      footer={<>
        <button className="btn btn-secondary" onClick={() => save('draft')} disabled={busy}>Save draft</button>
        <button className="btn btn-primary" onClick={() => save('queued')} disabled={busy}>Queue to send</button>
      </>}>
      <div className="form-group"><label className="field">To</label>
        <input type="text" autoFocus value={to} onChange={(e) => setTo(e.target.value)} placeholder="name@company.com" /></div>
      <div className="form-group"><label className="field">Subject</label>
        <input type="text" value={subject} onChange={(e) => setSubject(e.target.value)} /></div>
      <div className="form-group"><label className="field">Body</label>
        <textarea value={body} onChange={(e) => setBody(e.target.value)} style={{ minHeight: 160 }} /></div>
    </Modal>
  );
}

const STATUS_META: Record<EmailStatus, { label: string; color: string }> = {
  draft: { label: 'Draft', color: 'var(--text3)' },
  queued: { label: 'Queued', color: 'var(--accent)' },
  sent: { label: 'Sent', color: 'var(--green)' },
  cancelled: { label: 'Cancelled', color: 'var(--red)' },
};
const ORDER: EmailStatus[] = ['queued', 'draft', 'sent', 'cancelled'];

export function Outbox({ onMenu }: { onMenu?: () => void }) {
  const { data, update, logActivity } = useCadence();
  const [creating, setCreating] = useState(false);
  const queued = useMemo(() => data.outbox.filter((m) => m.status === 'queued').length, [data]);

  const setStatus = (m: OutboxEmail, status: EmailStatus) => {
    update('outbox', m.id, { status, sent_at: status === 'sent' ? new Date().toISOString() : m.sent_at } as Partial<OutboxEmail>);
    logActivity('email_' + status, m.subject);
  };

  return (
    <>
      <ScreenHeader title="Outbox" subtitle={`${queued} queued`} onMenu={onMenu}>
        <button className="btn btn-primary" onClick={() => setCreating(true)}>+ New Message</button>
      </ScreenHeader>
      <div className="screen-content">
        {data.outbox.length === 0 && <EmptyState icon="✉️" title="Outbox empty" sub="Draft and queue messages here." />}
        {ORDER.map((status) => {
          const items = data.outbox.filter((m) => m.status === status);
          if (!items.length) return null;
          const meta = STATUS_META[status];
          return (
            <React.Fragment key={status}>
              <div className="section-header"><h2>{meta.label}</h2><span className="section-count" style={{ background: meta.color }}>{items.length}</span></div>
              <div className="row-list">
                {items.map((m) => (
                  <div className="card card-compact" key={m.id}>
                    <div className="card-row" style={{ alignItems: 'flex-start' }}>
                      <div style={{ flex: 1 }}>
                        <div className="card-title">{m.subject || '(no subject)'}</div>
                        <p className="card-meta" style={{ marginTop: 2 }}>To: {m.to || '—'}</p>
                        {m.body && <p className="card-meta" style={{ marginTop: 4 }}>{m.body.slice(0, 120)}{m.body.length > 120 ? '…' : ''}</p>}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                      {status !== 'sent' && <button className="btn btn-sm btn-primary" onClick={() => setStatus(m, 'sent')}>Mark sent</button>}
                      {status === 'queued' && <button className="btn btn-sm btn-ghost" onClick={() => setStatus(m, 'draft')}>Unqueue</button>}
                      {status === 'draft' && <button className="btn btn-sm btn-secondary" onClick={() => setStatus(m, 'queued')}>Queue</button>}
                      {status !== 'cancelled' && status !== 'sent' && <button className="btn btn-sm btn-ghost" onClick={() => setStatus(m, 'cancelled')}>Cancel</button>}
                    </div>
                  </div>
                ))}
              </div>
            </React.Fragment>
          );
        })}
      </div>
      {creating && <NewDraft onClose={() => setCreating(false)} />}
    </>
  );
}
