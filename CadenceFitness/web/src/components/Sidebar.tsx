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

// Grouped lanes like the other Cadence apps' sidebars: Train is the gym half
// (the MacroFactor-workout side), Body & Fuel is the scale/Whoop/food half.
export const NAV: NavGroup[] = [
  {
    section: '',
    items: [
      { id: 'dashboard', label: 'Dashboard', icon: '◎' },
      { id: 'workout', label: 'Workout', icon: '▶' },
    ],
  },
  {
    section: 'Train',
    items: [
      { id: 'programs', label: 'Programs', icon: '▦' },
      { id: 'history', label: 'History', icon: '↺' },
      { id: 'exercises', label: 'Exercises', icon: '≣' },
      { id: 'cardio', label: 'Cardio & Sauna', icon: '≋' },
    ],
  },
  {
    section: 'Body & Fuel',
    items: [
      { id: 'nutrition', label: 'Nutrition', icon: '◔' },
      { id: 'body', label: 'Body', icon: '⚖' },
      { id: 'recovery', label: 'Recovery', icon: '♥' },
    ],
  },
  {
    section: 'Agents',
    items: [{ id: 'kobe', label: 'Kobe', icon: '⚡' }],
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
          <span id="sidebar-title-sub">Fitness</span>
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
        <div id="sidebar-signature">Private · Personal training log</div>
      </div>
    </nav>
  );
}
