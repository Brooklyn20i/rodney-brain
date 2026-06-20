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
  const { ready, configured, session, needsPasswordSet, data, signOut, syncError, clearSyncError } = useCadence();
  const [screen, setScreen] = useState('today');
  const [menuOpen, setMenuOpen] = useState(false);

  const errorTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!syncError) return;
    if (errorTimer.current) clearTimeout(errorTimer.current);
    errorTimer.current = setTimeout(() => clearSyncError(), 5000);
    return () => { if (errorTimer.current) clearTimeout(errorTimer.current); };
  // clearSyncError is stable (useCallback); omitting avoids double-timer bug.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [syncError]);

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
  if (!configured || !session) return <Login />;
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
      <Sidebar current={screen} onNavigate={navigate} badges={badges} open={menuOpen} />
      {menuOpen && <div className="sidebar-backdrop" onClick={() => setMenuOpen(false)} />}
      <div id="main">{render()}</div>
    </div>
  );
}
