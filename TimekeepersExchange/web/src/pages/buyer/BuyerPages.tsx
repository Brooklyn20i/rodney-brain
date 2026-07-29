import React, { useState } from 'react'
import { Link } from 'react-router-dom'
import { store, useDb, useMe } from '../../lib/store'
import { Stat, Badge, OfferBadge, Empty, Note, WatchThumb, BuyerBadge, Field } from '../../components/ui'
import { aud } from '../../lib/fees'
import { timeRemaining, titleCase, fmtDate } from '../../lib/format'

export function BuyerDashboard() {
  const db = useDb()
  const me = useMe()!
  const bp = store.buyerProfile(me.id)!
  const opportunities = store.visibleOpportunities(me.id)
  const myOffers = db.offers.filter((o) => o.buyerId === me.id)
  const active = myOffers.filter((o) => o.status === 'active')
  const won = myOffers.filter((o) => o.status === 'accepted')
  const txs = db.transactions.filter((t) => t.buyerId === me.id)
  const needsAction = txs.filter((t) => ['offer_accepted', 'buyer_review', 'in_transit_to_buyer'].includes(t.state))
  const matches = opportunities.filter((s) => bp.preferredBrands.some((b) => s.brand.toLowerCase().includes(b.toLowerCase())))

  return (
    <>
      <header className="spread">
        <div>
          <h1>{bp.businessName ?? me.name}</h1>
          <p className="muted small">{titleCase(bp.buyerType)} · Trust score {bp.trustScore}/100 · Limit {aud(bp.transactionLimit)}</p>
        </div>
        <BuyerBadge status={bp.status} />
      </header>

      {needsAction.length > 0 && (
        <Note tone="warn">
          <strong>Action required on {needsAction.length} transaction{needsAction.length > 1 ? 's' : ''}.</strong>{' '}
          {needsAction.map((t) => {
            const s = db.submissions.find((x) => x.id === t.submissionId)!
            const label = t.state === 'offer_accepted' ? 'authorise payment' : t.state === 'buyer_review' ? 'review inspection discrepancy' : 'confirm delivery'
            return <span key={t.id}><Link to={`/buyer/transactions/${t.id}`}>{s.brand} {s.model} — {label}</Link>. </span>
          })}
        </Note>
      )}

      <div className="grid grid-4" style={{ margin: '18px 0' }}>
        <Stat k="Open opportunities" v={opportunities.length} s={matches.length + ' matching your preferences'} />
        <Stat k="Active offers" v={active.length} />
        <Stat k="Winning offers" v={won.length} />
        <Stat k="Completed purchases" v={txs.filter((t) => t.state === 'completed').length} s={`Settlement reliability ${bp.defaultedCount === 0 ? '100%' : ''}`} />
      </div>

      <div className="spread" style={{ margin: '24px 0 10px' }}>
        <h4>Newly available watches</h4>
        <Link to="/buyer/opportunities" className="small">View all</Link>
      </div>
      {opportunities.length === 0
        ? <Empty title="No open opportunities right now" body="You are invited automatically when watches matching your profile are approved." />
        : (
          <div className="stack">
            {opportunities.slice(0, 4).map((s) => (
              <Link key={s.id} to={`/buyer/opportunities/${s.id}`} className="card spread" style={{ textDecoration: 'none' }}>
                <div className="row">
                  <WatchThumb brand={s.brand} />
                  <div>
                    <strong>{s.headline}</strong>
                    <div className="small muted">{s.reference} · {s.year} · {s.sellerLocation} · Est. {aud(s.valuation?.marketLow ?? 0)}–{aud(s.valuation?.marketHigh ?? 0)}</div>
                  </div>
                </div>
                <div className="row">
                  {matches.includes(s) && <Badge tone="gold">Matches preferences</Badge>}
                  {s.bidWindow && <Badge tone="olive">{timeRemaining(s.bidWindow.closesAt).label}</Badge>}
                </div>
              </Link>
            ))}
          </div>
        )}
    </>
  )
}

export function OpportunityFeed() {
  const db = useDb()
  const me = useMe()!
  const opportunities = store.visibleOpportunities(me.id)
  const [brand, setBrand] = useState('')
  const [maxPrice, setMaxPrice] = useState('')
  const [fullSet, setFullSet] = useState(false)
  const filtered = opportunities.filter((s) =>
    (!brand || s.brand === brand) &&
    (!maxPrice || (s.valuation?.marketLow ?? 0) <= Number(maxPrice)) &&
    (!fullSet || (s.boxIncluded && s.papersIncluded)))
  const brands = [...new Set(opportunities.map((s) => s.brand))]

  return (
    <>
      <header>
        <h1>Opportunity feed</h1>
        <p className="muted small">Sealed bidding — competing bids are never disclosed.</p>
      </header>
      <div className="card row" style={{ marginBottom: 16 }}>
        <Field label="Brand"><select value={brand} onChange={(e) => setBrand(e.target.value)}><option value="">All</option>{brands.map((b) => <option key={b}>{b}</option>)}</select></Field>
        <Field label="Max market estimate"><input type="number" value={maxPrice} onChange={(e) => setMaxPrice(e.target.value)} placeholder="A$" /></Field>
        <label className="checkline" style={{ marginTop: 18 }}>
          <input type="checkbox" checked={fullSet} onChange={(e) => setFullSet(e.target.checked)} /> Full set only
        </label>
      </div>
      {filtered.length === 0
        ? <Empty title="Nothing matches your filters" />
        : (
          <div className="stack">
            {filtered.map((s) => (
              <Link key={s.id} to={`/buyer/opportunities/${s.id}`} className="card spread" style={{ textDecoration: 'none' }}>
                <div className="row">
                  <WatchThumb brand={s.brand} />
                  <div>
                    <strong>{s.headline}</strong>
                    <div className="small muted">{s.reference} · {s.year} · {titleCase(s.condition)} · {s.sellerLocation}</div>
                    <div className="small muted">{s.buyerSummary}</div>
                  </div>
                </div>
                <div className="row">
                  <Badge tone="neutral">Est. {aud(s.valuation?.marketLow ?? 0)}–{aud(s.valuation?.marketHigh ?? 0)}</Badge>
                  {s.bidWindow && <Badge tone="olive">{timeRemaining(s.bidWindow.closesAt).label}</Badge>}
                  {s.category !== 'standard' && <Badge tone="gold">{titleCase(s.category)}</Badge>}
                </div>
              </Link>
            ))}
          </div>
        )}
    </>
  )
}

