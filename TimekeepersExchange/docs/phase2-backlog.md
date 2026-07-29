# Phase 2 backlog

Ordered roughly by value against the product vision (trusted transaction infrastructure).

## Platform hardening (prereqs for real money)
1. Supabase/Postgres backend per `schema.sql` with RLS; replace mock store with API client
2. Real auth (email/magic link/Google/Apple + MFA), sessions, rate limiting, login alerts
3. Stripe Connect (or AU escrow) integration; webhook-driven state transitions; idempotency
4. KYC/KYB provider integration (Stripe Identity / Persona / FrankieOne)
5. Insured courier integration + tracking webhooks; secure local handover booking
6. Private object storage, signed URLs, malware scanning; PDF report generation job
7. Email + SMS notification delivery; digest preferences

## Marketplace depth
8. Managed auction mode UI for buyers (leading/not-leading indicator, auto-extensions, increments) — admin config exists
9. Offer expiry + bid-window close automation (background jobs); automatic reserve handling
10. Platform-mediated Q&A on opportunities (message entity exists; no direct contact principle)
11. Buyer fee tiers & dealer subscriptions; premium seller service
12. Trade offers; consignment / instant-purchase service (explicitly later phase)
13. International buyers: sanctions screening, FX display, GST/import duty calculation

## Intelligence
14. Real comparable-sales valuation with confidence intervals; dynamic reserve recommendations
15. Vision models: condition scoring, polishing detection, bracelet-stretch estimation, aftermarket-part detection
16. Fraud detection (velocity, duplicate serials, image reuse); buyer matching & offer-probability forecasting

## Experience
17. Native-quality mobile capture flow (guided camera overlays per angle)
18. Seller referral programme; structured review display
19. Journal/CMS; SEO-rendered public pages (move to Next.js SSR)
20. Accessibility audit to WCAG 2.2 AA (semantic pass done; needs full audit) and print styles for all documents

## Metrics instrumentation (§18 of the brief)
21. Funnel events: visitor→submission start→complete→approved→≥3 offers→acceptance→completion
22. Offer-spread, seller-uplift, and days-to-sale dashboards (admin overview computes basics today)
