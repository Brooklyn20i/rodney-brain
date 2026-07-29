// ---------------------------------------------------------------------------
// Mock data layer. A single Store holds the whole Db (types.ts), persists to
// localStorage, and exposes domain actions. Every state change writes an
// AuditEvent; sensitive records are never hard-deleted (status changes only).
//
// PRODUCTION SWAP: each action maps 1:1 to a server endpoint / RPC with
// row-level security (see docs/schema.sql + docs/roles-permissions.md).
// Page code only calls store actions, so replacing this file with an API
// client is the whole migration surface.
// ---------------------------------------------------------------------------
import { useSyncExternalStore } from 'react'
import type {
  Db, User, Role, WatchSubmission, Offer, Transaction, TransactionState,
  Inspection, InspectionOutcome, Shipment, Dispute, DisputeType, BidWindow,
  Notification, BuyerProfile, SellerProfile, WatchImage, PhotoAngle, FeeConfig,
} from './types'
import { seedDb, SEED_VERSION } from './seed'
import { uid, nowIso, daysFromNow } from './format'
import { computeFees } from './fees'
import { canTransition, STATE_LABELS, stateAfterInspection, OUTCOME_LABELS } from './stateMachine'
import { identifyWatch, buildValuation, generateBuyerSummary, checkPhoto } from './ai'

const DB_KEY = 'tke-db-v' + SEED_VERSION
const SESSION_KEY = 'tke-session'

// Storage access throws outright in some embedded/sandboxed contexts and in
// private-browsing modes. Degrade to an in-memory store rather than failing to
// boot — the demo stays usable, it just doesn't survive a reload.
const memory = new Map<string, string>()
const safeStorage = {
  get(key: string): string | null {
    try {
      return window.localStorage.getItem(key)
    } catch {
      return memory.get(key) ?? null
    }
  },
  set(key: string, value: string) {
    try {
      window.localStorage.setItem(key, value)
    } catch {
      memory.set(key, value)
    }
  },
  remove(key: string) {
    try {
      window.localStorage.removeItem(key)
    } catch {
      memory.delete(key)
    }
  },
  keys(): string[] {
    try {
      return Object.keys(window.localStorage)
    } catch {
      return [...memory.keys()]
    }
  },
}

class Store {
  db: Db
  currentUserId: string | null
  private listeners = new Set<() => void>()
  private snapshotVersion = 0

  constructor() {
    this.db = this.load()
    this.currentUserId = safeStorage.get(SESSION_KEY)
    if (this.currentUserId && !this.db.users.find((u) => u.id === this.currentUserId)) {
      this.currentUserId = null
    }
  }

  private load(): Db {
    try {
      const raw = safeStorage.get(DB_KEY)
      if (raw) {
        const parsed = JSON.parse(raw) as Db
        if (parsed.version === SEED_VERSION) return parsed
      }
    } catch {
      /* corrupted local data — fall through to reseed */
    }
    return seedDb()
  }

  resetDemo() {
    // Clear any older seed versions too.
    safeStorage.keys()
      .filter((k) => k.startsWith('tke-db'))
      .forEach((k) => safeStorage.remove(k))
    this.db = seedDb()
    this.commit()
  }

  subscribe = (fn: () => void) => {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }
  getVersion = () => this.snapshotVersion

  private commit() {
    this.snapshotVersion++
    try {
      safeStorage.set(DB_KEY, JSON.stringify(this.db))
    } catch {
      /* storage full — keep in-memory state so the demo continues */
    }
    this.listeners.forEach((fn) => fn())
  }

  // --- helpers --------------------------------------------------------------

  get me(): User | null {
    return this.db.users.find((u) => u.id === this.currentUserId) ?? null
  }

