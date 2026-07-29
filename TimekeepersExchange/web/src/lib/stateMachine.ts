// ---------------------------------------------------------------------------
// Transaction state machine. Every transition is validated here so no page
// can move a transaction into an illegal state. See docs/state-machine.md.
// ---------------------------------------------------------------------------
import type { TransactionState, InspectionOutcome } from './types'

export const TRANSITIONS: Record<TransactionState, TransactionState[]> = {
  offer_accepted: ['payment_authorised', 'cancelled'],
  payment_authorised: ['awaiting_shipment', 'cancelled'],
  awaiting_shipment: ['in_transit_to_authentication', 'cancelled'],
  in_transit_to_authentication: ['received_at_authentication', 'disputed'],
  received_at_authentication: ['inspection_in_progress'],
  inspection_in_progress: ['inspection_complete'],
  inspection_complete: ['settlement', 'buyer_review', 'resolution', 'cancelled', 'disputed'],
  buyer_review: ['settlement', 'resolution', 'cancelled'],
  resolution: ['settlement', 'cancelled', 'disputed'],
  settlement: ['in_transit_to_buyer'],
  in_transit_to_buyer: ['completed', 'disputed'],
  completed: [],
  cancelled: [],
  disputed: ['resolution', 'cancelled', 'settlement'],
}

export function canTransition(from: TransactionState, to: TransactionState): boolean {
  return TRANSITIONS[from]?.includes(to) ?? false
}

export const STATE_LABELS: Record<TransactionState, string> = {
  offer_accepted: 'Offer accepted',
  payment_authorised: 'Buyer payment authorised',
  awaiting_shipment: 'Awaiting shipment from seller',
  in_transit_to_authentication: 'In transit to authentication',
  received_at_authentication: 'Received at authentication centre',
  inspection_in_progress: 'Inspection in progress',
  inspection_complete: 'Inspection complete',
  buyer_review: 'Buyer reviewing discrepancy',
  resolution: 'Managed resolution in progress',
  settlement: 'Settlement in progress',
  in_transit_to_buyer: 'In transit to buyer',
  completed: 'Completed',
  cancelled: 'Cancelled',
  disputed: 'Disputed',
}

// Ordered path used for the progress stepper (happy path).
export const HAPPY_PATH: TransactionState[] = [
  'offer_accepted',
  'payment_authorised',
  'awaiting_shipment',
  'in_transit_to_authentication',
  'received_at_authentication',
  'inspection_in_progress',
  'inspection_complete',
  'settlement',
  'in_transit_to_buyer',
  'completed',
]

// Maps an inspection outcome to the next transaction state.
export function stateAfterInspection(outcome: InspectionOutcome): TransactionState {
  switch (outcome) {
    case 'passed_as_described':
      return 'settlement'
    case 'passed_minor_discrepancy':
      return 'buyer_review'
    case 'passed_material_discrepancy':
    case 'inconclusive':
    case 'requires_manufacturer_review':
      return 'resolution'
    case 'failed':
    case 'suspected_stolen_or_altered':
      return 'disputed'
  }
}

export const OUTCOME_LABELS: Record<InspectionOutcome, string> = {
  passed_as_described: 'Passed as described',
  passed_minor_discrepancy: 'Passed with minor discrepancy',
  passed_material_discrepancy: 'Passed with material discrepancy',
  inconclusive: 'Authentication inconclusive',
  failed: 'Failed authentication',
  suspected_stolen_or_altered: 'Suspected stolen or altered item',
  requires_manufacturer_review: 'Requires manufacturer review',
}

// What each party is responsible for at each state — surfaced in the UI so
// "what happens next / who is responsible" is always explicit.
export const STATE_GUIDANCE: Record<
  TransactionState,
  { next: string; responsible: string; binding: string }
> = {
  offer_accepted: {
    next: 'The buyer authorises payment into secure settlement.',
    responsible: 'Buyer',
    binding: 'The accepted offer is binding, subject to inspection.',
  },
  payment_authorised: {
    next: 'The platform issues insured shipping instructions to the seller.',
    responsible: 'Platform',
    binding: 'Funds are pre-authorised and held by the settlement provider (simulated).',
  },
  awaiting_shipment: {
    next: 'The seller packs the watch using the guide and lodges the insured shipment.',
    responsible: 'Seller',
    binding: 'The watch must be shipped within 3 business days.',
  },
  in_transit_to_authentication: {
    next: 'The authentication centre confirms arrival and packaging condition.',
    responsible: 'Carrier / Authentication centre',
    binding: 'The shipment is insured for the accepted amount.',
  },
  received_at_authentication: {
    next: 'The assigned watchmaker begins the structured inspection.',
    responsible: 'Watchmaker',
    binding: 'Chain of custody is recorded from arrival.',
  },
  inspection_in_progress: {
    next: 'The watchmaker completes the 20-section inspection and issues a report.',
    responsible: 'Watchmaker',
    binding: 'The outcome determines the next step under the platform rules.',
  },
  inspection_complete: {
    next: 'The platform applies the inspection outcome.',
    responsible: 'Platform',
    binding: 'Passed as described proceeds automatically to settlement.',
  },
  buyer_review: {
    next: 'The buyer proceeds, proposes an amended offer, or cancels under the platform rules.',
    responsible: 'Buyer',
    binding: 'The buyer has 2 business days to respond.',
  },
  resolution: {
    next: 'The platform manages a resolution between the parties.',
    responsible: 'Platform',
    binding: 'Funds remain held until resolution.',
  },
  settlement: {
    next: 'Settlement is released and the watch is dispatched to the buyer.',
    responsible: 'Platform / Settlement provider',
    binding: 'Payment is released only when contractual conditions are satisfied.',
  },
  in_transit_to_buyer: {
    next: 'The buyer confirms delivery.',
    responsible: 'Carrier / Buyer',
    binding: 'The shipment is insured for the accepted amount.',
  },
  completed: {
    next: 'Transaction documents are available to both parties.',
    responsible: '—',
    binding: 'The transaction is complete.',
  },
  cancelled: {
    next: 'Any held funds are returned and the watch is returned to the seller if in custody.',
    responsible: 'Platform',
    binding: 'Cancellation follows the platform rules and fee schedule.',
  },
  disputed: {
    next: 'A dispute case has been opened and assigned to a platform case owner.',
    responsible: 'Platform',
    binding: 'Funds and the watch are held pending the outcome.',
  },
}
