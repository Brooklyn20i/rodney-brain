// ---------------------------------------------------------------------------
// Realistic fictional demo data. All names, businesses, prices and serials are
// fictional. Figures are illustrative only.
//
// Scenario coverage:
//  1. Rolex GMT-Master II "Batgirl" — live sealed bidding with 5 offers; the
//     demo seller can accept and drive the full transaction end to end.
//  2. AP Royal Oak 15450ST — minor discrepancy at inspection; the demo buyer
//     decides to proceed / amend / cancel.
//  3. Vintage Heuer Carrera — specialist review, restricted to vintage buyers.
//  4. Omega Speedmaster — fully completed transaction (history + analytics).
//  5. Cartier Santos — freshly submitted, sitting in the admin review queue.
// ---------------------------------------------------------------------------
import type { Db, Transaction, Inspection } from './types'
import { computeFees, DEFAULT_FEE_CONFIG } from './fees'
import { daysFromNow } from './format'
import { identifyWatch, buildValuation } from './ai'

export const SEED_VERSION = 3

const d = (n: number) => daysFromNow(n)

export function seedDb(): Db {
  const feeConfig = { ...DEFAULT_FEE_CONFIG }

  // --- users ---------------------------------------------------------------
  const users: Db['users'] = [
    { id: 'u-admin', role: 'admin', name: 'Eleanor Voss', email: 'admin@demo.tke.au', createdAt: d(-120) },
    { id: 'u-seller1', role: 'seller', name: 'Alexandra Chen', email: 'seller@demo.tke.au', createdAt: d(-30) },
    { id: 'u-seller2', role: 'seller', name: 'Marcus Webb', email: 'marcus@demo.tke.au', createdAt: d(-45) },
    { id: 'u-seller3', role: 'seller', name: 'David Okafor', email: 'david@demo.tke.au', createdAt: d(-10) },
    { id: 'u-seller4', role: 'seller', name: 'Sofia Marinos', email: 'sofia@demo.tke.au', createdAt: d(-80) },
    { id: 'u-buyer1', role: 'buyer', name: 'James Halloran', email: 'buyer@demo.tke.au', createdAt: d(-100) },
    { id: 'u-buyer2', role: 'buyer', name: 'Priya Nair', email: 'priya@demo.tke.au', createdAt: d(-95) },
    { id: 'u-buyer3', role: 'buyer', name: 'Tom Berger', email: 'tom@demo.tke.au', createdAt: d(-70) },
    { id: 'u-buyer4', role: 'buyer', name: 'Grace Liu', email: 'grace@demo.tke.au', createdAt: d(-60) },
    { id: 'u-buyer5', role: 'buyer', name: 'Oliver Stanton', email: 'oliver@demo.tke.au', createdAt: d(-90) },
    { id: 'u-buyer6', role: 'buyer', name: 'Nathan Reid', email: 'nathan@demo.tke.au', createdAt: d(-2) },
    { id: 'u-wm1', role: 'watchmaker', name: 'Henrik Larsen', email: 'watchmaker@demo.tke.au', createdAt: d(-110) },
  ]

  const sellerProfiles: Db['sellerProfiles'] = [
    {
      userId: 'u-seller1', location: 'Sydney', state: 'NSW', kycStatus: 'verified',
      legalName: 'Alexandra Mei Chen', idDocumentUploaded: true, bankAccountConfirmed: true,
      ownershipDeclarationAccepted: true, notStolenDeclarationAccepted: true, payoutAccountMasked: '•••• 4821',
    },
    {
      userId: 'u-seller2', location: 'Melbourne', state: 'VIC', kycStatus: 'verified',
      legalName: 'Marcus J Webb', idDocumentUploaded: true, bankAccountConfirmed: true,
      ownershipDeclarationAccepted: true, notStolenDeclarationAccepted: true, payoutAccountMasked: '•••• 2210',
    },
    { userId: 'u-seller3', location: 'Brisbane', state: 'QLD', kycStatus: 'in_progress' },
    {
      userId: 'u-seller4', location: 'Perth', state: 'WA', kycStatus: 'verified',
      legalName: 'Sofia Marinos', idDocumentUploaded: true, bankAccountConfirmed: true,
      ownershipDeclarationAccepted: true, notStolenDeclarationAccepted: true, payoutAccountMasked: '•••• 7734',
    },
  ]

  const buyerProfiles: Db['buyerProfiles'] = [
    {
      userId: 'u-buyer1', status: 'verified', buyerType: 'dealer', businessName: 'Halloran & Co Fine Watches',
      abn: '53 004 085 616', businessAddress: 'Armadale VIC', gstRegistered: true, dealerLicence: 'SHD-VIC-88231',
      transactionLimit: 150000, preferredBrands: ['Rolex', 'Omega', 'Tudor'], priceRangeMin: 8000, priceRangeMax: 60000,
      shippingAddress: 'Armadale VIC 3143', trustScore: 94, vintageApproved: false, proofOfFundsProvided: true,
      settledCount: 14, defaultedCount: 0,
    },
    {
      userId: 'u-buyer2', status: 'verified', buyerType: 'dealer', businessName: 'Collins Street Timepieces',
      abn: '61 009 145 331', businessAddress: 'Melbourne VIC', gstRegistered: true, dealerLicence: 'SHD-VIC-90417',
      transactionLimit: 250000, preferredBrands: ['Rolex', 'Patek Philippe', 'Audemars Piguet'],
      priceRangeMin: 15000, priceRangeMax: 200000, shippingAddress: 'Melbourne VIC 3000', trustScore: 91,
      vintageApproved: false, proofOfFundsProvided: true, settledCount: 22, defaultedCount: 0,
    },
    {
      userId: 'u-buyer3', status: 'verified', buyerType: 'collector', transactionLimit: 60000,
      preferredBrands: ['Rolex', 'IWC', 'Cartier'], priceRangeMin: 10000, priceRangeMax: 50000,
      shippingAddress: 'Mosman NSW 2088', trustScore: 82, vintageApproved: false, proofOfFundsProvided: true,
      settledCount: 3, defaultedCount: 0,
    },
    {
      userId: 'u-buyer4', status: 'verified', buyerType: 'professional_trader', businessName: 'GL Horology Pty Ltd',
      abn: '77 611 204 559', businessAddress: 'Sydney NSW', gstRegistered: true, transactionLimit: 120000,
      preferredBrands: ['Audemars Piguet', 'Vacheron Constantin', 'Patek Philippe'], priceRangeMin: 20000,
      priceRangeMax: 120000, shippingAddress: 'Sydney NSW 2000', trustScore: 88, vintageApproved: false,
      proofOfFundsProvided: true, settledCount: 9, defaultedCount: 0,
    },
    {
      userId: 'u-buyer5', status: 'verified', buyerType: 'dealer', businessName: 'Stanton Vintage',
      abn: '18 003 776 240', businessAddress: 'Paddington NSW', gstRegistered: true, dealerLicence: 'SHD-NSW-33107',
      transactionLimit: 90000, preferredBrands: ['Heuer', 'Omega', 'Rolex'], priceRangeMin: 5000, priceRangeMax: 80000,
      shippingAddress: 'Paddington NSW 2021', trustScore: 90, vintageApproved: true, proofOfFundsProvided: true,
      settledCount: 11, defaultedCount: 0,
    },
    {
      userId: 'u-buyer6', status: 'under_review', buyerType: 'collector', transactionLimit: 0,
      preferredBrands: ['Omega', 'Tudor'], trustScore: 0, vintageApproved: false, proofOfFundsProvided: false,
      settledCount: 0, defaultedCount: 0,
    },
  ]

  const watchmakerProfiles: Db['watchmakerProfiles'] = [
    {
      userId: 'u-wm1', businessName: 'Meridian Watch Services', location: 'Sydney NSW',
      accreditations: ['WOSTEP-trained', 'Rolex-accredited service history (former AD workshop)'],
      specialisms: ['Modern Rolex', 'Omega', 'AP Royal Oak', 'Vintage chronographs'],
    },
  ]

  // --- submissions ---------------------------------------------------------
  const VERIFIED_BUYERS = ['u-buyer1', 'u-buyer2', 'u-buyer3', 'u-buyer4', 'u-buyer5']

  const gmtVal = buildValuation({ brand: 'Rolex', model: 'GMT-Master II', reference: '126710BLNR', condition: 'good', boxIncluded: true, papersIncluded: true, polished: true, serviceHistory: false })
  // Pin the demo scenario figures from the brief.
  Object.assign(gmtVal, { marketLow: 22000, marketHigh: 25000, dealerOfferLow: 20800, dealerOfferHigh: 21500, expectedOfferLow: 21500, expectedOfferHigh: 23000 })

  const submissions: Db['submissions'] = [
    {
      id: 'sub-gmt', sellerId: 'u-seller1', status: 'approved_for_offers', category: 'standard',
      createdAt: d(-6), updatedAt: d(-2),
      brand: 'Rolex', model: 'GMT-Master II "Batgirl"', reference: '126710BLNR', year: '2021',
      caseMaterial: 'Oystersteel', dialColour: 'Black', braceletOrStrap: 'Jubilee bracelet',
      condition: 'good', boxIncluded: true, papersIncluded: true,
      serviceHistory: 'None — running well within spec', polishingHistory: 'Centre links lightly polished by previous AD',
      aftermarketParts: 'None declared', sellerLocation: 'Sydney', saleTiming: 'Within 2–4 weeks',
      minimumPrice: 21500, serialMasked: '7G••••••',
      aiIdentification: identifyWatch('Rolex', 'GMT-Master II', '126710BLNR'),
      valuation: gmtVal,
      adminNotes: [{ id: 'an-1', authorId: 'u-admin', text: 'Clean full-set example. Polished centre links declared — verify at inspection.', createdAt: d(-3) }],
      infoRequests: [], flaggedForEnhancedInspection: false, restrictedToVintageBuyers: false,
      bidWindow: {
        mode: 'sealed', opensAt: d(-2), closesAt: d(2), reserve: 21500, minimumIncrement: 100,
        invitedBuyerIds: VERIFIED_BUYERS, extensionsUsed: 0, sellerSeesLeadingPrice: true,
      },
      headline: 'Rolex GMT-Master II "Batgirl"',
      buyerSummary: '2021 Rolex GMT-Master II (126710BLNR), full set, declared good condition with lightly polished centre links, located Sydney. Seller-declared details; independent authentication occurs after offer acceptance.',
      knownFlaws: 'Light desk-diving marks on clasp; centre links previously polished.',
    },
    {
      id: 'sub-ap', sellerId: 'u-seller2', status: 'offer_accepted', category: 'standard',
      createdAt: d(-18), updatedAt: d(-1),
      brand: 'Audemars Piguet', model: 'Royal Oak 37mm', reference: '15450ST', year: '2017',
      caseMaterial: 'Stainless steel', dialColour: 'Silver', braceletOrStrap: 'Integrated steel bracelet + 1 spare link',
      condition: 'very_good', boxIncluded: true, papersIncluded: true,
      serviceHistory: 'AP service 2022 (documented)', polishingHistory: 'Previously polished (declared)',
      aftermarketParts: 'None declared', sellerLocation: 'Melbourne', saleTiming: 'No urgency',
      serialMasked: 'H8••••••',
      aiIdentification: identifyWatch('Audemars Piguet', 'Royal Oak', '15450ST'),
      valuation: buildValuation({ brand: 'Audemars Piguet', model: 'Royal Oak', reference: '15450ST', condition: 'very_good', boxIncluded: true, papersIncluded: true, polished: true, serviceHistory: true }),
      adminNotes: [{ id: 'an-2', authorId: 'u-admin', text: 'Condition-sensitive reference. Buyer offer is subject to case-condition verification.', createdAt: d(-12) }],
      infoRequests: [], flaggedForEnhancedInspection: true, restrictedToVintageBuyers: false,
      bidWindow: {
        mode: 'sealed', opensAt: d(-12), closesAt: d(-8), reserve: 38000,
        invitedBuyerIds: VERIFIED_BUYERS, extensionsUsed: 0, sellerSeesLeadingPrice: false,
      },
      headline: 'Audemars Piguet Royal Oak 37mm',
      buyerSummary: '2017 AP Royal Oak 37mm (15450ST), silver dial, full set with spare link, AP-serviced 2022, previously polished. Located Melbourne. Offer accepted subject to case-condition verification.',
      knownFlaws: 'Previously polished; light hairlines on clasp.',
    },
    {
      id: 'sub-heuer', sellerId: 'u-seller3', status: 'under_review', category: 'vintage',
      createdAt: d(-4), updatedAt: d(-1),
      brand: 'Heuer', model: 'Carrera (vintage, manual wind)', reference: 'Unknown — possibly 2447', year: 'c. 1966',
      caseMaterial: 'Stainless steel', dialColour: 'White / black registers', braceletOrStrap: 'Leather strap (non-original)',
      condition: 'fair', boxIncluded: false, papersIncluded: false,
      serviceHistory: 'Unknown', polishingHistory: 'Unknown', aftermarketParts: 'Hands possibly replaced (seller uncertain)',
      sellerLocation: 'Brisbane', saleTiming: 'Flexible',
      serialMasked: '••••••',
      aiIdentification: identifyWatch('Heuer', 'Carrera', ''),
      valuation: buildValuation({ brand: 'Heuer', model: 'Carrera', reference: '2447', condition: 'fair', boxIncluded: false, papersIncluded: false, polished: false, serviceHistory: false }),
      adminNotes: [
        { id: 'an-3', authorId: 'u-admin', text: 'Escalated to vintage specialist. Possible replacement hands — needs movement and dial photos before approval.', createdAt: d(-2) },
      ],
      infoRequests: ['Please photograph the movement (or have a watchmaker do so) and the inside caseback, and provide a close-up of the hands and lume plots.'],
      flaggedForEnhancedInspection: true, restrictedToVintageBuyers: true,
      headline: 'Vintage Heuer Carrera',
      buyerSummary: 'Vintage manual-wind Heuer Carrera, reference to be confirmed (possibly 2447). Requires specialist review; bidding will be restricted to approved vintage buyers.',
      knownFlaws: 'Possible replacement hands; reference unconfirmed; no box or papers.',
    },
    {
      id: 'sub-omega', sellerId: 'u-seller4', status: 'sold', category: 'standard',
      createdAt: d(-40), updatedAt: d(-20),
      brand: 'Omega', model: 'Speedmaster Professional', reference: '310.30.42.50.01.001', year: '2022',
      caseMaterial: 'Stainless steel', dialColour: 'Black', braceletOrStrap: 'Steel bracelet',
      condition: 'excellent', boxIncluded: true, papersIncluded: true,
      serviceHistory: 'None required', polishingHistory: 'None', aftermarketParts: 'None',
      sellerLocation: 'Perth', saleTiming: 'Sold',
      serialMasked: '88••••••',
      aiIdentification: identifyWatch('Omega', 'Speedmaster Professional', '310.30.42.50.01.001'),
      valuation: buildValuation({ brand: 'Omega', model: 'Speedmaster Professional', reference: '310.30.42.50.01.001', condition: 'excellent', boxIncluded: true, papersIncluded: true, polished: false, serviceHistory: false }),
      adminNotes: [], infoRequests: [], flaggedForEnhancedInspection: false, restrictedToVintageBuyers: false,
      bidWindow: {
        mode: 'sealed', opensAt: d(-35), closesAt: d(-31),
        invitedBuyerIds: VERIFIED_BUYERS, extensionsUsed: 0, sellerSeesLeadingPrice: true,
      },
      headline: 'Omega Speedmaster Professional',
      buyerSummary: '2022 Omega Speedmaster Professional, full set, excellent condition, unpolished. Completed transaction.',
    },
    {
      id: 'sub-santos', sellerId: 'u-seller1', status: 'submitted', category: 'standard',
      createdAt: d(-1), updatedAt: d(-1),
      brand: 'Cartier', model: 'Santos Large', reference: 'WSSA0018', year: '2023',
      caseMaterial: 'Stainless steel', dialColour: 'Silvered opaline', braceletOrStrap: 'Steel bracelet + spare leather strap',
      condition: 'excellent', boxIncluded: true, papersIncluded: true,
      serviceHistory: 'None required', polishingHistory: 'None', aftermarketParts: 'None',
      sellerLocation: 'Sydney', saleTiming: 'Within a month', serialMasked: 'CR••••••',
      aiIdentification: identifyWatch('Cartier', 'Santos', 'WSSA0018'),
      valuation: buildValuation({ brand: 'Cartier', model: 'Santos', reference: 'WSSA0018', condition: 'excellent', boxIncluded: true, papersIncluded: true, polished: false, serviceHistory: false }),
      adminNotes: [], infoRequests: [], flaggedForEnhancedInspection: false, restrictedToVintageBuyers: false,
      headline: 'Cartier Santos Large',
      buyerSummary: '2023 Cartier Santos Large (WSSA0018), full set with spare strap, excellent condition. Awaiting platform review.',
    },
  ]

  // --- offers --------------------------------------------------------------
  const offers: Db['offers'] = [
    { id: 'of-gmt-1', submissionId: 'sub-gmt', buyerId: 'u-buyer1', amount: 21800, type: 'subject_to_inspection', validityDays: 7, status: 'active', createdAt: d(-1.5), bindingAcknowledged: true },
    { id: 'of-gmt-2', submissionId: 'sub-gmt', buyerId: 'u-buyer2', amount: 22400, type: 'subject_to_inspection', validityDays: 7, status: 'active', createdAt: d(-1.2), bindingAcknowledged: true },
    { id: 'of-gmt-3', submissionId: 'sub-gmt', buyerId: 'u-buyer3', amount: 22100, type: 'binding_cash', validityDays: 5, status: 'active', createdAt: d(-1), bindingAcknowledged: true },
    { id: 'of-gmt-4', submissionId: 'sub-gmt', buyerId: 'u-buyer4', amount: 21950, type: 'subject_to_inspection', validityDays: 7, status: 'active', createdAt: d(-0.8), bindingAcknowledged: true },
    { id: 'of-gmt-5', submissionId: 'sub-gmt', buyerId: 'u-buyer5', amount: 21600, type: 'subject_to_inspection', validityDays: 7, status: 'active', createdAt: d(-0.4), bindingAcknowledged: true },
    {
      id: 'of-ap-1', submissionId: 'sub-ap', buyerId: 'u-buyer4', amount: 39500, type: 'subject_to_conditions',
      conditions: 'Subject to case-condition verification: case lines and bevels to be assessed against declared "previously polished, very good" description.',
      validityDays: 10, status: 'accepted', createdAt: d(-10), bindingAcknowledged: true,
    },
    { id: 'of-ap-2', submissionId: 'sub-ap', buyerId: 'u-buyer2', amount: 38800, type: 'subject_to_inspection', validityDays: 7, status: 'lost', createdAt: d(-10.5), bindingAcknowledged: true },
    { id: 'of-omega-1', submissionId: 'sub-omega', buyerId: 'u-buyer1', amount: 10400, type: 'subject_to_inspection', validityDays: 7, status: 'accepted', createdAt: d(-33), bindingAcknowledged: true },
    { id: 'of-omega-2', submissionId: 'sub-omega', buyerId: 'u-buyer3', amount: 10100, type: 'binding_cash', validityDays: 7, status: 'lost', createdAt: d(-33), bindingAcknowledged: true },
  ]

  // --- transactions --------------------------------------------------------
  const apFees = computeFees(39500, feeConfig)
  const omegaFees = computeFees(10400, feeConfig)

  const txAp: Transaction = {
    id: 'tx-ap', submissionId: 'sub-ap', offerId: 'of-ap-1', sellerId: 'u-seller2', buyerId: 'u-buyer4',
    watchmakerId: 'u-wm1', state: 'buyer_review', createdAt: d(-8), updatedAt: d(-0.5),
    acceptedAmount: 39500, fees: apFees, paymentAuthorisedAt: d(-7.8),
    timeline: [
      { at: d(-8), state: 'offer_accepted', label: 'Seller accepted the offer — binding transaction created', actor: 'Marcus Webb' },
      { at: d(-7.8), state: 'payment_authorised', label: 'Buyer authorised A$' + apFees.buyerTotal.toLocaleString() + ' (simulated escrow pre-authorisation)', actor: 'Grace Liu' },
      { at: d(-7.8), state: 'awaiting_shipment', label: 'Insured shipping instructions issued to seller', actor: 'Platform' },
      { at: d(-6), state: 'in_transit_to_authentication', label: 'Seller lodged the insured shipment', actor: 'Marcus Webb' },
      { at: d(-4), state: 'received_at_authentication', label: 'Package received at authentication centre', actor: 'Henrik Larsen' },
      { at: d(-3), state: 'inspection_in_progress', label: 'Watchmaker began the structured inspection', actor: 'Henrik Larsen' },
      { at: d(-0.5), state: 'inspection_complete', label: 'Authentication report issued: Passed with minor discrepancy', actor: 'Henrik Larsen' },
      { at: d(-0.5), state: 'buyer_review', label: 'Minor discrepancy — buyer to review under platform rules', actor: 'Platform' },
    ],
  }

  const txOmega: Transaction = {
    id: 'tx-omega', submissionId: 'sub-omega', offerId: 'of-omega-1', sellerId: 'u-seller4', buyerId: 'u-buyer1',
    watchmakerId: 'u-wm1', state: 'completed', createdAt: d(-30), updatedAt: d(-20),
    acceptedAmount: 10400, fees: omegaFees, paymentAuthorisedAt: d(-29.5),
    settlementReleasedAt: d(-23), completedAt: d(-20),
    timeline: [
      { at: d(-30), state: 'offer_accepted', label: 'Seller accepted the offer — binding transaction created', actor: 'Sofia Marinos' },
      { at: d(-29.5), state: 'payment_authorised', label: 'Buyer authorised A$' + omegaFees.buyerTotal.toLocaleString() + ' (simulated escrow pre-authorisation)', actor: 'James Halloran' },
      { at: d(-29.5), state: 'awaiting_shipment', label: 'Insured shipping instructions issued to seller', actor: 'Platform' },
      { at: d(-28), state: 'in_transit_to_authentication', label: 'Seller lodged the insured shipment', actor: 'Sofia Marinos' },
      { at: d(-26), state: 'received_at_authentication', label: 'Package received at authentication centre', actor: 'Henrik Larsen' },
      { at: d(-25), state: 'inspection_in_progress', label: 'Watchmaker began the structured inspection', actor: 'Henrik Larsen' },
      { at: d(-24), state: 'inspection_complete', label: 'Authentication report issued: Passed as described', actor: 'Henrik Larsen' },
      { at: d(-24), state: 'settlement', label: 'Passed as described — proceeding automatically to settlement', actor: 'Platform' },
      { at: d(-23), state: 'in_transit_to_buyer', label: 'Settlement released (simulated) — watch dispatched to buyer, insured', actor: 'Platform' },
      { at: d(-20), state: 'completed', label: 'Buyer confirmed delivery — transaction complete', actor: 'James Halloran' },
    ],
  }

  const transactions: Db['transactions'] = [txAp, txOmega]

  // --- shipments & custody -------------------------------------------------
  const shipments: Db['shipments'] = [
    { id: 'shp-ap-1', transactionId: 'tx-ap', leg: 'seller_to_authenticator', carrier: 'Ferrata Secure Logistics (mock)', trackingNumber: 'FSL482210934', insuredValue: 39500, status: 'delivered', labelGeneratedAt: d(-7.8), deliveredAt: d(-4) },
    { id: 'shp-om-1', transactionId: 'tx-omega', leg: 'seller_to_authenticator', carrier: 'Ferrata Secure Logistics (mock)', trackingNumber: 'FSL301877265', insuredValue: 10400, status: 'delivered', labelGeneratedAt: d(-29.5), deliveredAt: d(-26) },
    { id: 'shp-om-2', transactionId: 'tx-omega', leg: 'authenticator_to_buyer', carrier: 'Ferrata Secure Logistics (mock)', trackingNumber: 'FSL301901118', insuredValue: 10400, status: 'delivered', labelGeneratedAt: d(-23), deliveredAt: d(-20) },
  ]

  const custodyEvents: Db['custodyEvents'] = [
    { id: 'coc-1', transactionId: 'tx-ap', at: d(-7.8), actor: 'Platform', event: 'Insured label generated for seller → authentication centre' },
    { id: 'coc-2', transactionId: 'tx-ap', at: d(-6), actor: 'Marcus Webb', event: 'Package lodged by seller — tamper-evident seal recorded' },
    { id: 'coc-3', transactionId: 'tx-ap', at: d(-4), actor: 'Henrik Larsen', event: 'Package received — outer packaging intact, seal unbroken' },
    { id: 'coc-4', transactionId: 'tx-omega', at: d(-29.5), actor: 'Platform', event: 'Insured label generated for seller → authentication centre' },
    { id: 'coc-5', transactionId: 'tx-omega', at: d(-28), actor: 'Sofia Marinos', event: 'Package lodged by seller — tamper-evident seal recorded' },
    { id: 'coc-6', transactionId: 'tx-omega', at: d(-26), actor: 'Henrik Larsen', event: 'Package received — packaging intact' },
    { id: 'coc-7', transactionId: 'tx-omega', at: d(-23), actor: 'Platform', event: 'Watch dispatched from authentication centre to buyer' },
    { id: 'coc-8', transactionId: 'tx-omega', at: d(-20), actor: 'James Halloran', event: 'Delivery confirmed by buyer — chain of custody closed' },
  ]

  // --- inspections ---------------------------------------------------------
  const passItems = (notes: Partial<Record<string, { verdict: 'pass' | 'note' | 'issue' | 'na'; notes: string }>>): Inspection['items'] => {
    const sections = ['Chain of custody', 'Packaging', 'Reference and serial', 'Dial', 'Hands and lume', 'Crystal', 'Case', 'Bezel', 'Crown and pushers', 'Bracelet or strap', 'Clasp', 'Movement', 'Timekeeping', 'Functions', 'Water resistance', 'Polishing', 'Replacement parts', 'Accessories', 'Final photographs', 'Conclusion'] as const
    return sections.map((s) => ({
      section: s,
      verdict: notes[s]?.verdict ?? 'pass',
      notes: notes[s]?.notes ?? 'No issues noted.',
    }))
  }

  const inspections: Db['inspections'] = [
    {
      id: 'insp-ap', transactionId: 'tx-ap', watchmakerId: 'u-wm1', status: 'submitted',
      items: passItems({
        'Case': { verdict: 'issue', notes: 'Case shows a further light polish beyond the declared history — bevels slightly softened on lugs 1 and 2. Structurally excellent.' },
        'Polishing': { verdict: 'issue', notes: 'Polishing assessed as moderate rather than the declared light single polish. Material to a condition-sensitive reference.' },
        'Bracelet or strap': { verdict: 'note', notes: 'Additional spare link present and original, as declared.' },
        'Timekeeping': { verdict: 'pass', notes: '+3.4 s/day dial up; within AP service tolerance.' },
        'Movement': { verdict: 'pass', notes: 'Calibre 3120 present, correct and unmodified. Serials consistent.' },
        'Conclusion': { verdict: 'note', notes: 'Authentic, full set. Minor discrepancy: polishing degree exceeds declaration.' },
      }),
      timegrapherRate: '+3.4 s/day', amplitude: '285°', beatError: '0.2 ms',
      outcome: 'passed_minor_discrepancy',
      discrepancySummary: 'Watch is authentic and in very good order, but the case has been polished more than declared. This is a minor, condition-related discrepancy under the platform rules.',
      serviceRecommendation: 'None required. Next AP service due c. 2028.',
      conclusion: 'Genuine Audemars Piguet Royal Oak 15450ST, full set, movement correct, timekeeping in tolerance. Case polishing exceeds the declared history — buyer review required.',
      submittedAt: d(-0.5), reportNumber: 'TKE-AR-000214',
    },
    {
      id: 'insp-omega', transactionId: 'tx-omega', watchmakerId: 'u-wm1', status: 'submitted',
      items: passItems({
        'Timekeeping': { verdict: 'pass', notes: '+1.8 s/day; METAS spec.' },
        'Conclusion': { verdict: 'pass', notes: 'Passed as described in all sections.' },
      }),
      timegrapherRate: '+1.8 s/day', amplitude: '301°', beatError: '0.1 ms',
      outcome: 'passed_as_described',
      serviceRecommendation: 'None.',
      conclusion: 'Genuine Omega Speedmaster Professional 310.30.42.50.01.001, unpolished, full set, functioning to specification. Passed as described.',
      submittedAt: d(-24), reportNumber: 'TKE-AR-000198',
    },
  ]

  // --- disputes (worked example, resolved) ---------------------------------
  const disputes: Db['disputes'] = [
    {
      id: 'dsp-1', transactionId: 'tx-omega', type: 'incorrect_accessory', status: 'resolved',
      ownerId: 'u-admin', openedAt: d(-22),
      summary: 'Buyer reported the spare NATO strap listed in the accessories was not in the delivered box.',
      messages: [
        { at: d(-22), author: 'James Halloran', text: 'Everything perfect except the listed spare NATO strap was not included.' },
        { at: d(-21.5), author: 'Eleanor Voss', text: 'Confirmed against the inspection accessory log — strap was not received at the centre. Proposing a A$120 adjustment.' },
        { at: d(-21), author: 'Sofia Marinos', text: 'Apologies — found it at home. Happy with the adjustment.' },
      ],
      proposedResolution: 'A$120 price adjustment in lieu of the missing strap.',
      financialAdjustment: -120,
      finalDecision: 'Adjustment of A$120 applied to seller settlement. Both parties accepted. Case closed.',
    },
  ]

  // --- notifications -------------------------------------------------------
  const notifications: Db['notifications'] = [
    { id: 'n-1', userId: 'u-seller1', at: d(-0.4), title: 'New offer received', body: 'A new sealed offer has been received for your Rolex GMT-Master II.', read: false, link: '/seller/submissions/sub-gmt' },
    { id: 'n-2', userId: 'u-seller1', at: d(-2), title: 'Approved for offers', body: 'Rolex GMT-Master II "Batgirl" is now visible to 5 verified buyers.', read: true, link: '/seller/submissions/sub-gmt' },
    { id: 'n-3', userId: 'u-buyer4', at: d(-0.5), title: 'Authentication report ready', body: 'Audemars Piguet Royal Oak 37mm: Passed with minor discrepancy. Your review is required.', read: false, link: '/buyer/transactions/tx-ap' },
    { id: 'n-4', userId: 'u-seller2', at: d(-0.5), title: 'Authentication complete', body: 'Audemars Piguet Royal Oak 37mm: Passed with minor discrepancy.', read: false, link: '/seller/transactions/tx-ap' },
    { id: 'n-5', userId: 'u-admin', at: d(-1), title: 'New submission', body: 'Cartier Santos Large (WSSA0018) submitted for review.', read: false, link: '/admin/watches/sub-santos' },
    { id: 'n-6', userId: 'u-wm1', at: d(-4), title: 'Inspection assigned', body: 'A watch has arrived and is assigned to you for inspection.', read: true, link: '/watchmaker/inspections/insp-ap' },
  ]

  const auditEvents: Db['auditEvents'] = [
    { id: 'ae-s1', at: d(-0.4), actorId: 'u-buyer5', actorName: 'Oliver Stanton', action: 'offer_placed', entity: 'offer', entityId: 'of-gmt-5', detail: 'A$21,600 on Rolex GMT-Master II "Batgirl"' },
    { id: 'ae-s2', at: d(-0.5), actorId: 'u-wm1', actorName: 'Henrik Larsen', action: 'inspection_submitted', entity: 'inspection', entityId: 'insp-ap', detail: 'Passed with minor discrepancy' },
    { id: 'ae-s3', at: d(-1), actorId: 'u-seller1', actorName: 'Alexandra Chen', action: 'submission_submitted', entity: 'submission', entityId: 'sub-santos', detail: 'Cartier Santos Large WSSA0018' },
    { id: 'ae-s4', at: d(-2), actorId: 'u-admin', actorName: 'Eleanor Voss', action: 'approved_for_offers', entity: 'submission', entityId: 'sub-gmt', detail: 'sealed, 5 buyers invited' },
  ]

  return {
    version: SEED_VERSION,
    users, sellerProfiles, buyerProfiles, watchmakerProfiles,
    submissions, images: [], offers, transactions, shipments, custodyEvents,
    inspections, disputes, notifications, auditEvents, feeConfig,
  }
}