  user(id: string) {
    return this.db.users.find((u) => u.id === id)
  }
  sellerProfile(userId: string): SellerProfile | undefined {
    return this.db.sellerProfiles.find((p) => p.userId === userId)
  }
  buyerProfile(userId: string): BuyerProfile | undefined {
    return this.db.buyerProfiles.find((p) => p.userId === userId)
  }
  submission(id: string) {
    return this.db.submissions.find((s) => s.id === id)
  }
  offersFor(submissionId: string) {
    return this.db.offers.filter((o) => o.submissionId === submissionId)
  }
  transaction(id: string) {
    return this.db.transactions.find((t) => t.id === id)
  }
  transactionForSubmission(submissionId: string) {
    return this.db.transactions.find((t) => t.submissionId === submissionId)
  }
  inspectionForTransaction(txId: string) {
    return this.db.inspections.find((i) => i.transactionId === txId)
  }
  imagesFor(submissionId: string) {
    return this.db.images.filter((i) => i.submissionId === submissionId)
  }

  private audit(action: string, entity: string, entityId: string, detail?: string) {
    const actor = this.me
    this.db.auditEvents.unshift({
      id: uid('ae-'), at: nowIso(),
      actorId: actor?.id ?? 'system', actorName: actor?.name ?? 'System',
      action, entity, entityId, detail,
    })
  }

  private notify(userId: string, title: string, body: string, link?: string) {
    this.db.notifications.unshift({ id: uid('n-'), userId, at: nowIso(), title, body, read: false, link })
  }

  notificationsFor(userId: string): Notification[] {
    return this.db.notifications.filter((n) => n.userId === userId)
  }

  markNotificationsRead(userId: string) {
    this.db.notifications.forEach((n) => { if (n.userId === userId) n.read = true })
    this.commit()
  }

  // --- auth (mocked) --------------------------------------------------------

  signIn(userId: string) {
    this.currentUserId = userId
    safeStorage.set(SESSION_KEY, userId)
    this.audit('sign_in', 'user', userId)
    this.commit()
  }

  signOut() {
    if (this.currentUserId) this.audit('sign_out', 'user', this.currentUserId)
    this.currentUserId = null
    safeStorage.remove(SESSION_KEY)
    this.commit()
  }

  registerSeller(name: string, email: string, location: string, state: string): User {
    const u: User = { id: uid('u-'), role: 'seller', name, email, createdAt: nowIso() }
    this.db.users.push(u)
    this.db.sellerProfiles.push({ userId: u.id, location, state, kycStatus: 'not_started' })
    this.audit('register', 'user', u.id, 'Seller account created')
    this.currentUserId = u.id
    safeStorage.set(SESSION_KEY, u.id)
    this.commit()
    return u
  }

  completeKyc(userId: string, data: Partial<SellerProfile>) {
    const p = this.sellerProfile(userId)
    if (!p) return
    Object.assign(p, data, { kycStatus: 'verified' as const })
    this.audit('kyc_verified', 'seller_profile', userId, 'Mock KYC completed (production: Stripe Identity / FrankieOne)')
    this.notify(userId, 'Identity verified', 'Your identity and ownership declarations are confirmed. You can now accept offers.')
    this.commit()
  }

  // --- submissions ----------------------------------------------------------

  createSubmission(sellerId: string, data: Partial<WatchSubmission>): WatchSubmission {
    const s: WatchSubmission = {
      id: uid('sub-'), sellerId, status: 'draft', category: 'standard',
      createdAt: nowIso(), updatedAt: nowIso(),
      brand: '', model: '', reference: '', year: '', caseMaterial: '', dialColour: '',
      braceletOrStrap: '', condition: 'excellent', boxIncluded: false, papersIncluded: false,
      serviceHistory: '', polishingHistory: '', aftermarketParts: '', sellerLocation: '',
      saleTiming: '', serialMasked: '', adminNotes: [], infoRequests: [],
      flaggedForEnhancedInspection: false, restrictedToVintageBuyers: false,
      ...data,
    }
    this.db.submissions.push(s)
    this.audit('submission_created', 'submission', s.id)
    this.commit()
    return s
  }

