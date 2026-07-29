// ---------------------------------------------------------------------------
// Mock AI services. Every AI-derived conclusion carries confidence, evidence,
// limitations and a human-review flag. None of these functions ever claims
// final authenticity — final authentication happens only after an offer is
// accepted, by a qualified watchmaker. In production these become server-side
// calls to a vision/LLM pipeline; the interfaces stay the same.
// ---------------------------------------------------------------------------
import type { AiIdentification, PhotoAiCheck, Valuation, Condition } from './types'

interface RefData {
  brand: string
  model: string
  reference: string
  low: number
  high: number
  liquidity: 'high' | 'medium' | 'low'
}

// Mock comparable data — production replaces this with live comparable sales.
const REFERENCE_BOOK: RefData[] = [
  { brand: 'Rolex', model: 'GMT-Master II "Batgirl"', reference: '126710BLNR', low: 22000, high: 25000, liquidity: 'high' },
  { brand: 'Rolex', model: 'Submariner Date', reference: '126610LN', low: 17500, high: 20000, liquidity: 'high' },
  { brand: 'Rolex', model: 'Datejust 41', reference: '126334', low: 14000, high: 16500, liquidity: 'high' },
  { brand: 'Audemars Piguet', model: 'Royal Oak 37mm', reference: '15450ST', low: 38000, high: 44000, liquidity: 'medium' },
  { brand: 'Patek Philippe', model: 'Nautilus', reference: '5711/1A', low: 140000, high: 165000, liquidity: 'medium' },
  { brand: 'Patek Philippe', model: 'Aquanaut', reference: '5167A', low: 65000, high: 78000, liquidity: 'medium' },
  { brand: 'Vacheron Constantin', model: 'Overseas', reference: '4500V', low: 42000, high: 50000, liquidity: 'medium' },
  { brand: 'Cartier', model: 'Santos Large', reference: 'WSSA0018', low: 10500, high: 12500, liquidity: 'high' },
  { brand: 'Omega', model: 'Speedmaster Professional', reference: '310.30.42.50.01.001', low: 9500, high: 11500, liquidity: 'high' },
  { brand: 'IWC', model: 'Portugieser Chronograph', reference: 'IW371617', low: 10000, high: 12000, liquidity: 'medium' },
  { brand: 'Tudor', model: 'Black Bay 58', reference: '79030N', low: 4800, high: 5800, liquidity: 'high' },
  { brand: 'Heuer', model: 'Carrera (vintage)', reference: '2447', low: 18000, high: 45000, liquidity: 'low' },
]

export function identifyWatch(brand: string, model: string, reference: string): AiIdentification {
  const b = brand.trim().toLowerCase()
  const r = reference.trim().toLowerCase()
  const hit =
    REFERENCE_BOOK.find((x) => r && x.reference.toLowerCase() === r) ??
    REFERENCE_BOOK.find(
      (x) => x.brand.toLowerCase() === b && model && x.model.toLowerCase().includes(model.trim().toLowerCase().split(' ')[0]),
    )
  if (hit) {
    const exact = r === hit.reference.toLowerCase()
    return {
      brand: hit.brand,
      model: hit.model,
      likelyReference: hit.reference,
      confidence: exact ? 0.92 : 0.71,
      evidence: [
        exact ? 'Reference number matches a known production reference.' : 'Brand and model text match a known reference family.',
        'Declared details are consistent with photographs provided (mock check).',
      ],
      limitations: [
        'Preliminary identification only. Final authentication occurs after an offer is accepted.',
        'Photographic checks cannot verify movement originality or internal condition.',
      ],
      humanReviewRequired: !exact,
    }
  }
  return {
    brand: brand || 'Unknown',
    model: model || 'Unknown',
    likelyReference: reference || 'Unconfirmed',
    confidence: 0.35,
    evidence: ['Declared details did not match the platform reference book.'],
    limitations: [
      'Preliminary identification only. Final authentication occurs after an offer is accepted.',
      'This submission requires specialist review before approval.',
    ],
    humanReviewRequired: true,
  }
}

const CONDITION_ADJ: Record<Condition, number> = {
  unworn: 1.06,
  excellent: 1.0,
  very_good: 0.96,
  good: 0.92,
  fair: 0.84,
}

