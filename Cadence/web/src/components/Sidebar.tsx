import React from 'react';

export type Domain = 'work' | 'financial' | 'fitness';

export interface NavItem { id: string; label: string; icon: string; }

export const WORK_NAV: { section: string; items: NavItem[] }[] = [
  { section: 'Day', items: [
    { id: 'dashboard', label: 'Dashboard', icon: '⊞' },
    { id: 'today', label: 'Control', icon: '☀' },
    { id: 'horizon', label: 'Horizon', icon: '↗' },
    { id: 'tasks', label: 'Tasks', icon: '◎' },
    { id: 'inbox', label: 'Inbox', icon: '↓' },
    { id: 'notes', label: 'Notes', icon: '✎' },
  ]},
  { section: 'Work', items: [
    { id: 'board', label: 'Board', icon: '▦' },
    { id: 'projects', label: 'Projects', icon: '▤' },
    { id: 'people', label: 'People', icon: '✦' },
    { id: 'meetings', label: 'Meetings', icon: '🗓' },
  ]},
  { section: 'Agents', items: [
    { id: 'ace', label: 'Ace', icon: '◆' },
    { id: 'kobe', label: 'Kobe', icon: '⚡' },
  ]},
];
const WORK_FOOTER: NavItem[] = [
  { id: 'review', label: 'Review', icon: '✓' },
  { id: 'search', label: 'Search', icon: '⌕' },
  { id: 'settings', label: 'Settings', icon: '⚙' },
];

// Financial's screen ids, prefixed 'financial:' so they can never collide
// with Work's or Fitness's bare ids (e.g. both Work and Fitness have a
// 'dashboard' and a 'kobe' screen) -- App.tsx dispatches on this prefix.
export const FINANCIAL_NAV: { section: string; items: NavItem[] }[] = [
  { section: '', items: [
    { id: 'financial:overview', label: 'Overview', icon: '◎' },
    { id: 'financial:goals', label: 'Goals & Runway', icon: '⚑' },
  ]},
  { section: 'Operate', items: [
    { id: 'financial:budget', label: 'Budget', icon: '▤' },
    { id: 'financial:month-close', label: 'Month Close', icon: '●' },
    { id: 'financial:free-cash-engine', label: 'Free Cash Engine', icon: '$' },
    { id: 'financial:net-worth-bridge', label: 'Net Worth Bridge', icon: '⇌' },
    { id: 'financial:debt-offset', label: 'Debt & Offset', icon: '⛁' },
  ]},
  { section: 'Invest', items: [
    { id: 'financial:investments', label: 'Investments', icon: '▲' },
    { id: 'financial:property', label: 'Property Portfolio', icon: '⌂' },
    { id: 'financial:allocation', label: 'Asset Allocation', icon: '◔' },
    { id: 'financial:performance', label: 'Performance', icon: '↗' },
  ]},
  { section: 'Risk', items: [
    { id: 'financial:risk', label: 'Risk Dashboard', icon: '▣' },
    { id: 'financial:stress', label: 'Stress Tests', icon: '≋' },
    { id: 'financial:protection', label: 'Protection', icon: '⛨' },
  ]},
  { section: 'Govern', items: [
    { id: 'financial:evidence', label: 'Evidence Register', icon: '☑' },
    { id: 'financial:decisions', label: 'Needs Rodney', icon: '!' },
    { id: 'financial:kobe', label: 'Kobe', icon: '⚡' },
  ]},
];

export const FITNESS_NAV: { section: string; items: NavItem[] }[] = [
  { section: '', items: [
    { id: 'fitness:dashboard', label: 'Dashboard', icon: '◎' },
    { id: 'fitness:workout', label: 'Workout', icon: '▶' },
  ]},
  { section: 'Train', items: [
    { id: 'fitness:programs', label: 'Programs', icon: '▦' },
    { id: 'fitness:history', label: 'History', icon: '↺' },
    { id: 'fitness:exercises', label: 'Exercises', icon: '≣' },
    { id: 'fitness:cardio', label: 'Cardio & Sauna', icon: '≋' },
  ]},
  { section: 'Body & Fuel', items: [
    { id: 'fitness:nutrition', label: 'Nutrition', icon: '◔' },
    { id: 'fitness:body', label: 'Body', icon: '⚖' },
    { id: 'fitness:recovery', label: 'Recovery', icon: '♥' },
    { id: 'fitness:sync', label: 'Sync', icon: '⇅' },
  ]},
  { section: 'Agents', items: [
    { id: 'fitness:kobe', label: 'Kobe', icon: '⚡' },
  ]},
];

const DOMAINS: { id: Domain; label: string; icon: string }[] = [
  { id: 'work', label: 'Work', icon: '◆' },
  { id: 'financial', label: 'Financial', icon: '$' },
  { id: 'fitness', label: 'Fitness', icon: '♥' },
];

interface Props {
  domain: Domain;
  onDomainChange: (d: Domain) => void;
  current: string;
  onNavigate: (id: string) => void;
  badges: Record<string, { count: number; cls: string }>;
  open: boolean;
  workspaceName: string | null;
}

export function Sidebar({ domain, onDomainChange, current, onNavigate, badges, open, workspaceName }: Props) {
  const item = (it: NavItem) => {
    const b = badges[it.id];
    return (
      <button key={it.id} className={`nav-item ${current === it.id ? 'active' : ''}`} onClick={() => onNavigate(it.id)}>
        <span className="nav-icon">{it.icon}</span> {it.label}
        {b && b.count > 0 ? <span className={`nav-badge ${b.cls}`}>{b.count}</span> : null}
      </button>
    );
  };

  const nav = domain === 'financial' ? FINANCIAL_NAV : domain === 'fitness' ? FITNESS_NAV : WORK_NAV;

  return (
    <nav id="sidebar" className={open ? 'open' : ''}>
      <div id="sidebar-title">
        <svg className="sidebar-logo" viewBox="0 0 32 32" width="30" height="30" aria-hidden="true">
          <circle cx="16" cy="16" r="9" fill="none" stroke="currentColor" strokeWidth="3.5"
            strokeLinecap="round" strokeDasharray="44 13" transform="rotate(40 16 16)" />
        </svg>
        <span className="sidebar-brand-text">
          <span className="sidebar-brand-name">Cadence</span>
          <span className="sidebar-sub">{domain === 'financial' ? 'Financial' : domain === 'fitness' ? 'Fitness' : 'Work'}</span>
        </span>
      </div>

      <div className="domain-switch">
        {DOMAINS.map((d) => (
          <button
            key={d.id}
            className={`domain-switch-btn ${domain === d.id ? 'active' : ''}`}
            onClick={() => onDomainChange(d.id)}
            title={d.label}
          >
            <span className="domain-switch-icon">{d.icon}</span>
            {d.label}
          </button>
        ))}
      </div>

      {nav.map((grp, i) => (
        <React.Fragment key={grp.section || i}>
          {i > 0 && <div className="nav-sep" />}
          {grp.section && <div className="nav-section-label">{grp.section}</div>}
          {grp.items.map(item)}
        </React.Fragment>
      ))}
      <div id="sidebar-footer">
        {domain === 'work' && WORK_FOOTER.map(item)}
        {domain !== 'work' && (
          <button className="nav-item" onClick={() => onNavigate('settings')}>
            <span className="nav-icon">⚙</span> Settings
          </button>
        )}
        <div id="sync-status"><span className="status-dot" /> Live sync on</div>
        <div id="sidebar-signature">{workspaceName ?? 'My workspace'} · Cadence</div>
      </div>
    </nav>
  );
}