  updateSubmission(id: string, data: Partial<WatchSubmission>) {
    const s = this.submission(id)
    if (!s) return
    Object.assign(s, data, { updatedAt: nowIso() })
    this.commit()
  }

  attachImage(submissionId: string, angle: PhotoAngle, fileName: string, dataUrl?: string) {
    const existing = this.db.images.find((i) => i.submissionId === submissionId && i.angle === angle)
    const img: WatchImage = existing ?? { id: uid('img-'), submissionId, angle }
    img.fileName = fileName
    img.dataUrl = dataUrl
    img.uploadedAt = nowIso()
    img.aiChecks = checkPhoto(fileName, angle)
    if (!existing) this.db.images.push(img)
    this.commit()
    return img
  }

  submitForReview(id: string) {
    const s = this.submission(id)
    if (!s) return
    s.aiIdentification = identifyWatch(s.brand, s.model, s.reference)
    s.valuation = buildValuation({
      brand: s.brand, model: s.model, reference: s.reference, condition: s.condition,
      boxIncluded: s.boxIncluded, papersIncluded: s.papersIncluded,
      polished: !!s.polishingHistory && !/none|^no\b|never/i.test(s.polishingHistory),
      serviceHistory: !!s.serviceHistory && !/none|^no\b|never/i.test(s.serviceHistory),
    })
    s.buyerSummary = generateBuyerSummary(s)
    s.headline = `${s.brand} ${s.model}`.trim()
    s.status = 'submitted'
    s.updatedAt = nowIso()
    this.audit('submission_submitted', 'submission', s.id, `${s.brand} ${s.model} ${s.reference}`)
    const admins = this.db.users.filter((u) => u.role === 'admin')
    admins.forEach((a) => this.notify(a.id, 'New submission', `${s.brand} ${s.model} (${s.reference}) submitted for review.`, `/admin/watches/${s.id}`))
    this.commit()
  }

  // --- admin: review & bidding ---------------------------------------------

  adminSetSubmissionStatus(id: string, status: WatchSubmission['status'], note?: string) {
    const s = this.submission(id)
    if (!s) return
    s.status = status
    s.updatedAt = nowIso()
    this.audit('submission_status', 'submission', id, `${status}${note ? ' — ' + note : ''}`)
    if (status === 'declined') this.notify(s.sellerId, 'Submission declined', note ?? 'Your submission was not approved for offers.', `/seller/submissions/${id}`)
    this.commit()
  }

  adminRequestInfo(id: string, request: string) {
    const s = this.submission(id)
    if (!s) return
    s.infoRequests.push(request)
    s.status = 'info_required'
    s.updatedAt = nowIso()
    this.audit('info_requested', 'submission', id, request)
    this.notify(s.sellerId, 'More information required', request, `/seller/submissions/${id}`)
    this.commit()
  }

  adminAddNote(id: string, text: string) {
    const s = this.submission(id)
    if (!s || !this.me) return
    s.adminNotes.push({ id: uid('an-'), authorId: this.me.id, text, createdAt: nowIso() })
    this.audit('admin_note', 'submission', id)
    this.commit()
  }

  adminApproveForOffers(id: string, window: BidWindow, category: WatchSubmission['category'], flags: { enhanced: boolean; vintageOnly: boolean }) {
    const s = this.submission(id)
    if (!s) return
    s.status = 'approved_for_offers'
    s.category = category
    s.flaggedForEnhancedInspection = flags.enhanced
    s.restrictedToVintageBuyers = flags.vintageOnly
    s.bidWindow = window
    s.updatedAt = nowIso()
    this.audit('approved_for_offers', 'submission', id, `${window.mode}, closes ${window.closesAt}`)
    this.notify(s.sellerId, 'Approved for offers', `${s.brand} ${s.model} is now visible to ${window.invitedBuyerIds.length} verified buyers.`, `/seller/submissions/${id}`)
    window.invitedBuyerIds.forEach((b) =>
      this.notify(b, 'New opportunity', `${s.brand} ${s.model} (${s.reference}) is open for sealed offers.`, `/buyer/opportunities/${id}`))
    this.commit()
  }