export function buildValuation(input: {
  brand: string
  model: string
  reference: string
  condition: Condition
  boxIncluded: boolean
  papersIncluded: boolean
  polished: boolean
  serviceHistory: boolean
}): Valuation {
  const id = identifyWatch(input.brand, input.model, input.reference)
  const hit = REFERENCE_BOOK.find((x) => x.reference === id.likelyReference)
  const base = hit ?? { low: 10000, high: 14000, liquidity: 'low' as const }
  let adj = CONDITION_ADJ[input.condition]
  const factors: Valuation['factors'] = []
  if (input.boxIncluded && input.papersIncluded) {
    adj *= 1.04
    factors.push({ label: 'Full set', impact: 'positive', note: 'Box and papers materially support value and buyer confidence.' })
  } else {
    adj *= 0.95
    factors.push({ label: 'Incomplete set', impact: 'negative', note: 'Missing box or papers typically reduces offers by 4–8%.' })
  }
  if (input.serviceHistory) {
    factors.push({ label: 'Service history', impact: 'positive', note: 'Documented servicing supports buyer confidence.' })
  }
  if (input.polished) {
    adj *= 0.97
    factors.push({ label: 'Polishing', impact: 'negative', note: 'Known polishing slightly reduces collector appeal.' })
  } else {
    factors.push({ label: 'Unpolished (declared)', impact: 'positive', note: 'Sharp case lines are increasingly valued — verified at inspection.' })
  }
  factors.push({
    label: 'Condition: ' + input.condition.replace('_', ' '),
    impact: input.condition === 'unworn' || input.condition === 'excellent' ? 'positive' : 'neutral',
    note: 'Condition is verified independently after an offer is accepted.',
  })
  const low = Math.round((base.low * adj) / 100) * 100
  const high = Math.round((base.high * adj) / 100) * 100
  const liquidityScore = base.liquidity === 'high' ? 88 : base.liquidity === 'medium' ? 62 : 34
  return {
    marketLow: low,
    marketHigh: high,
    dealerOfferLow: Math.round((low * 0.86) / 100) * 100,
    dealerOfferHigh: Math.round((low * 0.93) / 100) * 100,
    expectedOfferLow: Math.round((low * 0.95) / 100) * 100,
    expectedOfferHigh: Math.round((high * 0.97) / 100) * 100,
    liquidity: base.liquidity,
    liquidityScore,
    factors,
    estimatedDaysToOffers: base.liquidity === 'high' ? '2–4 days' : base.liquidity === 'medium' ? '4–7 days' : '7–14 days',
    source: 'ai_mock',
  }
}

// Placeholder photo QA — production runs a vision model server-side.
export function checkPhoto(fileName: string, angle: string): PhotoAiCheck {
  const blurry = /blur|shaky/i.test(fileName)
  const notes: string[] = []
  if (angle === 'reference_serial') {
    notes.push('Do not expose the full serial number publicly. The platform masks serials automatically.')
  }
  if (blurry) notes.push('This image appears blurry — retake with the watch on a flat, well-lit surface.')
  return {
    watchDetected: true,
    sharpness: blurry ? 'blurry' : 'sharp',
    notes,
    confidence: blurry ? 0.55 : 0.9,
  }
}

export function generateBuyerSummary(s: { brand: string; model: string; reference: string; year: string; condition: string; boxIncluded: boolean; papersIncluded: boolean; polishingHistory: string; sellerLocation: string }): string {
  const set = s.boxIncluded && s.papersIncluded ? 'full set' : s.papersIncluded ? 'with papers' : s.boxIncluded ? 'with box' : 'watch only'
  return `${s.year} ${s.brand} ${s.model} (${s.reference}), ${set}, declared ${s.condition.replace('_', ' ')} condition, located ${s.sellerLocation}. ` +
    `${s.polishingHistory && !/none|no /i.test(s.polishingHistory) ? 'Seller declares: ' + s.polishingHistory + '. ' : ''}` +
    `Seller-declared details; independent authentication occurs after offer acceptance.`
}

export function maskSerial(serial: string): string {
  const s = serial.trim()
  if (s.length <= 2) return '••••••'
  return s.slice(0, 2) + '•'.repeat(Math.max(4, s.length - 2))
}
