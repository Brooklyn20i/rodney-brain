import React from 'react'
import { Link } from 'react-router-dom'
import { store, useDb, useMe } from '../../lib/store'
import { Badge, Empty, OutcomeBadge, WatchThumb, Note } from '../../components/ui'
import { fmtDate } from '../../lib/format'

export function WatchmakerQueue() {
  const db = useDb()
  const me = useMe()!
  const profile = db.watchmakerProfiles.find((p) => p.userId === me.id)
  const mine = db.inspections.filter((i) => i.watchmakerId === me.id)
  const incoming = db.transactions.filter((t) => t.state === 'in_transit_to_authentication')

  return (
    <>
      <header>
        <h1>Inspection queue</h1>
        <p className="muted small">{profile?.businessName} · {profile?.location} · You only see inspections assigned to you.</p>
      </header>

      {incoming.length > 0 && (
        <>
          <h4 style={{ margin: '18px 0 8px' }}>Incoming shipments</h4>
          <div className="stack">
            {incoming.map((t) => {
              const s = db.submissions.find((x) => x.id === t.submissionId)!
              const sh = db.shipments.find((x) => x.transactionId === t.id && x.leg === 'seller_to_authenticator')
              return (
                <div key={t.id} className="card spread">
                  <div className="row">
                    <WatchThumb brand={s.brand} />
                    <div>
                      <strong>{s.brand} {s.model}</strong>
                      <div className="small muted">{s.reference} · Tracking {sh?.trackingNumber ?? '—'}{s.flaggedForEnhancedInspection && ' · Enhanced inspection requested'}</div>
                    </div>
                  </div>
                  <button className="btn btn-sm btn-primary"
                    onClick={() => store.markReceivedAtAuthenticator(t.id, me.id, 'Outer packaging intact, tamper-evident seal unbroken')}>
                    Record package arrival
                  </button>
                </div>
              )
            })}
          </div>
        </>
      )}

      <h4 style={{ margin: '22px 0 8px' }}>Assigned inspections</h4>
      {mine.length === 0 ? <Empty title="No inspections assigned" body="Assigned inspections appear here when a package arrives." /> : (
        <div className="stack">
          {mine.map((insp) => {
            const t = db.transactions.find((x) => x.id === insp.transactionId)!
            const s = db.submissions.find((x) => x.id === t.submissionId)!
            return (
              <Link key={insp.id} to={`/watchmaker/inspections/${insp.id}`} className="card spread" style={{ textDecoration: 'none' }}>
                <div className="row">
                  <WatchThumb brand={s.brand} />
                  <div>
                    <strong>{s.brand} {s.model}</strong>
                    <div className="small muted">{s.reference} · Transaction {t.id} · Received {fmtDate(t.timeline.find((e) => e.state === 'received_at_authentication')?.at)}</div>
                  </div>
                </div>
                <div className="row">
                  {s.flaggedForEnhancedInspection && <Badge tone="warn">Enhanced</Badge>}
                  {insp.status === 'submitted' && insp.outcome
                    ? <OutcomeBadge outcome={insp.outcome} />
                    : <Badge tone={insp.status === 'draft' ? 'gold' : 'info'}>{insp.status === 'draft' ? 'Draft in progress' : 'Awaiting inspection'}</Badge>}
                </div>
              </Link>
            )
          })}
        </div>
      )}

      <Note tone="info">
        Chain of custody is recorded from package arrival. Record arrival before opening any
        packaging, and photograph the seal serial.
      </Note>
    </>
  )
}
