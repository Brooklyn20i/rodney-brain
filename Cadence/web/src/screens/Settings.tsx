import { useState } from 'react';
import { useCadence } from '../lib/store';
import { ScreenHeader } from '../components/bits';
import { localDateStr } from '../lib/util';


const isIOS = typeof navigator !== 'undefined' && /iPad|iPhone|iPod/.test(navigator.userAgent);

function exportBackup(data: ReturnType<typeof useCadence>['data']) {
  const dateStr = localDateStr();
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

function CreateWorkspaceSection() {
  const { createWorkspace } = useCadence();
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleCreate = async () => {
    if (!name.trim()) return;
    setLoading(true);
    setError('');
    try {
      await createWorkspace(name.trim());
    } catch (e: any) {
      setError(e?.message || 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <div className="settings-section-title">Workspace</div>
      <div className="settings-group">
        <div className="settings-row">
          <div>
            <div className="settings-row-label">Create a workspace</div>
            <div className="settings-row-sub">Invite your team once it's set up</div>
          </div>
        </div>
        <div className="settings-row" style={{ borderTop: '1px solid var(--border)', gap: 8 }}>
          <input
            className="input"
            style={{ flex: 1 }}
            placeholder="Workspace name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleCreate(); }}
            disabled={loading}
          />
          <button className="btn btn-primary btn-sm" onClick={handleCreate} disabled={loading || !name.trim()}>
            {loading ? 'Creating…' : 'Create'}
          </button>
        </div>
        {error && (
          <div className="settings-row" style={{ borderTop: '1px solid var(--border)', color: 'var(--red)' }}>
            {error}
          </div>
        )}
      </div>
    </>
  );
}

function WorkspaceSection({ myUserId }: { myUserId: string }) {
  const { workspace, workspaceMembers, createInvite, removeWorkspaceMember } = useCadence();
  const [inviteRole, setInviteRole] = useState<'editor' | 'viewer'>('editor');
  const [inviteUrl, setInviteUrl] = useState('');
  const [inviteCopied, setInviteCopied] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);

  if (!workspace) return null;

  const myRole = workspaceMembers.find((m) => m.user_id === myUserId)?.role;
  const isAdmin = myRole === 'admin';

  const handleGenerateInvite = async () => {
    if (inviteUrl) {
      await navigator.clipboard.writeText(inviteUrl).catch(() => {});
      setInviteCopied(true);
      setTimeout(() => setInviteCopied(false), 3000);
      return;
    }
    const url = await createInvite(inviteRole);
    setInviteUrl(url);
    await navigator.clipboard.writeText(url).catch(() => {});
    setInviteCopied(true);
    setTimeout(() => setInviteCopied(false), 3000);
  };

  const handleRoleChange = (r: 'editor' | 'viewer') => {
    setInviteRole(r);
    setInviteUrl(''); // new role = new invite token needed
    setInviteCopied(false);
  };

  return (
    <>
      <div className="settings-section-title" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span>Workspace</span>
        {isAdmin && (
          <button className="btn btn-secondary btn-sm" onClick={() => { setInviteOpen((v) => !v); setInviteUrl(''); setInviteCopied(false); }}>
            {inviteOpen ? 'Cancel' : '+ Invite member'}
          </button>
        )}
      </div>
      {inviteOpen && (
        <div className="settings-group" style={{ marginBottom: 8 }}>
          <div className="settings-row">
            <div>
              <div className="settings-row-label">Invite as</div>
              <div className="settings-row-sub">Editor can read &amp; write · Viewer is read-only</div>
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <button className={`btn btn-sm ${inviteRole === 'editor' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => handleRoleChange('editor')}>Editor</button>
              <button className={`btn btn-sm ${inviteRole === 'viewer' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => handleRoleChange('viewer')}>Viewer</button>
            </div>
          </div>
          <div className="settings-row" style={{ borderTop: '1px solid var(--border)' }}>
            <div className="settings-row-sub" style={{ fontSize: 12, color: 'var(--text3)' }}>
              Link expires in 7 days. Share via Slack, email, or text.
            </div>
            <button className="btn btn-primary btn-sm" onClick={handleGenerateInvite}>
              {inviteCopied ? '✓ Copied!' : inviteUrl ? '⎘ Copy again' : '⎘ Copy invite link'}
            </button>
          </div>
        </div>
      )}
      <div className="settings-group">
        <div className="settings-row">
          <div className="settings-row-label" style={{ fontWeight: 600 }}>{workspace.name}</div>
          <span className="tag tag-action">{workspace.plan}</span>
        </div>
        {workspaceMembers.map((m) => (
          <div key={m.user_id} className="settings-row" style={{ borderTop: '1px solid var(--border)' }}>
            <div>
              <div className="settings-row-label" style={{ fontSize: 13 }}>{m.email || m.user_id.slice(0, 8) + '…'}</div>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <span className={`tag ${m.role === 'admin' ? 'tag-decision' : 'tag-action'}`}>{m.role}</span>
              {isAdmin && m.user_id !== myUserId && (
                <button className="btn btn-danger btn-sm" title="Remove from workspace"
                  onClick={() => { if (confirm(`Remove ${m.email || 'this member'}?`)) removeWorkspaceMember(m.user_id); }}>
                  –
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

export function Settings({ onMenu, email, onSignOut }: { onMenu?: () => void; email?: string; onSignOut: () => void }) {
  const { data, session, workspace } = useCadence();
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
        {session?.user?.id && (workspace ? <WorkspaceSection myUserId={session.user.id} /> : <CreateWorkspaceSection />)}
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
