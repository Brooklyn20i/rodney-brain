import React from 'react'
import { useParams, Link } from 'react-router-dom'

export function About() {
  return (
    <section className="section">
      <div className="container legal-prose">
        <div className="eyebrow" style={{ color: 'var(--gold)', letterSpacing: '0.2em', textTransform: 'uppercase', fontSize: '0.75rem', fontWeight: 600 }}>About</div>
        <h1 style={{ margin: '12px 0 18px' }}>The trusted transaction infrastructure for Australia&rsquo;s pre-owned watch market.</h1>
        <p>
          The Timekeeper&rsquo;s Exchange exists because selling a significant watch in Australia has
          meant choosing between a single dealer&rsquo;s offer, the risk and friction of private
          classifieds, or months of consignment. None of those tells a seller what credible buyers
          would actually pay.
        </p>
        <p>
          We built a different model: one submission, multiple verified offers, one secure
          transaction. The platform manages bids, questions, documentation, logistics, inspection,
          payment, and disputes — so sellers never meet strangers, and buyers never rely on a
          stranger&rsquo;s description.
        </p>
        <h2>Principles</h2>
        <ul>
          <li>The watch stays with the seller until an offer is accepted.</li>
          <li>Every buyer is verified. Every seller is identity-checked before acceptance.</li>
          <li>Authentication is independent and happens after acceptance — never from photographs.</li>
          <li>Fees are transparent and itemised. There is no hidden spread.</li>
          <li>The platform does not own inventory and does not bid on watches.</li>
        </ul>
      </div>
    </section>
  )
}

const ARTICLES = [
  {
    slug: 'why-sealed-offers',
    title: 'Why sealed offers produce better prices than public listings',
    date: 'July 2026',
    body: 'When a watch is listed publicly, the first visible price becomes an anchor and every subsequent conversation is a negotiation downward. Sealed offers invert this: each verified buyer states the most they are genuinely willing to pay, privately, before a deadline. Across our demonstration scenarios the spread between the lowest and highest sealed offer routinely exceeds the typical margin a seller is asked to give away in a trade-in.',
  },
  {
    slug: 'polish-and-value',
    title: 'Polishing: the quiet variable in modern watch value',
    date: 'June 2026',
    body: 'Case polishing is legitimate maintenance — and one of the most common discrepancies between a seller’s description and a watchmaker’s bench findings. On condition-sensitive references, a softened bevel is material information. This is why our inspections assess polishing explicitly, and why our discrepancy rules give buyers a structured choice rather than a dispute.',
  },
  {
    slug: 'what-authentication-means',
    title: 'What “authenticated” should actually mean',
    date: 'May 2026',
    body: 'A photograph can suggest a reference; it cannot verify a movement. Our authentication is a physical, 20-section inspection by a qualified watchmaker after an offer is accepted — serial consistency, movement identity, timegrapher performance, originality of components, and consistency with the declared condition. Anything less is an opinion.',
  },
]