  extendBidWindow(id: string) {
    const s = this.submission(id)
    if (!s?.bidWindow || s.bidWindow.extensionsUsed >= 1) return
    s.bidWindow.closesAt = daysFromNow(2)
    s.bidWindow.extensionsUsed++
    this.audit('bid_window_extended', 'submission', id)
    this.commit()
  }

  withdrawSubmission(id: string) {
    const s = this.submission(id)
    if (!s || s.status === 'offer_accepted' || s.status === 'sold') return
    s.status = 'withdrawn'
    this.offersFor(id).forEach((o) => { if (o.status === 'active') o.status = 'expired' })
    this.audit('submission_withdrawn', 'submission', id)
    this.commit()
  }

  // --- offers ---------------------------------------------------------------

  visibleOpportunities(buyerId: string): WatchSubmission[] {
    const bp = this.buyerProfile(buyerId)
    if (!bp || bp.status !== 'verified') return []
    return this.db.submissions.filter((s) =>
      s.status === 'approved_for_offers' &&
      s.bidWindow?.invitedBuyerIds.includes(buyerId) &&
      (!s.restrictedToVintageBuyers || bp.vintageApproved))
  }

  placeOffer(submissionId: string, buyerId: string, data: { amount: number; type: Offer['type']; conditions?: string; noteToAdmin?: string; validityDays: number }): Offer | { error: string } {
    const s = this.submission(submissionId)
    const bp = this.buyerProfile(buyerId)
    if (!s || !bp) return { error: 'Not found' }
    if (bp.status !== 'verified') return { error: 'Buyer account is not verified.' }
    if (data.amount > bp.transactionLimit) return { error: `Offer exceeds your approved transaction limit of A$${bp.transactionLimit.toLocaleString()}. Contact the platform to raise it.` }
    if (s.status !== 'approved_for_offers') return { error: 'Bidding is not open for this watch.' }
    const existing = this.db.offers.find((o) => o.submissionId === submissionId && o.buyerId === buyerId && o.status === 'active')
    if (existing) {
      existing.amount = data.amount
      existing.type = data.type
      existing.conditions = data.conditions
      existing.createdAt = nowIso()
      this.audit('offer_revised', 'offer', existing.id, `A$${data.amount.toLocaleString()}`)
      this.commit()
      return existing
    }
    const o: Offer = {
      id: uid('of-'), submissionId, buyerId, amount: data.amount, type: data.type,
      conditions: data.conditions, noteToAdmin: data.noteToAdmin, validityDays: data.validityDays,
      status: 'active', createdAt: nowIso(), bindingAcknowledged: true,
    }
    this.db.offers.push(o)
    this.audit('offer_placed', 'offer', o.id, `A$${data.amount.toLocaleString()} on ${s.brand} ${s.model}`)
    this.notify(s.sellerId, 'New offer received', `A new sealed offer has been received for your ${s.brand} ${s.model}.`, `/seller/submissions/${submissionId}`)
    this.commit()
    return o
  }

  declineOffer(offerId: string) {
    const o = this.db.offers.find((x) => x.id === offerId)
    if (!o || o.status !== 'active') return
    o.status = 'declined'
    this.audit('offer_declined', 'offer', offerId)
    this.notify(o.buyerId, 'Offer declined', 'The seller has declined your offer.', '/buyer/offers')
    this.commit()
  }

