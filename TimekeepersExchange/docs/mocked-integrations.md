# Mocked integrations requiring production providers

Each mock has a documented interface so the production provider drops in behind the same calls.

| # | Capability | MVP mock (where) | Production target | Interface / swap notes |
|---|---|---|---|---|
| 1 | Authentication (sign-in) | One-click demo accounts (`pages/public/Auth.tsx`, `store.signIn`) | Supabase Auth: email/password, magic link, Google, Apple; MFA-ready | Replace sign-in page; `useMe()` contract unchanged |
| 2 | Payments & escrow | `authorisePayment` / `releaseSettlement` set flags + timeline ("simulated" labelled in UI) | Stripe Connect (or AU escrow provider); **no platform-held wallet** | `payment` table records provider refs; webhooks drive `payment_authorised` / `settlement` transitions |
| 3 | KYC / identity | `completeKyc` mock form (`SellerVerification`) | Stripe Identity / Persona / FrankieOne | `identity_verification` table; provider webhook sets `kyc_status='verified'` |
| 4 | Buyer KYB / proof of funds | Admin manual approve with mock flags | Provider KYB + bank statement / PoF review | Same `buyer_profile` fields |
| 5 | Logistics & insurance | `generateShipment` fabricates carrier + tracking ("Ferrata Secure Logistics (mock)") | AusPost / DHL / FedEx / specialist insured courier APIs | Abstraction: `createLabel(leg, insuredValue) → {carrier, tracking, labelUrl}`; tracking webhooks drive transit states |
| 6 | AI photo checks | `checkPhoto` heuristics (`lib/ai.ts`) | Server-side vision pipeline | Returns `{watchDetected, sharpness, notes[], confidence}` — same shape |
| 7 | AI identification & valuation | Static reference book + adjustment model (`lib/ai.ts`) | Vision + comparable-sales service | Returns `AiIdentification` / `Valuation` with confidence, evidence, limitations, human-review flag — contract fixed |
| 8 | Stolen-watch register check | Hard-coded "Clear (mock)" in admin review | Police/insurer register API | `stolen_watch_check` table |
| 9 | Email / SMS notifications | In-app notification list only | Resend/SES + Twilio (SMS-ready architecture) | `notify()` fan-out point in `store.tsx` |
| 10 | Image/document storage | Downscaled data-URLs in localStorage | Private object storage + signed URLs, malware scanning | `watch_image.storage_key`; never public buckets |
| 11 | PDF report generation | Print-styled HTML report (`ReportPage`) | Background job → PDF in private storage | Report is generated from structured `inspection` data, so layout swap only |
| 12 | Analytics/metrics | Computed live from the store (admin overview) | Product analytics + warehouse funnels (submission funnel, offer behaviour, settlement performance per §18 of the brief) | Event names align with audit `action`s |
| 13 | Secure local handover | Text placeholder on shipping panel | Appointment booking with partner locations | New table + calendar integration |
