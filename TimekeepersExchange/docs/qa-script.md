# Manual QA script

Reset state first: browser devtools → Application → clear site data (reseeds demo data).
Automated coverage: `npm test` (state machine + fees) and `node e2e/smoke.mjs` (full lifecycle).

## 1. Public site
- [ ] Home renders hero, 3-step value prop, comparison table, trust section, GMT example (marked illustrative), buyer section, final CTA
- [ ] How it works / For buyers / Trust / Fees / About / Journal / FAQ / Contact all reachable from header/footer
- [ ] All six legal documents render with "requires legal review" notice
- [ ] Mobile (≤620px): nav collapses to CTAs, tables scroll horizontally, no horizontal page scroll

## 2. Seller journey
- [ ] Register a new seller (Sign in → New seller account) → lands on dashboard with verification warning
- [ ] New submission wizard: 5 steps; step 1 requires brand/model/year; photo step requires all 9 required angles (mock-capture works); file upload previews and flags "blur" filenames
- [ ] Submit → detail page shows preliminary identification (confidence/evidence/limitations) and indicative valuation labelled "Indicative — not guaranteed"
- [ ] Attempt to accept an offer while unverified → blocked with verification link
- [ ] Verification page: cannot submit without both declarations + ID upload; after completion, status Verified
- [ ] As Alexandra: GMT shows 5 offers sorted desc, highest badged, net proceeds per offer, reserve met, time remaining; decline works; one extension allowed; withdraw prompts

## 3. Bidding (buyer)
- [ ] As Priya/James: dashboard stats, matching badges; feed filters (brand, price, full set)
- [ ] Opportunity page: no seller identity, serial masked, gallery, itemised total updates with amount; binding acknowledgement required
- [ ] Offer above transaction limit → clear error
- [ ] Re-submitting revises the existing offer (no duplicates)
- [ ] Suspended/under-review buyer sees no opportunities

## 4. Transaction lifecycle (happy path)
- [ ] Accept top GMT offer as Alexandra → transaction at Offer accepted; other offers marked lost; buyers notified
- [ ] Priya: authorise payment → state advances to Awaiting shipment; seller notified
- [ ] Alexandra: generate label (carrier/tracking/insured value), packing guide modal, lodge → In transit; chain of custody grows
- [ ] Henrik: record arrival → inspection assigned; complete 20 sections; issue "Passed as described" → auto-settlement
- [ ] Eleanor: release settlement → dispatched to buyer; seller "payment released" notification
- [ ] Priya: confirm delivery → Completed; submission shows Sold; report accessible to both parties; print view clean

## 5. Discrepancy & specialist paths
- [ ] Grace: Royal Oak buyer review — all three choices present; Proceed → settlement; (reset and retry) Amend → resolution, seller sees accept-amended; Cancel → cancelled, seller notified of insured return
- [ ] Heuer Carrera (admin): info request reaches seller (info_required banner); restricting to vintage buyers limits invite list to Stanton Vintage; approval invites only eligible buyers
- [ ] Watchmaker submitting "Failed authentication" opens a dispute automatically (test on a fresh transaction)

## 6. Admin operations
- [ ] Overview stats consistent with data; review queue lists Santos
- [ ] Santos review: approve with window/mode/reserve/invites → seller + buyers notified; bidding controls allow suspend/reopen/extend
- [ ] Buyers: approve Nathan Reid (limit auto-set), suspend/reinstate, edit limits and vintage flag
- [ ] Disputes: expand resolved Omega case (messages, adjustment, final decision); add message; change status
- [ ] Fees & configuration: change seller fee → new offers reflect it; existing transactions unchanged; audit event recorded
- [ ] Audit log: filter works; entries for every action taken during this script

## 7. Cross-cutting
- [ ] Notifications bell: unread dot, mark-read on open, links navigate correctly per role
- [ ] Role gates: seller URL as buyer redirects to buyer home; report URL as uninvolved user → not authorised
- [ ] Refresh mid-flow: state persists (localStorage); sign out/in retains data
- [ ] No console errors during the full script (network/font noise excepted in sandboxes)
