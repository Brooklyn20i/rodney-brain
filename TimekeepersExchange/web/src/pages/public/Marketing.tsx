import React from 'react'
import { Link } from 'react-router-dom'
import { useDb } from '../../lib/store'
import { aud } from '../../lib/fees'

function PageHead({ eyebrow, title, sub }: { eyebrow: string; title: string; sub: string }) {
  return (
    <section className="hero" style={{ padding: '64px 0 40px' }}>
      <div className="container">
        <div className="eyebrow">{eyebrow}</div>
        <h1 style={{ fontSize: 'clamp(1.8rem,4vw,2.6rem)' }}>{title}</h1>
        <p className="lede" style={{ margin: '16px 0 0' }}>{sub}</p>
      </div>
    </section>
  )
}

export function SellLanding() {
  return (
    <>
      <PageHead
        eyebrow="Sell a watch"
        title="Submit your watch once. Receive offers from approved buyers."
        sub="A guided, ten-minute submission from your phone. Your watch stays with you until you accept an offer — then the platform manages authentication, insured logistics, and secure settlement."
      />
      <section className="section">
        <div className="container">
          <div className="grid grid-2" style={{ gap: 36 }}>
            <div className="stack">
              {[
                ['1 · Tell us about your watch', 'Brand, reference, condition, service history, box and papers. Guided photo capture shows you exactly which angles buyers need.'],
                ['2 · Receive an indicative valuation', 'An indicative market range, a likely dealer offer range, and the expected competitive-offer range — clearly labelled as indicative, not guaranteed.'],
                ['3 · Approval and sealed offers', 'Our team reviews every submission. Once approved, verified buyers compete privately during a defined bidding window.'],
                ['4 · Accept on your terms', 'See estimated net proceeds after clear, itemised fees before you accept. Decline, extend once, or withdraw before accepting.'],
                ['5 · Authenticated, insured, settled', 'Only after acceptance does your watch travel — insured, tamper-evident, to an independent watchmaker. Payment is released on satisfied conditions.'],
              ].map(([t, b]) => (
                <div key={t} className="card">
                  <strong>{t}</strong>
                  <p className="small muted" style={{ marginTop: 6 }}>{b}</p>
                </div>
              ))}
            </div>
            <div>
              <div className="card" style={{ position: 'sticky', top: 90 }}>
                <h3>Start your submission</h3>
                <p className="small muted" style={{ margin: '8px 0 16px' }}>
                  Create an account as you go. Identity verification is only required before you
                  accept an offer.
                </p>
                <Link to="/signin?role=seller&next=/seller/submit" className="btn btn-primary" style={{ width: '100%' }}>
                  Get offers for my watch
                </Link>
                <hr className="divider" />
                <p className="small muted">
                  Initial focus: watches of approximately A$10,000 or more. Liquid references
                  typically receive their first offers within 2–4 days.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>
    </>
  )
}

export function HowItWorks() {
  return (
    <>
      <PageHead
        eyebrow="How it works"
        title="A managed transaction, end to end."
        sub="At every stage you can see what happens next, who is responsible, what is binding, and when payment moves."
      />
      <section className="section">
        <div className="container legal-prose">
          {[
            ['Submission', 'The seller completes a structured submission with guided photography. Automated checks flag missing angles and blurry images and suggest a likely reference. Preliminary identification only — final authentication occurs after an offer is accepted.'],
            ['Review', 'A platform administrator reviews every submission, may request more photographs or information, sets the bidding window, and classifies the watch as standard, vintage, or specialist.'],
            ['Sealed offers', 'Verified buyers are invited to bid privately. Buyers do not see each other’s bids. The seller sees the number of offers, the highest offer, and estimated net proceeds — never buyer identities before acceptance.'],
            ['Acceptance', 'Accepting an offer creates a binding transaction. The buyer authorises payment into secure settlement before the watch travels anywhere.'],
            ['Authentication', 'The watch ships — insured and tamper-evident — to an approved watchmaker, who completes a structured 20-section inspection: identity, movement, timekeeping, condition, originality, and consistency with the seller’s declaration.'],
            ['Outcomes', 'Passed as described: the transaction proceeds automatically. Minor discrepancy: the buyer may proceed, propose an amended offer, or cancel under the platform rules. Material discrepancy: the platform initiates a managed resolution.'],
            ['Settlement and delivery', 'Payment is released only when the contractual conditions are satisfied. The watch is dispatched to the buyer, insured, and both parties receive their transaction documents.'],
          ].map(([t, b]) => (
            <div key={t}>
              <h2>{t}</h2>
              <p>{b}</p>
            </div>
          ))}
          <div className="row" style={{ marginTop: 26 }}>
            <Link to="/sell" className="btn btn-primary">Get offers for my watch</Link>
            <Link to="/trust" className="btn btn-ghost">Trust &amp; authentication</Link>
          </div>
        </div>
      </section>
    </>
  )
}

