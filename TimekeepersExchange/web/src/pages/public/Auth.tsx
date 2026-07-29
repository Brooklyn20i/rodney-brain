import React, { useState } from 'react'
import { useNavigate, useSearchParams, Link } from 'react-router-dom'
import { store, useDb, roleHome } from '../../lib/store'
import { Field, Note, Badge } from '../../components/ui'
import type { BuyerType } from '../../lib/types'

const DEMO_ACCOUNTS: { id: string; label: string; detail: string }[] = [
  { id: 'u-seller1', label: 'Alexandra Chen — Seller', detail: 'Rolex GMT with 5 live sealed offers; a Cartier Santos in review.' },
  { id: 'u-seller2', label: 'Marcus Webb — Seller', detail: 'AP Royal Oak mid-transaction (minor discrepancy at inspection).' },
  { id: 'u-buyer1', label: 'James Halloran — Buyer (dealer)', detail: 'Halloran & Co Fine Watches. Verified, active offers, one completed purchase.' },
  { id: 'u-buyer2', label: 'Priya Nair — Buyer (dealer)', detail: 'Collins Street Timepieces. Holds the leading sealed offer on the GMT.' },
  { id: 'u-buyer4', label: 'Grace Liu — Buyer (trader)', detail: 'Must review the Royal Oak discrepancy: proceed, amend, or cancel.' },
  { id: 'u-buyer5', label: 'Oliver Stanton — Buyer (vintage dealer)', detail: 'Approved for vintage/specialist lots.' },
  { id: 'u-wm1', label: 'Henrik Larsen — Watchmaker', detail: 'Meridian Watch Services. Inspection queue.' },
  { id: 'u-admin', label: 'Eleanor Voss — Administrator', detail: 'Full operations: review queue, buyers, transactions, disputes, audit.' },
]

export function SignIn() {
  const db = useDb()
  const nav = useNavigate()
  const [params] = useSearchParams()
  const next = params.get('next')
  const wantSeller = params.get('role') === 'seller'
  const [mode, setMode] = useState<'demo' | 'register'>(wantSeller ? 'register' : 'demo')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [location, setLocation] = useState('')
  const [stateAu, setStateAu] = useState('NSW')

  const go = (id: string) => {
    store.signIn(id)
    const u = db.users.find((x) => x.id === id)!
    nav(next ?? roleHome(u.role))
  }

  return (
    <section className="section">
      <div className="container" style={{ maxWidth: 720 }}>
        <h1 style={{ marginBottom: 6 }}>Sign in</h1>
        <p className="muted" style={{ marginBottom: 20 }}>
          Demonstration build — authentication is mocked. Production supports email &amp; password,
          magic link, Google and Apple sign-in, with MFA-ready architecture.
        </p>
        <div className="pill-tabs" style={{ marginBottom: 18 }}>
          <button className={mode === 'demo' ? 'on' : ''} onClick={() => setMode('demo')}>Demo accounts</button>
          <button className={mode === 'register' ? 'on' : ''} onClick={() => setMode('register')}>New seller account</button>
        </div>

        {mode === 'demo' && (
          <div className="stack">
            {DEMO_ACCOUNTS.map((a) => (
              <button key={a.id} className="card spread" style={{ cursor: 'pointer', textAlign: 'left', width: '100%' }} onClick={() => go(a.id)}>
                <div>
                  <strong>{a.label}</strong>
                  <div className="small muted">{a.detail}</div>
                </div>
                <Badge tone="olive">Sign in</Badge>
              </button>
            ))}
            <Note tone="info">
              Want to see the buyer application flow instead? <Link to="/apply">Apply as a buyer</Link>.
            </Note>
          </div>
        )}

        {mode === 'register' && (
          <form
            className="card stack"
            onSubmit={(e) => {
              e.preventDefault()
              if (!name || !email || !location) return
              store.registerSeller(name, email, location, stateAu)
              nav(next ?? '/seller')
            }}
          >
            <Field label="Full name" required><input type="text" value={name} onChange={(e) => setName(e.target.value)} required /></Field>
            <Field label="Email" required><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></Field>
            <div className="grid grid-2">
              <Field label="City / suburb" required hint="Only your city is ever shown to buyers.">
                <input type="text" value={location} onChange={(e) => setLocation(e.target.value)} required />
              </Field>
              <Field label="State">
                <select value={stateAu} onChange={(e) => setStateAu(e.target.value)}>
                  {['NSW', 'VIC', 'QLD', 'WA', 'SA', 'TAS', 'ACT', 'NT'].map((s) => <option key={s}>{s}</option>)}
                </select>
              </Field>
            </div>
            <Note tone="info">
              You can submit a watch immediately. Identity verification is required before you can
              accept an offer.
            </Note>
            <button className="btn btn-primary" type="submit">Create account</button>
          </form>
        )}
      </div>
    </section>
  )
}

