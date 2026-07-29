import React, { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { store, useDb, useMe } from '../../lib/store'
import { SubmissionBadge, Stat, Empty, Field, Note, Badge, WatchThumb } from '../../components/ui'
import { aud } from '../../lib/fees'
import { fmtDate, timeRemaining } from '../../lib/format'

export function SellerDashboard() {
  const db = useDb()
  const me = useMe()!
  const profile = store.sellerProfile(me.id)
  const mine = db.submissions.filter((s) => s.sellerId === me.id)
  const activeOffers = (id: string) => db.offers.filter((o) => o.submissionId === id && o.status === 'active')
  const txs = db.transactions.filter((t) => t.sellerId === me.id)

  return (
    <>
      <header className="spread">
        <div>
          <h1>Welcome back, {me.name.split(' ')[0]}</h1>
          <p className="muted small">Your submissions, offers, and transactions — all in one place.</p>
        </div>
        <Link to="/seller/submit" className="btn btn-primary">Get offers for a watch</Link>
      </header>

      {profile?.kycStatus !== 'verified' && (
        <Note tone="warn">
          <strong>Identity verification incomplete.</strong> You can submit watches now, but
          verification is required before you can accept an offer.{' '}
          <Link to="/seller/verification">Complete verification</Link>
        </Note>
      )}

      <div className="grid grid-3" style={{ margin: '18px 0' }}>
        <Stat k="Active submissions" v={mine.filter((s) => !['sold', 'declined', 'withdrawn'].includes(s.status)).length} />
        <Stat k="Offers received" v={db.offers.filter((o) => mine.some((s) => s.id === o.submissionId)).length} />
        <Stat k="Transactions" v={txs.length} s={txs.filter((t) => t.state === 'completed').length + ' completed'} />
      </div>

      <h4 style={{ margin: '26px 0 10px' }}>Your watches</h4>
      {mine.length === 0 && (
        <Empty title="No submissions yet" body="Submit your first watch — it stays with you until you accept an offer." />
      )}
      <div className="stack">
        {mine.map((s) => {
          const offers = activeOffers(s.id)
          const best = offers.length ? Math.max(...offers.map((o) => o.amount)) : null
          const tx = db.transactions.find((t) => t.submissionId === s.id)
          return (
            <Link key={s.id} to={tx && ['offer_accepted', 'sold'].includes(s.status) ? `/seller/transactions/${tx.id}` : `/seller/submissions/${s.id}`}
              className="card spread" style={{ textDecoration: 'none' }}>
              <div className="row">
                <WatchThumb brand={s.brand} />
                <div>
                  <strong>{s.brand} {s.model}</strong>
                  <div className="small muted">{s.reference} · {s.year} · Submitted {fmtDate(s.createdAt)}</div>
                </div>
              </div>
              <div className="row">
                {s.status === 'approved_for_offers' && s.bidWindow && (
                  <>
                    <Badge tone="gold">{offers.length} offer{offers.length === 1 ? '' : 's'}</Badge>
                    {best && s.bidWindow.sellerSeesLeadingPrice && <Badge tone="olive">Highest {aud(best)}</Badge>}
                    <Badge tone="neutral">{timeRemaining(s.bidWindow.closesAt).label}</Badge>
                  </>
                )}
                <SubmissionBadge status={s.status} />
              </div>
            </Link>
          )
        })}
      </div>
    </>
  )
}

export function SellerVerification() {
  const me = useMe()!
  const db = useDb()
  const nav = useNavigate()
  const profile = store.sellerProfile(me.id)
  const [form, setForm] = useState({
    legalName: profile?.legalName ?? me.name,
    dob: '', address: '', mobile: '', bank: '',
    idUploaded: profile?.idDocumentUploaded ?? false,
    owns: false, notStolen: false,
  })
  if (!profile) return null
  const verified = profile.kycStatus === 'verified'

  return (
    <>
      <header>
        <h1>Profile &amp; verification</h1>
        <p className="muted small">Identity and ownership verification is required before you can accept an offer.</p>
      </header>

      <div className="grid grid-2" style={{ alignItems: 'start' }}>
        <div className="card">
          <div className="spread">
            <h3>Identity verification</h3>
            {verified ? <Badge tone="ok">Verified</Badge> : <Badge tone="warn">{profile.kycStatus.replace('_', ' ')}</Badge>}
          </div>
          {verified ? (
            <div className="stack" style={{ marginTop: 14 }}>
              <div className="kv">
                <dt>Legal name</dt><dd>{profile.legalName}</dd>
                <dt>Government ID</dt><dd>Uploaded &amp; verified (mock)</dd>
                <dt>Bank account</dt><dd>{profile.payoutAccountMasked ?? 'Confirmed'} — ownership confirmed</dd>
                <dt>Ownership declaration</dt><dd>Accepted</dd>
                <dt>Not-stolen declaration</dt><dd>Accepted</dd>
              </div>
              <Note tone="info">
                Production integrates an Australian-compatible KYC provider (Stripe Identity,
                Persona, or FrankieOne) behind this same interface.
              </Note>
            </div>
          ) : (
            <form
              className="stack" style={{ marginTop: 14 }}
              onSubmit={(e) => {
                e.preventDefault()
                if (!form.owns || !form.notStolen) return
                store.completeKyc(me.id, {
                  legalName: form.legalName,
                  idDocumentUploaded: true,
                  bankAccountConfirmed: true,
                  ownershipDeclarationAccepted: true,
                  notStolenDeclarationAccepted: true,
                  payoutAccountMasked: '•••• ' + (form.bank.slice(-4) || '0000'),
                })
                nav('/seller')
              }}
            >
              <Field label="Full legal name" required><input type="text" required value={form.legalName} onChange={(e) => setForm({ ...form, legalName: e.target.value })} /></Field>
              <div className="grid grid-2">
                <Field label="Date of birth" required><input type="date" required value={form.dob} onChange={(e) => setForm({ ...form, dob: e.target.value })} /></Field>
                <Field label="Mobile number" required><input type="tel" required value={form.mobile} onChange={(e) => setForm({ ...form, mobile: e.target.value })} /></Field>
              </div>
              <Field label="Residential address" required><input type="text" required value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></Field>
              <Field label="Government ID" hint="Driver licence or passport. Mock upload — production uses the KYC provider's capture flow.">
                <button type="button" className={`btn btn-sm ${form.idUploaded ? 'btn-primary' : 'btn-ghost'}`}
                  onClick={() => setForm({ ...form, idUploaded: true })}>
                  {form.idUploaded ? '✓ ID uploaded (mock)' : 'Upload ID (mock)'}
                </button>
              </Field>
              <Field label="Bank account for payout" required hint="Ownership of the account is confirmed before settlement.">
                <input type="text" required placeholder="BSB and account number" value={form.bank} onChange={(e) => setForm({ ...form, bank: e.target.value })} />
              </Field>
              <label className="checkline">
                <input type="checkbox" checked={form.owns} onChange={(e) => setForm({ ...form, owns: e.target.checked })} />
                I declare that I am the legal owner of any watch I submit for sale.
              </label>
              <label className="checkline">
                <input type="checkbox" checked={form.notStolen} onChange={(e) => setForm({ ...form, notStolen: e.target.checked })} />
                I declare that the item is not stolen, encumbered, or subject to an insurance claim.
              </label>
              <button className="btn btn-primary" disabled={!form.owns || !form.notStolen || !form.idUploaded} type="submit">
                Complete verification (mock)
              </button>
            </form>
          )}
        </div>

        <div className="card">
          <h3>Account</h3>
          <div className="kv" style={{ marginTop: 12 }}>
            <dt>Name</dt><dd>{me.name}</dd>
            <dt>Email</dt><dd>{me.email}</dd>
            <dt>Location</dt><dd>{profile.location}, {profile.state}</dd>
            <dt>Member since</dt><dd>{fmtDate(me.createdAt)}</dd>
          </div>
          <hr className="divider" />
          <h4>Privacy</h4>
          <p className="small muted" style={{ marginTop: 8 }}>
            Buyers only ever see your city and your watch&rsquo;s details. Your name, address, and
            contact details are never disclosed to buyers.
          </p>
        </div>
      </div>
    </>
  )
}
