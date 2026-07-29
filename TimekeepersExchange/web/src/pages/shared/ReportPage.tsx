import React from 'react'
import { useParams, Link } from 'react-router-dom'
import { store, useDb, useMe } from '../../lib/store'
import { OutcomeBadge, Note } from '../../components/ui'
import { fmtDate } from '../../lib/format'
import { titleCase } from '../../lib/format'

// Professional authentication report — styled HTML now; the same structured
// data feeds PDF generation later (see docs/mocked-integrations.md).
export function ReportPage() {
  const { inspectionId } = useParams()
  const db = useDb()
  const me = useMe()
  const insp = db.inspections.find((i) => i.id === inspectionId)
  if (!me) return <div className="container section"><Note tone="bad">Sign in to view this document.</Note></div>
  if (!insp || insp.status !== 'submitted') return <div className="container section"><Note tone="bad">Report not found or not yet issued.</Note></div>
  const tx = db.transactions.find((t) => t.id === insp.transactionId)!
  // Access control: parties to the transaction, the watchmaker, or admin only.
  const allowed = me.role === 'admin' || me.id === tx.sellerId || me.id === tx.buyerId || me.id === insp.watchmakerId
  if (!allowed) return <div className="container section"><Note tone="bad">You are not authorised to view this document.</Note></div>
  const s = db.submissions.find((x) => x.id === tx.submissionId)!
  const wm = store.user(insp.watchmakerId)
  const wmp = db.watchmakerProfiles.find((p) => p.userId === insp.watchmakerId)

  return (
    <div className="container section" style={{ maxWidth: 900 }}>
      <div className="row" style={{ marginBottom: 16, justifyContent: 'space-between' }}>
        <Link to={-1 as never} className="btn btn-sm btn-ghost" onClick={(e) => { e.preventDefault(); history.back() }}>← Back</Link>
        <button className="btn btn-sm" onClick={() => window.print()}>Print / save as PDF</button>
      </div>
      <div className="report">
        <div className="rhead">
          <div>
            <div className="wordmark" style={{ fontSize: '1.2rem' }}><span className="mark">◷</span> The Timekeeper&rsquo;s Exchange</div>
            <div className="small muted" style={{ marginTop: 4 }}>Independent Authentication Report</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div className="mono"><strong>{insp.reportNumber}</strong></div>
            <div className="small muted">Issued {fmtDate(insp.submittedAt)}</div>
          </div>
        </div>

        <div className="grid grid-2" style={{ marginBottom: 22 }}>
          <div>
            <h4>Watch</h4>
            <div className="kv" style={{ marginTop: 8 }}>
              <dt>Brand / model</dt><dd>{s.brand} {s.model}</dd>
              <dt>Reference</dt><dd>{s.reference}</dd>
              <dt>Year</dt><dd>{s.year}</dd>
              <dt>Serial</dt><dd>{s.serialMasked} <span className="muted">(masked in this copy; verified physically)</span></dd>
            </div>
          </div>
          <div>
            <h4>Inspection</h4>
            <div className="kv" style={{ marginTop: 8 }}>
              <dt>Authentication centre</dt><dd>{wmp?.businessName} · {wmp?.location}</dd>
              <dt>Watchmaker</dt><dd>{wm?.name}</dd>
              <dt>Transaction</dt><dd>{tx.id}</dd>
              <dt>Outcome</dt><dd><OutcomeBadge outcome={insp.outcome!} /></dd>
            </div>
          </div>
        </div>

        <h4>Structured conclusion</h4>
        <p style={{ margin: '8px 0 18px' }}>{insp.conclusion}</p>
        {insp.discrepancySummary && (
          <Note tone="warn"><strong>Discrepancy:</strong> {insp.discrepancySummary}</Note>
        )}

        <h4 style={{ margin: '22px 0 8px' }}>Measurements</h4>
        <div className="kv">
          <dt>Timegrapher rate</dt><dd>{insp.timegrapherRate ?? '—'}</dd>
          <dt>Amplitude</dt><dd>{insp.amplitude ?? '—'}</dd>
          <dt>Beat error</dt><dd>{insp.beatError ?? '—'}</dd>
          <dt>Service recommendation</dt><dd>{insp.serviceRecommendation || 'None'}</dd>
        </div>

        <h4 style={{ margin: '22px 0 8px' }}>Section findings</h4>
        <div className="table-wrap">
          <table className="tke">
            <thead><tr><th>Section</th><th>Verdict</th><th>Notes</th></tr></thead>
            <tbody>
              {insp.items.map((it) => (
                <tr key={it.section}>
                  <td style={{ whiteSpace: 'nowrap' }}>{it.section}</td>
                  <td>
                    <span className={`badge ${it.verdict === 'pass' ? 'ok' : it.verdict === 'issue' ? 'bad' : it.verdict === 'note' ? 'warn' : 'neutral'}`}>
                      {titleCase(it.verdict)}
                    </span>
                  </td>
                  <td className="small">{it.notes}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <hr className="divider" style={{ margin: '26px 0 14px' }} />
        <p className="small muted">
          This report records the findings of a physical inspection at the date of issue and is
          prepared for the parties to transaction {tx.id}. Inspection photographs are retained on
          the platform record (secure storage with signed access in production). It is not a
          valuation. Demonstration document — not legal advice, not an insurance certificate.
        </p>
      </div>
    </div>
  )
}
