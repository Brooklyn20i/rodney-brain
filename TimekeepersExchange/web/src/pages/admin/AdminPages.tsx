import React, { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { store, useDb } from '../../lib/store'
import { Stat, SubmissionBadge, StateBadge, BuyerBadge, Badge, Empty, Field, Note } from '../../components/ui'
import { aud } from '../../lib/fees'
import { fmtDate, fmtDateTime, titleCase } from '../../lib/format'
import type { DisputeStatus } from '../../lib/types'

export function AdminDashboard() {
  const db = useDb()
  const subs = db.submissions
  const txs = db.transactions
  const completed = txs.filter((t) => t.state === 'completed')
  const totalValue = completed.reduce((a, t) => a + (t.amendedAmount ?? t.acceptedAmount), 0)
  const revenue = completed.reduce((a, t) => a + t.fees.sellerFee + t.fees.buyerPlatformFee + t.fees.authenticationFee + t.fees.shippingFee, 0)
  const offersPerWatch = subs.filter((s) => ['approved_for_offers', 'offer_accepted', 'sold', 'bidding_closed'].includes(s.status))
  const avgOffers = offersPerWatch.length
    ? (db.offers.filter((o) => offersPerWatch.some((s) => s.id === o.submissionId)).length / offersPerWatch.length).toFixed(1)
    : '—'
  const inspections = db.inspections
  // Seller uplift vs indicative dealer mid for accepted offers.
  const uplifts = txs.map((t) => {
    const s = subs.find((x) => x.id === t.submissionId)
    if (!s?.valuation) return null
    const dealerMid = (s.valuation.dealerOfferLow + s.valuation.dealerOfferHigh) / 2
    return ((t.acceptedAmount - t.fees.sellerFee) - dealerMid) / dealerMid
  }).filter((x): x is number => x !== null)
  const avgUplift = uplifts.length ? (uplifts.reduce((a, b) => a + b, 0) / uplifts.length * 100).toFixed(1) + '%' : '—'

  return (
    <>
      <header><h1>Operations overview</h1></header>
      <div className="grid grid-4">
        <Stat k="Submitted" v={subs.length} s={subs.filter((s) => ['submitted', 'under_review', 'info_required'].includes(s.status)).length + ' awaiting review'} />
        <Stat k="Open for offers" v={subs.filter((s) => s.status === 'approved_for_offers').length} />
        <Stat k="Active transactions" v={txs.filter((t) => !['completed', 'cancelled'].includes(t.state)).length} />
        <Stat k="Completed" v={completed.length} />
        <Stat k="Inspections pending" v={inspections.filter((i) => i.status !== 'submitted').length} />
        <Stat k="Disputes open" v={db.disputes.filter((d) => !['resolved', 'closed'].includes(d.status)).length} />
        <Stat k="Transaction value" v={aud(totalValue)} s="completed transactions" />
        <Stat k="Platform revenue" v={aud(revenue)} s="fees on completed transactions" />
        <Stat k="Avg offers / watch" v={avgOffers} />
        <Stat k="Avg seller uplift" v={avgUplift} s="net vs indicative dealer offer" />
        <Stat k="Inspection pass rate" v={inspections.filter((i) => i.outcome?.startsWith('passed')).length + '/' + inspections.filter((i) => i.status === 'submitted').length} s="incl. minor discrepancies" />
        <Stat k="Verified buyers" v={db.buyerProfiles.filter((b) => b.status === 'verified').length} s={db.buyerProfiles.filter((b) => ['applicant', 'under_review'].includes(b.status)).length + ' awaiting review'} />
      </div>

      <div className="grid grid-2" style={{ marginTop: 20, alignItems: 'start' }}>
        <div className="card">
          <div className="spread"><h3>Review queue</h3><Link className="small" to="/admin/watches">All submissions</Link></div>
          <div className="stack" style={{ marginTop: 12 }}>
            {subs.filter((s) => ['submitted', 'under_review', 'info_required'].includes(s.status)).map((s) => (
              <Link key={s.id} to={`/admin/watches/${s.id}`} className="spread card" style={{ textDecoration: 'none', padding: '12px 16px' }}>
                <div>
                  <strong>{s.brand} {s.model}</strong>
                  <div className="small muted">{s.reference} · {fmtDate(s.createdAt)}</div>
                </div>
                <SubmissionBadge status={s.status} />
              </Link>
            ))}
            {subs.filter((s) => ['submitted', 'under_review', 'info_required'].includes(s.status)).length === 0 && <p className="small muted">Queue clear.</p>}
          </div>
        </div>
        <div className="card">
          <div className="spread"><h3>Recent activity</h3><Link className="small" to="/admin/audit">Audit log</Link></div>
          <div className="stack" style={{ marginTop: 12, gap: 8 }}>
            {db.auditEvents.slice(0, 8).map((e) => (
              <div key={e.id} className="small" style={{ borderLeft: '2px solid var(--line-strong)', paddingLeft: 10 }}>
                <strong>{titleCase(e.action)}</strong> — {e.detail ?? e.entityId}
                <div className="muted">{fmtDateTime(e.at)} · {e.actorName}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  )
}

export function AdminWatches() {
  const db = useDb()
  const [q, setQ] = useState('')
  const [status, setStatus] = useState('')
  const subs = db.submissions.filter((s) =>
    (!q || `${s.brand} ${s.model} ${s.reference}`.toLowerCase().includes(q.toLowerCase())) &&
    (!status || s.status === status))
  return (
    <>
      <header><h1>Submissions</h1></header>
      <div className="card row" style={{ marginBottom: 14 }}>
        <Field label="Search"><input type="text" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Brand, model, reference" /></Field>
        <Field label="Status">
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">All</option>
            {['submitted', 'under_review', 'info_required', 'approved_for_offers', 'offer_accepted', 'sold', 'declined', 'withdrawn'].map((s) => <option key={s} value={s}>{titleCase(s)}</option>)}
          </select>
        </Field>
      </div>
      <div className="card card-flush table-wrap">
        <table className="tke">
          <thead><tr><th>Watch</th><th>Seller</th><th>Category</th><th className="num">Est. market</th><th>Offers</th><th>Status</th></tr></thead>
          <tbody>
            {subs.map((s) => {
              const seller = store.user(s.sellerId)
              const offers = db.offers.filter((o) => o.submissionId === s.id)
              return (
                <TrLink key={s.id} to={`/admin/watches/${s.id}`}>
                  <td><strong>{s.brand} {s.model}</strong><div className="small muted">{s.reference} · {s.year}</div></td>
                  <td className="small">{seller?.name}<div className="muted">{s.sellerLocation}</div></td>
                  <td className="small">{titleCase(s.category)}{s.flaggedForEnhancedInspection && <div className="muted">Enhanced inspection</div>}</td>
                  <td className="num small">{s.valuation ? `${aud(s.valuation.marketLow)}–${aud(s.valuation.marketHigh)}` : '—'}</td>
                  <td className="small">{offers.length}</td>
                  <td><SubmissionBadge status={s.status} /></td>
                </TrLink>
              )
            })}
          </tbody>
        </table>
      </div>
    </>
  )
}

function TrLink({ to, children }: { to: string; children: React.ReactNode }) {
  const nav = useNavigate()
  return <tr className="click" onClick={() => nav(to)}>{children}</tr>
}

export function AdminBuyers() {
  const db = useDb()
  const [editing, setEditing] = useState<string | null>(null)
  return (
    <>
      <header><h1>Buyer management</h1></header>
      <div className="card card-flush table-wrap">
        <table className="tke">
          <thead><tr><th>Buyer</th><th>Type</th><th className="num">Limit</th><th className="num">Trust</th><th>Record</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {db.buyerProfiles.map((b) => {
              const u = store.user(b.userId)!
              return (
                <tr key={b.userId}>
                  <td><strong>{b.businessName ?? u.name}</strong><div className="small muted">{u.name} · {b.abn ?? 'No ABN'} {b.vintageApproved && '· Vintage approved'}</div></td>
                  <td className="small">{titleCase(b.buyerType)}</td>
                  <td className="num">{aud(b.transactionLimit)}</td>
                  <td className="num">{b.trustScore}</td>
                  <td className="small">{b.settledCount} settled · {b.defaultedCount} defaulted</td>
                  <td><BuyerBadge status={b.status} /></td>
                  <td>
                    <div className="row" style={{ justifyContent: 'flex-end' }}>
                      {['applicant', 'under_review'].includes(b.status) && (
                        <>
                          <button className="btn btn-sm btn-primary" onClick={() => { store.setBuyerStatus(b.userId, 'verified'); store.updateBuyerProfile(b.userId, { transactionLimit: b.transactionLimit || 30000, trustScore: b.trustScore || 60, proofOfFundsProvided: true }) }}>Approve</button>
                          <button className="btn btn-sm btn-danger" onClick={() => store.setBuyerStatus(b.userId, 'rejected')}>Reject</button>
                        </>
                      )}
                      {b.status === 'verified' && (
                        <>
                          <button className="btn btn-sm btn-ghost" onClick={() => setEditing(editing === b.userId ? null : b.userId)}>Limits</button>
                          <button className="btn btn-sm btn-danger" onClick={() => store.setBuyerStatus(b.userId, 'suspended')}>Suspend</button>
                        </>
                      )}
                      {b.status === 'suspended' && (
                        <button className="btn btn-sm" onClick={() => store.setBuyerStatus(b.userId, 'verified')}>Reinstate</button>
                      )}
                    </div>
                    {editing === b.userId && (
                      <div className="row" style={{ marginTop: 8, justifyContent: 'flex-end' }}>
                        <input type="number" style={{ width: 130 }} defaultValue={b.transactionLimit}
                          onBlur={(e) => store.updateBuyerProfile(b.userId, { transactionLimit: Number(e.target.value) })} />
                        <label className="checkline small">
                          <input type="checkbox" defaultChecked={b.vintageApproved}
                            onChange={(e) => store.updateBuyerProfile(b.userId, { vintageApproved: e.target.checked })} />
                          Vintage
                        </label>
                      </div>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <p className="small muted" style={{ marginTop: 12 }}>
        Buyer approval is manual: identity, business, beneficial ownership where required, GST
        registration, dealer licensing where relevant, and proof of funds — mocked in the demo.
      </p>
    </>
  )
}

export function AdminTransactions() {
  const db = useDb()
  return (
    <>
      <header><h1>Transactions</h1></header>
      {db.transactions.length === 0 ? <Empty title="No transactions" /> : (
        <div className="card card-flush table-wrap">
          <table className="tke">
            <thead><tr><th>Watch</th><th>Seller</th><th>Buyer</th><th className="num">Amount</th><th className="num">Platform fees</th><th>State</th></tr></thead>
            <tbody>
              {db.transactions.map((t) => {
                const s = db.submissions.find((x) => x.id === t.submissionId)!
                return (
                  <TrLink key={t.id} to={`/admin/transactions/${t.id}`}>
                    <td><strong>{s.brand} {s.model}</strong><div className="small muted">{t.id}</div></td>
                    <td className="small">{store.user(t.sellerId)?.name}</td>
                    <td className="small">{store.user(t.buyerId)?.name}</td>
                    <td className="num">{aud(t.amendedAmount ?? t.acceptedAmount)}</td>
                    <td className="num small">{aud(t.fees.sellerFee + t.fees.buyerPlatformFee)}</td>
                    <td><StateBadge state={t.state} /></td>
                  </TrLink>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}

const DISPUTE_STATUSES: DisputeStatus[] = ['open', 'evidence', 'proposed_resolution', 'resolved', 'closed']

export function AdminDisputes() {
  const db = useDb()
  const [openId, setOpenId] = useState<string | null>(null)
  const [msg, setMsg] = useState('')
  return (
    <>
      <header><h1>Dispute management</h1></header>
      {db.disputes.length === 0 ? <Empty title="No disputes" body="Disputes opened from inspections or by parties appear here as managed cases." /> : (
        <div className="stack">
          {db.disputes.map((dp) => {
            const tx = db.transactions.find((t) => t.id === dp.transactionId)
            const s = tx ? db.submissions.find((x) => x.id === tx.submissionId) : undefined
            const expanded = openId === dp.id
            return (
              <div key={dp.id} className="card">
                <div className="spread" style={{ cursor: 'pointer' }} onClick={() => setOpenId(expanded ? null : dp.id)}>
                  <div>
                    <strong>{titleCase(dp.type)}</strong> — {s ? `${s.brand} ${s.model}` : dp.transactionId}
                    <div className="small muted">Opened {fmtDate(dp.openedAt)} · Owner {store.user(dp.ownerId)?.name} · {dp.summary}</div>
                  </div>
                  <Badge tone={['resolved', 'closed'].includes(dp.status) ? 'ok' : 'warn'}>{titleCase(dp.status)}</Badge>
                </div>
                {expanded && (
                  <div className="stack" style={{ marginTop: 14 }}>
                    <div className="stack" style={{ gap: 8 }}>
                      {dp.messages.map((m, i) => (
                        <div key={i} className="small" style={{ borderLeft: '2px solid var(--line-strong)', paddingLeft: 10 }}>
                          <strong>{m.author}</strong>: {m.text}
                          <div className="muted">{fmtDateTime(m.at)}</div>
                        </div>
                      ))}
                    </div>
                    {dp.proposedResolution && <Note tone="info"><strong>Proposed resolution:</strong> {dp.proposedResolution}{dp.financialAdjustment ? ` (adjustment ${aud(Math.abs(dp.financialAdjustment))})` : ''}</Note>}
                    {dp.finalDecision && <Note tone="ok"><strong>Final decision:</strong> {dp.finalDecision}</Note>}
                    <div className="row">
                      <input type="text" style={{ flex: 1, minWidth: 200 }} placeholder="Add a case message" value={msg} onChange={(e) => setMsg(e.target.value)} />
                      <button className="btn btn-sm" onClick={() => { if (msg) { store.addDisputeMessage(dp.id, msg); setMsg('') } }}>Add</button>
                      <select value={dp.status} onChange={(e) => store.updateDispute(dp.id, { status: e.target.value as DisputeStatus })}>
                        {DISPUTE_STATUSES.map((s2) => <option key={s2} value={s2}>{titleCase(s2)}</option>)}
                      </select>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </>
  )
}

export function AdminConfig() {
  const db = useDb()
  const [cfg, setCfg] = useState(db.feeConfig)
  return (
    <>
      <header><h1>Fees &amp; configuration</h1></header>
      <div className="grid grid-2" style={{ alignItems: 'start' }}>
        <form className="card stack" onSubmit={(e) => { e.preventDefault(); store.updateFeeConfig(cfg) }}>
          <h3>Fee schedule</h3>
          <Field label="Seller flat fee (AUD)"><input type="number" value={cfg.sellerFlatFee} onChange={(e) => setCfg({ ...cfg, sellerFlatFee: Number(e.target.value) })} /></Field>
          <Field label="Buyer platform fee (%)"><input type="number" step="0.5" value={cfg.buyerFeePct * 100} onChange={(e) => setCfg({ ...cfg, buyerFeePct: Number(e.target.value) / 100 })} /></Field>
          <Field label="Buyer fee minimum (AUD)"><input type="number" value={cfg.buyerFeeMin} onChange={(e) => setCfg({ ...cfg, buyerFeeMin: Number(e.target.value) })} /></Field>
          <Field label="Authentication fee (AUD)"><input type="number" value={cfg.authenticationFee} onChange={(e) => setCfg({ ...cfg, authenticationFee: Number(e.target.value) })} /></Field>
          <Field label="Insured shipping (AUD, both legs)"><input type="number" value={cfg.shippingFee} onChange={(e) => setCfg({ ...cfg, shippingFee: Number(e.target.value) })} /></Field>
          <button className="btn btn-primary" type="submit">Save configuration</button>
          <p className="small muted">Changes apply to new offers; existing transactions keep their agreed fees. All changes are audit-logged.</p>
        </form>
        <div className="stack">
          <div className="card">
            <h3>Revenue models supported</h3>
            <ul className="small" style={{ paddingLeft: 18, marginTop: 10, display: 'grid', gap: 6 }}>
              <li>Buyer transaction fee (active)</li>
              <li>Seller transaction fee (active)</li>
              <li>Fixed authentication fee (active)</li>
              <li>Premium seller service (backlog)</li>
              <li>Dealer subscription (backlog)</li>
              <li>Priority access / enhanced bidding tools (backlog)</li>
              <li>Consignment / instant-purchase service (later phase)</li>
            </ul>
          </div>
          <Note tone="warn">
            <strong>Compliance placeholders.</strong> Before launch: Australian Consumer Law
            review, privacy obligations (APPs), AML/CTF assessment, stolen-property checks,
            GST treatment, second-hand dealer licensing per state, payment/escrow licensing,
            insurance, and marketplace liability terms. See docs/legal-checklist.md in the
            repository. The software existing does not make the platform compliant.
          </Note>
        </div>
      </div>
    </>
  )
}

export function AdminAudit() {
  const db = useDb()
  const [q, setQ] = useState('')
  const events = db.auditEvents.filter((e) => !q || `${e.action} ${e.entity} ${e.actorName} ${e.detail}`.toLowerCase().includes(q.toLowerCase()))
  return (
    <>
      <header><h1>Audit log</h1></header>
      <div className="card row" style={{ marginBottom: 14 }}>
        <Field label="Filter"><input type="text" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Action, entity, actor" /></Field>
      </div>
      <div className="card card-flush table-wrap">
        <table className="tke">
          <thead><tr><th>When</th><th>Actor</th><th>Action</th><th>Entity</th><th>Detail</th></tr></thead>
          <tbody>
            {events.slice(0, 100).map((e) => (
              <tr key={e.id}>
                <td className="small muted" style={{ whiteSpace: 'nowrap' }}>{fmtDateTime(e.at)}</td>
                <td className="small">{e.actorName}</td>
                <td className="small"><strong>{titleCase(e.action)}</strong></td>
                <td className="small muted">{e.entity} · {e.entityId}</td>
                <td className="small">{e.detail ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="small muted" style={{ marginTop: 10 }}>
        Every state change is recorded. Sensitive financial and transaction records are never
        hard-deleted — status changes and soft deletion only.
      </p>
    </>
  )
}
