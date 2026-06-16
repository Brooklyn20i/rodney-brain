import React, { useState } from 'react';
import { useCadence } from '../lib/store';
import { ScreenHeader } from '../components/bits';

const isIOS = typeof navigator !== 'undefined' && /iPad|iPhone|iPod/.test(navigator.userAgent);

function exportBackup(data: ReturnType<typeof useCadence>['data']) {
  const dateStr = new Date().toISOString().slice(0, 10);
  const backup = {
    exported_at: new Date().toISOString(),
    version: '1.0',
    tables: {
      people: data.people,
      work_items: data.work_items,
      notes: data.notes,
      projects: data.projects,
      milestones: data.milestones,
      project_updates: data.project_updates,
      project_phases: data.project_phases,
      raid_items: data.raid_items,
      stakeholders: data.stakeholders,
      decisions: data.decisions,
      talking_points: data.talking_points,
      comments: data.comments,
      outbox: data.outbox,
      links: data.links,
      activity: data.activity,
    },
  };

  const json = JSON.stringify(backup, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);

  if (isIOS) {
    window.open(url, '_blank');
    setTimeout(() => URL.revokeObjectURL(url), 20000);
  } else {
    const a = document.createElement('a');
    a.href = url;
    a.download = `cadence-backup-${dateStr}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }
}

export function Settings({ onMenu, email, onSignOut }: { onMenu?: () => void; email?: string; onSignOut: () => void }) {
  const { data } = useCadence();
  const [exported, setExported] = useState(false);

  const total = data.work_items.length;
  const completed = data.work_items.filter((w) => w.done).length;

  const totalRecords = data.people.length + data.work_items.length + data.notes.length +
    data.projects.length + data.decisions.length + data.activity.length;

  const handleExport = () => {
    exportBackup(data);
    setExported(true);
    setTimeout(() => setExported(false), 4000);
  };

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

        <div className="settings-section-title">Backup &amp; Export</div>
        <div className="settings-group">
          <div className="settings-row">
            <div>
              <div className="settings-row-label">Export all data</div>
              <div className="settings-row-sub">
                {totalRecords} records · people, notes, meetings, projects, actions, decisions
              </div>
            </div>
            <button className="btn btn-secondary btn-sm" onClick={handleExport}>
              {exported ? '✓ Saved' : isIOS ? '⬆ Export' : '⬇ Download'}
            </button>
          </div>
          <div className="settings-row" style={{ borderTop: '1px solid var(--border)' }}>
            <div className="settings-row-sub" style={{ color: 'var(--text3)', fontSize: 12 }}>
              Downloads a dated JSON file with everything in Cadence. Run this weekly as a local backup — takes 2 seconds.
              {isIOS ? ' On iPhone/iPad, tap Share → Save to Files after it opens.' : ''}
            </div>
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
          <div className="settings-row"><div className="settings-row-label">Notes &amp; meetings</div><strong>{data.notes.length}</strong></div>
        </div>

        <p className="card-meta" style={{ textAlign: 'center', color: 'var(--text3)', marginTop: 20 }}>Cadence — Executive Operating System</p>
      </div>
    </>
  );
}