  acceptOffer(offerId: string): Transaction | { error: string } {
    const o = this.db.offers.find((x) => x.id === offerId)
    if (!o || o.status !== 'active') return { error: 'Offer is no longer active.' }
    const s = this.submission(o.submissionId)
    if (!s) return { error: 'Submission not found.' }
    const sp = this.sellerProfile(s.sellerId)
    if (sp?.kycStatus !== 'verified') return { error: 'Identity verification must be completed before accepting an offer.' }
    o.status = 'accepted'
    this.offersFor(s.id).forEach((x) => { if (x.id !== o.id && x.status === 'active') x.status = 'lost' })
    s.status = 'offer_accepted'
    const fees = computeFees(o.amount, this.db.feeConfig)
    const tx: Transaction = {
      id: uid('tx-'), submissionId: s.id, offerId: o.id, sellerId: s.sellerId, buyerId: o.buyerId,
      state: 'offer_accepted', createdAt: nowIso(), updatedAt: nowIso(),
      acceptedAmount: o.amount, fees,
      timeline: [{ at: nowIso(), state: 'offer_accepted', label: 'Seller accepted the offer — binding transaction created', actor: this.me?.name ?? 'Seller' }],
    }
    this.db.transactions.push(tx)
    this.audit('offer_accepted', 'transaction', tx.id, `A$${o.amount.toLocaleString()} — ${s.brand} ${s.model}`)
    this.notify(o.buyerId, 'Offer accepted', `Your offer of A$${o.amount.toLocaleString()} for the ${s.brand} ${s.model} was accepted. Authorise payment to proceed.`, `/buyer/transactions/${tx.id}`)
    this.offersFor(s.id).filter((x) => x.status === 'lost').forEach((x) =>
      this.notify(x.buyerId, 'Bidding closed', `The ${s.brand} ${s.model} has been sold to another buyer.`, '/buyer/offers'))
    this.db.users.filter((u) => u.role === 'admin').forEach((a) =>
      this.notify(a.id, 'Offer accepted', `Transaction ${tx.id} created for ${s.brand} ${s.model}.`, `/admin/transactions/${tx.id}`))
    this.commit()
    return tx
  }

  // --- transaction progression ---------------------------------------------

  private moveState(tx: Transaction, to: TransactionState, label: string) {
    if (!canTransition(tx.state, to)) {
      throw new Error(`Illegal transition ${tx.state} → ${to}`)
    }
    tx.state = to
    tx.updatedAt = nowIso()
    tx.timeline.push({ at: nowIso(), state: to, label, actor: this.me?.name ?? 'System' })
    this.audit('transaction_state', 'transaction', tx.id, `${to} — ${label}`)
  }

  private custody(txId: string, event: string) {
    this.db.custodyEvents.push({ id: uid('coc-'), transactionId: txId, at: nowIso(), actor: this.me?.name ?? 'System', event })
  }

  authorisePayment(txId: string) {
    const tx = this.transaction(txId)
    if (!tx) return
    this.moveState(tx, 'payment_authorised', `Buyer authorised A$${tx.fees.buyerTotal.toLocaleString()} (simulated escrow pre-authorisation)`)
    tx.paymentAuthorisedAt = nowIso()
    // Platform immediately issues shipping instructions.
    this.moveState(tx, 'awaiting_shipment', 'Insured shipping instructions issued to seller')
    const s = this.submission(tx.submissionId)!
    this.notify(tx.sellerId, 'Payment authorised', `The buyer's payment is secured. Ship your ${s.brand} ${s.model} using the insured label provided.`, `/seller/transactions/${tx.id}`)
    this.commit()
  }

  generateShipment(txId: string, leg: Shipment['leg']): Shipment {
    const tx = this.transaction(txId)!
    const sh: Shipment = {
      id: uid('shp-'), transactionId: txId, leg,
      carrier: 'Ferrata Secure Logistics (mock)', trackingNumber: 'FSL' + Math.random().toString().slice(2, 11),
      insuredValue: tx.acceptedAmount, status: 'label_generated', labelGeneratedAt: nowIso(),
    }
    this.db.shipments.push(sh)
    this.custody(txId, leg === 'seller_to_authenticator' ? 'Insured label generated for seller → authentication centre' : 'Insured label generated for authentication centre → buyer')
    this.audit('shipment_created', 'shipment', sh.id, `${leg} — ${sh.trackingNumber}`)
    this.commit()
    return sh
  }

