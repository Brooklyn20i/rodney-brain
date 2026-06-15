import React, { useMemo, useState } from 'react';
import { useCadence } from '../lib/store';
import type { Note, OutboxEmail, Person } from '../lib/types';
import type { MeetingData } from './MeetingNoteModal';

type Tab = 'full' | 'actions' | 'agenda';

// ── HTML generator (inline styles so it pastes cleanly into OneNote/Word) ─────
function generateHtml(data: MeetingData, title: string, person: Person, createdAt: string, tab: Tab): string {
  const dateStr = new Date(createdAt).toLocaleDateString('en-GB', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });
  const generatedOn = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  const firstName = person.name.split(' ')[0];

  const sectionHead = (label: string) =>
    `<h2 style="font-family:Calibri,Segoe UI,sans-serif;font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#217346;border-bottom:2px solid #217346;padding-bottom:5px;margin:22px 0 12px;">${label}</h2>`;

  // ── Agenda ──────────────────────────────────────────────────────────────────
  const agendaSection = (() => {
    if (tab === 'actions') return '';
    const covered = data.agenda.filter((a) => a.status === 'covered');
    const toDiscuss = data.agenda.filter((a) => a.status === 'discuss');
    const deferred = data.agenda.filter((a) => a.status === 'deferred');
    if (!covered.length && !toDiscuss.length && !deferred.length) return '';

    const itemHtml = (icon: string, a: { title: string; notes: string }) =>
      `<div style="display:flex;gap:10px;margin-bottom:9px;align-items:flex-start;">
        <span style="font-size:14px;line-height:1.4;">${icon}</span>
        <div>
          <div style="font-family:Calibri,Segoe UI,sans-serif;font-size:14px;font-weight:600;color:#1A1A1A;">${a.title}</div>
          ${a.notes ? `<div style="font-family:Calibri,Segoe UI,sans-serif;font-size:12px;color:#666;margin-top:2px;font-style:italic;">${a.notes}</div>` : ''}
        </div>
      </div>`;

    const deferredBlock = deferred.length
      ? `<div style="background:#FFF8EE;border-radius:6px;padding:9px 12px;margin-top:8px;border-left:3px solid #E07D00;">
          <div style="font-family:Calibri,Segoe UI,sans-serif;font-size:11px;font-weight:700;color:#E07D00;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:5px;">Deferred to next meeting</div>
          ${deferred.map((a) => `<div style="font-family:Calibri,Segoe UI,sans-serif;font-size:13px;color:#E07D00;">⏭ ${a.title}</div>`).join('')}
        </div>`
      : '';

    return sectionHead('Agenda')
      + covered.map((a) => itemHtml('✅', a)).join('')
      + toDiscuss.map((a) => itemHtml('💬', a)).join('')
      + deferredBlock;
  })();

  // ── Actions ─────────────────────────────────────────────────────────────────
  const actionsSection = (() => {
    if (tab === 'agenda') return '';
    if (!data.actions.length) return '';

    const rows = data.actions.map((a) => {
      const isMe = a.owner === 'me';
      const ownerName = isMe ? 'Rodney' : firstName;
      const ownerColor = isMe ? '#6B3FA0' : '#1A7F37';
      const ownerBg = isMe ? '#F3EEFA' : '#EDFAF1';
      const borderColor = isMe ? '#1B5E9E' : '#217346';
      const dueStr = a.due
        ? new Date(a.due).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
        : '';
      return `<div style="display:flex;gap:10px;padding:9px 12px;border-radius:7px;background:#F8F8F6;border-left:3px solid ${borderColor};margin-bottom:8px;align-items:flex-start;">
        <span style="background:${ownerBg};color:${ownerColor};font-family:Calibri,Segoe UI,sans-serif;font-size:11px;font-weight:700;padding:2px 8px;border-radius:8px;white-space:nowrap;flex-shrink:0;margin-top:2px;">${ownerName}</span>
        <div>
          <div style="font-family:Calibri,Segoe UI,sans-serif;font-size:14px;font-weight:600;color:#1A1A1A;${a.done ? 'text-decoration:line-through;opacity:0.6;' : ''}">${a.title}</div>
          ${dueStr ? `<div style="font-family:Calibri,Segoe UI,sans-serif;font-size:11px;color:#666;margin-top:2px;">Due ${dueStr}</div>` : ''}
        </div>
      </div>`;
    });

    return sectionHead('Action Items') + rows.join('');
  })();

  // ── Notes ───────────────────────────────────────────────────────────────────
  const notesSection = (() => {
    if (tab !== 'full') return '';
    const body = (data.notes || '').trim();
    if (!body || body === '<p></p>') return '';
    return sectionHead('Notes')
      + `<div style="font-family:Calibri,Segoe UI,sans-serif;font-size:13px;line-height:1.7;color:#333;">${body}</div>`;
  })();

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><title>${title}</title></head>
<body style="font-family:Calibri,'Segoe UI',sans-serif;max-width:720px;margin:0 auto;padding:28px 24px;color:#1A1A1A;background:#fff;">
  <h1 style="font-size:26px;font-weight:700;margin:0 0 4px;letter-spacing:-0.3px;">${title}</h1>
  <div style="font-size:13px;color:#666;padding-bottom:14px;border-bottom:2px solid #217346;margin-bottom:2px;">
    ${dateStr} &nbsp;·&nbsp; ${person.name}
  </div>
  ${agendaSection}
  ${actionsSection}
  ${notesSection}
  <div style="font-family:Calibri,Segoe UI,sans-serif;font-size:11px;color:#bbb;margin-top:28px;padding-top:12px;border-top:1px solid #eee;">
    Generated by Cadence &nbsp;·&nbsp; ${generatedOn}
  </div>
