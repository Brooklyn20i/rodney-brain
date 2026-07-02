import { LogoMark } from './LogoMark';

export interface NavItem {
  id: string;
  label: string;
  icon: string;
}

export const NAV: NavItem[] = [
  { id: 'month-close', label: 'Month Close', icon: '●' },
  { id: 'free-cash-engine', label: 'Free Cash Engine', icon: '$' },
  { id: 'net-worth-bridge', label: 'Net Worth Bridge', icon: '⇌' },
  { id: 'debt-offset', label: 'Debt & Offset', icon: '⛁' },
  { id: 'investments', label: 'Investments', icon: '▲' },
  { id: 'allocation', label: 'Asset Allocation', icon: '◔' },
  { id: 'risk', label: 'Risk Dashboard', icon: '▣' },
  { id: 'stress', label: 'Stress Tests', icon: '≋' },
  { id: 'evidence', label: 'Evidence Register', icon: '☑' },
  { id: 'decisions', label: 'Needs Rodney', icon: '!' },
  { id: 'kobe', label: 'Kobe', icon: '⚡' },
];

interface Props {
  current: string;
  onNavigate: (id: string) => void;
  open: boolean;
  demo: boolean;
  onSignOut: () => void;
}

export function Sidebar({ current, onNavigate, open, demo, onSignOut }: Props) {
  return (
    <nav id="sidebar" className={open ? 'open' : ''}>
      <div id="sidebar-title">
        <LogoMark size={24} />
        Cadence Financial
      </div>
      {NAV.map((it) => (
        <button
          key={it.id}
          className={`nav-item ${current === it.id ? 'active' : ''}`}
          onClick={() => onNavigate(it.id)}
        >
          <span className="nav-icon">{it.icon}</span> {it.label}
        </button>
      ))}
      <div id="sidebar-footer">
        <div id="sync-status">
          <span className="status-dot" /> {demo ? 'Demo data (fictional)' : 'Live sync on'}
        </div>
        {!demo && (
          <button className="nav-item" onClick={onSignOut}>
            <span className="nav-icon">⏻</span> Sign out
          </button>
        )}
        <div id="sidebar-signature">Private · Management-grade · Not advice</div>
      </div>
    </nav>
  );
}
