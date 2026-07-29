// ---------------------------------------------------------------------------
// The Timekeeper's Exchange — canonical data model.
// This file is the source of truth for the domain. The relational schema in
// docs/schema.sql mirrors these types 1:1 so the mocked store can be swapped
// for Supabase/Postgres without changing page code.
// ---------------------------------------------------------------------------

export type Role = 'seller' | 'buyer' | 'admin' | 'watchmaker'

export interface User {
  id: string
  role: Role
  name: string
  email: string
  phone?: string
  createdAt: string
  // Mocked auth — production swaps this for Supabase Auth / MFA.
  password?: string
}

export type KycStatus = 'not_started' | 'in_progress' | 'verified' | 'failed'

export interface SellerProfile {
  userId: string
  location: string // suburb/city only — never disclosed to buyers beyond city
  state: string
  kycStatus: KycStatus
  legalName?: string
  dateOfBirth?: string
  residentialAddress?: string
  idDocumentUploaded?: boolean
  bankAccountConfirmed?: boolean
  ownershipDeclarationAccepted?: boolean
  notStolenDeclarationAccepted?: boolean
  payoutAccountMasked?: string // e.g. "•••• 4821"
}

export type BuyerStatus = 'applicant' | 'under_review' | 'verified' | 'suspended' | 'rejected'
export type BuyerType = 'dealer' | 'professional_trader' | 'collector' | 'institutional'

export interface BuyerProfile {
  userId: string
  status: BuyerStatus
  buyerType: BuyerType
  businessName?: string
  abn?: string
  businessAddress?: string
  gstRegistered?: boolean
  dealerLicence?: string
  transactionLimit: number // AUD — set by admin
  preferredBrands: string[]
  priceRangeMin?: number
  priceRangeMax?: number
  shippingAddress?: string
  trustScore: number // 0–100, admin managed
  vintageApproved: boolean // may bid on specialist/vintage lots
  proofOfFundsProvided: boolean
  settledCount: number
  defaultedCount: number
}

export interface WatchmakerProfile {
  userId: string
  businessName: string
  location: string
  accreditations: string[]
  specialisms: string[]
}

// --- Watch submission -------------------------------------------------------

export type SubmissionStatus =
  | 'draft'
  | 'submitted'
  | 'under_review'
  | 'info_required'
  | 'approved_for_offers' // approved; bid window scheduled or open
  | 'bidding_closed'      // window ended, no acceptance yet
  | 'offer_accepted'      // binding transaction created
  | 'sold'
  | 'declined'
  | 'withdrawn'
  | 'suspended'

export type WatchCategory = 'standard' | 'vintage' | 'specialist'
export type Condition = 'unworn' | 'excellent' | 'very_good' | 'good' | 'fair'

export const PHOTO_ANGLES = [
  'dial_straight_on',
  'case_front',
  'caseback',
  'crown_side',
  'opposite_side',
  'clasp',
  'full_bracelet',
  'bracelet_stretch',
  'reference_serial',
  'box',
  'papers',
  'service_documents',
  'visible_defects',
] as const
export type PhotoAngle = (typeof PHOTO_ANGLES)[number]

export interface WatchImage {
  id: string
  submissionId: string
  angle: PhotoAngle
  // Data URL in the mock; production stores an object key + signed URL access.
  dataUrl?: string
  fileName?: string
  uploadedAt?: string
  aiChecks?: PhotoAiCheck
}

export interface PhotoAiCheck {
  watchDetected: boolean
  sharpness: 'sharp' | 'acceptable' | 'blurry'
  notes: string[]
  confidence: number // 0–1
}

export interface AiIdentification {
  brand: string
  model: string
  likelyReference: string
  confidence: number // 0–1
  evidence: string[]
  limitations: string[]
  humanReviewRequired: boolean
}

