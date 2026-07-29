import React, { useState } from 'react'
import type { ReactNode } from 'react'
import type { SubmissionStatus, TransactionState, OfferStatus, BuyerStatus, InspectionOutcome, FeeBreakdown } from '../lib/types'
import { STATE_LABELS, OUTCOME_LABELS, HAPPY_PATH } from '../lib/stateMachine'
import { aud } from '../lib/fees'
import { titleCase } from '../lib/format'

type Tone = 'ok' | 'warn' | 'bad' | 'info' | 'neutral' | 'gold' | 'olive'

export function Badge({ tone = 'neutral', children }: { tone?: Tone; children: ReactNode }) {
  return <span className={`badge ${tone}`}>{children}</span>
}

const SUBMISSION_TONE: Record<SubmissionStatus, Tone> = {
  draft: 'neutral', submitted: 'info', under_review: 'info', info_required: 'warn',
  approved_for_offers: 'olive', bidding_closed: 'neutral', offer_accepted: 'gold',
  sold: 'ok', declined: 'bad', withdrawn: 'neutral', suspended: 'bad',
}
export function SubmissionBadge({ status }: { status: SubmissionStatus }) {
  const label = status === 'approved_for_offers' ? 'Open for offers' : titleCase(status)
  return <Badge tone={SUBMISSION_TONE[status]}>{label}</Badge>
}

const STATE_TONE: Partial<Record<TransactionState, Tone>> = {
  completed: 'ok', cancelled: 'neutral', disputed: 'bad', buyer_review: 'warn', resolution: 'warn',
}
export function StateBadge({ state }: { state: TransactionState }) {
  return <Badge tone={STATE_TONE[state] ?? 'info'}>{STATE_LABELS[state]}</Badge>
}

const OFFER_TONE: Record<OfferStatus, Tone> = {
  active: 'olive', accepted: 'ok', declined: 'bad', expired: 'neutral', withdrawn: 'neutral', lost: 'neutral',
}
export function OfferBadge({ status }: { status: OfferStatus }) {
  return <Badge tone={OFFER_TONE[status]}>{titleCase(status)}</Badge>
}

const BUYER_TONE: Record<BuyerStatus, Tone> = {
  applicant: 'info', under_review: 'warn', verified: 'ok', suspended: 'bad', rejected: 'bad',
}
export function BuyerBadge({ status }: { status: BuyerStatus }) {
  return <Badge tone={BUYER_TONE[status]}>{titleCase(status)}</Badge>
}

export function OutcomeBadge({ outcome }: { outcome: InspectionOutcome }) {
  const tone: Tone = outcome === 'passed_as_described' ? 'ok'
    : outcome === 'passed_minor_discrepancy' ? 'warn'
    : outcome === 'passed_material_discrepancy' || outcome === 'inconclusive' || outcome === 'requires_manufacturer_review' ? 'warn'
    : 'bad'
  return <Badge tone={tone}>{OUTCOME_LABELS[outcome]}</Badge>
}

export function Stat({ k, v, s }: { k: string; v: ReactNode; s?: string }) {
  return (
    <div className="stat">
      <div className="k">{k}</div>
      <div className="v">{v}</div>
      {s && <div className="s">{s}</div>}
    </div>
  )
}

export function Field({ label, hint, children, required }: { label: string; hint?: string; children: ReactNode; required?: boolean }) {
  return (
    <div className="field">
      <label>{label}{required && <span style={{ color: 'var(--oxblood)' }}> *</span>}</label>
      {children}
      {hint && <span className="hint">{hint}</span>}
    </div>
  )
}

export function Note({ tone = 'plain', children }: { tone?: 'ok' | 'warn' | 'bad' | 'info' | 'plain'; children: ReactNode }) {
  return <div className={`note ${tone}`}>{children}</div>
}

export function WatchThumb({ brand, large }: { brand: string; large?: boolean }) {
  const initials = brand.split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase()
  return <div className={`watch-thumb ${large ? 'lg' : ''}`} aria-hidden>{initials || '◷'}</div>
}

export function TransactionStepper({ state }: { state: TransactionState }) {
  const idx = HAPPY_PATH.indexOf(state)
  const offPath = idx === -1
  return (
    <div className="stepper">
      {HAPPY_PATH.map((s, i) => {
        const done = idx > i || state === 'completed'
        const current = idx === i
        return (
          <div key={s} className={`step ${done ? 'done' : ''} ${current ? 'current' : ''}`}>
            <div className="dot">{done ? '✓' : i + 1}</div>
            <div className="body">
              <div className="t">{STATE_LABELS[s]}</div>
            </div>
          </div>
        )
      })}
      {offPath && (
        <div className="step current">
          <div className="dot">!</div>
          <div className="body">
            <div className="t">{STATE_LABELS[state]}</div>
            <div className="s">This transaction has left the standard path and is being managed by the platform.</div>
          </div>
        </div>
      )}
    </div>
  )
}

export function FeeTable({ fees, perspective }: { fees: FeeBreakdown; perspective: 'seller' | 'buyer' }) {
  if (perspective === 'seller') {
    const gst = Math.round(fees.sellerFee * 0.1)
    return (
      <table className="fee-table">
        <tbody>
          <tr><td>Accepted offer</td><td>{aud(fees.offerAmount)}</td></tr>
          <tr><td>Seller fee</td><td>−{aud(fees.sellerFee)}</td></tr>
          <tr><td>GST on seller fee</td><td>−{aud(gst)}</td></tr>
          <tr><td>Authentication &amp; insured shipping</td><td>Paid by buyer</td></tr>
          <tr className="total"><td>Net payout</td><td>{aud(fees.sellerNet)}</td></tr>
        </tbody>
      </table>
    )
  }
  const buyerGst = Math.round((fees.buyerPlatformFee + fees.authenticationFee + fees.shippingFee) * 0.1)
  return (
    <table className="fee-table">
      <tbody>
        <tr><td>Offer amount</td><td>{aud(fees.offerAmount)}</td></tr>
        <tr><td>Platform fee</td><td>{aud(fees.buyerPlatformFee)}</td></tr>
        <tr><td>Independent authentication</td><td>{aud(fees.authenticationFee)}</td></tr>
        <tr><td>Insured shipping (both legs)</td><td>{aud(fees.shippingFee)}</td></tr>
        <tr><td>GST on platform services</td><td>{aud(buyerGst)}</td></tr>
        <tr className="total"><td>Total payable</td><td>{aud(fees.buyerTotal)}</td></tr>
      </tbody>
    </table>
  )
}

export function Modal({ open, onClose, children }: { open: boolean; onClose: () => void; children: ReactNode }) {
  if (!open) return null
  return (
    <div className="modal-scrim" onClick={onClose} role="dialog" aria-modal>
      <div className="modal" onClick={(e) => e.stopPropagation()}>{children}</div>
    </div>
  )
}

export function Empty({ title, body }: { title: string; body?: string }) {
  return (
    <div className="card" style={{ textAlign: 'center', padding: 44 }}>
      <div style={{ fontSize: '1.6rem', marginBottom: 8 }}>◷</div>
      <h3>{title}</h3>
      {body && <p className="small muted" style={{ marginTop: 6 }}>{body}</p>}
    </div>
  )
}

export function useFlash(): [string | null, (m: string) => void] {
  const [msg, setMsg] = useState<string | null>(null)
  const flash = (m: string) => {
    setMsg(m)
    window.setTimeout(() => setMsg(null), 3500)
  }
  return [msg, flash]
}
