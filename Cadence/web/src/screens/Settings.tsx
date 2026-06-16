import React, { useState } from 'react';
import { useCadence } from '../lib/store';
import { ScreenHeader } from '../components/bits';

const MIGRATION_SQL = `-- Cadence migrations (safe to re-run)

-- migration 0006: advanced project tables
CREATE TABLE IF NOT EXISTS project_phases (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  owner_id uuid NOT NULL DEFAULT auth.uid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name text NOT NULL DEFAULT '', start_date date, end_date date, sort integer NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now(), deleted_at timestamptz
);
ALTER TABLE project_phases ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='project_phases' AND policyname='owner') THEN
  CREATE POLICY "owner" ON project_phases USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid()); END IF; END $$;

CREATE TABLE IF NOT EXISTS raid_items (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  owner_id uuid NOT NULL DEFAULT auth.uid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  kind text NOT NULL DEFAULT 'risk', text text NOT NULL DEFAULT '', owner text NOT NULL DEFAULT '',
  severity text NOT NULL DEFAULT 'medium', status text NOT NULL DEFAULT 'open',
  created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now(), deleted_at timestamptz
);
ALTER TABLE raid_items ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='raid_items' AND policyname='owner') THEN
  CREATE POLICY "owner" ON raid_items USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid()); END IF; END $$;

CREATE TABLE IF NOT EXISTS stakeholders (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  owner_id uuid NOT NULL DEFAULT auth.uid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  person_id uuid REFERENCES people(id) ON DELETE SET NULL,
  name text NOT NULL DEFAULT '', raci text NOT NULL DEFAULT 'I',
  created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now(), deleted_at timestamptz
);
ALTER TABLE stakeholders ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='stakeholders' AND policyname='owner') THEN
  CREATE POLICY "owner" ON stakeholders USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid()); END IF; END $$;

ALTER TABLE projects ADD COLUMN IF NOT EXISTS pillar_id text;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS kpi_ids text[] DEFAULT '{}';
ALTER TABLE milestones ADD COLUMN IF NOT EXISTS phase_id uuid REFERENCES project_phases(id) ON DELETE SET NULL;
ALTER TABLE work_items ADD COLUMN IF NOT EXISTS phase_id uuid REFERENCES project_phases(id) ON DELETE SET NULL;
ALTER TABLE people ADD COLUMN IF NOT EXISTS color text;
ALTER TABLE people ADD COLUMN IF NOT EXISTS group_name text;
ALTER TABLE people ADD COLUMN IF NOT EXISTS sort_order integer;

-- migration 0008: 1:1 meeting dates
ALTER TABLE people ADD COLUMN IF NOT EXISTS next_meeting date;
`;

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
  const [copied, setCopied] = useState(false);

  const copyMigration = async () => {
    try {
      await navigator.clipboard.writeText(MIGRATION_SQL);
      setCopied(true);
      setTimeout(() => setCopied(false), 3000);
    } catch { /* clipboard not available */ }
  };

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

        <div className="settings-section-title">Database Setup</div>
        <div className="settings-group">
          <div className="settings-row">
            <div>
              <div className="settings-row-label">Run migrations</div>
              <div className="settings-row-sub">If Phases, RAID or Stakeholders show errors in Projects, paste this SQL into your Supabase SQL Editor and run it</div>
            </div>
            <button className="btn btn-secondary btn-sm" onClick={copyMigration}>
              {copied ? '✓ Copied' : '⎘ Copy SQL'}
            </button>
          </div>
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
