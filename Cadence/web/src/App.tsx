import { useMemo, useState, useEffect, useRef, lazy, Suspense } from 'react';
import { useCadence } from './lib/store';
import { isOverdue } from './lib/util';
import { isFiled } from './lib/tasks';
import { Login } from './components/Login';
import { SetPassword } from './components/SetPassword';
import { Sidebar } from './components/Sidebar';
import { Today } from './screens/Today'; // eager — the default landing screen

// Lazy-load the remaining screens so the initial bundle ships only Today plus
// the shell. The per-screen chunks (vite manualChunks) are now actually
// deferred instead of eagerly imported by this module.
const Dashboard = lazy(() => import('./screens/Dashboard').then((m) => ({ default: m.Dashboard })));
const Horizon = lazy(() => import('./screens/Horizon').then((m) => ({ default: m.Horizon })));
const Board = lazy(() => import('./screens/Board').then((m) => ({ default: m.Board })));
const Tasks = lazy(() => import('./screens/Tasks').then((m) => ({ default: m.Tasks })));
const Inbox = lazy(() => import('./screens/Inbox').then((m) => ({ default: m.Inbox })));
const Projects = lazy(() => import('./screens/Projects').then((m) => ({ default: m.Projects })));
const People = lazy(() => import('./screens/People').then((m) => ({ default: m.People })));
const Meetings = lazy(() => import('./screens/Meetings').then((m) => ({ default: m.Meetings })));
const Notes = lazy(() => import('./screens/Notes').then((m) => ({ default: m.Notes })));
const Review = lazy(() => import('./screens/Review').then((m) => ({ default: m.Review })));
const Search = lazy(() => import('./screens/Search').then((m) => ({ default: m.Search })));
const Settings = lazy(() => import('./screens/Settings').then((m) => ({ default: m.Settings })));
const Kobe = lazy(() => import('./screens/Kobe').then((m) => ({ default: m.Kobe })));
const Ace = lazy(() => import('./screens/Ace').then((m) => ({ default: m.Ace })));

export function App() {
  const { ready, configured, session, needsPasswordSet, data, workspace, signOut, syncError, clearSyncError, acceptInvite, isOffline, pendingCount, isSyncing, canEdit } = useCadence();
  const [screen, setScreen] = useState('today');
  const [focusId, setFocusId] = useState<string | null>(null);
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
  }), [data]);

  if (!ready) return <div className="login-wrap"><div className="login-card"><h1>Cadence Work</h1><p>Loading…</p></div></div>;
  if (!configured || !session) return <Login inviteHint={!!sessionStorage.getItem('cadence_invite') || !!inviteToken} />;
  if (needsPasswordSet) return <SetPassword />;

  const navigate = (id: string, entityId?: string | null) => {
    setFocusId(entityId ?? null);
    setScreen(id);
    setMenuOpen(false);
  };
  const onMenu = () => setMenuOpen(true);
  const email = session.user.email ?? undefined;

  const render = () => {
    switch (screen) {
      case 'dashboard': return <Dashboard onMenu={onMenu} onNavigate={navigate} />;
      case 'today': return <Today onMenu={onMenu} />;
      case 'horizon': return <Horizon onMenu={onMenu} onNavigate={navigate} />;
      case 'tasks': return <Tasks onMenu={onMenu} />;
      case 'inbox': return <Inbox onMenu={onMenu} />;
      case 'board': return <Board onMenu={onMenu} />;
      case 'projects': return <Projects onMenu={onMenu} initialSelectedId={focusId} />;
      case 'people': return <People onMenu={onMenu} initialSelectedId={focusId} />;
      case 'meetings': return <Meetings onMenu={onMenu} />;
      case 'notes': return <Notes onMenu={onMenu} />;
      case 'review': return <Review onMenu={onMenu} />;
      case 'search': return <Search onMenu={onMenu} onNavigate={navigate} />;
      case 'ace': return <Ace onMenu={onMenu} />;
      case 'kobe': return <Kobe onMenu={onMenu} />;
      case 'settings': return <Settings onMenu={onMenu} email={email} onSignOut={signOut} />;
      default: return <Today onMenu={onMenu} />;
    }
  };

  return (
    <div id="app">
      {isOffline && (
        <div className="offline-banner">
          Offline{pendingCount > 0 ? ` — ${pendingCount} change${pendingCount === 1 ? '' : 's'} pending sync` : ''}
        </div>
      )}
      {!canEdit && (
        <div className="syncing-banner" style={{ background: 'var(--text2)' }}>👁 Read-only access — you can view but not edit this workspace</div>
      )}
      {!isOffline && isSyncing && (
        <div className="syncing-banner">Syncing…</div>
      )}
      {!isOffline && !isSyncing && pendingCount > 0 && (
        <div className="syncing-banner">{pendingCount} change{pendingCount === 1 ? '' : 's'} synced</div>
      )}
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
      <div id="main">
        <Suspense fallback={<div className="screen-content" style={{ padding: 24, color: 'var(--text3)' }}>Loading…</div>}>
          {render()}
        </Suspense>
      </div>
    </div>
  );
}