</body>
</html>`;
}

// ── SharePanel ────────────────────────────────────────────────────────────────
interface Props {
  note: Note;
  person: Person;
  meetingData: MeetingData;
  onClose: () => void;
}

export function SharePanel({ note, person, meetingData, onClose }: Props) {
  const { insert } = useCadence();
  const [tab, setTab] = useState<Tab>('full');
  const [copied, setCopied] = useState(false);
  const [emailDone, setEmailDone] = useState(false);

  const html = useMemo(
    () => generateHtml(meetingData, note.title, person, note.created_at, tab),
    [meetingData, note.title, person.name, note.created_at, tab],
  );

  const copyToClipboard = async () => {
    try {
      const blob = new Blob([html], { type: 'text/html' });
      await navigator.clipboard.write([new ClipboardItem({ 'text/html': blob })]);
    } catch {
      // Fallback: plain text (some browsers restrict ClipboardItem)
      await navigator.clipboard.writeText(html);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 3000);
  };

  const downloadHtml = () => {
    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${note.title.replace(/[^a-z0-9]/gi, '_')}.html`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const sendEmail = async () => {
    await insert('outbox', {
      to: person.email || '',
      cc: '',
      subject: note.title,
      body: html,
      status: 'draft',
      related_project_id: null,
      related_work_item_id: null,
      created_by: 'you',
    } as Partial<OutboxEmail>);
    setEmailDone(true);
  };

  return (
    <div className="share-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="share-modal">

        {/* Header */}
        <div className="share-hdr">
          <button className="btn btn-ghost btn-sm" onClick={onClose}>← Back</button>
          <div className="share-title">
            <div className="onenote-badge">N</div>
            Share 1:1 Summary
          </div>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>✕</button>
        </div>

        {/* Format tabs */}
        <div className="share-tabs">
          {(['full', 'actions', 'agenda'] as const).map((t) => (
            <button key={t} className={`share-tab${tab === t ? ' active' : ''}`} onClick={() => setTab(t)}>
              {t === 'full' ? 'Full Summary' : t === 'actions' ? 'Actions Only' : 'Agenda Only'}
            </button>
          ))}
        </div>

        {/* Document preview */}
        <div className="share-preview">
          <div className="share-doc" dangerouslySetInnerHTML={{ __html: html }} />
        </div>

        {/* Export actions */}
        <div className="share-actions">
          <button className={`share-primary-btn${copied ? ' copied' : ''}`} onClick={copyToClipboard}>
            {copied ? '✅ Copied! Paste into OneNote' : '📋 Copy to clipboard'}
          </button>
          <div className="share-secondary-row">
            {person.email
              ? <button className="share-secondary-btn" onClick={sendEmail} disabled={emailDone}>
                  {emailDone ? '✓ Added to Outbox' : `✉ Send to ${person.name.split(' ')[0]}`}
                </button>
              : <span className="share-hint-sm">Add {person.name.split(' ')[0]}'s email in People to send</span>}
            <button className="share-secondary-btn" onClick={downloadHtml}>⬇ Download .html</button>
          </div>
          <div className="share-hint">Paste into OneNote — formatting, colours and action owners are preserved</div>
        </div>

      </div>
    </div>
  );
}
