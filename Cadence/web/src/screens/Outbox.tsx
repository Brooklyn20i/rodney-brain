import React, { useMemo } from 'react';
import { useCadence } from '../lib/store';
import { EmptyState } from '../components/bits';
import type { OutboxEmail } from '../lib/types';

export function Outbox() {
  const { data, update } = useCadence();
  const messages = useMemo(() => data.outbox.filter((m) => !m.deleted_at).sort((a, b) => b.created_at.localeCompare(a.created_at)), [data.outbox]);

  return (
    <>
      <div className="screen-header"><div><h1>Outbox</h1><div className="subtitle">Approval queue only — Cadence does not send email automatically</div></div></div>
      <div className="screen-content">
        {messages.length === 0 ? <EmptyState icon="✉" title="Outbox empty" sub="Drafts will appear here for review before sending." /> : (
          <div className="row-list">
            {messages.map((m) => (
              <div className="card" key={m.id}>
                <div className="card-row"><span className={`tag ${m.status === 'queued' ? 'tag-action' : 'pri-low'}`}>{m.status}</span><div style={{ flex: 1 }}><div className="card-title">{m.subject || '(No subject)'}</div><div className="card-meta">To: {m.to}{m.cc ? ` · Cc: ${m.cc}` : ''}</div></div></div>
                {m.body && <pre className="email-preview">{m.body}</pre>}
                {m.status === 'queued' && <div className="button-row"><button className="btn btn-primary btn-sm" onClick={() => update('outbox', m.id, { status: 'sent', sent_at: new Date().toISOString(), sent_via: 'manual' } as Partial<OutboxEmail>)}>Mark sent manually</button><button className="btn btn-secondary btn-sm" onClick={() => update('outbox', m.id, { status: 'cancelled' } as Partial<OutboxEmail>)}>Cancel</button></div>}
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