export interface Valuation {
  marketLow: number
  marketHigh: number
  dealerOfferLow: number
  dealerOfferHigh: number
  expectedOfferLow: number
  expectedOfferHigh: number
  liquidity: 'high' | 'medium' | 'low'
  liquidityScore: number // 0–100
  factors: { label: string; impact: 'positive' | 'negative' | 'neutral'; note: string }[]
  estimatedDaysToOffers: string // e.g. "2–4 days"
  source: 'ai_mock' | 'admin'
}

export interface WatchSubmission {
  id: string
  sellerId: string
  status: SubmissionStatus
  category: WatchCategory
  createdAt: string
  updatedAt: string
  // Declared details
  brand: string
  model: string
  reference: string
  year: string
  caseMaterial: string
  dialColour: string
  braceletOrStrap: string
  condition: Condition
  boxIncluded: boolean
  papersIncluded: boolean
  serviceHistory: string
  polishingHistory: string
  aftermarketParts: string
  sellerLocation: string // city only, shown to buyers
  saleTiming: string
  minimumPrice?: number // seller reserve, optional, never shown to buyers
  purchaseInfo?: string
  serialMasked: string // e.g. "7G8•••••" — full serial never stored client-visible
  // Platform-derived
  aiIdentification?: AiIdentification
  valuation?: Valuation
  adminNotes: AdminNote[]
  infoRequests: string[]
  flaggedForEnhancedInspection: boolean
  restrictedToVintageBuyers: boolean
  bidWindow?: BidWindow
  headline?: string // buyer-facing generated headline
  buyerSummary?: string // AI-generated opportunity summary
  knownFlaws?: string
}

export interface AdminNote {
  id: string
  authorId: string
  text: string
  createdAt: string
}

// --- Bidding ----------------------------------------------------------------

export type BiddingMode = 'sealed' | 'managed_auction'

export interface BidWindow {
  mode: BiddingMode
  opensAt: string
  closesAt: string
  reserve?: number
  minimumIncrement?: number
  invitedBuyerIds: string[] // eligible verified buyers
  extensionsUsed: number
  sellerSeesLeadingPrice: boolean
}

export type OfferType = 'binding_cash' | 'subject_to_inspection' | 'subject_to_conditions'
export type OfferStatus = 'active' | 'accepted' | 'declined' | 'expired' | 'withdrawn' | 'lost'

export interface Offer {
  id: string
  submissionId: string
  buyerId: string
  amount: number // AUD, what the seller would receive before seller fee
  type: OfferType
  conditions?: string
  noteToAdmin?: string
  validityDays: number
  status: OfferStatus
  createdAt: string
  bindingAcknowledged: boolean
}

// --- Transaction state machine ---------------------------------------------

export type TransactionState =
  | 'offer_accepted'
  | 'payment_authorised'
  | 'awaiting_shipment'
  | 'in_transit_to_authentication'
  | 'received_at_authentication'
  | 'inspection_in_progress'
  | 'inspection_complete'
  | 'buyer_review' // minor discrepancy — buyer decides
  | 'resolution'   // material discrepancy — managed resolution
  | 'settlement'
  | 'in_transit_to_buyer'
  | 'completed'
  | 'cancelled'
  | 'disputed'

export interface Transaction {
  id: string
  submissionId: string
  offerId: string
  sellerId: string
  buyerId: string
  watchmakerId?: string
  state: TransactionState
  createdAt: string
  updatedAt: string
  acceptedAmount: number
  fees: FeeBreakdown
  paymentAuthorisedAt?: string
  settlementReleasedAt?: string
  completedAt?: string
  cancellationReason?: string
  amendedAmount?: number // if buyer proposes amended offer after discrepancy
  timeline: TimelineEvent[]
}

export interface TimelineEvent {
  at: string
  state: TransactionState | string
  label: string
  actor: string
}

export interface FeeBreakdown {
  offerAmount: number
  sellerFee: number
  buyerPlatformFee: number
  authenticationFee: number
  shippingFee: number
  gstOnFees: number
  sellerNet: number
  buyerTotal: number
}

// --- Logistics --------------------------------------------------------------

