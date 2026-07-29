import type { FeeBreakdown, FeeConfig } from './types'

export const DEFAULT_FEE_CONFIG: FeeConfig = {
  sellerFlatFee: 250,
  buyerFeePct: 0.04,
  buyerFeeMin: 400,
  authenticationFee: 350,
  shippingFee: 180,
  gstRate: 0.1,
}

// Default economics: the seller receives the accepted bid less a flat seller
// fee; the buyer pays the bid plus a transparent platform fee, authentication
// and shipping, itemised. GST applies to platform services (fees), not the
// second-hand watch itself in a private sale. All figures AUD.
export function computeFees(offerAmount: number, cfg: FeeConfig): FeeBreakdown {
  const sellerFee = cfg.sellerFlatFee
  const buyerPlatformFee = Math.max(cfg.buyerFeeMin, Math.round(offerAmount * cfg.buyerFeePct))
  const authenticationFee = cfg.authenticationFee
  const shippingFee = cfg.shippingFee
  const gstOnFees = Math.round((sellerFee + buyerPlatformFee + authenticationFee + shippingFee) * cfg.gstRate)
  const buyerGst = Math.round((buyerPlatformFee + authenticationFee + shippingFee) * cfg.gstRate)
  return {
    offerAmount,
    sellerFee,
    buyerPlatformFee,
    authenticationFee,
    shippingFee,
    gstOnFees,
    sellerNet: offerAmount - sellerFee - Math.round(sellerFee * cfg.gstRate),
    buyerTotal: offerAmount + buyerPlatformFee + authenticationFee + shippingFee + buyerGst,
  }
}

export function aud(n: number): string {
  return 'A$' + n.toLocaleString('en-AU', { maximumFractionDigits: 0 })
}