  markShipped(txId: string) {
    const tx = this.transaction(txId)
    if (!tx) return
    const sh = this.db.shipments.find((x) => x.transactionId === txId && x.leg === 'seller_to_authenticator')
    if (sh) sh.status = 'in_transit'
    this.moveState(tx, 'in_transit_to_authentication', 'Seller lodged the insured shipment')
    this.custody(txId, 'Package lodged by seller — tamper-evident seal recorded')
    this.commit()
  }

  markReceivedAtAuthenticator(txId: string, watchmakerId: string, packagingNote: string) {
    const tx = this.transaction(txId)
    if (!tx) return
    const sh = this.db.shipments.find((x) => x.transactionId === txId && x.leg === 'seller_to_authenticator')
    if (sh) { sh.status = 'delivered'; sh.deliveredAt = nowIso() }
    tx.watchmakerId = watchmakerId
    this.moveState(tx, 'received_at_authentication', 'Package received at authentication centre')
    this.custody(txId, `Package received — ${packagingNote}`)
    let insp = this.inspectionForTransaction(txId)
    if (!insp) {
      insp = {
        id: uid('insp-'), transactionId: txId, watchmakerId, status: 'assigned',
        items: [],
      }
      this.db.inspections.push(insp)
    }
    this.notify(watchmakerId, 'Inspection assigned', 'A watch has arrived and is assigned to you for inspection.', `/watchmaker/inspections/${insp.id}`)
    this.commit()
  }

  startInspection(inspId: string) {
    const insp = this.db.inspections.find((i) => i.id === inspId)
    if (!insp) return
    const tx = this.transaction(insp.transactionId)
    if (!tx) return
    if (tx.state === 'received_at_authentication') {
      this.moveState(tx, 'inspection_in_progress', 'Watchmaker began the structured inspection')
    }
    insp.status = 'draft'
    this.commit()
  }

  saveInspection(inspId: string, data: Partial<Inspection>) {
    const insp = this.db.inspections.find((i) => i.id === inspId)
    if (!insp) return
    Object.assign(insp, data)
    this.audit('inspection_saved', 'inspection', inspId, 'Draft saved')
    this.commit()
  }

  submitInspection(inspId: string, outcome: InspectionOutcome) {
    const insp = this.db.inspections.find((i) => i.id === inspId)
    if (!insp) return
    const tx = this.transaction(insp.transactionId)
    if (!tx) return
    insp.outcome = outcome
    insp.status = 'submitted'
    insp.submittedAt = nowIso()
    insp.reportNumber = 'TKE-AR-' + insp.id.slice(-6).toUpperCase()
    if (tx.state === 'received_at_authentication') {
      this.moveState(tx, 'inspection_in_progress', 'Inspection recorded')
    }
    this.moveState(tx, 'inspection_complete', `Authentication report issued: ${OUTCOME_LABELS[outcome]}`)
    const next = stateAfterInspection(outcome)
    if (next === 'disputed') {
      this.moveState(tx, 'disputed', 'Automatic dispute case opened following inspection outcome')
      this.openDispute(tx.id, outcome === 'failed' ? 'authenticity_concern' : 'authenticity_concern', `Inspection outcome: ${OUTCOME_LABELS[outcome]}. ${insp.discrepancySummary ?? ''}`)
    } else {
      this.moveState(tx, next,
        next === 'settlement' ? 'Passed as described — proceeding automatically to settlement'
          : next === 'buyer_review' ? 'Minor discrepancy — buyer to review under platform rules'
            : 'Material discrepancy — managed resolution initiated')
    }
    const s = this.submission(tx.submissionId)!
    this.notify(tx.buyerId, 'Authentication report ready', `${s.brand} ${s.model}: ${OUTCOME_LABELS[outcome]}.`, `/buyer/transactions/${tx.id}`)
    this.notify(tx.sellerId, 'Authentication complete', `${s.brand} ${s.model}: ${OUTCOME_LABELS[outcome]}.`, `/seller/transactions/${tx.id}`)
    this.commit()
  }