export function Journal() {
  return (
    <section className="section">
      <div className="container">
        <h1 style={{ marginBottom: 8 }}>Journal</h1>
        <p className="muted" style={{ marginBottom: 30 }}>Notes on the market, condition, and how managed transactions work.</p>
        <div className="stack" style={{ maxWidth: 760 }}>
          {ARTICLES.map((a) => (
            <article key={a.slug} className="card">
              <div className="small muted">{a.date}</div>
              <h3 style={{ margin: '4px 0 10px' }}>{a.title}</h3>
              <p className="small">{a.body}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  )
}

const FAQS: [string, string][] = [
  ['Does my watch leave me when I submit it?', 'No. Your watch stays with you until you accept an offer. Only then is it shipped — insured and tamper-evident — to an independent authentication centre.'],
  ['Is the valuation guaranteed?', 'No. The valuation shown on submission is indicative, built from comparable data, and clearly labelled as such. What you can rely on are the actual sealed offers from verified buyers.'],
  ['Who are the buyers?', 'Professional dealers, professional traders, and approved collectors. Every buyer is manually reviewed and verified before they can see opportunities. You never see their identity before accepting, and they never see yours.'],
  ['What happens if the inspection finds something?', 'A minor discrepancy gives the buyer a structured choice: proceed, propose an amended offer, or cancel under the platform rules. A material discrepancy triggers a managed resolution. Your watch is returned to you, insured, at no cost, if a transaction does not complete through no fault of your description.'],
  ['When do I get paid?', 'Payment is released from settlement once the watch passes inspection and the contractual conditions are satisfied — typically within days of the inspection report.'],
  ['What does it cost to sell?', 'Submission and valuation are free. A flat seller fee (plus GST) is deducted from the accepted offer. Authentication and insured shipping are paid by the buyer and itemised to them before they bid.'],
  ['Is this platform holding my money?', 'No. The MVP simulates settlement; production uses a regulated third-party payment or escrow provider. The platform does not operate an unlicensed wallet.'],
  ['What about stolen watches?', 'Sellers declare legal ownership and that the watch is not stolen, encumbered, or subject to an insurance claim, and complete identity verification before acceptance. Serial checks against theft registers are part of the authentication workflow.'],
  ['Do you buy watches yourselves?', 'No. The platform does not own inventory, does not bid, and earns clearly disclosed fees only.'],
]

export function Faq() {
  return (
    <section className="section">
      <div className="container" style={{ maxWidth: 800 }}>
        <h1 style={{ marginBottom: 24 }}>Frequently asked questions</h1>
        {FAQS.map(([q, a]) => (
          <details key={q} className="faq-item">
            <summary>{q}</summary>
            <p>{a}</p>
          </details>
        ))}
      </div>
    </section>
  )
}

export function Contact() {
  return (
    <section className="section">
      <div className="container" style={{ maxWidth: 640 }}>
        <h1>Contact</h1>
        <p className="muted" style={{ margin: '10px 0 24px' }}>
          Questions about a submission, a buyer application, or the platform.
        </p>
        <div className="card stack">
          <div className="kv">
            <dt>Sellers</dt><dd>sellers@timekeepersexchange.au (demonstration)</dd>
            <dt>Buyers</dt><dd>buyers@timekeepersexchange.au (demonstration)</dd>
            <dt>Media</dt><dd>press@timekeepersexchange.au (demonstration)</dd>
            <dt>Location</dt><dd>Sydney, Australia</dd>
          </div>
          <p className="small muted">
            This is a demonstration build; the addresses above are placeholders and are not monitored.
          </p>
        </div>
      </div>
    </section>
  )
}

const LEGAL_DOCS: Record<string, { title: string; sections: [string, string][] }> = {
  terms: {
    title: 'Terms of Use',
    sections: [
      ['Status of this document', 'This is a demonstration platform. These terms are a placeholder structure for legal review and are not legal advice. Before launch the platform requires reviewed terms addressing Australian Consumer Law, marketplace liability, and the matters in the pre-launch legal checklist.'],
      ['The service', 'The Timekeeper’s Exchange provides a managed marketplace connecting private sellers of pre-owned watches with verified buyers. The platform does not own inventory, does not provide valuation advice, and does not act as agent for either party except as expressly described.'],
      ['Binding offers', 'An accepted offer creates a binding transaction between seller and buyer, subject to independent authentication and the discrepancy rules in the Authentication Policy.'],
      ['Fees', 'All fees are disclosed and itemised before an offer is placed or accepted. See the Fees page for the current schedule.'],
      ['Prohibited conduct', 'Misdescription, attempted off-platform contact, bid manipulation, and dealing in stolen or encumbered goods are prohibited and lead to suspension and referral where appropriate.'],
    ],
  },
  privacy: {
    title: 'Privacy Policy',
    sections: [
      ['Status of this document', 'Placeholder for a reviewed policy under the Privacy Act 1988 (Cth) and the Australian Privacy Principles.'],
      ['What we collect', 'Identity verification data, watch and transaction records, device and usage information. Identity documents are handled by the KYC provider in production; the platform stores verification status, not raw documents.'],
      ['What we never disclose', 'Seller residential addresses are never shown to buyers. Buyer identities are never shown to sellers before completion, and not after completion unless operationally required.'],
      ['Retention', 'Financial and transaction records are retained as required by law and are never hard-deleted from operational systems; access is role-restricted and audited.'],
    ],
  },
  'seller-agreement': {
    title: 'Seller Agreement',
    sections: [
      ['Status of this document', 'Placeholder structure for legal review.'],
      ['Your declarations', 'You declare that you are the legal owner, that the watch is not stolen, encumbered, or subject to an insurance claim, and that your description is accurate to the best of your knowledge.'],
      ['Acceptance is binding', 'Accepting an offer commits you to complete the transaction subject to the Authentication Policy. Withdrawal after acceptance may incur costs.'],
      ['Description accuracy', 'Material differences between your description and the inspection findings may result in an amended offer, cancellation, or a managed resolution under the Dispute Policy.'],
    ],
  },
  'buyer-agreement': {
    title: 'Buyer Agreement',
    sections: [
      ['Status of this document', 'Placeholder structure for legal review.'],
      ['Binding bids', 'A sealed offer is binding if accepted and the watch passes inspection as described, or with discrepancies you elect to accept.'],
      ['Funding', 'You must fund or pre-authorise payment promptly after acceptance. Failure to settle affects your trust score and may result in suspension.'],
      ['Verification', 'You consent to identity, business, and source-of-funds verification, and to transaction limits set by the platform.'],
    ],
  },
  'authentication-policy': {
    title: 'Authentication Policy',
    sections: [
      ['Scope', 'Every accepted transaction undergoes a physical, independent, 20-section inspection by an approved watchmaker. Photograph-based checks before acceptance are preliminary identification only.'],
      ['Outcomes', 'Passed as described; passed with minor discrepancy; passed with material discrepancy; inconclusive; failed; suspected stolen or altered; requires manufacturer review. Each outcome has defined consequences described in How It Works.'],
      ['Discrepancy rules', 'Minor: buyer may proceed, propose an amended offer, or cancel. Material: managed resolution. Failed or suspected stolen: transaction stops, funds protected, escalation as required by law.'],
    ],
  },
  'dispute-policy': {
    title: 'Dispute Policy',
    sections: [
      ['Case management', 'Every dispute has an owner, a status, a timeline, evidence, messages, a proposed resolution, any financial adjustment, and a final decision — all recorded on an audit log.'],
      ['Types', 'Condition discrepancy, aftermarket part, incorrect accessory, shipping damage, payment issue, authenticity concern, seller withdrawal, buyer default, lost shipment.'],
      ['Funds', 'Funds remain in settlement until a dispute is resolved. Neither party is paid out of order.'],
    ],
  },
}

export function Legal() {
  const { doc } = useParams()
  const d = LEGAL_DOCS[doc ?? 'terms'] ?? LEGAL_DOCS.terms
  return (
    <section className="section">
      <div className="container legal-prose">
        <h1>{d.title}</h1>
        <p className="small muted" style={{ margin: '8px 0 8px' }}>
          Demonstration document — requires legal review before launch. See the repository&rsquo;s
          pre-launch legal checklist.
        </p>
        {d.sections.map(([t, b]) => (
          <div key={t}>
            <h2>{t}</h2>
            <p>{b}</p>
          </div>
        ))}
        <div className="row" style={{ marginTop: 24 }}>
          {Object.keys(LEGAL_DOCS).map((k) => (
            <Link key={k} to={`/legal/${k}`} className="btn btn-sm btn-ghost">{LEGAL_DOCS[k].title}</Link>
          ))}
        </div>
      </div>
    </section>
  )
}