export function ForBuyers() {
  return (
    <>
      <PageHead
        eyebrow="For buyers"
        title="Access watches before they reach the broader market."
        sub="A private, sealed-offer pipeline of identity-verified, condition-disclosed watches — inspected independently before your money moves."
      />
      <section className="section">
        <div className="container">
          <div className="grid grid-3">
            {[
              ['Who buys here', 'Professional dealers, serious collectors, and approved private buyers. Every account is manually reviewed and verified — ABN, identity, and proof of funds or a transaction limit.'],
              ['What you see', 'Structured submissions: declared condition, known flaws, service history, full gallery, preliminary platform review, and an estimated market range. Serials masked; seller identity withheld.'],
              ['How you bid', 'Sealed offers by default. Binding cash, subject to standard inspection, or subject to specific stated conditions. Your total — offer, platform fee, authentication, shipping, taxes — is itemised before you commit.'],
              ['Your protection', 'The watch is authenticated after acceptance by an independent watchmaker against the declared condition. Discrepancies trigger clear rules: proceed, amend, or cancel.'],
              ['Settlement', 'Funds are pre-authorised, held by the settlement process, and released only when conditions are satisfied. No wiring money to strangers.'],
              ['Preferences', 'Set preferred brands, references, and price ranges — you are invited to matching opportunities as they are approved.'],
            ].map(([t, b]) => (
              <div key={t} className="card">
                <strong>{t}</strong>
                <p className="small muted" style={{ marginTop: 6 }}>{b}</p>
              </div>
            ))}
          </div>
          <div style={{ marginTop: 28 }}>
            <Link to="/apply" className="btn btn-primary">Apply as a buyer</Link>
          </div>
        </div>
      </section>
    </>
  )
}

export function Trust() {
  return (
    <>
      <PageHead
        eyebrow="Trust & authentication"
        title="Independent authentication, recorded chain of custody."
        sub="No watch is called authentic from photographs. Authentication is physical, independent, and happens only after an offer is accepted."
      />
      <section className="section">
        <div className="container legal-prose">
          <h2>The 20-section inspection</h2>
          <p>
            Every accepted transaction passes through an approved watchmaker who records: chain of
            custody, packaging, reference and serial consistency, dial, hands and lume, crystal,
            case, bezel, crown and pushers, bracelet, clasp, movement identity, timegrapher results,
            functions, water resistance where appropriate, polishing assessment, replacement parts,
            accessories, final photographs, and a structured conclusion.
          </p>
          <h2>Possible outcomes</h2>
          <ul>
            <li>Passed as described — the transaction proceeds automatically.</li>
            <li>Passed with minor discrepancy — the buyer may proceed, propose an amended offer, or cancel under the platform rules.</li>
            <li>Passed with material discrepancy — the platform initiates a managed resolution.</li>
            <li>Authentication inconclusive / requires manufacturer review — escalated with both parties informed.</li>
            <li>Failed authentication or suspected stolen or altered item — the transaction stops, funds are protected, and the matter is escalated appropriately.</li>
          </ul>
          <h2>Chain of custody</h2>
          <p>
            From the moment the insured label is generated to the buyer&rsquo;s delivery confirmation,
            every hand the watch passes through is recorded and visible to both parties.
          </p>
          <h2>What AI does — and does not — do</h2>
          <p>
            Automated checks assist with photo quality, likely reference identification, and
            discrepancy flags. Every automated conclusion shows its confidence, evidence, and
            limitations. The platform never claims final authenticity from photographs.
          </p>
        </div>
      </section>
    </>
  )
}

export function FeesPage() {
  const db = useDb()
  const c = db.feeConfig
  return (
    <>
      <PageHead
        eyebrow="Fees"
        title="Clear, itemised fees. No hidden spread."
        sub="The seller receives the accepted offer less a flat fee. The buyer pays the offer plus transparent, itemised platform costs. Every figure is shown before anything becomes binding."
      />
      <section className="section">
        <div className="container">
          <div className="grid grid-2">
            <div className="card">
              <h3>Sellers</h3>
              <table className="fee-table" style={{ marginTop: 12 }}>
                <tbody>
                  <tr><td>Submission &amp; indicative valuation</td><td>Free</td></tr>
                  <tr><td>Seller transaction fee</td><td>{aud(c.sellerFlatFee)} + GST</td></tr>
                  <tr><td>Authentication &amp; insured shipping</td><td>Paid by buyer</td></tr>
                  <tr><td>If your watch doesn&rsquo;t sell</td><td>No charge</td></tr>
                </tbody>
              </table>
            </div>
            <div className="card">
              <h3>Buyers</h3>
              <table className="fee-table" style={{ marginTop: 12 }}>
                <tbody>
                  <tr><td>Platform fee</td><td>{(c.buyerFeePct * 100).toFixed(0)}% of offer (min {aud(c.buyerFeeMin)})</td></tr>
                  <tr><td>Independent authentication</td><td>{aud(c.authenticationFee)}</td></tr>
                  <tr><td>Insured shipping, both legs</td><td>{aud(c.shippingFee)}</td></tr>
                  <tr><td>GST</td><td>Applies to platform services</td></tr>
                </tbody>
              </table>
            </div>
          </div>
          <p className="small muted" style={{ marginTop: 18, maxWidth: '48em' }}>
            Fees shown are the current demonstration configuration and are illustrative. GST
            treatment of second-hand goods varies with the seller&rsquo;s and buyer&rsquo;s circumstances —
            see the FAQ and obtain independent advice. All fees are itemised in full before an
            offer is placed or accepted.
          </p>
        </div>
      </section>
    </>
  )
}
