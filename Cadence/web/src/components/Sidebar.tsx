import React from 'react';

export type Domain = 'work' | 'financial' | 'fitness' | 'life';

export interface NavItem { id: string; label: string; icon: string; }

// Seven screens, one section — Home is the landing commitments view (my
// tasks + waiting), everything else is a destination you visit deliberately.
export const WORK_NAV: { section: string; items: NavItem[] }[] = [
  { section: '', items: [
    { id: 'home', label: 'Home', icon: '☀' },
    { id: 'people', label: 'People', icon: '✦' },
    { id: 'meetings', label: 'Meetings', icon: '🗓' },
    { id: 'projects', label: 'Projects', icon: '▤' },
    { id: 'notes', label: 'Notes', icon: '✎' },
    { id: 'inbox', label: 'Inbox', icon: '↓' },
    { id: 'dashboard', label: 'Dashboard', icon: '◧' },
  ]},
];
const WORK_FOOTER: NavItem[] = [
  { id: 'search', label: 'Search', icon: '⌕' },
  { id: 'settings', label: 'Settings', icon: '⚙' },
];

// Financial's screen ids, prefixed 'financial:' so they can never collide
// with Work's or Fitness's bare ids (e.g. both Work and Fitness have a
// 'dashboard' and a 'kobe' screen) -- App.tsx dispatches on this prefix.
// Eleven screens, question-first. Overview folds in the bridge, performance,
// allocation and goals views; Cashflow = budget + free cash; Month Close
// carries the evidence register; Strategy carries the decision queue; Risk &
// Protection = dashboard + stress + cover. Investments, Watches, Property and
// Conviction are deliberately standalone. Old ids still deep-link (App.tsx).
export const FINANCIAL_NAV: { section: string; items: NavItem[] }[] = [
  { section: '', items: [
    { id: 'financial:overview', label: 'Overview', icon: '◎' },
    { id: 'financial:strategy', label: 'Strategy', icon: '✦' },
  ]},
  { section: 'Operate', items: [
    { id: 'financial:month-close', label: 'Month Close', icon: '●' },
    { id: 'financial:cashflow', label: 'Cashflow', icon: '$' },
    { id: 'financial:debt-offset', label: 'Debt & Offset', icon: '⛁' },
  ]},
  { section: 'Invest', items: [
    { id: 'financial:investments', label: 'Investments', icon: '▲' },
    { id: 'financial:property', label: 'Property Portfolio', icon: '⌂' },
    { id: 'financial:watches', label: 'Watches', icon: '◉' },
    { id: 'financial:conviction', label: 'Conviction', icon: '◈' },
  ]},
  { section: 'Risk', items: [
    { id: 'financial:risk', label: 'Risk & Protection', icon: '⛨' },
  ]},
  { section: 'Govern', items: [
    { id: 'financial:kobe', label: 'Cadence Financial', icon: '⚡' },
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
  ]},
  { section: 'Body & Fuel', items: [
    { id: 'fitness:nutrition', label: 'Nutrition', icon: '◔' },
    { id: 'fitness:body', label: 'Body', icon: '⚖' },
    { id: 'fitness:recovery', label: 'Recovery', icon: '♥' },
    { id: 'fitness:cardio', label: 'Recovery Activities', icon: '♨' },
    { id: 'fitness:sync', label: 'Sync', icon: '⇅' },
  ]},
  { section: 'Agents', items: [
    { id: 'fitness:kobe', label: 'Kobe', icon: '⚡' },
  ]},
];

// Life: three screens, deliberately. It's an obligations register plus an
// admin list — personal captures never touch Work's tables (and vice versa;
// each domain's triage has a one-tap flick to the other).
export const LIFE_NAV: { section: string; items: NavItem[] }[] = [
  { section: '', items: [
    { id: 'life:dashboard', label: 'Dashboard', icon: '◎' },
    { id: 'life:admin', label: 'Admin', icon: '✎' },
    { id: 'life:obligations', label: 'Obligations', icon: '↺' },
  ]},
];