  buyerReviewDecision(txId: string, decision: 'proceed' | 'amend' | 'cancel', amendedAmount?: number) {
    const tx = this.transaction(txId)
    if (!tx || tx.state !== 'buyer_review') return
    if (decision === 'proceed') {
      this.moveState(tx, 'settlement', 'Buyer reviewed the discrepancy and elected to proceed at the accepted price')
    } else if (decision === 'amend' && amendedAmount) {
      tx.amendedAmount = amendedAmount
      tx.fees = computeFees(amendedAmount, this.db.feeConfig)
      this.moveState(tx, 'resolution', `Buyer proposed an amended offer of A$${amendedAmount.toLocaleString()} — platform managing resolution`)
      this.notify(tx.sellerId, 'Amended offer proposed', `Following inspection, the buyer proposed A$${amendedAmount.toLocaleString()}. The platform will contact you.`, `/seller/transactions/${tx.id}`)
    } else {
      this.moveState(tx, 'cancelled', 'Buyer cancelled under the platform discrepancy rules')
      tx.cancellationReason = 'Cancelled by buyer after minor discrepancy (permitted under platform rules).'
      const s = this.submission(tx.submissionId)!
      s.status = 'bidding_closed'
      this.notify(tx.sellerId, 'Transaction cancelled', 'The buyer cancelled after inspection. Your watch will be returned, fully insured, at no cost to you.', `/seller/transactions/${tx.id}`)
    }
    this.commit()
  }

  sellerAcceptAmended(txId: string) {
    const tx = this.transaction(txId)
    if (!tx || tx.state !== 'resolution') return
    this.moveState(tx, 'settlement', `Seller accepted the amended amount of A$${(tx.amendedAmount ?? tx.acceptedAmount).toLocaleString()}`)
    this.commit()
  }

  releaseSettlement(txId: string) {
    const tx = this.transaction(txId)
    if (!tx || tx.state !== 'settlement') return
    tx.settlementReleasedAt = nowIso()
    this.generateShipment(txId, 'authenticator_to_buyer')
    this.moveState(tx, 'in_transit_to_buyer', 'Settlement released (simulated) — watch dispatched to buyer, insured')
    this.custody(txId, 'Watch dispatched from authentication centre to buyer')
    const s = this.submission(tx.submissionId)!
    this.notify(tx.sellerId, 'Payment released', `A$${(tx.fees.sellerNet).toLocaleString()} has been released to your nominated account (simulated settlement).`, `/seller/transactions/${tx.id}`)
    this.notify(tx.buyerId, 'Watch dispatched', `Your ${s.brand} ${s.model} is on its way, fully insured.`, `/buyer/transactions/${tx.id}`)
    this.commit()
  }

  confirmDelivery(txId: string) {
    const tx = this.transaction(txId)
    if (!tx || tx.state !== 'in_transit_to_buyer') return
    const sh = this.db.shipments.find((x) => x.transactionId === txId && x.leg === 'authenticator_to_buyer')
    if (sh) { sh.status = 'delivered'; sh.deliveredAt = nowIso() }
    tx.completedAt = nowIso()
    this.moveState(tx, 'completed', 'Buyer confirmed delivery — transaction complete')
    this.custody(txId, 'Delivery confirmed by buyer — chain of custody closed')
    const s = this.submission(tx.submissionId)!
    s.status = 'sold'
    this.notify(tx.sellerId, 'Transaction complete', 'Both parties have received their transaction documents. Thank you.', `/seller/transactions/${tx.id}`)
    const bp = this.buyerProfile(tx.buyerId)
    if (bp) bp.settledCount++
    this.commit()
  }

