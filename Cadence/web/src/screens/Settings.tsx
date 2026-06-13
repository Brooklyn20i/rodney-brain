import React from 'react';
import { useCadence } from '../lib/store';
import { ScreenHeader } from '../components/bits';

export function Settings({ onMenu, email, onSignOut }: { onMenu?: () => void; email?: string; onSignOut: () => void }) {
  const { data } = useCadence();
  const counts: [string, number][] = [
    ['Projects', data.projects.length],
    ['Work items', data.work_items.length],
    ['People', data.people.length],
    ['Decisions', data.decisions.length],
    ['Notes', data.notes.length],
    ['Messages', data.outbox.length],
  ];

  return (
    <>
      <ScreenHeader title="Settings" onMenu={onMenu} />
      <div className="screen-content">
        <div className="section-header"><h2>Account</h2></div>
        <div className="card card-compact">
          <div className="card-row"><span className="card-meta" style={{ flex: 1 }}>Signed in as</span><span className="card-title">{email || '—'}</span></div>
        </div>
        <button className="btn btn-danger" style={{ marginTop: 10 }} onClick={onSignOut}>Sign out</button>

        <div className="section-header"><h2>Your data</h2></div>
        <div className="stat-grid">
          {counts.map(([label, n]) => (
            <div className="stat-card" key={label}><div className="stat-value">{n}</div><div className="stat-label">{label}</div></div>
          ))}
        </div>

        <div className="section-header"><h2>Sync</h2></div>
        <div className="card card-compact">
          <p className="card-meta">Live two-way sync via Supabase. Changes on any device — iPad, iPhone, browser — appear everywhere in real time.</p>
        </div>

        <div className="section-header"><h2>Privacy</h2></div>
        <div className="card card-compact">
          <p className="card-meta">Your data is protected by row-level security and only ever visible to your account. On the native app, screenshots and OCR stay on-device and are never uploaded.</p>
        </div>

        <p className="card-meta" style={{ marginTop: 20, textAlign: 'center', color: 'var(--text3)' }}>Cadence · executive operating system</p>
      </div>
    </>
  );
}
