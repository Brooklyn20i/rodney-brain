import React from 'react';

export interface NavItem { id: string; label: string; icon: string; }
export const NAV: { section: string; items: NavItem[] }[] = [
  { section: 'Day', items: [
    { id: 'today', label: 'Today', icon: '☀' },
    { id: 'notes', label: 'Notes', icon: '✎' },
    { id: 'capture', label: 'Capture', icon: '⊡' },
    { id: 'inbox', label: 'Inbox', icon: '↓' },
  ]},
  { section: 'Work', items: [
    { id: 'projects', label: 'Projects', icon: '▤' },
    { id: 'people', label: 'People', icon: '✦' },
    { id: 'decisions', label: 'Decisions', icon: '⚖' },
    { id: 'outbox', label: 'Outbox', icon: '✉' },
  ]},
];
const FOOTER: NavItem[] = [
  { id: 'review', label: 'Review', icon: '✓' },
  { id: 'search', label: 'Search', icon: '⌕' },
  { id: 'settings', label: 'Settings', icon: '⚙' },
];

interface Props {
  current: string;
  onNavigate: (id: string) => void;
  badges: Record<string, number>;
  email?: string;
  onSignOut: () => void;
  open: boolean;
}

export function Sidebar({ current, onNavigate, badges, email, onSignOut, open }: Props) {
  const item = (it: NavItem, badgeClass = '') => (
    <button key={it.id} className={`nav-item ${current === it.id ? 'active' : ''}`} onClick={() => onNavigate(it.id)}>
      <span className="nav-icon">{it.icon}</span> {it.label}
      {badges[it.id] ? <span className={`nav-badge ${badgeClass}`}>{badges[it.id]}</span> : null}
    </button>
  );
  const badgeClassFor: Record<string, string> = { inbox: '', decisions: 'purple', outbox: 'blue' };

  return (
    <nav id="sidebar" className={open ? 'open' : ''}>
      <div id="sidebar-title">Cadence</div>
      {NAV.map((grp) => (
        <React.Fragment key={grp.section}>
          <div className="nav-label">{grp.section}</div>
          {grp.items.map((it) => item(it, badgeClassFor[it.id] || ''))}
        </React.Fragment>
      ))}
      <div className="sidebar-footer">
        {FOOTER.map((it) => item(it))}
        {email && <div className="sidebar-user">{email}</div>}
        <button className="nav-item" onClick={onSignOut}><span className="nav-icon">⎋</span> Sign out</button>
      </div>
    </nav>
  );
}
