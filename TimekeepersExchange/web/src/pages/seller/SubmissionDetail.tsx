import React, { useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { store, useDb, useMe } from '../../lib/store'
import { SubmissionBadge, OfferBadge, Note, Badge, Modal, FeeTable, WatchThumb } from '../../components/ui'
import { aud, computeFees } from '../../lib/fees'
import { fmtDate, timeRemaining, titleCase } from '../../lib/format'

export function SubmissionDetail() {
  const { id } = useParams()
  const db = useDb()
  const me = useMe()!
  const nav = useNavigate()
  const s = db.submissions.find((x) => x.id === id && x.sellerId === me.id)
  const [acceptId, setAcceptId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  if (!s) return <Note tone="bad">Submission not found.</Note>

  const offers = db.offers.filter((o) => o.submissionId === s.id)
  const active = offers.filter((o) => o.status === 'active')
  const best = active.length ? Math.max(...active.map((o) => o.amount)) : null
  const profile = store.sellerProfile(me.id)
  const v = s.valuation
  const tx = db.transactions.find((t) => t.submissionId === s.id)
  const reserveMet = s.minimumPrice ? (best ?? 0) >= s.minimumPrice : true
  const window = s.bidWindow
  const remaining = window ? timeRemaining(window.closesAt) : null
  const acceptOffer = acceptId ? offers.find((o) => o.id === acceptId) : null

  return (
    <>
      <header className="spread">
        <div className="row">
          <WatchThumb brand={s.brand} />
          <div>
            <h1>{s.brand} {s.model}</h1>
            <p className="muted small">{s.reference} · {s.year} · Submitted {fmtDate(s.createdAt)}</p>
          </div>
        </div>
        <div className="row">
          <SubmissionBadge status={s.status} />
          {tx && <Link className="btn btn-sm" to={`/seller/transactions/${tx.id}`}>View transaction</Link>}
        </div>
      </header>

      {s.status === 'info_required' && s.infoRequests.length > 0 && (
        <Note tone="warn">
          <strong>More information required:</strong> {s.infoRequests[s.infoRequests.length - 1]}
          <div style={{ marginTop: 8 }}>
            <button className="btn btn-sm" onClick={() => store.adminSetSubmissionStatus(s.id, 'under_review', 'Seller responded (demo)')}>
              I&rsquo;ve added this — resubmit (demo)
            </button>
          </div>
        </Note>
      )}

      <div className="grid grid-2" style={{ alignItems: 'start', marginTop: 14 }}>
        <div className="stack">
          {/* Offers panel */}
          <div className="card">
            <div className="spread">
              <h3>Offers</h3>
              {window && s.status === 'approved_for_offers' && (
                <div className="row">
                  <Badge tone="neutral">{window.mode === 'sealed' ? 'Sealed offers' : 'Managed auction'}</Badge>
                  <Badge tone={remaining?.expired ? 'neutral' : 'gold'}>{remaining?.label}</Badge>
                </div>
              )}
            </div>
            {window && s.status === 'approved_for_offers' && (
              <p className="small muted" style={{ margin: '6px 0 12px' }}>
                {window.invitedBuyerIds.length} verified buyers invited · {active.length} offer{active.length === 1 ? '' : 's'} received
                {s.minimumPrice ? <> · Reserve {reserveMet ? <strong style={{ color: 'var(--ok)' }}>met</strong> : <strong style={{ color: 'var(--warn)' }}>not met</strong>}</> : null}
              </p>
            )}
            {active.length === 0 && offers.length === 0 && (
              <p className="small muted">No offers yet. {s.status === 'approved_for_offers' ? 'Verified buyers have been invited — most liquid references receive offers within days.' : 'Offers open once your watch is approved.'}</p>
            )}
            <div className="stack">
              {offers
                .slice()
                .sort((a, b) => b.amount - a.amount)
                .map((o) => {
                  const fees = computeFees(o.amount, db.feeConfig)
                  const isBest = o.amount === best && o.status === 'active'
                  return (
                    <div key={o.id} className={`offer-row ${isBest ? 'best' : ''}`}>
                      <div>
                        <div className="row">
                          <span className="offer-amt">{aud(o.amount)}</span>
                          {isBest && <Badge tone="olive">Highest offer</Badge>}
                          <OfferBadge status={o.status} />
                        </div>
                        <div className="small muted">
                          Verified buyer · {titleCase(o.type)} · Valid {o.validityDays} days
                          {o.conditions && <> · Conditions: {o.conditions}</>}
                        </div>
                        <div className="small" style={{ marginTop: 4 }}>
                          Estimated net proceeds: <strong>{aud(fees.sellerNet)}</strong>{' '}
                          <span className="muted">after {aud(fees.sellerFee)} seller fee + GST</span>
                        </div>
                      </div>
                      {o.status === 'active' && (
                        <div className="row">
                          <button className="btn btn-sm btn-ghost" onClick={() => store.declineOffer(o.id)}>Decline</button>
                          <button className="btn btn-sm btn-accent" onClick={() => { setError(null); setAcceptId(o.id) }}>Accept offer</button>
                        </div>
                      )}
                    </div>
                  )
                })}
            </div>
            {s.status === 'approved_for_offers' && window && (
              <div className="row" style={{ marginTop: 14 }}>
                {window.extensionsUsed < 1 && (
                  <button className="btn btn-sm btn-ghost" onClick={() => store.extendBidWindow(s.id)}>Request one extension (+2 days)</button>
                )}
                <button className="btn btn-sm btn-danger" onClick={() => { if (confirm('Withdraw this watch from sale? Active offers will lapse.')) { store.withdrawSubmission(s.id); nav('/seller') } }}>
                  Withdraw watch
                </button>
              </div>
            )}
            <p className="small muted" style={{ marginTop: 12 }}>
              Buyer identities are not disclosed before acceptance. Accepting an offer starts a
              binding transaction: authentication, insured logistics, then settlement.
            </p>
          </div>

          {/* Valuation */}
          {v && (
            <div className="card">
              <div className="spread">
                <h3>Indicative valuation</h3>
                <Badge tone="neutral">Indicative — not guaranteed</Badge>
              </div>
              <div className="grid grid-3" style={{ margin: '14px 0' }}>
                <div className="stat"><div className="k">Market range</div><div className="v" style={{ fontSize: '1.15rem' }}>{aud(v.marketLow)}–{aud(v.marketHigh)}</div></div>
                <div className="stat"><div className="k">Likely dealer offer</div><div className="v" style={{ fontSize: '1.15rem' }}>{aud(v.dealerOfferLow)}–{aud(v.dealerOfferHigh)}</div></div>
                <div className="stat"><div className="k">Expected offers here</div><div className="v" style={{ fontSize: '1.15rem' }}>{aud(v.expectedOfferLow)}–{aud(v.expectedOfferHigh)}</div></div>
              </div>
              <div className="row small" style={{ marginBottom: 10 }}>
                <Badge tone={v.liquidity === 'high' ? 'ok' : v.liquidity === 'medium' ? 'warn' : 'neutral'}>
                  Liquidity {v.liquidityScore}/100
                </Badge>
                <span className="muted">Estimated time to offers: {v.estimatedDaysToOffers}</span>
              </div>
              <h4>Factors affecting value</h4>
              <ul style={{ listStyle: 'none', marginTop: 8, display: 'grid', gap: 6 }}>
                {v.factors.map((f) => (
                  <li key={f.label} className="small row">
                    <span style={{ color: f.impact === 'positive' ? 'var(--ok)' : f.impact === 'negative' ? 'var(--bad)' : 'var(--steel)' }}>
                      {f.impact === 'positive' ? '▲' : f.impact === 'negative' ? '▼' : '•'}
                    </span>
                    <span><strong>{f.label}.</strong> <span className="muted">{f.note}</span></span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <div className="stack">
          {/* Identification */}
          {s.aiIdentification && (
            <div className="card">
              <div className="spread">
                <h3>Preliminary identification</h3>
                <Badge tone={s.aiIdentification.confidence > 0.8 ? 'ok' : 'warn'}>
                  {Math.round(s.aiIdentification.confidence * 100)}% confidence
                </Badge>
              </div>
              <div className="kv" style={{ marginTop: 12 }}>
                <dt>Identified as</dt><dd>{s.aiIdentification.brand} {s.aiIdentification.model}</dd>
                <dt>Likely reference</dt><dd>{s.aiIdentification.likelyReference}</dd>
                <dt>Human review</dt><dd>{s.aiIdentification.humanReviewRequired ? 'Required' : 'Not required'}</dd>
              </div>
              <h4 style={{ marginTop: 12 }}>Evidence</h4>
              <ul className="small muted" style={{ paddingLeft: 18, marginTop: 6 }}>
                {s.aiIdentification.evidence.map((e) => <li key={e}>{e}</li>)}
              </ul>
              <h4 style={{ marginTop: 12 }}>Limitations</h4>
              <ul className="small muted" style={{ paddingLeft: 18, marginTop: 6 }}>
                {s.aiIdentification.limitations.map((e) => <li key={e}>{e}</li>)}
              </ul>
            </div>
          )}

          {/* Declared details */}
          <div className="card">
            <h3>Declared details</h3>
            <div className="kv" style={{ marginTop: 12 }}>
              <dt>Condition</dt><dd>{titleCase(s.condition)}</dd>
              <dt>Set</dt><dd>{s.boxIncluded && s.papersIncluded ? 'Full set' : [s.boxIncluded && 'Box', s.papersIncluded && 'Papers'].filter(Boolean).join(', ') || 'Watch only'}</dd>
              <dt>Case</dt><dd>{s.caseMaterial || '—'}</dd>
              <dt>Dial</dt><dd>{s.dialColour || '—'}</dd>
              <dt>Bracelet/strap</dt><dd>{s.braceletOrStrap || '—'}</dd>
              <dt>Service history</dt><dd>{s.serviceHistory}</dd>
              <dt>Polishing</dt><dd>{s.polishingHistory}</dd>
              <dt>Aftermarket parts</dt><dd>{s.aftermarketParts}</dd>
              <dt>Serial</dt><dd>{s.serialMasked} <span className="muted">(masked)</span></dd>
              <dt>Location</dt><dd>{s.sellerLocation}</dd>
              <dt>Sale timing</dt><dd>{s.saleTiming}</dd>
              {s.minimumPrice ? <><dt>Your reserve</dt><dd>{aud(s.minimumPrice)} (private)</dd></> : null}
            </div>
          </div>

          {profile?.kycStatus !== 'verified' && (
            <Note tone="warn">
              <strong>Verification required before acceptance.</strong>{' '}
              <Link to="/seller/verification">Complete identity verification</Link> so you can accept
              an offer the moment the right one arrives.
            </Note>
          )}
        </div>
      </div>

      {/* Accept modal */}
      <Modal open={!!acceptOffer} onClose={() => setAcceptId(null)}>
        {acceptOffer && (
          <>
            <h3>Accept this offer?</h3>
            <p className="small muted" style={{ margin: '8px 0 14px' }}>
              Accepting creates a <strong>binding transaction</strong>. Your watch will then — and
              only then — be shipped, insured, to an independent authentication centre. Payment is
              released after the contractual conditions are satisfied.
            </p>
            <FeeTable fees={computeFees(acceptOffer.amount, db.feeConfig)} perspective="seller" />
            {acceptOffer.conditions && (
              <Note tone="info">This offer is subject to: {acceptOffer.conditions}</Note>
            )}
            {error && <Note tone="bad">{error} <Link to="/seller/verification">Verify now</Link></Note>}
            <div className="row" style={{ marginTop: 16, justifyContent: 'flex-end' }}>
              <button className="btn btn-ghost" onClick={() => setAcceptId(null)}>Not yet</button>
              <button
                className="btn btn-accent"
                onClick={() => {
                  const res = store.acceptOffer(acceptOffer.id)
                  if ('error' in res) { setError(res.error); return }
                  nav(`/seller/transactions/${res.id}`)
                }}
              >
                Accept — begin secure transaction
              </button>
            </div>
          </>
        )}
      </Modal>
    </>
  )
}
