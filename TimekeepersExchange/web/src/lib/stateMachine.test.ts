import { describe, it, expect } from 'vitest'
import { canTransition, stateAfterInspection, TRANSITIONS, HAPPY_PATH } from './stateMachine'
import type { TransactionState } from './types'

describe('transaction state machine', () => {
  it('allows the full happy path in order', () => {
    for (let i = 0; i < HAPPY_PATH.length - 1; i++) {
      const from = HAPPY_PATH[i]
      const to = HAPPY_PATH[i + 1]
      // inspection_complete → settlement is via outcome mapping; both must be legal.
      expect(canTransition(from, to), `${from} → ${to}`).toBe(true)
    }
  })

  it('rejects illegal transitions', () => {
    expect(canTransition('offer_accepted', 'settlement')).toBe(false)
    expect(canTransition('awaiting_shipment', 'completed')).toBe(false)
    expect(canTransition('completed', 'settlement')).toBe(false)
    expect(canTransition('cancelled', 'settlement')).toBe(false)
    expect(canTransition('settlement', 'cancelled')).toBe(false)
  })

  it('terminal states have no exits', () => {
    expect(TRANSITIONS.completed).toHaveLength(0)
    expect(TRANSITIONS.cancelled).toHaveLength(0)
  })

  it('payment must be authorised before shipment', () => {
    expect(canTransition('offer_accepted', 'awaiting_shipment')).toBe(false)
    expect(canTransition('payment_authorised', 'awaiting_shipment')).toBe(true)
  })

  it('maps inspection outcomes to the correct next state', () => {
    expect(stateAfterInspection('passed_as_described')).toBe('settlement')
    expect(stateAfterInspection('passed_minor_discrepancy')).toBe('buyer_review')
    expect(stateAfterInspection('passed_material_discrepancy')).toBe('resolution')
    expect(stateAfterInspection('inconclusive')).toBe('resolution')
    expect(stateAfterInspection('requires_manufacturer_review')).toBe('resolution')
    expect(stateAfterInspection('failed')).toBe('disputed')
    expect(stateAfterInspection('suspected_stolen_or_altered')).toBe('disputed')
  })

  it('buyer review permits proceed, resolution, or cancellation only', () => {
    expect(TRANSITIONS.buyer_review.sort()).toEqual(['cancelled', 'resolution', 'settlement'].sort())
  })

  it('every declared state is reachable from some other state (except the entry state)', () => {
    const targets = new Set(Object.values(TRANSITIONS).flat())
    const all = Object.keys(TRANSITIONS) as TransactionState[]
    for (const st of all) {
      if (st === 'offer_accepted') continue // entry point
      expect(targets.has(st), `${st} unreachable`).toBe(true)
    }
  })
})
