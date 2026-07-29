import React, { useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { store, useDb, useMe } from '../../lib/store'
import { Note, Field, OutcomeBadge, Badge } from '../../components/ui'
import { INSPECTION_SECTIONS } from '../../lib/types'
import type { InspectionItem, InspectionOutcome, SectionVerdict } from '../../lib/types'
import { OUTCOME_LABELS } from '../../lib/stateMachine'
import { titleCase } from '../../lib/format'

const SECTION_PROMPTS: Record<string, string> = {
  'Chain of custody': 'Confirm seal serial matches the shipping record; note any anomaly.',
  'Packaging': 'Condition of outer carton, tamper-evident bag, and internal packing.',
  'Reference and serial': 'Verify reference and serial against declared values and period-correct placement.',
  'Dial': 'Originality, refinishing signs, lume consistency, printing quality.',
  'Hands and lume': 'Correct handset for reference; lume colour/age consistency with dial.',
  'Crystal': 'Material, chips, scratches, correct type for reference.',
  'Case': 'Lines, bevels, dents, corrosion, between-lug condition.',
  'Bezel': 'Insert originality, alignment, action where rotating.',
  'Crown and pushers': 'Signing, thread engagement, winding feel, pusher action.',
  'Bracelet or strap': 'Correct type, stretch, link count, end-link fit.',
  'Clasp': 'Engravings, action, hairlines, correct clasp code where applicable.',
  'Movement': 'Calibre identity, serial consistency, modification or non-original parts.',
  'Timekeeping': 'Timegrapher in at least two positions; record rate below.',
  'Functions': 'All complications: date change, GMT hand, chronograph reset, etc.',
  'Water resistance': 'Test where construction permits; otherwise mark N/A with reason.',
  'Polishing': 'Estimate polish history; compare against seller declaration.',
  'Replacement parts': 'Identify any service or aftermarket replacements.',
  'Accessories': 'Verify box, papers, links, cards against the declared accessory list.',
  'Final photographs': 'Capture the standard report set (mock upload in demonstration).',
  'Conclusion': 'Overall assessment; note anything material to the parties.',
}

const OUTCOMES: InspectionOutcome[] = [
  'passed_as_described', 'passed_minor_discrepancy', 'passed_material_discrepancy',
  'inconclusive', 'failed', 'suspected_stolen_or_altered', 'requires_manufacturer_review',
]

export function InspectionForm() {
  const { id } = useParams()
  const db = useDb()
  const me = useMe()!
  const nav = useNavigate()
  const insp = db.inspections.find((i) => i.id === id && i.watchmakerId === me.id)
  const [items, setItems] = useState<InspectionItem[]>(() =>
    insp?.items.length
      ? insp.items
      : INSPECTION_SECTIONS.map((s) => ({ section: s, verdict: 'pass' as SectionVerdict, notes: '' })))
  const [rate, setRate] = useState(insp?.timegrapherRate ?? '')
  const [amp, setAmp] = useState(insp?.amplitude ?? '')
  const [beat, setBeat] = useState(insp?.beatError ?? '')
  const [discrepancy, setDiscrepancy] = useState(insp?.discrepancySummary ?? '')
  const [service, setService] = useState(insp?.serviceRecommendation ?? '')
  const [conclusion, setConclusion] = useState(insp?.conclusion ?? '')
  const [outcome, setOutcome] = useState<InspectionOutcome>(insp?.outcome ?? 'passed_as_described')
  const [photos, setPhotos] = useState(0)

  if (!insp) return <Note tone="bad">Inspection not found or not assigned to you.</Note>
  const tx = db.transactions.find((t) => t.id === insp.transactionId)!
  const s = db.submissions.find((x) => x.id === tx.submissionId)!
  const submitted = insp.status === 'submitted'
  const issues = items.filter((i) => i.verdict === 'issue')
  const needsDiscrepancy = outcome !== 'passed_as_described' && !discrepancy

  const setItem = (idx: number, patch: Partial<InspectionItem>) =>
    setItems(items.map((it, i) => (i === idx ? { ...it, ...patch } : it)))

  const persistDraft = () => {
    if (tx.state === 'received_at_authentication') store.startInspection(insp.id)
    store.saveInspection(insp.id, {
      items, timegrapherRate: rate, amplitude: amp, beatError: beat,
      discrepancySummary: discrepancy || undefined, serviceRecommendation: service,
      conclusion,
    })
  }

  return (
    <div style={{ maxWidth: 860 }}>
      <header className="spread">
        <div>
          <h1>Inspection — {s.brand} {s.model}</h1>
          <p className="muted small">
            {s.reference} · Declared: {titleCase(s.condition)}, {s.polishingHistory} · Transaction {tx.id}
            {s.flaggedForEnhancedInspection && ' · Enhanced inspection requested'}
          </p>
        </div>
        {submitted && insp.outcome ? <OutcomeBadge outcome={insp.outcome} /> : <Badge tone="gold">{insp.status}</Badge>}
      </header>

      {submitted ? (
        <div className="card">
          <h3>Report issued</h3>
          <p className="small muted" style={{ margin: '8px 0 12px' }}>
            This inspection was submitted and the report issued. The transaction has moved forward
            under the platform rules.
          </p>
          <Link className="btn btn-sm" to={`/report/${insp.id}`}>View authentication report</Link>
        </div>
      ) : (
        <>
          <Note tone="info">
            Seller declaration for comparison — condition: <strong>{titleCase(s.condition)}</strong>;
            polishing: <strong>{s.polishingHistory}</strong>; aftermarket parts:{' '}
            <strong>{s.aftermarketParts}</strong>; accessories:{' '}
            <strong>{s.boxIncluded && s.papersIncluded ? 'full set' : [s.boxIncluded && 'box', s.papersIncluded && 'papers'].filter(Boolean).join(', ') || 'watch only'}</strong>.
            Mark any material difference as an issue.
          </Note>

          <div className="stack" style={{ marginTop: 14 }}>
            {items.map((it, idx) => (
              <div key={it.section} className="card" style={{ padding: '14px 18px' }}>
                <div className="spread">
                  <strong>{idx + 1}. {it.section}</strong>
                  <div className="pill-tabs">
                    {(['pass', 'note', 'issue', 'na'] as SectionVerdict[]).map((v) => (
                      <button key={v} className={it.verdict === v ? 'on' : ''} onClick={() => setItem(idx, { verdict: v })}>
                        {v === 'na' ? 'N/A' : titleCase(v)}
                      </button>
                    ))}
                  </div>
                </div>
                <p className="small muted" style={{ margin: '6px 0' }}>{SECTION_PROMPTS[it.section]}</p>
                {it.section === 'Timekeeping' && (
                  <div className="grid grid-3" style={{ margin: '8px 0' }}>
                    <Field label="Rate"><input type="text" placeholder="+2.0 s/day" value={rate} onChange={(e) => setRate(e.target.value)} /></Field>
                    <Field label="Amplitude"><input type="text" placeholder="290°" value={amp} onChange={(e) => setAmp(e.target.value)} /></Field>
                    <Field label="Beat error"><input type="text" placeholder="0.2 ms" value={beat} onChange={(e) => setBeat(e.target.value)} /></Field>
                  </div>
                )}
                {it.section === 'Final photographs' && (
                  <button className="btn btn-sm btn-ghost" style={{ margin: '6px 0' }} onClick={() => setPhotos(photos + 1)}>
                    {photos > 0 ? `✓ ${photos} photographs attached (mock)` : 'Attach photographs (mock)'}
                  </button>
                )}
                <textarea placeholder={it.verdict === 'issue' ? 'Describe the issue and how it differs from the declaration' : 'Notes (optional)'}
                  value={it.notes} onChange={(e) => setItem(idx, { notes: e.target.value })} />
              </div>
            ))}
          </div>

          <div className="card stack" style={{ marginTop: 16 }}>
            <h3>Conclusion</h3>
            {issues.length > 0 && (
              <Note tone="warn">
                {issues.length} section{issues.length > 1 ? 's' : ''} marked as an issue:{' '}
                {issues.map((i) => i.section).join(', ')}. Choose the outcome accordingly.
              </Note>
            )}
            <Field label="Outcome" required>
              <select value={outcome} onChange={(e) => setOutcome(e.target.value as InspectionOutcome)}>
                {OUTCOMES.map((o) => <option key={o} value={o}>{OUTCOME_LABELS[o]}</option>)}
              </select>
            </Field>
            {outcome !== 'passed_as_described' && (
              <Field label="Discrepancy summary" required hint="Shown to both parties — state precisely what differs from the declaration.">
                <textarea value={discrepancy} onChange={(e) => setDiscrepancy(e.target.value)} />
              </Field>
            )}
            <Field label="Service recommendation"><input type="text" value={service} onChange={(e) => setService(e.target.value)} placeholder="e.g. None required. Next service due c. 2028." /></Field>
            <Field label="Structured conclusion" required hint="Appears verbatim on the authentication report.">
              <textarea value={conclusion} onChange={(e) => setConclusion(e.target.value)} />
            </Field>
            <div className="row">
              <button className="btn btn-ghost" onClick={persistDraft}>Save draft</button>
              <button className="btn btn-accent" disabled={!conclusion || needsDiscrepancy}
                onClick={() => {
                  persistDraft()
                  store.submitInspection(insp.id, outcome)
                  nav('/watchmaker')
                }}>
                Submit report — {OUTCOME_LABELS[outcome]}
              </button>
            </div>
            <p className="small muted">
              Submitting issues the report to both parties and moves the transaction under the
              platform rules: pass → settlement; minor discrepancy → buyer review; material →
              managed resolution; failed or suspected stolen → dispute and escalation.
            </p>
          </div>
        </>
      )}
    </div>
  )
}
