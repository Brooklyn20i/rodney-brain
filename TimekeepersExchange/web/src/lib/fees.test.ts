import { describe, it, expect } from 'vitest'
import { computeFees, DEFAULT_FEE_CONFIG } from './fees'

describe('fee economics', () => {
  it('matches the homepage example: A$22,400 accepted, seller nets 22,150 before GST on fee', () => {
    const f = computeFees(22400, DEFAULT_FEE_CONFIG)
    expect(f.offerAmount).toBe(22400)
    expect(f.sellerFee).toBe(250)
    // Seller net = offer − flat fee − GST on the fee.
    expect(f.sellerNet).toBe(22400 - 250 - 25)
  })

  it('buyer pays offer + itemised platform costs + GST on services', () => {
    const f = computeFees(20000, DEFAULT_FEE_CONFIG)
    const platformFee = Math.max(400, Math.round(20000 * 0.04)) // 800
    const services = platformFee + 350 + 180
    expect(f.buyerPlatformFee).toBe(platformFee)
    expect(f.buyerTotal).toBe(20000 + services + Math.round(services * 0.1))
  })

  it('applies the buyer fee minimum on smaller lots', () => {
    const f = computeFees(8000, DEFAULT_FEE_CONFIG)
    expect(f.buyerPlatformFee).toBe(400) // 4% would be 320 — minimum applies
  })

  it('never hides a spread: seller net + all fees reconcile to buyer total', () => {
    const f = computeFees(39500, DEFAULT_FEE_CONFIG)
    const buyerGst = Math.round((f.buyerPlatformFee + f.authenticationFee + f.shippingFee) * 0.1)
    expect(f.buyerTotal).toBe(f.offerAmount + f.buyerPlatformFee + f.authenticationFee + f.shippingFee + buyerGst)
    // The seller receives the accepted bid less only the disclosed seller fee (+GST on it).
    expect(f.offerAmount - f.sellerNet).toBe(f.sellerFee + Math.round(f.sellerFee * 0.1))
  })
})
