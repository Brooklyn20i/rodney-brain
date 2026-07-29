import React from 'react'
import { Link } from 'react-router-dom'
import { aud } from '../../lib/fees'

export function Home() {
  return (
    <>
      <section className="hero">
        <div className="container">
          <div className="eyebrow">Verified offers for exceptional watches</div>
          <h1>Sell your watch through verified competition.</h1>
          <p className="lede">
            Submit your watch once and receive offers from approved dealers and collectors.
            Your watch stays with you until you accept an offer. Every completed transaction is
            independently authenticated, securely settled, and insured in transit.
          </p>
          <div className="row">
            <Link to="/sell" className="btn btn-primary">Get offers for my watch</Link>
            <Link to="/apply" className="btn btn-ghost">Apply as a buyer</Link>
          </div>
          <p className="small muted" style={{ marginTop: 26 }}>
            Australia-first · Initial focus on watches of approximately A$10,000 and above ·
            Rolex, Audemars Piguet, Patek Philippe, Vacheron Constantin, Cartier, Omega, IWC, Tudor, and selected vintage references
          </p>
        </div>
      </section>

      <section className="section alt">
        <div className="container">
          <h2>One watch. Multiple verified offers. One secure transaction.</h2>
          <p className="sub">A managed transaction platform — not a classifieds site.</p>
          <div className="grid grid-3">
            <div className="step-card">
              <div className="n">1</div>
              <h3>Submit</h3>
              <p className="small">Upload the details and photographs of your watch through a guided flow, from your phone. It takes about ten minutes.</p>
            </div>
            <div className="step-card">
              <div className="n">2</div>
              <h3>Receive offers</h3>
              <p className="small">Approved buyers compete privately for the opportunity to purchase it. Sealed offers, no anonymous messages, no strangers.</p>
            </div>
            <div className="step-card">
              <div className="n">3</div>
              <h3>Complete securely</h3>
              <p className="small">After you accept an offer, the watch is independently authenticated, insured in transit, and settled through the platform.</p>
            </div>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="container">
          <h2>The smarter way to sell a significant watch</h2>
          <p className="sub">How selling through The Timekeeper&rsquo;s Exchange compares.</p>
          <div className="card card-flush table-wrap">
            <table className="tke compare">
              <thead>
                <tr>
                  <th>Criteria</th>
                  <th className="them">Dealer trade-in</th>
                  <th className="them">Private classifieds</th>
                  <th className="them">Traditional consignment</th>
                  <th className="us">The Timekeeper&rsquo;s Exchange</th>
                </tr>
              </thead>
              <tbody>
                <tr><td>Price competition</td><td className="them">One offer</td><td className="them">Unpredictable</td><td className="them">Single channel</td><td className="us">Multiple verified offers</td></tr>
                <tr><td>Speed</td><td className="them">Fast</td><td className="them">Weeks to months</td><td className="them">Months</td><td className="us">Typically days to offers</td></tr>
                <tr><td>Stranger contact</td><td className="them">None</td><td className="them">Constant</td><td className="them">Limited</td><td className="us">None</td></tr>
                <tr><td>Authentication</td><td className="them">Internal</td><td className="them">Your problem</td><td className="them">Varies</td><td className="us">Independent, after acceptance</td></tr>
                <tr><td>Insured logistics</td><td className="them">N/A</td><td className="them">Your risk</td><td className="them">Sometimes</td><td className="us">Included, both legs</td></tr>
                <tr><td>Payment security</td><td className="them">Immediate</td><td className="them">Your risk</td><td className="them">On sale</td><td className="us">Secure managed settlement</td></tr>
                <tr><td>Seller effort</td><td className="them">Low</td><td className="them">High</td><td className="them">Medium</td><td className="us">One submission</td></tr>
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section className="section alt">
        <div className="container">
          <div className="grid grid-2" style={{ gap: 40, alignItems: 'center' }}>
            <div>
              <h2>Built on trust, not traffic</h2>
              <p className="sub" style={{ marginBottom: 18 }}>
                The platform manages every step so neither party carries the other&rsquo;s risk.
              </p>
              <ul style={{ listStyle: 'none', display: 'grid', gap: 12 }}>
                {[
                  ['Verified participants', 'Every seller completes identity verification; every buyer is manually approved.'],
                  ['Independent authentication', 'A qualified watchmaker inspects every watch after an offer is accepted — never before, never from photographs alone.'],
                  ['Insured shipping', 'Fully insured, tamper-evident logistics with a recorded chain of custody.'],
                  ['Secure settlement', 'Payment is released only when the contractual conditions are satisfied.'],
                  ['Clear condition reporting', 'Structured 20-section inspection reports, shared with both parties.'],
                ].map(([t, b]) => (
                  <li key={t} className="card" style={{ padding: '14px 18px' }}>
                    <strong>{t}</strong>
                    <div className="small muted">{b}</div>
                  </li>
                ))}
              </ul>
            </div>
            <div className="card" style={{ padding: 30 }}>
              <h4>Example transaction</h4>
              <h3 style={{ margin: '8px 0 2px' }}>Rolex GMT-Master II</h3>
              <p className="small muted" style={{ marginBottom: 14 }}>Illustrative figures only.</p>
              <table className="fee-table">
                <tbody>
                  <tr><td>Typical dealer offer</td><td>{aud(21500)}</td></tr>
                  <tr><td>Highest verified platform offer</td><td>{aud(22400)}</td></tr>
                  <tr><td>Seller fee</td><td>−{aud(250)}</td></tr>
                  <tr className="total"><td>Seller receives</td><td>{aud(22150)}</td></tr>
                </tbody>
              </table>
              <hr className="divider" />
              <p className="small muted">
                The buyer&rsquo;s total is itemised clearly before their offer is placed — offer amount,
                platform fee, independent authentication, and insured shipping. The watch is
                authenticated before completion.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="container">
          <h2>Access watches before they reach the broader market.</h2>
          <p className="sub">For approved dealers, professional traders, and serious collectors.</p>
          <div className="grid grid-3">
            {[
              ['Verified ownership', 'Every seller is identity-verified and has declared legal ownership before you see the watch.'],
              ['Standardised information', 'Structured condition disclosure, guided photography, and a preliminary platform review on every lot.'],
              ['Sealed bidding', 'Compete privately. No public listings, no price anchoring, no bidding theatre.'],
              ['Independent inspection', 'Your purchase proceeds only after independent authentication against the declared condition.'],
              ['Reliable settlement', 'Managed payment flow with clear rules when an inspection finds a discrepancy.'],
              ['Clean submissions', 'Serial numbers masked, stolen-property checks flagged, incomplete submissions filtered before approval.'],
            ].map(([t, b]) => (
              <div key={t} className="card">
                <strong>{t}</strong>
                <p className="small muted" style={{ marginTop: 6 }}>{b}</p>
              </div>
            ))}
          </div>
          <div style={{ marginTop: 26 }}>
            <Link to="/apply" className="btn">Apply as a buyer</Link>
          </div>
        </div>
      </section>

      <section className="section alt" style={{ textAlign: 'center' }}>
        <div className="container">
          <h2>Discover what verified buyers would pay for your watch.</h2>
          <p className="sub" style={{ margin: '12px auto 26px' }}>
            Indicative valuation on submission. Your watch stays with you until you accept an offer.
          </p>
          <Link to="/sell" className="btn btn-primary">Get offers for my watch</Link>
        </div>
      </section>
    </>
  )
}
