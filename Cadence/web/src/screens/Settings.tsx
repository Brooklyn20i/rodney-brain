import React from 'react';
import { useCadence } from '../lib/store';
import { ScreenHeader } from '../components/bits';

export function Settings({ onMenu, email, onSignOut }: { onMenu?: () => void; email?: string; onSignOut: () => void }) {
  const { data } = useCadence();
  const total = data.work_items.length;
  const completed = data.work_items.filter((w) => w.done).length;

  return (
    <>
      <ScreenHeader title="Settings" onMenu={onMenu} />
      <div className="screen-content">
        <div className="settings-section-title">Account</div>
        <div className="settings-group">
          <div className="settings-row">
            <div><div className="settings-row-label">Signed in</div><div className="settings-row-sub">{email || '—'}</div></div>
            <button className="btn btn-danger btn-sm" onClick={onSignOut}>Sign out</button>
          </div>
        </div>

        <div className="settings-section-title">Sync</div>
        <div className="settings-group">
          <div className="settings-row">
            <div><div className="settings-row-label">Live sync</div><div className="settings-row-sub">Real-time across iPad, iPhone &amp; browser via Supabase</div></div>
            <span className="tag tag-action">✓ On</span>
          </div>
        </div>

        <div className="settings-section-title">Privacy &amp; Data</div>
        <div className="settings-group">
          <div className="settings-row"><div className="settings-row-label">Screenshots stay on-device</div><span className="tag tag-action">✓ Local only</span></div>
          <div className="settings-row"><div className="settings-row-label">No analytics or third-party tracking</div><span className="tag tag-action">✓ Private</span></div>
          <div className="settings-row"><div className="settings-row-label">Row-level security</div><span className="tag tag-action">✓ Your data only</span></div>
        </div>

        <div className="settings-section-title">Stats</div>
        <div className="settings-group">
          <div className="settings-row"><div className="settings-row-label">Total items</div><strong>{total}</strong></div>
          <div className="settings-row"><div className="settings-row-label">Completed</div><strong>{completed}</strong></div>
          <div className="settings-row"><div className="settings-row-label">Projects</div><strong>{data.projects.length}</strong></div>
          <div className="settings-row"><div className="settings-row-label">People</div><strong>{data.people.length}</strong></div>
        </div>

        <p className="card-meta" style={{ textAlign: 'center', color: 'var(--text3)', marginTop: 20 }}>Cadence — Executive Operating System</p>
      </div>
    </>
  );
}
