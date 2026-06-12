import React, { useMemo, useState } from 'react';
import { useCadence } from './lib/store';
import { Login } from './components/Login';
import { SetPassword } from './components/SetPassword';
import { Sidebar, NAV } from './components/Sidebar';
import { Today } from './screens/Today';
import { Placeholder } from './screens/Placeholder';

const LABELS: Record<string, string> = {
  today: 'Today', notes: 'Notes', capture: 'Capture', inbox: 'Inbox',
  projects: 'Projects', people: 'People', decisions: 'Decisions', outbox: 'Outbox',
  review: 'Weekly Review', search: 'Search', settings: 'Settings',
};

export function App() {
  const { ready, configured, session, needsPasswordSet, data, signOut } = useCadence();
  const [screen, setScreen] = useState('today');
  const [menuOpen, setMenuOpen] = useState(false);

  const badges = useMemo(() => ({
    inbox: data.work_items.filter((w) => w.inboxed && !w.done).length,
    decisions: data.decisions.filter((d) => d.status === 'pending').length,
    outbox: data.outbox.filter((m) => m.status === 'queued').length,
  }), [data]);

  if (!ready) return <div className="login-wrap"><div className="login-card"><h1>Cadence</h1><p>Loading…</p></div></div>;
  if (!configured || !session) return <Login />;
  if (needsPasswordSet) return <SetPassword />;

  const navigate = (id: string) => { setScreen(id); setMenuOpen(false); };
  const known = NAV.some((g) => g.items.some((i) => i.id === screen)) || ['review', 'search', 'settings'].includes(screen);

  return (
    <div id="app">
      <Sidebar current={screen} onNavigate={navigate} badges={badges}
        email={session.user.email ?? undefined} onSignOut={signOut} open={menuOpen} />
      <div id="main">
        {screen === 'today' ? <Today /> : <Placeholder title={LABELS[known ? screen : 'today'] || 'Cadence'} />}
      </div>
    </div>
  );
}
