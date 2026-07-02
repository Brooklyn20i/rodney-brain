import { useState } from 'react';
import { useCadenceFinancial } from './lib/store';
import { Login } from './components/Login';
import { SetPassword } from './components/SetPassword';
import { Sidebar } from './components/Sidebar';
import { AuthorityBanner } from './components/AuthorityBanner';
import { MonthClose } from './screens/MonthClose';
import { FreeCashEngine } from './screens/FreeCashEngine';
import { NetWorthBridge } from './screens/NetWorthBridge';
import { DebtOffsetControl } from './screens/DebtOffsetControl';
import { InvestmentDeployment } from './screens/InvestmentDeployment';
import { AssetAllocation } from './screens/AssetAllocation';
import { EvidenceRegister } from './screens/EvidenceRegister';
import { Decisions } from './screens/Decisions';
import { Kobe } from './screens/Kobe';

export function App() {
  const { ready, configured, demo, session, needsPasswordSet, signOut, syncError, clearSyncError } =
    useCadenceFinancial();
  const [screen, setScreen] = useState('month-close');
  const [menuOpen, setMenuOpen] = useState(false);

  if (!ready) {
    return (
      <div className="login-wrap">
        <div className="login-card">
          <h1>Cadence Financial</h1>
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
      case 'month-close':
        return <MonthClose onMenu={onMenu} />;
      case 'free-cash-engine':
        return <FreeCashEngine onMenu={onMenu} />;
      case 'net-worth-bridge':
        return <NetWorthBridge onMenu={onMenu} />;
      case 'debt-offset':
        return <DebtOffsetControl onMenu={onMenu} />;
      case 'investments':
        return <InvestmentDeployment onMenu={onMenu} />;
      case 'allocation':
        return <AssetAllocation onMenu={onMenu} />;
      case 'evidence':
        return <EvidenceRegister onMenu={onMenu} />;
      case 'decisions':
        return <Decisions onMenu={onMenu} />;
      case 'kobe':
        return <Kobe onMenu={onMenu} />;
      default:
        return <MonthClose onMenu={onMenu} />;
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
      <div id="main">
        <AuthorityBanner />
        {render()}
      </div>
    </div>
  );
}