export type ShipmentLeg = 'seller_to_authenticator' | 'authenticator_to_buyer'
export type ShipmentStatus = 'label_generated' | 'in_transit' | 'delivered'

export interface Shipment {
  id: string
  transactionId: string
  leg: ShipmentLeg
  carrier: string
  trackingNumber: string
  insuredValue: number
  status: ShipmentStatus
  labelGeneratedAt: string
  deliveredAt?: string
}

export interface ChainOfCustodyEvent {
  id: string
  transactionId: string
  at: string
  actor: string
  event: string
}

// --- Inspection -------------------------------------------------------------

export type InspectionOutcome =
  | 'passed_as_described'
  | 'passed_minor_discrepancy'
  | 'passed_material_discrepancy'
  | 'inconclusive'
  | 'failed'
  | 'suspected_stolen_or_altered'
  | 'requires_manufacturer_review'

export type InspectionStatus = 'assigned' | 'draft' | 'submitted'

export const INSPECTION_SECTIONS = [
  'Chain of custody',
  'Packaging',
  'Reference and serial',
  'Dial',
  'Hands and lume',
  'Crystal',
  'Case',
  'Bezel',
  'Crown and pushers',
  'Bracelet or strap',
  'Clasp',
  'Movement',
  'Timekeeping',
  'Functions',
  'Water resistance',
  'Polishing',
  'Replacement parts',
  'Accessories',
  'Final photographs',
  'Conclusion',
] as const
export type InspectionSection = (typeof INSPECTION_SECTIONS)[number]

export type SectionVerdict = 'pass' | 'note' | 'issue' | 'na'

export interface InspectionItem {
  section: InspectionSection
  verdict: SectionVerdict
  notes: string
  measurements?: string
}

export interface Inspection {
  id: string
  transactionId: string
  watchmakerId: string
  status: InspectionStatus
  items: InspectionItem[]
  timegrapherRate?: string // e.g. "+2.1 s/day"
  amplitude?: string
  beatError?: string
  outcome?: InspectionOutcome
  discrepancySummary?: string
  serviceRecommendation?: string
  conclusion?: string
  submittedAt?: string
  reportNumber?: string
}

// --- Disputes ---------------------------------------------------------------

export type DisputeType =
  | 'condition_discrepancy'
  | 'aftermarket_part'
  | 'incorrect_accessory'
  | 'shipping_damage'
  | 'payment_issue'
  | 'authenticity_concern'
  | 'seller_withdrawal'
  | 'buyer_default'
  | 'lost_shipment'

export type DisputeStatus = 'open' | 'evidence' | 'proposed_resolution' | 'resolved' | 'closed'

export interface Dispute {
  id: string
  transactionId: string
  type: DisputeType
  status: DisputeStatus
  ownerId: string // admin case owner
  openedAt: string
  summary: string
  messages: { at: string; author: string; text: string }[]
  proposedResolution?: string
  financialAdjustment?: number
  finalDecision?: string
}

// --- Platform ---------------------------------------------------------------

export interface Notification {
  id: string
  userId: string
  at: string
  title: string
  body: string
  read: boolean
  link?: string
}

export interface AuditEvent {
  id: string
  at: string
  actorId: string
  actorName: string
  action: string
  entity: string
  entityId: string
  detail?: string
}

export interface FeeConfig {
  sellerFlatFee: number // AUD
  buyerFeePct: number // e.g. 0.05
  buyerFeeMin: number
  authenticationFee: number
  shippingFee: number
  gstRate: number // 0.10
}

export interface Db {
  version: number
  users: User[]
  sellerProfiles: SellerProfile[]
  buyerProfiles: BuyerProfile[]
  watchmakerProfiles: WatchmakerProfile[]
  submissions: WatchSubmission[]
  images: WatchImage[]
  offers: Offer[]
  transactions: Transaction[]
  shipments: Shipment[]
  custodyEvents: ChainOfCustodyEvent[]
  inspections: Inspection[]
  disputes: Dispute[]
  notifications: Notification[]
  auditEvents: AuditEvent[]
  feeConfig: FeeConfig
}
