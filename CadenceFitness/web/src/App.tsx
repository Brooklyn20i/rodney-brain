import { useState } from 'react';
import { useCadenceFitness } from './lib/store';
import { Login } from './components/Login';
import { SetPassword } from './components/SetPassword';
import { Sidebar } from './components/Sidebar';
import { Dashboard } from './screens/Dashboard';
import { Workout } from './screens/Workout';
import { Programs } from './screens/Programs';
import { History } from './screens/History';
import { Exercises } from './screens/Exercises';
import { Cardio } from './screens/Cardio';
import { Nutrition } from './screens/Nutrition';
import { Body } from './screens/Body';
import { Recovery } from './screens/Recovery';
import { Kobe } from './screens/Kobe';

export function App() {
  const { ready, configured, demo, session, needsPasswordSet, signOut, syncError, clearSyncError } =
    useCadenceFitness();
  const [screen, setScreen] = useState('dashboard');
  const [menuOpen, setMenuOpen] = useState(false);

  if (!ready) {
    return (
      <div className="login-wrap">
        <div className="login-card">
          <h1>Cadence Fitness</h1>
          <p>Loading…</p>
        </div>
      </div>
    );
  }
  if (!demo && (!configured || !session)) return <Login />;
  if (!demo && needsPasswordSet) return <SetPassword />;

  const navigate = (id: string) => {
    setScreen(id);
    setMenuOpen(false);
  };
  const onMenu = () => setMenuOpen(true);

  const render = () => {
    switch (screen) {
      case 'dashboard':
        return <Dashboard onMenu={onMenu} onNavigate={navigate} />;
      case 'workout':
        return <Workout onMenu={onMenu} onNavigate={navigate} />;
      case 'programs':
        return <Programs onMenu={onMenu} />;
      case 'history':
        return <History onMenu={onMenu} />;
      case 'exercises':
        return <Exercises onMenu={onMenu} />;
      case 'cardio':
        return <Cardio onMenu={onMenu} />;
      case 'nutrition':
        return <Nutrition onMenu={onMenu} />;
      case 'body':
        return <Body onMenu={onMenu} />;
      case 'recovery':
        return <Recovery onMenu={onMenu} />;
      case 'kobe':
        return <Kobe onMenu={onMenu} />;
      default:
        return <Dashboard onMenu={onMenu} onNavigate={navigate} />;
    }
  };

  return (
    <div id="app">
      {syncError && (
        <div className="sync-error-banner">
          ⚠ {syncError}
          <button className="sync-error-dismiss" onClick={clearSyncError}>
            ✕
          </button>
        </div>
      )}
      <Sidebar current={screen} onNavigate={navigate} open={menuOpen} demo={demo} onSignOut={signOut} />
      {menuOpen && <div className="sidebar-backdrop" onClick={() => setMenuOpen(false)} />}
      <div id="main">{render()}</div>
    </div>
  );
}
