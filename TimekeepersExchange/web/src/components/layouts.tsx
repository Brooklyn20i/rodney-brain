import React, { useState } from 'react'
import { Link, NavLink, Outlet, useNavigate, Navigate } from 'react-router-dom'
import { store, useMe, useDb, roleHome } from '../lib/store'
import type { Role } from '../lib/types'
import { fmtDateTime } from '../lib/format'

function Wordmark({ to = '/' }: { to?: string }) {
  return (
    <Link to={to} className="wordmark">
      <span className="mark">◷</span>
      <span>The Timekeeper&rsquo;s Exchange</span>
    </Link>
  )
}

export function PublicLayout() {
  const me = useMe()
  return (
    <>
      <header className="pub-header">
        <div className="container">
          <Wordmark />
          <nav className="pub-nav links">
            <Link to="/how-it-works">How it works</Link>
            <Link to="/buyers">For buyers</Link>
            <Link to="/trust">Trust &amp; authentication</Link>
            <Link to="/fees">Fees</Link>
            <Link to="/journal">Journal</Link>
          </nav>
          <nav className="pub-nav">
            {me
              ? <Link to={roleHome(me.role)} className="btn btn-sm btn-primary">My dashboard</Link>
              : <>
                  <Link to="/signin">Sign in</Link>
                  <Link to="/sell" className="btn btn-sm btn-primary">Get offers for my watch</Link>
                </>}
          </nav>
        </div>
      </header>
      <main><Outlet /></main>
      <footer className="pub-footer">
        <div className="container cols">
          <div>
            <Wordmark />
            <p className="small muted" style={{ marginTop: 12, maxWidth: '26em' }}>
              Verified offers for exceptional watches. Australia-first. Your watch stays with
              you until you accept an offer.
            </p>
            <p className="small muted" style={{ marginTop: 12 }}>
              Demonstration platform. All listings, valuations and figures are illustrative.
            </p>
          </div>
          <div>
            <h4>Platform</h4>
            <Link to="/sell">Sell a watch</Link>
            <Link to="/buyers">For buyers</Link>
            <Link to="/how-it-works">How it works</Link>
            <Link to="/fees">Fees</Link>
            <Link to="/faq">FAQ</Link>
          </div>
          <div>
            <h4>Company</h4>
            <Link to="/about">About</Link>
            <Link to="/journal">Journal</Link>
            <Link to="/contact">Contact</Link>
            <Link to="/trust">Trust &amp; authentication</Link>
          </div>
          <div>
            <h4>Legal</h4>
            <Link to="/legal/terms">Terms</Link>
            <Link to="/legal/privacy">Privacy</Link>
            <Link to="/legal/seller-agreement">Seller agreement</Link>
            <Link to="/legal/buyer-agreement">Buyer agreement</Link>
            <Link to="/legal/authentication-policy">Authentication policy</Link>
            <Link to="/legal/dispute-policy">Dispute policy</Link>
          </div>
        </div>
      </footer>
    </>
  )
}

function Bell() {
  const me = useMe()
  const db = useDb()
  const nav = useNavigate()
  const [open, setOpen] = useState(false)
  if (!me) return null
  const items = db.notifications.filter((n) => n.userId === me.id).slice(0, 20)
  const unread = items.filter((n) => !n.read).length
  return (
    <div className="bellwrap">
      <button className="btn btn-sm btn-ghost" style={{ color: '#d9d4c8', borderColor: 'rgba(255,255,255,0.25)' }}
        onClick={() => { setOpen(!open); if (!open) store.markNotificationsRead(me.id) }}>
        Notifications{unread > 0 && ` (${unread})`}
        {unread > 0 && <span className="bell-dot" />}
      </button>
      {open && (
        <div className="notif-panel">
          {items.length === 0 && <div className="notif-item small muted">No notifications yet.</div>}
          {items.map((n) => (
            <a key={n.id} className={`notif-item ${n.read ? '' : 'unread'}`}
              style={{ cursor: n.link ? 'pointer' : 'default' }}
              onClick={() => { setOpen(false); if (n.link) nav(n.link) }}>
              <div style={{ fontWeight: 600, fontSize: '0.84rem' }}>{n.title}</div>
              <div className="small" style={{ color: 'var(--graphite)' }}>{n.body}</div>
              <div className="small muted">{fmtDateTime(n.at)}</div>
            </a>
          ))}
        </div>
      )}
    </div>
  )
}

const NAV: Record<Role, { to: string; label: string; end?: boolean }[]> = {
  seller: [
    { to: '/seller', label: 'Dashboard', end: true },
    { to: '/seller/submit', label: 'New submission' },
    { to: '/seller/transactions', label: 'Transactions' },
    { to: '/seller/verification', label: 'Profile & verification' },
  ],
  buyer: [
    { to: '/buyer', label: 'Dashboard', end: true },
    { to: '/buyer/opportunities', label: 'Opportunities' },
    { to: '/buyer/offers', label: 'My offers' },
    { to: '/buyer/transactions', label: 'Purchases' },
    { to: '/buyer/account', label: 'Account & preferences' },
  ],
  admin: [
    { to: '/admin', label: 'Overview', end: true },
    { to: '/admin/watches', label: 'Submissions' },
    { to: '/admin/buyers', label: 'Buyers' },
    { to: '/admin/transactions', label: 'Transactions' },
    { to: '/admin/disputes', label: 'Disputes' },
    { to: '/admin/config', label: 'Fees & configuration' },
    { to: '/admin/audit', label: 'Audit log' },
  ],
  watchmaker: [
    { to: '/watchmaker', label: 'Inspection queue', end: true },
  ],
}

export function PortalLayout({ role }: { role: Role }) {
  const me = useMe()
  const nav = useNavigate()
  if (!me) return <Navigate to="/signin" replace />
  if (me.role !== role) return <Navigate to={roleHome(me.role)} replace />
  return (
    <div className="portal">
      <aside className="sidebar">
        <Wordmark to="/" />
        <div className="role-tag">{role} portal</div>
        <nav>
          {NAV[role].map((i) => (
            <NavLink key={i.to} to={i.to} end={i.end}>{i.label}</NavLink>
          ))}
        </nav>
        <div className="stack" style={{ gap: 8 }}>
          <Bell />
          <div className="user-box">
            <div style={{ color: 'var(--ivory)', fontWeight: 600 }}>{me.name}</div>
            <div style={{ opacity: 0.7 }}>{me.email}</div>
            <button className="btn btn-sm btn-ghost" style={{ marginTop: 10, color: '#d9d4c8', borderColor: 'rgba(255,255,255,0.25)' }}
              onClick={() => { store.signOut(); nav('/') }}>
              Sign out
            </button>
          </div>
        </div>
      </aside>
      <div className="portal-main"><Outlet /></div>
    </div>
  )
}
