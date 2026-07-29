import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { store, useMe } from '../../lib/store'
import { Field, Note, Badge } from '../../components/ui'
import { PHOTO_ANGLES } from '../../lib/types'
import type { Condition, PhotoAngle, WatchImage } from '../../lib/types'
import { maskSerial } from '../../lib/ai'
import { aud } from '../../lib/fees'

const ANGLE_META: Record<PhotoAngle, { label: string; guide: string; icon: string; required: boolean }> = {
  dial_straight_on: { label: 'Dial, straight on', guide: 'Watch flat, camera directly above, no reflections.', icon: '🕛', required: true },
  case_front: { label: 'Case, front', guide: 'Three-quarter angle showing lugs and bezel.', icon: '⌚', required: true },
  caseback: { label: 'Caseback', guide: 'Whole caseback in frame, engravings legible.', icon: '⭕', required: true },
  crown_side: { label: 'Crown side', guide: 'Profile from the crown side, crown pushed in.', icon: '🔘', required: true },
  opposite_side: { label: 'Opposite case side', guide: 'Profile from the side opposite the crown.', icon: '◐', required: true },
  clasp: { label: 'Clasp', guide: 'Clasp closed, logo and engravings visible.', icon: '🔗', required: true },
  full_bracelet: { label: 'Full bracelet', guide: 'Bracelet laid out to show all links.', icon: '⛓', required: true },
  bracelet_stretch: { label: 'Bracelet stretch / sag', guide: 'Hold the head horizontally; photograph how the bracelet hangs.', icon: '〰', required: true },
  reference_serial: { label: 'Reference & serial area', guide: 'Between the lugs or on the rehaut. We mask serials automatically — never post them publicly.', icon: '#', required: true },
  box: { label: 'Box', guide: 'Only if included.', icon: '📦', required: false },
  papers: { label: 'Papers / warranty card', guide: 'Cover personal details; we only need issue date and reference.', icon: '📄', required: false },
  service_documents: { label: 'Service documents', guide: 'Only if you have them.', icon: '🧾', required: false },
  visible_defects: { label: 'Visible defects', guide: 'Close-ups of any scratches, dents, or damage.', icon: '🔍', required: false },
}

const STEPS = ['The watch', 'Condition & history', 'Photographs', 'Sale preferences', 'Review & submit'] as const

