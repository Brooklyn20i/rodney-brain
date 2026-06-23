import { useState, useEffect } from 'react';
import { useCadence } from '../lib/store';
import { ScreenHeader } from '../components/bits';
import { localDateStr } from '../lib/util';
import { isAgentTask } from '../lib/tasks';
import { supabase } from '../lib/supabase';


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

type WaitlistEntry = { id: string; email: string; name: string | null; created_at: string; status: 'pending' | 'approved' | 'rejected' };

function WaitlistSection() {
  const [entries, setEntries] = useState<WaitlistEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    supabase
      .from('waitlist')
      .select('*')
      .order('created_at', { ascending: false })
      .then(({ data }) => { setEntries((data as WaitlistEntry[]) || []); setLoading(false); });
  }, []);

  const updateStatus = async (id: string, status: 'approved' | 'rejected') => {
    await supabase.from('waitlist').update({ status }).eq('id', id);
    setEntries((prev) => prev.map((e) => (e.id === id ? { ...e, status } : e)));
  };

  const approveEntry = async (entry: WaitlistEntry) => {
    await updateStatus(entry.id, 'approved');
    await navigator.clipboard.writeText(entry.email).catch(() => {});
    setCopied(entry.id);
    setTimeout(() => setCopied(null), 4000);
  };

  const pending = entries.filter((e) => e.status === 'pending');
  const rest = entries.filter((e) => e.status !== 'pending');
  const sorted = [...pending, ...rest];

  const statusTag = (s: string) => {
    if (s === 'approved') return <span className="tag tag-action">Approved</span>;
    if (s === 'rejected') return <span className="tag" style={{ background: 'var(--red-bg, #fee)', color: 'var(--red)' }}>Rejected</span>;
    return <span className="tag tag-decision">Pending</span>;
  };

  return (
    <>
      <div className="settings-section-title">
        Waitlist {pending.length > 0 && (
          <span className="tag tag-decision" style={{ marginLeft: 8, fontSize: 11 }}>{pending.length} new</span>
        )}
      </div>
      <div className="settings-group">
        {loading && (
          <div className="settings-row"><div className="settings-row-sub">Loading…</div></div>
        )}
        {!loading && sorted.length === 0 && (
          <div className="settings-row"><div className="settings-row-sub">No one on the waitlist yet.</div></div>
        )}
        {!loading && sorted.map((entry, i) => (
          <div key={entry.id} style={{ borderTop: i === 0 ? undefined : '1px solid var(--border)' }}>
            <div className="settings-row">
              <div>
                <div className="settings-row-label" style={{ fontSize: 13 }}>
                  {entry.name || <span style={{ color: 'var(--text3)' }}>No name</span>}
                </div>
                <div className="settings-row-sub">{entry.email}</div>
                <div className="settings-row-sub" style={{ fontSize: 11, color: 'var(--text3)' }}>
                  {new Date(entry.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
                {statusTag(entry.status)}
                {entry.status === 'pending' && (
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button className="btn btn-primary btn-sm" onClick={() => approveEntry(entry)}>
                      {copied === entry.id ? '✓ Email copied' : 'Approve'}
                    </button>
                    <button className="btn btn-danger btn-sm" onClick={() => updateStatus(entry.id, 'rejected')}>
                      Reject
                    </button>
                  </div>
                )}
                {entry.status === 'approved' && (
                  <button className="btn btn-ghost btn-sm"
                    onClick={async () => { await navigator.clipboard.writeText(entry.email).catch(() => {}); setCopied(entry.id); setTimeout(() => setCopied(null), 2000); }}>
                    {copied === entry.id ? '✓ Copied' : '⎘ Copy email'}
                  </button>
                )}
              </div>
            </div>
            {copied === entry.id && entry.status === 'approved' && (
              <div className="settings-row" style={{ paddingTop: 0, borderTop: 'none' }}>
                <div className="settings-row-sub" style={{ fontSize: 12, color: 'var(--text3)' }}>
                  Create their Supabase account, then send them a workspace invite from the section above.
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </>
  );
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
            <div className="settings-row-label">Set up your workspace</div>
            <div className="settings-row-sub">Give it a name — you can invite your team once it's created</div>
          </div>
        </div>
        <div className="form-group" style={{ padding: '0 16px 12px' }}>
          <input
            type="text"
            placeholder="e.g. Acme Leadership"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleCreate(); }}
            disabled={loading}
            autoFocus
          />
          {error && <p style={{ color: 'var(--red)', fontSize: 12, marginTop: 6, marginBottom: 0 }}>{error}</p>}
          <button
            className="btn btn-primary"
            style={{ width: '100%', justifyContent: 'center', marginTop: 10 }}
            onClick={handleCreate}
            disabled={loading || !name.trim()}
          >
            {loading ? 'Creating…' : 'Create workspace'}
          </button>
        </div>
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
  const { data, session, workspace, workspaceMembers } = useCadence();
  const [exported, setExported] = useState(false);

  const myRole = workspaceMembers.find((m) => m.user_id === session?.user?.id)?.role;
  const isAdmin = myRole === 'admin';

  // Count the user's own items (exclude agent-owned tasks) so the stats match
  // what's shown across the app rather than inflating with Kobe/Ace rows.
  const userItems = data.work_items.filter((w) => !isAgentTask(w));
  const total = userItems.length;
  const completed = userItems.filter((w) => w.done).length;
  const peopleCount = data.people.filter((p) => !p.type || p.type === 'person').length;
  const notesCount = data.notes.filter((n) => !(n.folder || '').startsWith('__kobe')).length;

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
        {isAdmin && <WaitlistSection />}
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
          <div className="settings-row"><div className="settings-row-label">People</div><strong>{peopleCount}</strong></div>
          <div className="settings-row"><div className="settings-row-label">Notes &amp; meetings</div><strong>{notesCount}</strong></div>
        </div>

        <p className="card-meta" style={{ textAlign: 'center', color: 'var(--text3)', marginTop: 20 }}>Cadence — Executive Operating System</p>
      </div>
    </>
  );
}
