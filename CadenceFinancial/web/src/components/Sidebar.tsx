import React from 'react';
import { LogoMark } from './LogoMark';

export interface NavItem {
  id: string;
  label: string;
  icon: string;
}

interface NavGroup {
  section: string; // '' = no header (top group)
  items: NavItem[];
}

// Grouped like the main Cadence app's sidebar: a flat 15-item list is
// exactly the "complicated" feeling Rodney flagged; four labeled lanes
// mirror how a family office actually thinks about the work.
export const NAV: NavGroup[] = [
  {
    section: '',
    items: [
      { id: 'overview', label: 'Overview', icon: '◎' },
      { id: 'goals', label: 'Goals & Runway', icon: '⚑' },
    ],
  },
  {
    section: 'Operate',
    items: [
      { id: 'month-close', label: 'Month Close', icon: '●' },
      { id: 'free-cash-engine', label: 'Free Cash Engine', icon: '$' },
      { id: 'net-worth-bridge', label: 'Net Worth Bridge', icon: '⇌' },
      { id: 'debt-offset', label: 'Debt & Offset', icon: '⛁' },
    ],
  },
  {
    section: 'Invest',
    items: [
      { id: 'investments', label: 'Investments', icon: '▲' },
      { id: 'property', label: 'Property Portfolio', icon: '⌂' },
      { id: 'allocation', label: 'Asset Allocation', icon: '◔' },
      { id: 'performance', label: 'Performance', icon: '↗' },
    ],
  },
  {
    section: 'Risk',
    items: [
      { id: 'risk', label: 'Risk Dashboard', icon: '▣' },
      { id: 'stress', label: 'Stress Tests', icon: '≋' },
      { id: 'protection', label: 'Protection', icon: '⛨' },
    ],
  },
  {
    section: 'Govern',
    items: [
      { id: 'evidence', label: 'Evidence Register', icon: '☑' },
      { id: 'decisions', label: 'Needs Rodney', icon: '!' },
      { id: 'kobe', label: 'Kobe', icon: '⚡' },
    ],
  },
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
        <span id="sidebar-title-text">
          Cadence
          <span id="sidebar-title-sub">Financial</span>
        </span>
      </div>
      {NAV.map((grp) => (
        <React.Fragment key={grp.section || 'top'}>
          {grp.section && <div className="nav-section-label">{grp.section}</div>}
          {grp.items.map((it) => (
            <button
              key={it.id}
              className={`nav-item ${current === it.id ? 'active' : ''}`}
              onClick={() => onNavigate(it.id)}
            >
              <span className="nav-icon">{it.icon}</span> {it.label}
            </button>
          ))}
        </React.Fragment>
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