export function SubmissionWizard() {
  const me = useMe()!
  const nav = useNavigate()
  const [step, setStep] = useState(0)
  const [submissionId, setSubmissionId] = useState<string | null>(null)
  const [photos, setPhotos] = useState<Partial<Record<PhotoAngle, WatchImage>>>({})
  const profile = store.sellerProfile(me.id)
  const [form, setForm] = useState({
    brand: '', model: '', reference: '', year: '', caseMaterial: '', dialColour: '',
    braceletOrStrap: '', serial: '',
    condition: 'excellent' as Condition, boxIncluded: true, papersIncluded: true,
    serviceHistory: '', polishingHistory: '', aftermarketParts: '', knownFlaws: '',
    saleTiming: 'Within 2–4 weeks', minimumPrice: '', purchaseInfo: '',
  })

  const set = (k: string, v: unknown) => setForm((f) => ({ ...f, [k]: v }))

  const ensureDraft = (): string => {
    if (submissionId) return submissionId
    const s = store.createSubmission(me.id, {})
    setSubmissionId(s.id)
    return s.id
  }

  const requiredPhotosDone = PHOTO_ANGLES.filter((a) => ANGLE_META[a].required).every((a) => photos[a])

  const handleFile = (angle: PhotoAngle, file: File | null) => {
    if (!file) return
    const id = ensureDraft()
    // Downscale to keep localStorage small; production uploads originals to
    // object storage and serves signed URLs.
    const reader = new FileReader()
    reader.onload = () => {
      const imgEl = new Image()
      imgEl.onload = () => {
        const canvas = document.createElement('canvas')
        const scale = Math.min(1, 560 / Math.max(imgEl.width, imgEl.height))
        canvas.width = Math.round(imgEl.width * scale)
        canvas.height = Math.round(imgEl.height * scale)
        canvas.getContext('2d')!.drawImage(imgEl, 0, 0, canvas.width, canvas.height)
        const dataUrl = canvas.toDataURL('image/jpeg', 0.55)
        const img = store.attachImage(id, angle, file.name, dataUrl)
        setPhotos((p) => ({ ...p, [angle]: img }))
      }
      imgEl.src = reader.result as string
    }
    reader.readAsDataURL(file)
  }

  const markMock = (angle: PhotoAngle) => {
    const id = ensureDraft()
    const img = store.attachImage(id, angle, `${angle}-demo.jpg`)
    setPhotos((p) => ({ ...p, [angle]: img }))
  }

  const stepValid = [
    !!(form.brand && form.model && form.year),
    true,
    requiredPhotosDone,
    !!form.saleTiming,
    true,
  ][step]

  const submit = () => {
    const id = ensureDraft()
    store.updateSubmission(id, {
      brand: form.brand, model: form.model, reference: form.reference || 'Unknown', year: form.year,
      caseMaterial: form.caseMaterial, dialColour: form.dialColour, braceletOrStrap: form.braceletOrStrap,
      condition: form.condition, boxIncluded: form.boxIncluded, papersIncluded: form.papersIncluded,
      serviceHistory: form.serviceHistory || 'None declared', polishingHistory: form.polishingHistory || 'None declared',
      aftermarketParts: form.aftermarketParts || 'None declared', knownFlaws: form.knownFlaws,
      sellerLocation: profile?.location ?? 'Australia', saleTiming: form.saleTiming,
      minimumPrice: form.minimumPrice ? Number(form.minimumPrice) : undefined,
      purchaseInfo: form.purchaseInfo || undefined,
      serialMasked: form.serial ? maskSerial(form.serial) : '••••••',
    })
    store.submitForReview(id)
    nav(`/seller/submissions/${id}`)
  }

  return (
    <div style={{ maxWidth: 760 }}>
      <header>
        <h1>New submission</h1>
        <p className="muted small">
          {STEPS[step]} — step {step + 1} of {STEPS.length}. Your watch stays with you until you accept an offer.
        </p>
      </header>
      <div className="wizbar">
        {STEPS.map((s, i) => <div key={s} className={`seg ${i <= step ? 'on' : ''}`} />)}
      </div>

      {step === 0 && (
        <div className="card stack">
          <div className="grid grid-2">
            <Field label="Brand" required><input type="text" placeholder="e.g. Rolex" value={form.brand} onChange={(e) => set('brand', e.target.value)} /></Field>
            <Field label="Model" required><input type="text" placeholder="e.g. GMT-Master II" value={form.model} onChange={(e) => set('model', e.target.value)} /></Field>
          </div>
          <div className="grid grid-2">
            <Field label="Reference number" hint="Leave blank if unsure — our specialists will identify it.">
              <input type="text" placeholder="e.g. 126710BLNR" value={form.reference} onChange={(e) => set('reference', e.target.value)} />
            </Field>
            <Field label="Year" required><input type="text" placeholder="e.g. 2021" value={form.year} onChange={(e) => set('year', e.target.value)} /></Field>
          </div>
          <div className="grid grid-2">
            <Field label="Case material"><input type="text" placeholder="e.g. Oystersteel" value={form.caseMaterial} onChange={(e) => set('caseMaterial', e.target.value)} /></Field>
            <Field label="Dial colour"><input type="text" placeholder="e.g. Black" value={form.dialColour} onChange={(e) => set('dialColour', e.target.value)} /></Field>
          </div>
          <div className="grid grid-2">
            <Field label="Bracelet or strap"><input type="text" placeholder="e.g. Jubilee bracelet" value={form.braceletOrStrap} onChange={(e) => set('braceletOrStrap', e.target.value)} /></Field>
            <Field label="Serial number" hint="Stored masked. Never shown to buyers; verified physically at authentication.">
              <input type="text" value={form.serial} onChange={(e) => set('serial', e.target.value)} />
            </Field>
          </div>
        </div>
      )}

      {step === 1 && (
        <div className="card stack">
          <Field label="Overall condition" required>
            <select value={form.condition} onChange={(e) => set('condition', e.target.value)}>
              <option value="unworn">Unworn</option>
              <option value="excellent">Excellent</option>
              <option value="very_good">Very good</option>
              <option value="good">Good</option>
              <option value="fair">Fair</option>
            </select>
          </Field>
          <div className="grid grid-2">
            <label className="checkline"><input type="checkbox" checked={form.boxIncluded} onChange={(e) => set('boxIncluded', e.target.checked)} /> Original box included</label>
            <label className="checkline"><input type="checkbox" checked={form.papersIncluded} onChange={(e) => set('papersIncluded', e.target.checked)} /> Papers / warranty card included</label>
          </div>
          <Field label="Service history" hint="When, by whom, with documents if available."><textarea value={form.serviceHistory} onChange={(e) => set('serviceHistory', e.target.value)} placeholder="e.g. Serviced by AD in 2023, receipt included — or 'None'" /></Field>
          <Field label="Known polishing history"><textarea value={form.polishingHistory} onChange={(e) => set('polishingHistory', e.target.value)} placeholder="e.g. Never polished — or describe what you know" /></Field>
          <Field label="Known replacement or aftermarket parts"><textarea value={form.aftermarketParts} onChange={(e) => set('aftermarketParts', e.target.value)} placeholder="e.g. None — or aftermarket clasp fitted 2022" /></Field>
          <Field label="Visible flaws" hint="Honest disclosure protects your sale — discrepancies found at inspection can amend or cancel an accepted offer.">
            <textarea value={form.knownFlaws} onChange={(e) => set('knownFlaws', e.target.value)} placeholder="e.g. Light desk-diving marks on clasp" />
          </Field>
        </div>
      )}

      {step === 2 && (
        <div className="stack">
          <Note tone="info">
            Guided photography: tap a slot to upload the exact angle shown. Automated checks flag
            blur and missing angles. <strong>Preliminary identification only — final
            authentication occurs after an offer is accepted.</strong> For the demonstration, you
            can mark a slot as captured without a file.
          </Note>
          <div className="photo-grid">
            {PHOTO_ANGLES.map((a) => {
              const meta = ANGLE_META[a]
              const img = photos[a]
              return (
                <label key={a} className={`photo-slot ${img ? 'filled' : ''}`}>
                  <input type="file" accept="image/*" capture="environment" style={{ display: 'none' }}
                    onChange={(e) => handleFile(a, e.target.files?.[0] ?? null)} />
                  {img?.dataUrl ? <img src={img.dataUrl} alt={meta.label} /> : <div className="angle-icon" aria-hidden>{meta.icon}</div>}
                  <div className="t">{meta.label}{meta.required && ' *'}</div>
                  <div className="s">{img ? (img.aiChecks?.sharpness === 'blurry' ? '⚠ Blurry — retake' : '✓ Captured') : meta.guide}</div>
                  {!img && (
                    <button type="button" className="btn btn-sm btn-ghost" onClick={(e) => { e.preventDefault(); markMock(a) }}>
                      Mark captured (demo)
                    </button>
                  )}
                </label>
              )
            })}
          </div>
          {!requiredPhotosDone && <p className="small muted">All angles marked * are required.</p>}
        </div>
      )}

      {step === 3 && (
        <div className="card stack">
          <Field label="Desired sale timing" required>
            <select value={form.saleTiming} onChange={(e) => set('saleTiming', e.target.value)}>
              <option>As soon as possible</option>
              <option>Within 2–4 weeks</option>
              <option>Within a month</option>
              <option>No urgency</option>
            </select>
          </Field>
          <Field label="Minimum acceptable price (optional)" hint="Held privately as your reserve — never shown to buyers.">
            <input type="number" min={0} value={form.minimumPrice} onChange={(e) => set('minimumPrice', e.target.value)} placeholder="e.g. 21500" />
          </Field>
          <Field label="Original purchase information (optional)" hint="Where and when you purchased it — supports provenance.">
            <textarea value={form.purchaseInfo} onChange={(e) => set('purchaseInfo', e.target.value)} />
          </Field>
        </div>
      )}

      {step === 4 && (
        <div className="stack">
          <div className="card">
            <h3>{form.brand} {form.model}</h3>
            <div className="kv" style={{ marginTop: 12 }}>
              <dt>Reference</dt><dd>{form.reference || 'To be identified'}</dd>
              <dt>Year</dt><dd>{form.year}</dd>
              <dt>Condition</dt><dd>{form.condition.replace('_', ' ')}</dd>
              <dt>Set</dt><dd>{form.boxIncluded && form.papersIncluded ? 'Full set' : [form.boxIncluded && 'Box', form.papersIncluded && 'Papers'].filter(Boolean).join(', ') || 'Watch only'}</dd>
              <dt>Photographs</dt><dd>{Object.keys(photos).length} captured</dd>
              <dt>Reserve</dt><dd>{form.minimumPrice ? aud(Number(form.minimumPrice)) + ' (private)' : 'None set'}</dd>
            </div>
          </div>
          <Note tone="info">
            On submission you&rsquo;ll receive a <strong>preliminary identification and an indicative
            valuation</strong>. Our team then reviews your watch before it is opened to verified
            buyers. Nothing is binding until you accept an offer.
          </Note>
          {profile?.kycStatus !== 'verified' && (
            <Note tone="warn">
              You&rsquo;ll need to complete identity verification before accepting an offer — you can
              do this any time from Profile &amp; verification.
            </Note>
          )}
        </div>
      )}

      <div className="spread" style={{ marginTop: 20 }}>
        <button className="btn btn-ghost" disabled={step === 0} onClick={() => setStep(step - 1)}>Back</button>
        {step < STEPS.length - 1
          ? <button className="btn btn-primary" disabled={!stepValid} onClick={() => setStep(step + 1)}>Continue</button>
          : <button className="btn btn-accent" onClick={submit}>Submit for review</button>}
      </div>
    </div>
  )
}
