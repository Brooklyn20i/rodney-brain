import { useMemo, useState, useEffect, useRef } from 'react';
import { useCadence } from './lib/store';
import { isOverdue } from './lib/util';
import { isFiled } from './lib/tasks';
import { Login } from './components/Login';
import { SetPassword } from './components/SetPassword';
import { Sidebar } from './components/Sidebar';
import { Today } from './screens/Today';
import { Tasks } from './screens/Tasks';
import { Inbox } from './screens/Inbox';
import { Projects } from './screens/Projects';
import { People } from './screens/People';
import { Meetings } from './screens/Meetings';
import { Decisions } from './screens/Decisions';
import { Notes } from './screens/Notes';
import { Outbox } from './screens/Outbox';
import { Review } from './screens/Review';
import { Search } from './screens/Search';
import { Settings } from './screens/Settings';

export function App() {
  const { ready, configured, session, needsPasswordSet, data, workspace, signOut, syncError, clearSyncError, acceptInvite } = useCadence();
  const [screen, setScreen] = useState('today');
  const [menuOpen, setMenuOpen] = useState(false);
  const [inviteBanner, setInviteBanner] = useState<string | null>(null);

  const errorTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!syncError) return;
    if (errorTimer.current) clearTimeout(errorTimer.current);
    errorTimer.current = setTimeout(() => clearSyncError(), 30000);
    return () => { if (errorTimer.current) clearTimeout(errorTimer.current); };
  // clearSyncError is stable (useCallback); omitting avoids double-timer bug.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [syncError]);

  // Handle ?invite=<token> on load. Stash token for post-login processing.
  const inviteToken = new URLSearchParams(window.location.search).get('invite');
  useEffect(() => {
    if (!inviteToken) return;
    if (!session) {
      // Not logged in — preserve token across login via sessionStorage.
      sessionStorage.setItem('cadence_invite', inviteToken);
      return;
    }
    // Logged in — accept now (handles both direct link and post-login redirect).
    const token = inviteToken || sessionStorage.getItem('cadence_invite');
    if (!token) return;
    sessionStorage.removeItem('cadence_invite');
    history.replaceState(null, '', window.location.pathname);
    acceptInvite(token).then((result) => {
      setInviteBanner(result.error ? `Could not join workspace: ${result.error}` : '✓ You have joined the workspace');
      setTimeout(() => setInviteBanner(null), 6000);
    });
  // acceptInvite is stable; inviteToken and session drive the key behaviour.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, inviteToken]);

  const badges = useMemo(() => ({
    // Tasks badge = anything overdue (the urgent signal); Inbox badge = the
    // triage backlog (unprocessed captures waiting to be filed).
    tasks: { count: data.work_items.filter((w) => !w.done && isOverdue(w.due_date)).length, cls: 'red' },
    inbox: { count: data.work_items.filter((w) => !w.done && w.inboxed && !isFiled(w)).length, cls: '' },
    people: { count: data.work_items.filter((w) => w.type === 'waitingFor' && !w.done).length, cls: 'blue' },
    decisions: { count: data.decisions.filter((d) => d.status === 'pending').length + data.work_items.filter((w) => w.type === 'decision' && !w.done).length, cls: 'purple' },
    outbox: { count: data.outbox.filter((m) => m.status === 'queued').length, cls: 'blue' },
  }), [data]);

  if (!ready) return <div className="login-wrap"><div className="login-card"><h1>Cadence</h1><p>Loading…</p></div></div>;
  if (!configured || !session) return <Login inviteHint={!!sessionStorage.getItem('cadence_invite') || !!inviteToken} />;
  if (needsPasswordSet) return <SetPassword />;

  const navigate = (id: string) => { setScreen(id); setMenuOpen(false); };
  const onMenu = () => setMenuOpen(true);
  const email = session.user.email ?? undefined;

  const render = () => {
    switch (screen) {
      case 'today': return <Today onMenu={onMenu} />;
      case 'tasks': return <Tasks onMenu={onMenu} />;
      case 'inbox': return <Inbox onMenu={onMenu} />;
      case 'projects': return <Projects onMenu={onMenu} />;
      case 'people': return <People onMenu={onMenu} />;
      case 'meetings': return <Meetings onMenu={onMenu} />;
      case 'decisions': return <Decisions onMenu={onMenu} />;
      case 'notes': return <Notes onMenu={onMenu} />;
      case 'outbox': return <Outbox onMenu={onMenu} />;
      case 'review': return <Review onMenu={onMenu} />;
      case 'search': return <Search onMenu={onMenu} onNavigate={navigate} />;
      case 'settings': return <Settings onMenu={onMenu} email={email} onSignOut={signOut} />;
      default: return <Today onMenu={onMenu} />;
    }
  };

  return (
    <div id="app">
      {syncError && (
        <div className="sync-error-banner">
          ⚠ {syncError}
          <button className="sync-error-dismiss" onClick={clearSyncError}>✕</button>
        </div>
      )}
      {inviteBanner && (
        <div className={`sync-error-banner${inviteBanner.startsWith('✓') ? ' sync-success-banner' : ''}`}>
          {inviteBanner}
        </div>
      )}
      <Sidebar current={screen} onNavigate={navigate} badges={badges} open={menuOpen} workspaceName={workspace?.name ?? null} />
      {menuOpen && <div className="sidebar-backdrop" onClick={() => setMenuOpen(false)} />}
      <div id="main">{render()}</div>
    </div>
  );
}