const DOMAINS: { id: Domain; label: string }[] = [
  { id: 'work', label: 'Work' },
  { id: 'financial', label: 'Financial' },
  { id: 'fitness', label: 'Health' },
  { id: 'life', label: 'Life' },
];

// Domain marks, drawn to what each domain actually is rather than stock glyphs:
// Work = the operating board (columns + cards), Financial = an asset growing
// (coin with a rising trend), Health = vitality (heart with a pulse line).
// One stroke weight, rounded joins, currentColor so they inherit the pill's
// idle/active ink — per DESIGN.md's restrained executive line language.
function DomainIcon({ id }: { id: Domain }) {
  const common = {
    width: 20,
    height: 20,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.85,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
  };
  if (id === 'work') {
    // Operating board — columns with cards (the Board / Control surface).
    return (
      <svg {...common}>
        <rect x="3" y="4.5" width="18" height="15" rx="2.4" />
        <path d="M9 4.5v15M15 4.5v15" />
        <rect x="4.7" y="7.4" width="2.6" height="2.1" rx="0.7" fill="currentColor" stroke="none" />
        <rect x="4.7" y="11" width="2.6" height="2.1" rx="0.7" fill="currentColor" stroke="none" />
        <rect x="10.7" y="7.4" width="2.6" height="2.1" rx="0.7" fill="currentColor" stroke="none" />
        <rect x="16.7" y="7.4" width="2.6" height="2.1" rx="0.7" fill="currentColor" stroke="none" />
      </svg>
    );
  }
  if (id === 'financial') {
    // A coin with a rising trend inside — an asset growing.
    return (
      <svg {...common}>
        <circle cx="12" cy="12" r="8.5" />
        <path d="M8 14.2l2.4-2.6 1.9 1.7 3.7-4" />
        <path d="M14.2 9.3h1.9v1.9" />
      </svg>
    );
  }
  if (id === 'fitness') {
    // Health — a clean symmetric heart with a single ECG pulse (training +
    // recovery), so it reads as vitality, not a "favourite" heart.
    return (
      <svg {...common}>
        <path d="M12 19.6c-.6-.45-7.1-5.05-7.1-9.75A3.65 3.65 0 0 1 12 7.75a3.65 3.65 0 0 1 7.1 2.1c0 4.7-6.5 9.3-7.1 9.75Z" />
        <path d="M7.6 12h2.15l1.05-2 1.55 3.4 1-1.4h2.05" />
      </svg>
    );
  }
  // Life — a house with a tick inside: the household run well. Same stroke
  // language as the other marks.
  return (
    <svg {...common}>
      <path d="M4 11.2 12 4.6l8 6.6" />
      <path d="M6.3 10.2V19h11.4v-8.8" />
      <path d="M9.4 13.9l1.9 1.9 3.4-3.6" />
    </svg>
  );
}

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

  const nav =
    domain === 'financial' ? FINANCIAL_NAV : domain === 'fitness' ? FITNESS_NAV : domain === 'life' ? LIFE_NAV : WORK_NAV;

  return (
    <nav id="sidebar" className={open ? 'open' : ''}>
      <div id="sidebar-title">
        <svg className="sidebar-logo" viewBox="0 0 32 32" width="30" height="30" aria-hidden="true">
          <circle cx="16" cy="16" r="9" fill="none" stroke="currentColor" strokeWidth="3.5"
            strokeLinecap="round" strokeDasharray="44 13" transform="rotate(40 16 16)" />
        </svg>
        <span className="sidebar-brand-text">
          <span className="sidebar-brand-name">Cadence</span>
          <span className="sidebar-sub">
            {domain === 'financial' ? 'Financial' : domain === 'fitness' ? 'Health' : domain === 'life' ? 'Life' : 'Work'}
          </span>
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
            <span className="domain-switch-icon">
              <DomainIcon id={d.id} />
            </span>
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
