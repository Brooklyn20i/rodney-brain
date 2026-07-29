import React, { useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { store, useDb } from '../../lib/store'
import { SubmissionBadge, Badge, Note, Field, OfferBadge } from '../../components/ui'
import { aud } from '../../lib/fees'
import { fmtDate, fmtDateTime, daysFromNow, titleCase, timeRemaining } from '../../lib/format'
import type { WatchCategory, BiddingMode } from '../../lib/types'

export function AdminWatchReview() {
  const { id } = useParams()
  const db = useDb()
  const nav = useNavigate()
  const s = db.submissions.find((x) => x.id === id)
  const [infoReq, setInfoReq] = useState('')
  const [note, setNote] = useState('')
  const [category, setCategory] = useState<WatchCategory>(s?.category ?? 'standard')
  const [mode, setMode] = useState<BiddingMode>('sealed')
  const [days, setDays] = useState(4)
  const [reserve, setReserve] = useState(s?.minimumPrice ? String(s.minimumPrice) : '')
  const [enhanced, setEnhanced] = useState(s?.flaggedForEnhancedInspection ?? false)
  const [vintageOnly, setVintageOnly] = useState(s?.restrictedToVintageBuyers ?? false)
  const [showLeading, setShowLeading] = useState(true)
  const verifiedBuyers = db.buyerProfiles.filter((b) => b.status === 'verified')
  const [invited, setInvited] = useState<string[]>(verifiedBuyers.map((b) => b.userId))
  if (!s) return <Note tone="bad">Submission not found.</Note>

  const seller = store.user(s.sellerId)
  const sellerProfile = store.sellerProfile(s.sellerId)
  const offers = db.offers.filter((o) => o.submissionId === s.id)
  const tx = db.transactions.find((t) => t.submissionId === s.id)
  const reviewable = ['submitted', 'under_review', 'info_required'].includes(s.status)
  const eligibleForInvite = vintageOnly ? verifiedBuyers.filter((b) => b.vintageApproved) : verifiedBuyers

  return (
    <>
      <header className="spread">
        <div>
          <h1>{s.brand} {s.model}</h1>
          <p className="muted small">{s.reference} · {s.year} · Submitted {fmtDate(s.createdAt)} by {seller?.name} ({s.sellerLocation})</p>
        </div>
        <div className="row">
          {s.flaggedForEnhancedInspection && <Badge tone="warn">Enhanced inspection</Badge>}
          {s.restrictedToVintageBuyers && <Badge tone="gold">Vintage buyers only</Badge>}
          <SubmissionBadge status={s.status} />
          {tx && <Link to={`/admin/transactions/${tx.id}`} className="btn btn-sm">Transaction</Link>}
        </div>
      </header>

      <div className="grid grid-2" style={{ alignItems: 'start', marginTop: 8 }}>
        <div className="stack">
          <div className="card">
            <h3>Declared details</h3>
            <div className="kv" style={{ marginTop: 10 }}>
              <dt>Condition</dt><dd>{titleCase(s.condition)}</dd>
              <dt>Set</dt><dd>{s.boxIncluded && s.papersIncluded ? 'Full set' : [s.boxIncluded && 'Box', s.papersIncluded && 'Papers'].filter(Boolean).join(', ') || 'Watch only'}</dd>
              <dt>Service history</dt><dd>{s.serviceHistory}</dd>
              <dt>Polishing</dt><dd>{s.polishingHistory}</dd>
              <dt>Aftermarket parts</dt><dd>{s.aftermarketParts}</dd>
              <dt>Known flaws</dt><dd>{s.knownFlaws || 'None declared'}</dd>
              <dt>Serial (masked)</dt><dd>{s.serialMasked}</dd>
              <dt>Sale timing</dt><dd>{s.saleTiming}</dd>
              <dt>Seller reserve</dt><dd>{s.minimumPrice ? aud(s.minimumPrice) : 'None'}</dd>
              <dt>Seller KYC</dt><dd>{sellerProfile?.kycStatus === 'verified' ? '✓ Verified' : '⚠ ' + titleCase(sellerProfile?.kycStatus ?? 'not started')}</dd>
              <dt>Stolen-watch check</dt><dd>Clear (mock — production: police/insurer registers)</dd>
            </div>
          </div>

          {s.aiIdentification && (
            <div className="card">
              <div className="spread">
                <h3>AI preliminary review</h3>
                <Badge tone={s.aiIdentification.confidence > 0.8 ? 'ok' : 'warn'}>{Math.round(s.aiIdentification.confidence * 100)}% confidence</Badge>
              </div>
              <div className="kv" style={{ marginTop: 10 }}>
                <dt>Identified as</dt><dd>{s.aiIdentification.brand} {s.aiIdentification.model} ({s.aiIdentification.likelyReference})</dd>
                <dt>Human review</dt><dd>{s.aiIdentification.humanReviewRequired ? 'Required' : 'Optional'}</dd>
                <dt>Valuation</dt><dd>{s.valuation ? `${aud(s.valuation.marketLow)}–${aud(s.valuation.marketHigh)} · liquidity ${s.valuation.liquidityScore}/100` : '—'}</dd>
              </div>
              <p className="small muted" style={{ marginTop: 10 }}>
                {s.aiIdentification.limitations.join(' ')}
              </p>
            </div>
          )}

          {offers.length > 0 && (
            <div className="card">
              <div className="spread">
                <h3>Offers</h3>
                {s.bidWindow && s.status === 'approved_for_offers' && <Badge tone="gold">{timeRemaining(s.bidWindow.closesAt).label}</Badge>}
              </div>
              <div className="stack" style={{ marginTop: 10 }}>
                {offers.slice().sort((a, b) => b.amount - a.amount).map((o) => (
                  <div key={o.id} className="spread small">
                    <div>
                      <strong>{aud(o.amount)}</strong> · {store.buyerProfile(o.buyerId)?.businessName ?? store.user(o.buyerId)?.name}
                      <div className="muted">{titleCase(o.type)}{o.conditions ? ` — ${o.conditions}` : ''}{o.noteToAdmin ? ` · Note: ${o.noteToAdmin}` : ''}</div>
                    </div>
                    <OfferBadge status={o.status} />
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="card">
            <h3>Admin notes</h3>
            <div className="stack" style={{ marginTop: 10, gap: 8 }}>
              {s.adminNotes.map((n) => (
                <div key={n.id} className="small" style={{ borderLeft: '2px solid var(--line-strong)', paddingLeft: 10 }}>
                  {n.text}
                  <div className="muted">{fmtDateTime(n.createdAt)} · {store.user(n.authorId)?.name}</div>
                </div>
              ))}
            </div>
            <div className="row" style={{ marginTop: 10 }}>
              <input type="text" style={{ flex: 1, minWidth: 180 }} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Add an internal note" />
              <button className="btn btn-sm" onClick={() => { if (note) { store.adminAddNote(s.id, note); setNote('') } }}>Add</button>
            </div>
          </div>
        </div>

        <div className="stack">
          {reviewable ? (
            <div className="card stack">
              <h3>Review decision</h3>
              {s.status !== 'under_review' && (
                <button className="btn btn-sm btn-ghost" onClick={() => store.adminSetSubmissionStatus(s.id, 'under_review')}>Mark under review</button>
              )}
              <Field label="Category">
                <select value={category} onChange={(e) => { setCategory(e.target.value as WatchCategory); if (e.target.value !== 'standard') setEnhanced(true) }}>
                  <option value="standard">Standard</option>
                  <option value="vintage">Vintage</option>
                  <option value="specialist">Specialist</option>
                </select>
              </Field>
              <div className="grid grid-2">
                <Field label="Bidding mode">
                  <select value={mode} onChange={(e) => setMode(e.target.value as BiddingMode)}>
                    <option value="sealed">Sealed offers (default)</option>
                    <option value="managed_auction">Managed auction</option>
                  </select>
                </Field>
                <Field label="Bidding window (days)">
                  <select value={days} onChange={(e) => setDays(Number(e.target.value))}>
                    {[2, 3, 4, 5, 7, 10].map((d) => <option key={d} value={d}>{d}</option>)}
                  </select>
                </Field>
              </div>
              <Field label="Reserve (AUD, optional)" hint="Defaults to the seller's private minimum.">
                <input type="number" value={reserve} onChange={(e) => setReserve(e.target.value)} />
              </Field>
              <label className="checkline"><input type="checkbox" checked={enhanced} onChange={(e) => setEnhanced(e.target.checked)} /> Flag for enhanced inspection</label>
              <label className="checkline"><input type="checkbox" checked={vintageOnly} onChange={(e) => setVintageOnly(e.target.checked)} /> Restrict to approved vintage buyers</label>
              <label className="checkline"><input type="checkbox" checked={showLeading} onChange={(e) => setShowLeading(e.target.checked)} /> Seller sees the leading price</label>
              <Field label={`Invite buyers (${invited.filter((i) => eligibleForInvite.some((b) => b.userId === i)).length} of ${eligibleForInvite.length} eligible)`}>
                <div className="stack" style={{ gap: 6 }}>
                  {eligibleForInvite.map((b) => (
                    <label key={b.userId} className="checkline small">
                      <input type="checkbox" checked={invited.includes(b.userId)}
                        onChange={(e) => setInvited(e.target.checked ? [...invited, b.userId] : invited.filter((x) => x !== b.userId))} />
                      {b.businessName ?? store.user(b.userId)?.name} · limit {aud(b.transactionLimit)}{b.vintageApproved ? ' · vintage' : ''}
                    </label>
                  ))}
                </div>
              </Field>
              <div className="row">
                <button className="btn btn-accent" onClick={() => {
                  store.adminApproveForOffers(s.id, {
                    mode, opensAt: daysFromNow(0), closesAt: daysFromNow(days),
                    reserve: reserve ? Number(reserve) : undefined, minimumIncrement: 100,
                    invitedBuyerIds: invited.filter((i) => eligibleForInvite.some((b) => b.userId === i)),
                    extensionsUsed: 0, sellerSeesLeadingPrice: showLeading,
                  }, category, { enhanced, vintageOnly })
                }}>
                  Approve for offers
                </button>
                <button className="btn btn-danger" onClick={() => { const r = prompt('Reason for declining (sent to seller):'); if (r) { store.adminSetSubmissionStatus(s.id, 'declined', r); nav('/admin/watches') } }}>
                  Decline
                </button>
              </div>
              <hr className="divider" />
              <Field label="Request more information / photographs">
                <textarea value={infoReq} onChange={(e) => setInfoReq(e.target.value)} placeholder="e.g. Please photograph the movement and inside caseback" />
              </Field>
              <button className="btn btn-ghost" disabled={!infoReq} onClick={() => { store.adminRequestInfo(s.id, infoReq); setInfoReq('') }}>
                Send information request
              </button>
            </div>
          ) : (
            <div className="card">
              <h3>Bidding controls</h3>
              {s.bidWindow && s.status === 'approved_for_offers' ? (
                <div className="stack" style={{ marginTop: 10 }}>
                  <div className="kv">
                    <dt>Mode</dt><dd>{s.bidWindow.mode === 'sealed' ? 'Sealed offers' : 'Managed auction'}</dd>
                    <dt>Closes</dt><dd>{fmtDateTime(s.bidWindow.closesAt)} ({timeRemaining(s.bidWindow.closesAt).label})</dd>
                    <dt>Reserve</dt><dd>{s.bidWindow.reserve ? aud(s.bidWindow.reserve) : 'None'}</dd>
                    <dt>Invited buyers</dt><dd>{s.bidWindow.invitedBuyerIds.length}</dd>
                  </div>
                  <div className="row">
                    <button className="btn btn-sm btn-ghost" onClick={() => store.extendBidWindow(s.id)} disabled={s.bidWindow.extensionsUsed >= 1}>Extend +2 days</button>
                    <button className="btn btn-sm btn-danger" onClick={() => store.adminSetSubmissionStatus(s.id, 'suspended', 'Bidding suspended by administrator')}>Suspend bidding</button>
                  </div>
                </div>
              ) : s.status === 'suspended' ? (
                <button className="btn btn-sm" style={{ marginTop: 10 }} onClick={() => store.adminSetSubmissionStatus(s.id, 'approved_for_offers', 'Bidding reopened')}>Reopen bidding</button>
              ) : (
                <p className="small muted" style={{ marginTop: 8 }}>No active bidding window.</p>
              )}
            </div>
          )}

          {s.infoRequests.length > 0 && (
            <div className="card">
              <h3>Information requests</h3>
              <ul className="small" style={{ paddingLeft: 18, marginTop: 8 }}>
                {s.infoRequests.map((r, i) => <li key={i}>{r}</li>)}
              </ul>
            </div>
          )}
        </div>
      </div>
    </>
  )
}
