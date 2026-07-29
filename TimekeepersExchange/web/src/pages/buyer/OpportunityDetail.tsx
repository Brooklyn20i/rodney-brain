import React, { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { store, useDb, useMe } from '../../lib/store'
import { Badge, Note, Field, FeeTable, WatchThumb } from '../../components/ui'
import { aud, computeFees } from '../../lib/fees'
import { timeRemaining, titleCase } from '../../lib/format'
import type { OfferType } from '../../lib/types'
import { PHOTO_ANGLES } from '../../lib/types'

export function OpportunityDetail() {
  const { id } = useParams()
  const db = useDb()
  const me = useMe()!
  const nav = useNavigate()
  const s = db.submissions.find((x) => x.id === id)
  const bp = store.buyerProfile(me.id)
  const [amount, setAmount] = useState('')
  const [type, setType] = useState<OfferType>('subject_to_inspection')
  const [conditions, setConditions] = useState('')
  const [noteToAdmin, setNoteToAdmin] = useState('')
  const [validity, setValidity] = useState(7)
  const [ack, setAck] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!s || !bp || !store.visibleOpportunities(me.id).includes(s)) {
    return <Note tone="bad">This opportunity is not available to your account.</Note>
  }

  const existing = db.offers.find((o) => o.submissionId === s.id && o.buyerId === me.id && o.status === 'active')
  const remaining = s.bidWindow ? timeRemaining(s.bidWindow.closesAt) : null
  const fees = amount ? computeFees(Number(amount), db.feeConfig) : null
  const images = store.imagesFor(s.id)

  return (
    <>
      <header className="spread">
        <div className="row">
          <WatchThumb brand={s.brand} />
          <div>
            <h1>{s.headline}</h1>
            <p className="muted small">{s.reference} · {s.year} · Seller located {s.sellerLocation} (identity withheld)</p>
          </div>
        </div>
        <div className="row">
          <Badge tone="neutral">{s.bidWindow?.mode === 'sealed' ? 'Sealed offers' : 'Managed auction'}</Badge>
          {remaining && <Badge tone={remaining.expired ? 'neutral' : 'gold'}>{remaining.label}</Badge>}
        </div>
      </header>

      <div className="grid grid-2" style={{ alignItems: 'start', marginTop: 10 }}>
        <div className="stack">
          <div className="card">
            <h3>Opportunity summary</h3>
            <p className="small" style={{ margin: '8px 0' }}>{s.buyerSummary}</p>
            <div className="kv" style={{ marginTop: 10 }}>
              <dt>Declared condition</dt><dd>{titleCase(s.condition)}</dd>
              <dt>Set</dt><dd>{s.boxIncluded && s.papersIncluded ? 'Full set' : [s.boxIncluded && 'Box', s.papersIncluded && 'Papers'].filter(Boolean).join(', ') || 'Watch only'}</dd>
              <dt>Case material</dt><dd>{s.caseMaterial || '—'}</dd>
              <dt>Dial</dt><dd>{s.dialColour || '—'}</dd>
              <dt>Bracelet/strap</dt><dd>{s.braceletOrStrap || '—'}</dd>
              <dt>Service history</dt><dd>{s.serviceHistory}</dd>
              <dt>Polishing</dt><dd>{s.polishingHistory}</dd>
              <dt>Aftermarket parts</dt><dd>{s.aftermarketParts}</dd>
              <dt>Known flaws</dt><dd>{s.knownFlaws || 'None declared'}</dd>
              <dt>Serial</dt><dd>{s.serialMasked} <span className="muted">(masked — verified at authentication)</span></dd>
              <dt>Estimated market range</dt><dd>{aud(s.valuation?.marketLow ?? 0)}–{aud(s.valuation?.marketHigh ?? 0)} <span className="muted">(indicative)</span></dd>
            </div>
          </div>

          <div className="card">
            <h3>Image gallery</h3>
            <p className="small muted" style={{ margin: '6px 0 12px' }}>
              {images.length > 0 ? 'Seller-captured guided photography.' : 'Demonstration lot — guided photography placeholders shown.'}
            </p>
            <div className="photo-grid">
              {PHOTO_ANGLES.slice(0, 9).map((a) => {
                const img = images.find((i) => i.angle === a)
                return (
                  <div key={a} className="photo-slot filled" style={{ cursor: 'default' }}>
                    {img?.dataUrl
                      ? <img src={img.dataUrl} alt={a} />
                      : <div className="watch-thumb" style={{ width: '100%', height: 84, borderRadius: 6 }}>{s.brand.slice(0, 2).toUpperCase()}</div>}
                    <div className="s">{titleCase(a)}</div>
                  </div>
                )
              })}
            </div>
          </div>

          <div className="card">
            <h3>Process &amp; protection</h3>
            <ul className="small" style={{ paddingLeft: 18, marginTop: 8, display: 'grid', gap: 6 }}>
              <li>Preliminary platform review completed; identity-verified seller; ownership declared.</li>
              <li>Independent 20-section authentication after acceptance, before settlement.</li>
              <li>Insured, tamper-evident shipping with recorded chain of custody.</li>
              <li>Estimated delivery: 7–12 business days after acceptance, subject to inspection.</li>
              <li>Discrepancy rules: minor — proceed, amend, or cancel; material — managed resolution.</li>
            </ul>
          </div>
        </div>

        <div className="card" style={{ position: 'sticky', top: 20 }}>
          <h3>{existing ? 'Revise your sealed offer' : 'Submit a sealed offer'}</h3>
          {existing && (
            <Note tone="info">Your current offer: <strong>{aud(existing.amount)}</strong> ({titleCase(existing.type)})</Note>
          )}
          <div className="stack" style={{ marginTop: 12 }}>
            <Field label="Offer amount (AUD)" required hint={`Your approved transaction limit: ${aud(bp.transactionLimit)}`}>
              <input type="number" min={0} value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="e.g. 22000" />
            </Field>
            <Field label="Offer type" required>
              <select value={type} onChange={(e) => setType(e.target.value as OfferType)}>
                <option value="binding_cash">Binding cash offer</option>
                <option value="subject_to_inspection">Subject to standard inspection</option>
                <option value="subject_to_conditions">Subject to specific stated conditions</option>
              </select>
            </Field>
            {type === 'subject_to_conditions' && (
              <Field label="Your stated conditions" required>
                <textarea value={conditions} onChange={(e) => setConditions(e.target.value)} placeholder="e.g. Subject to case-condition verification against the declared polishing history" />
              </Field>
            )}
            <div className="grid grid-2">
              <Field label="Validity (days)">
                <select value={validity} onChange={(e) => setValidity(Number(e.target.value))}>
                  {[5, 7, 10, 14].map((d) => <option key={d} value={d}>{d}</option>)}
                </select>
              </Field>
            </div>
            <Field label="Note to platform administrator (optional)">
              <textarea value={noteToAdmin} onChange={(e) => setNoteToAdmin(e.target.value)} />
            </Field>

            {fees && Number(amount) > 0 && (
              <>
                <h4>Your estimated total</h4>
                <FeeTable fees={fees} perspective="buyer" />
              </>
            )}

            <label className="checkline">
              <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} />
              I acknowledge this offer is binding if accepted and the watch passes inspection
              {type !== 'binding_cash' ? ' under my stated terms' : ''}. Payment must be authorised promptly after acceptance.
            </label>
            {error && <Note tone="bad">{error}</Note>}
            <button
              className="btn btn-accent"
              disabled={!amount || !ack || (type === 'subject_to_conditions' && !conditions)}
              onClick={() => {
                const res = store.placeOffer(s.id, me.id, {
                  amount: Number(amount), type,
                  conditions: type === 'subject_to_conditions' ? conditions : undefined,
                  noteToAdmin: noteToAdmin || undefined, validityDays: validity,
                })
                if ('error' in res) { setError(res.error); return }
                nav('/buyer/offers')
              }}
            >
              {existing ? 'Update sealed offer' : 'Submit sealed offer'}
            </button>
            <p className="small muted">
              Sealed bidding: other buyers cannot see your offer, and you cannot see theirs.
              Funding is authorised only if the seller accepts.
            </p>
          </div>
        </div>
      </div>
    </>
  )
}