export function BuyerApply() {
  const nav = useNavigate()
  const [done, setDone] = useState(false)
  const [form, setForm] = useState({
    name: '', email: '', buyerType: 'dealer' as BuyerType, businessName: '', abn: '', brands: 'Rolex, Omega',
  })
  if (done) {
    return (
      <section className="section">
        <div className="container" style={{ maxWidth: 640 }}>
          <div className="card" style={{ textAlign: 'center', padding: 44 }}>
            <h2>Application received</h2>
            <p className="muted" style={{ margin: '12px 0 20px' }}>
              Buyer approval is manual. Our team reviews identity, business details, and proof of
              funds before granting access — typically within two business days. You&rsquo;ll be
              notified by email.
            </p>
            <button className="btn btn-primary" onClick={() => nav('/')}>Return home</button>
          </div>
        </div>
      </section>
    )
  }
  return (
    <section className="section">
      <div className="container" style={{ maxWidth: 680 }}>
        <h1 style={{ marginBottom: 6 }}>Apply as a buyer</h1>
        <p className="muted" style={{ marginBottom: 20 }}>
          Access is limited to verified dealers, professional traders, collectors, and institutional
          buyers. All applications are manually reviewed.
        </p>
        <form
          className="card stack"
          onSubmit={(e) => {
            e.preventDefault()
            store.applyAsBuyer({
              name: form.name, email: form.email, buyerType: form.buyerType,
              businessName: form.businessName || undefined, abn: form.abn || undefined,
              preferredBrands: form.brands.split(',').map((s) => s.trim()).filter(Boolean),
            })
            store.signOut()
            setDone(true)
          }}
        >
          <div className="grid grid-2">
            <Field label="Legal name" required><input type="text" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
            <Field label="Email" required><input type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
          </div>
          <div className="grid grid-2">
            <Field label="Buyer type" required>
              <select value={form.buyerType} onChange={(e) => setForm({ ...form, buyerType: e.target.value as BuyerType })}>
                <option value="dealer">Dealer</option>
                <option value="professional_trader">Professional trader</option>
                <option value="collector">Collector</option>
                <option value="institutional">Institutional buyer</option>
              </select>
            </Field>
            <Field label="Business name (if applicable)"><input type="text" value={form.businessName} onChange={(e) => setForm({ ...form, businessName: e.target.value })} /></Field>
          </div>
          <div className="grid grid-2">
            <Field label="ABN / company number" hint="Required for dealers and traders.">
              <input type="text" value={form.abn} onChange={(e) => setForm({ ...form, abn: e.target.value })} />
            </Field>
            <Field label="Preferred brands" hint="Comma-separated — used to match opportunities.">
              <input type="text" value={form.brands} onChange={(e) => setForm({ ...form, brands: e.target.value })} />
            </Field>
          </div>
          <Note tone="info">
            After this application, verification covers identity, beneficial ownership where
            required, GST registration status, dealer licensing where relevant, payment method, and
            proof of funds or a transaction limit. These steps are mocked in the demonstration and
            completed by the administrator.
          </Note>
          <button className="btn btn-primary" type="submit">Submit application</button>
        </form>
      </div>
    </section>
  )
}
