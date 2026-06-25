import React from 'react';

export interface NavItem { id: string; label: string; icon: string; }
export const NAV: { section: string; items: NavItem[] }[] = [
  { section: 'Day', items: [
    { id: 'dashboard', label: 'Dashboard', icon: '⊞' },
    { id: 'today', label: 'Control', icon: '☀' },
    { id: 'tasks', label: 'Tasks', icon: '◎' },
    { id: 'inbox', label: 'Inbox', icon: '↓' },
    { id: 'notes', label: 'Notes', icon: '✎' },
  ]},
  { section: 'Work', items: [
    { id: 'projects', label: 'Projects', icon: '▤' },
    { id: 'people', label: 'People', icon: '✦' },
    { id: 'meetings', label: 'Meetings', icon: '🗓' },
  ]},
  { section: 'Agents', items: [
    { id: 'ace', label: 'Ace', icon: '◆' },
    { id: 'kobe', label: 'Kobe', icon: '⚡' },
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
  badges: Record<string, { count: number; cls: string }>;
  open: boolean;
  workspaceName: string | null;
}

export function Sidebar({ current, onNavigate, badges, open, workspaceName }: Props) {
  const item = (it: NavItem) => {
    const b = badges[it.id];
    return (
      <button key={it.id} className={`nav-item ${current === it.id ? 'active' : ''}`} onClick={() => onNavigate(it.id)}>
        <span className="nav-icon">{it.icon}</span> {it.label}
        {b && b.count > 0 ? <span className={`nav-badge ${b.cls}`}>{b.count}</span> : null}
      </button>
    );
  };

  return (
    <nav id="sidebar" className={open ? 'open' : ''}>
      <div id="sidebar-title">Cadence</div>
      {NAV.map((grp, i) => (
        <React.Fragment key={grp.section}>
          {i > 0 && <div className="nav-sep" />}
          <div className="nav-section-label">{grp.section}</div>
          {grp.items.map(item)}
        </React.Fragment>
      ))}
      <div id="sidebar-footer">
        {FOOTER.map(item)}
        <div id="sync-status"><span className="status-dot" /> Live sync on</div>
        <div id="sidebar-signature">{workspaceName ?? 'My workspace'} · Cadence</div>
      </div>
    </nav>
  );
}
