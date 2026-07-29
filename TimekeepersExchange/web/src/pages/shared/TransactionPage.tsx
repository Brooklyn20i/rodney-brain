import React, { useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { store, useDb, useMe } from '../../lib/store'
import { StateBadge, Note, TransactionStepper, FeeTable, Modal, OutcomeBadge, Empty, WatchThumb, Badge } from '../../components/ui'
import { STATE_GUIDANCE, STATE_LABELS } from '../../lib/stateMachine'
import { aud } from '../../lib/fees'
import { fmtDateTime, fmtDate } from '../../lib/format'

export function TransactionList({ perspective }: { perspective: 'seller' | 'buyer' }) {
  const db = useDb()
  const me = useMe()!
  const txs = db.transactions.filter((t) => (perspective === 'seller' ? t.sellerId : t.buyerId) === me.id)
  return (
    <>
      <header><h1>{perspective === 'seller' ? 'Transactions' : 'Purchases'}</h1></header>
      {txs.length === 0 ? <Empty title="No transactions yet" /> : (
        <div className="stack">
          {txs.map((t) => {
            const s = db.submissions.find((x) => x.id === t.submissionId)!
            return (
              <Link key={t.id} to={`/${perspective}/transactions/${t.id}`} className="card spread" style={{ textDecoration: 'none' }}>
                <div className="row">
                  <WatchThumb brand={s.brand} />
                  <div>
                    <strong>{s.brand} {s.model}</strong>
                    <div className="small muted">{aud(t.acceptedAmount)} · Started {fmtDate(t.createdAt)}</div>
                  </div>
                </div>
                <StateBadge state={t.state} />
              </Link>
            )
          })}
        </div>
      )}
    </>
  )
}

export function TransactionPage({ perspective }: { perspective: 'seller' | 'buyer' | 'admin' }) {
  const { id } = useParams()
  const db = useDb()
  const me = useMe()!
  const [amendOpen, setAmendOpen] = useState(false)
  const [amendAmount, setAmendAmount] = useState('')
  const [shipModal, setShipModal] = useState(false)
  const tx = db.transactions.find((t) => t.id === id)
  if (!tx) return <Note tone="bad">Transaction not found.</Note>
  if (perspective === 'seller' && tx.sellerId !== me.id) return <Note tone="bad">Not authorised.</Note>
  if (perspective === 'buyer' && tx.buyerId !== me.id) return <Note tone="bad">Not authorised.</Note>

  const s = db.submissions.find((x) => x.id === tx.submissionId)!
  const insp = store.inspectionForTransaction(tx.id)
  const shipments = db.shipments.filter((x) => x.transactionId === tx.id)
  const custody = db.custodyEvents.filter((x) => x.transactionId === tx.id)
  const guidance = STATE_GUIDANCE[tx.state]
  const sellerLeg = shipments.find((x) => x.leg === 'seller_to_authenticator')
  const dispute = db.disputes.find((x) => x.transactionId === tx.id && x.status !== 'resolved' && x.status !== 'closed')

  return (
    <>
      <header className="spread">
        <div className="row">
          <WatchThumb brand={s.brand} />
          <div>
            <h1>{s.brand} {s.model}</h1>
            <p className="muted small">Transaction {tx.id} · Accepted {aud(tx.acceptedAmount)}{tx.amendedAmount ? ` · Amended ${aud(tx.amendedAmount)}` : ''} · {fmtDate(tx.createdAt)}</p>
          </div>
        </div>
        <StateBadge state={tx.state} />
      </header>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="grid grid-3">
          <div><h4>What happens next</h4><p className="small" style={{ marginTop: 6 }}>{guidance.next}</p></div>
          <div><h4>Who is responsible</h4><p className="small" style={{ marginTop: 6 }}>{guidance.responsible}</p></div>
          <div><h4>What is binding</h4><p className="small" style={{ marginTop: 6 }}>{guidance.binding}</p></div>
        </div>
      </div>

      {dispute && (
        <Note tone="bad">
          <strong>Open dispute:</strong> {dispute.summary}{' '}
          {perspective === 'admin' && <Link to="/admin/disputes">Manage dispute</Link>}
        </Note>
      )}

      <div className="grid grid-2" style={{ alignItems: 'start', marginTop: 14 }}>
        <div className="stack">
          {/* --- role-specific action panel --------------------------------- */}
          {perspective === 'buyer' && tx.state === 'offer_accepted' && (
            <div className="card">
              <h3>Authorise payment</h3>
              <p className="small muted" style={{ margin: '8px 0 12px' }}>
                Your offer was accepted. Authorise the full amount into secure settlement to begin
                logistics and authentication. Funds are held and released only when the contractual
                conditions are satisfied. <em>(Simulated — production uses a regulated payment /
                escrow provider such as Stripe Connect.)</em>
              </p>
              <FeeTable fees={tx.fees} perspective="buyer" />
              <button className="btn btn-accent" style={{ marginTop: 14 }} onClick={() => store.authorisePayment(tx.id)}>
                Authorise {aud(tx.fees.buyerTotal)} (simulated)
              </button>
            </div>
          )}

          {perspective === 'seller' && tx.state === 'awaiting_shipment' && (
            <div className="card">
              <h3>Ship your watch</h3>
              <p className="small muted" style={{ margin: '8px 0 12px' }}>
                The buyer&rsquo;s payment is secured. Your insured shipping label and packing guide are
                ready — your watch travels directly to the independent authentication centre, never
                to the buyer&rsquo;s address.
              </p>
              <div className="kv">
                <dt>Carrier</dt><dd>{sellerLeg?.carrier ?? 'Generated on request'}</dd>
                <dt>Tracking</dt><dd>{sellerLeg?.trackingNumber ?? '—'}</dd>
                <dt>Insured value</dt><dd>{aud(tx.acceptedAmount)}</dd>
                <dt>Destination</dt><dd>Meridian Watch Services, Sydney (authentication centre)</dd>
              </div>
              <div className="row" style={{ marginTop: 14 }}>
                {!sellerLeg && <button className="btn" onClick={() => store.generateShipment(tx.id, 'seller_to_authenticator')}>Generate insured label</button>}
                {sellerLeg && <button className="btn btn-ghost" onClick={() => setShipModal(true)}>View packing guide</button>}
                {sellerLeg && <button className="btn btn-accent" onClick={() => store.markShipped(tx.id)}>I&rsquo;ve lodged the package</button>}
              </div>
              <p className="small muted" style={{ marginTop: 10 }}>Prefer a secure local handover? Contact the platform to book an appointment (demonstration placeholder).</p>
            </div>
          )}

          {perspective === 'admin' && tx.state === 'in_transit_to_authentication' && (
            <div className="card">
              <h3>Logistics</h3>
              <p className="small muted" style={{ margin: '8px 0 12px' }}>In transit. The authentication centre records arrival in the watchmaker portal — or record it here.</p>
              <button className="btn" onClick={() => store.markReceivedAtAuthenticator(tx.id, 'u-wm1', 'Outer packaging intact, tamper-evident seal unbroken')}>
                Record arrival at authentication centre
              </button>
            </div>
          )}

          {perspective === 'buyer' && tx.state === 'buyer_review' && insp && (
            <div className="card">
              <h3>Discrepancy review — your decision</h3>
              <Note tone="warn" >
                <strong>{insp.discrepancySummary}</strong>
              </Note>
              <p className="small muted" style={{ margin: '10px 0' }}>
                Under the platform rules you may proceed at the accepted price, propose an amended
                offer, or cancel. You have 2 business days.
              </p>
              <div className="row">
                <button className="btn btn-accent" onClick={() => store.buyerReviewDecision(tx.id, 'proceed')}>Proceed at {aud(tx.acceptedAmount)}</button>
                <button className="btn btn-ghost" onClick={() => { setAmendAmount(String(tx.acceptedAmount)); setAmendOpen(true) }}>Propose amended offer</button>
                <button className="btn btn-danger" onClick={() => { if (confirm('Cancel this transaction under the discrepancy rules?')) store.buyerReviewDecision(tx.id, 'cancel') }}>Cancel</button>
              </div>
            </div>
          )}

          {perspective === 'seller' && tx.state === 'resolution' && tx.amendedAmount && (
            <div className="card">
              <h3>Amended offer proposed</h3>
              <p className="small muted" style={{ margin: '8px 0 12px' }}>
                Following inspection, the buyer proposed <strong>{aud(tx.amendedAmount)}</strong> (originally {aud(tx.acceptedAmount)}).
                The platform is managing this resolution. You may accept the amended amount; otherwise the case proceeds to managed resolution.
              </p>
              <button className="btn btn-accent" onClick={() => store.sellerAcceptAmended(tx.id)}>Accept {aud(tx.amendedAmount)}</button>
            </div>
          )}

          {perspective === 'admin' && tx.state === 'settlement' && (
            <div className="card">
              <h3>Release settlement</h3>
              <p className="small muted" style={{ margin: '8px 0 12px' }}>
                Conditions satisfied. Releasing settlement pays the seller {aud(tx.fees.sellerNet)} (simulated) and dispatches the watch to the buyer, insured.
              </p>
              <button className="btn btn-accent" onClick={() => store.releaseSettlement(tx.id)}>Release settlement &amp; dispatch (simulated)</button>
            </div>
          )}

          {perspective === 'buyer' && tx.state === 'in_transit_to_buyer' && (
            <div className="card">
              <h3>Your watch is on its way</h3>
              <div className="kv" style={{ margin: '10px 0' }}>
                {shipments.filter((x) => x.leg === 'authenticator_to_buyer').map((x) => (
                  <React.Fragment key={x.id}>
                    <dt>Carrier</dt><dd>{x.carrier}</dd>
                    <dt>Tracking</dt><dd>{x.trackingNumber}</dd>
                    <dt>Insured value</dt><dd>{aud(x.insuredValue)}</dd>
                  </React.Fragment>
                ))}
              </div>
              <button className="btn btn-accent" onClick={() => store.confirmDelivery(tx.id)}>Confirm delivery received</button>
            </div>
          )}

          {tx.state === 'completed' && (
            <div className="card">
              <h3>Transaction complete</h3>
              <p className="small muted" style={{ margin: '8px 0 12px' }}>
                Completed {fmtDateTime(tx.completedAt)}. Transaction documents below; both parties
                may leave structured feedback (demonstration placeholder).
              </p>
              <div className="row">
                {insp && <Link to={`/report/${insp.id}`} className="btn btn-sm">Authentication report</Link>}
                <button className="btn btn-sm btn-ghost" onClick={() => alert('Settlement statement (demonstration): itemised fees as shown on this page.')}>Settlement statement</button>
              </div>
            </div>
          )}

          {/* --- inspection summary ----------------------------------------- */}
          {insp?.status === 'submitted' && insp.outcome && (
            <div className="card">
              <div className="spread">
                <h3>Authentication report</h3>
                <OutcomeBadge outcome={insp.outcome} />
              </div>
              <p className="small" style={{ margin: '10px 0' }}>{insp.conclusion}</p>
              <div className="kv">
                <dt>Report</dt><dd>{insp.reportNumber}</dd>
                <dt>Timegrapher</dt><dd>{insp.timegrapherRate} · {insp.amplitude} · beat error {insp.beatError}</dd>
                <dt>Service recommendation</dt><dd>{insp.serviceRecommendation || 'None'}</dd>
              </div>
              <Link to={`/report/${insp.id}`} className="btn btn-sm" style={{ marginTop: 12 }}>View full report</Link>
            </div>
          )}

          {/* --- fees -------------------------------------------------------- */}
          <div className="card">
            <h3>{perspective === 'buyer' ? 'Your costs' : perspective === 'seller' ? 'Your proceeds' : 'Economics'}</h3>
            <div style={{ marginTop: 10 }}>
              {perspective !== 'buyer' && <FeeTable fees={tx.fees} perspective="seller" />}
              {perspective !== 'seller' && (
                <>
                  {perspective === 'admin' && <h4 style={{ margin: '14px 0 6px' }}>Buyer side</h4>}
                  {perspective === 'buyer' && <FeeTable fees={tx.fees} perspective="buyer" />}
                  {perspective === 'admin' && <FeeTable fees={tx.fees} perspective="buyer" />}
                </>
              )}
            </div>
            {perspective === 'seller' && tx.state !== 'completed' && tx.state !== 'cancelled' && (
              <p className="small muted" style={{ marginTop: 10 }}>
                Expected payment: within 2 business days of settlement release, to {store.sellerProfile(tx.sellerId)?.payoutAccountMasked ?? 'your nominated account'}.
              </p>
            )}
          </div>
        </div>

        <div className="stack">
          <div className="card">
            <h3>Progress</h3>
            <div style={{ marginTop: 14 }}><TransactionStepper state={tx.state} /></div>
          </div>

          <div className="card">
            <h3>Timeline</h3>
            <div className="stack" style={{ marginTop: 10, gap: 8 }}>
              {tx.timeline.slice().reverse().map((e, i) => (
                <div key={i} className="small" style={{ borderLeft: '2px solid var(--line-strong)', paddingLeft: 12 }}>
                  <div><strong>{e.label}</strong></div>
                  <div className="muted">{fmtDateTime(e.at)} · {e.actor}</div>
                </div>
              ))}
            </div>
          </div>

          {custody.length > 0 && (
            <div className="card">
              <h3>Chain of custody</h3>
              <div className="stack" style={{ marginTop: 10, gap: 8 }}>
                {custody.map((c) => (
                  <div key={c.id} className="small" style={{ borderLeft: '2px solid var(--olive)', paddingLeft: 12 }}>
                    <div>{c.event}</div>
                    <div className="muted">{fmtDateTime(c.at)} · {c.actor}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {shipments.length > 0 && (
            <div className="card">
              <h3>Shipments</h3>
              <div className="stack" style={{ marginTop: 10 }}>
                {shipments.map((x) => (
                  <div key={x.id} className="spread small">
                    <div>
                      <strong>{x.leg === 'seller_to_authenticator' ? 'Seller → Authentication' : 'Authentication → Buyer'}</strong>
                      <div className="muted">{x.carrier} · {x.trackingNumber} · insured {aud(x.insuredValue)}</div>
                    </div>
                    <Badge tone={x.status === 'delivered' ? 'ok' : x.status === 'in_transit' ? 'gold' : 'neutral'}>
                      {x.status.replace('_', ' ')}
                    </Badge>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Amend modal */}
      <Modal open={amendOpen} onClose={() => setAmendOpen(false)}>
        <h3>Propose an amended offer</h3>
        <p className="small muted" style={{ margin: '8px 0 14px' }}>
          Based on the inspection findings, propose a revised amount. The platform will manage the
          resolution with the seller. Original accepted amount: {aud(tx.acceptedAmount)}.
        </p>
        <input type="number" value={amendAmount} onChange={(e) => setAmendAmount(e.target.value)} />
        <div className="row" style={{ marginTop: 14, justifyContent: 'flex-end' }}>
          <button className="btn btn-ghost" onClick={() => setAmendOpen(false)}>Back</button>
          <button className="btn btn-accent" disabled={!amendAmount || Number(amendAmount) <= 0}
            onClick={() => { store.buyerReviewDecision(tx.id, 'amend', Number(amendAmount)); setAmendOpen(false) }}>
            Propose {amendAmount ? aud(Number(amendAmount)) : ''}
          </button>
        </div>
      </Modal>

      {/* Packing guide modal */}
      <Modal open={shipModal} onClose={() => setShipModal(false)}>
        <h3>Packing guide</h3>
        <ol style={{ paddingLeft: 20, marginTop: 12, display: 'grid', gap: 8, fontSize: '0.9rem' }}>
          <li>Wind the crown fully in and set the bracelet around the supplied travel cushion (or soft cloth roll).</li>
          <li>Wrap the head in acid-free tissue; never let the clasp touch the crystal.</li>
          <li>Place box and papers flat beneath the watch layer, documents in the sleeve provided.</li>
          <li>Use the tamper-evident bag first, then the double-walled shipping carton. Photograph the sealed bag&rsquo;s serial.</li>
          <li>Do not write anything watch-related on the outer carton. The label shows only the carrier reference.</li>
          <li>Lodge at a staffed counter and keep the lodgement receipt — this opens your insurance cover.</li>
        </ol>
        <div className="row" style={{ marginTop: 14, justifyContent: 'flex-end' }}>
          <button className="btn" onClick={() => setShipModal(false)}>Done</button>
        </div>
      </Modal>
    </>
  )
}