  cancelTransaction(txId: string, reason: string) {
    const tx = this.transaction(txId)
    if (!tx) return
    if (!canTransition(tx.state, 'cancelled')) return
    this.moveState(tx, 'cancelled', reason)
    tx.cancellationReason = reason
    this.commit()
  }

  // --- disputes -------------------------------------------------------------

  openDispute(txId: string, type: DisputeType, summary: string): Dispute {
    const admin = this.db.users.find((u) => u.role === 'admin')!
    const d: Dispute = {
      id: uid('dsp-'), transactionId: txId, type, status: 'open', ownerId: admin.id,
      openedAt: nowIso(), summary, messages: [],
    }
    this.db.disputes.push(d)
    this.audit('dispute_opened', 'dispute', d.id, `${type} — ${summary}`)
    this.notify(admin.id, 'Dispute opened', summary, `/admin/disputes`)
    this.commit()
    return d
  }

  updateDispute(id: string, data: Partial<Dispute>) {
    const d = this.db.disputes.find((x) => x.id === id)
    if (!d) return
    Object.assign(d, data)
    this.audit('dispute_updated', 'dispute', id, data.status)
    this.commit()
  }

  addDisputeMessage(id: string, text: string) {
    const d = this.db.disputes.find((x) => x.id === id)
    if (!d || !this.me) return
    d.messages.push({ at: nowIso(), author: this.me.name, text })
    this.commit()
  }

  // --- buyer management -----------------------------------------------------

  setBuyerStatus(userId: string, status: BuyerProfile['status']) {
    const bp = this.buyerProfile(userId)
    if (!bp) return
    bp.status = status
    this.audit('buyer_status', 'buyer_profile', userId, status)
    if (status === 'verified') this.notify(userId, 'Buyer account verified', 'Your buyer application has been approved. You can now receive opportunities and place offers.')
    this.commit()
  }

  updateBuyerProfile(userId: string, data: Partial<BuyerProfile>) {
    const bp = this.buyerProfile(userId)
    if (!bp) return
    Object.assign(bp, data)
    this.audit('buyer_updated', 'buyer_profile', userId)
    this.commit()
  }

  applyAsBuyer(data: { name: string; email: string; buyerType: BuyerProfile['buyerType']; businessName?: string; abn?: string; preferredBrands: string[] }): User {
    const u: User = { id: uid('u-'), role: 'buyer', name: data.name, email: data.email, createdAt: nowIso() }
    this.db.users.push(u)
    this.db.buyerProfiles.push({
      userId: u.id, status: 'applicant', buyerType: data.buyerType, businessName: data.businessName,
      abn: data.abn, transactionLimit: 0, preferredBrands: data.preferredBrands, trustScore: 0,
      vintageApproved: false, proofOfFundsProvided: false, settledCount: 0, defaultedCount: 0,
    })
    this.audit('buyer_applied', 'buyer_profile', u.id, data.businessName ?? data.name)
    this.db.users.filter((x) => x.role === 'admin').forEach((a) =>
      this.notify(a.id, 'New buyer application', `${data.businessName ?? data.name} applied as ${data.buyerType}.`, '/admin/buyers'))
    this.commit()
    return u
  }

  updateFeeConfig(cfg: FeeConfig) {
    this.db.feeConfig = cfg
    this.audit('fee_config_updated', 'fee_config', 'global', JSON.stringify(cfg))
    this.commit()
  }
}

export const store = new Store()

export function useDb(): Db {
  useSyncExternalStore(store.subscribe, store.getVersion)
  return store.db
}

export function useMe(): User | null {
  useSyncExternalStore(store.subscribe, store.getVersion)
  return store.me
}

export function roleHome(role: Role): string {
  return { seller: '/seller', buyer: '/buyer', admin: '/admin', watchmaker: '/watchmaker' }[role]
}
