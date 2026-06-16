import React, { useState } from 'react';
import { useCadence } from '../lib/store';
import { ScreenHeader } from '../components/bits';

// Brings any older Cadence database fully up to date (folds in migrations
// 0004/0006/0007). Idempotent — safe to run as many times as you like.
const MIGRATION_SQL = `-- Cadence — update database (safe to re-run)
-- Uses named dollar-quote tags ($fn$/$rls$/$rt$) so it survives iPad/Safari copy-paste.

-- updated_at helper (used by triggers below)
create or replace function set_updated_at() returns trigger as $fn$
begin new.updated_at = now(); return new; end;
$fn$ language plpgsql;

-- People: avatar colour + grouping
alter table people add column if not exists color      text    not null default '#1B5E9E';
alter table people add column if not exists group_name text    not null default 'Direct Reports';
alter table people add column if not exists sort_order integer not null default 0;

-- Projects: strategy linkage (priority + KPIs)
alter table projects add column if not exists pillar_id text  not null default '';
alter table projects add column if not exists kpi_ids   jsonb not null default '[]'::jsonb;

-- Phases / workstreams
create table if not exists project_phases (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  project_id uuid not null references projects(id) on delete cascade,
  name text not null default '', start_date date, end_date date, sort int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
alter table milestones add column if not exists phase_id uuid references project_phases(id) on delete set null;
alter table work_items add column if not exists phase_id uuid references project_phases(id) on delete set null;

-- RAID (Risks, Assumptions, Issues, Dependencies)
create table if not exists raid_items (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  project_id uuid not null references projects(id) on delete cascade,
  kind text not null default 'risk', text text not null default '', owner text not null default '',
  severity text not null default 'medium', status text not null default 'open',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

-- Stakeholders / RACI
create table if not exists stakeholders (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  project_id uuid not null references projects(id) on delete cascade,
  person_id uuid references people(id) on delete set null,
  name text not null default '', raci text not null default 'I',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

-- Triggers + row-level security for the new tables
do $rls$
declare t text;
begin
  foreach t in array array['project_phases','raid_items','stakeholders'] loop
    execute format('drop trigger if exists trg_%1$s_updated on %1$s;', t);
    execute format('create trigger trg_%1$s_updated before update on %1$s for each row execute function set_updated_at();', t);
    execute format('alter table %I enable row level security;', t);
    execute format('drop policy if exists %1$s_all on %1$s;', t);
    execute format('create policy %1$s_all on %1$s using (owner_id = auth.uid()) with check (owner_id = auth.uid());', t);
  end loop;
end $rls$;

-- Realtime cross-device sync for every table (base + new)
do $rt$
declare t text;
begin
  foreach t in array array[
    'projects','milestones','project_updates','people','talking_points',
    'work_items','comments','decisions','notes','outbox','links','activity',
    'project_phases','raid_items','stakeholders'
  ] loop
    execute format('alter table %I replica identity full;', t);
    if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename=t) then
      execute format('alter publication supabase_realtime add table %I;', t);
    end if;
  end loop;
end $rt$;
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
              <div className="settings-row-label">Update database</div>
              <div className="settings-row-sub">Unlocks project Priority grouping, Phases, RAID &amp; Stakeholders. Run once.</div>
            </div>
            <button className="btn btn-primary btn-sm" onClick={copyMigration}>
              {copied ? '✓ Copied — now paste in Supabase' : '⎘ Copy SQL'}
            </button>
          </div>
          <div className="settings-row" style={{ borderTop: '1px solid var(--border)' }}>
            <div className="settings-row-sub" style={{ color: 'var(--text3)', fontSize: 12, lineHeight: 1.6 }}>
              1. Tap <strong>Copy SQL</strong> above.<br />
              2. Open your Supabase project → <strong>SQL Editor</strong> → <strong>New query</strong>.<br />
              3. Paste and tap <strong>Run</strong>. It's safe to run more than once.<br />
              4. Come back here and pull to refresh. Done.
            </div>
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