export function BuyerOffers() {
  const db = useDb()
  const me = useMe()!
  const myOffers = db.offers.filter((o) => o.buyerId === me.id).slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  return (
    <>
      <header><h1>My offers</h1></header>
      {myOffers.length === 0 ? <Empty title="No offers yet" body="Open the opportunity feed to place your first sealed offer." /> : (
        <div className="card card-flush table-wrap">
          <table className="tke">
            <thead><tr><th>Watch</th><th className="num">Offer</th><th>Type</th><th>Status</th><th>Placed</th><th></th></tr></thead>
            <tbody>
              {myOffers.map((o) => {
                const s = db.submissions.find((x) => x.id === o.submissionId)!
                const tx = o.status === 'accepted' ? db.transactions.find((t) => t.offerId === o.id) : undefined
                return (
                  <tr key={o.id}>
                    <td><strong>{s.brand} {s.model}</strong><div className="small muted">{s.reference}</div></td>
                    <td className="num">{aud(o.amount)}</td>
                    <td className="small">{titleCase(o.type)}</td>
                    <td><OfferBadge status={o.status} /></td>
                    <td className="small muted">{fmtDate(o.createdAt)}</td>
                    <td>
                      {tx ? <Link className="btn btn-sm" to={`/buyer/transactions/${tx.id}`}>Transaction</Link>
                        : o.status === 'active' ? <Link className="btn btn-sm btn-ghost" to={`/buyer/opportunities/${s.id}`}>Revise</Link> : null}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}

export function BuyerAccount() {
  const me = useMe()!
  const db = useDb()
  const bp = store.buyerProfile(me.id)!
  const [brands, setBrands] = useState(bp.preferredBrands.join(', '))
  const [min, setMin] = useState(String(bp.priceRangeMin ?? ''))
  const [max, setMax] = useState(String(bp.priceRangeMax ?? ''))
  return (
    <>
      <header><h1>Account &amp; preferences</h1></header>
      <div className="grid grid-2" style={{ alignItems: 'start' }}>
        <div className="card">
          <div className="spread"><h3>Verification</h3><BuyerBadge status={bp.status} /></div>
          <div className="kv" style={{ marginTop: 12 }}>
            <dt>Buyer type</dt><dd>{titleCase(bp.buyerType)}</dd>
            {bp.businessName && <><dt>Business</dt><dd>{bp.businessName}</dd></>}
            {bp.abn && <><dt>ABN</dt><dd>{bp.abn}</dd></>}
            {bp.dealerLicence && <><dt>Dealer licence</dt><dd>{bp.dealerLicence}</dd></>}
            <dt>GST registered</dt><dd>{bp.gstRegistered ? 'Yes' : 'No'}</dd>
            <dt>Transaction limit</dt><dd>{aud(bp.transactionLimit)}</dd>
            <dt>Proof of funds</dt><dd>{bp.proofOfFundsProvided ? 'Provided' : 'Not provided'}</dd>
            <dt>Vintage / specialist access</dt><dd>{bp.vintageApproved ? 'Approved' : 'Not approved'}</dd>
            <dt>Trust score</dt><dd>{bp.trustScore}/100</dd>
            <dt>Settled / defaulted</dt><dd>{bp.settledCount} / {bp.defaultedCount}</dd>
          </div>
          <Note tone="info">Limits, tiers, and vintage access are managed by the platform. Contact us to request changes.</Note>
        </div>
        <form className="card stack" onSubmit={(e) => {
          e.preventDefault()
          store.updateBuyerProfile(me.id, {
            preferredBrands: brands.split(',').map((s) => s.trim()).filter(Boolean),
            priceRangeMin: min ? Number(min) : undefined,
            priceRangeMax: max ? Number(max) : undefined,
          })
        }}>
          <h3>Preferences</h3>
          <Field label="Preferred brands" hint="Used to match and notify you of new opportunities.">
            <input type="text" value={brands} onChange={(e) => setBrands(e.target.value)} />
          </Field>
          <div className="grid grid-2">
            <Field label="Price range from"><input type="number" value={min} onChange={(e) => setMin(e.target.value)} /></Field>
            <Field label="to"><input type="number" value={max} onChange={(e) => setMax(e.target.value)} /></Field>
          </div>
          <button className="btn btn-primary" type="submit">Save preferences</button>
        </form>
      </div>
    </>
  )
}
