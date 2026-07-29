# Security checklist

Status legend: ✅ implemented in MVP (mock-appropriate) · 🟡 architected, needs production wiring · ❌ required before launch.

## Access control
- ✅ Strict role-based permissions (route gates + store guards; matrix in roles-permissions.md)
- ✅ Watchmaker sees only assigned inspections; buyers see only invited opportunities
- ✅ Report access restricted to transaction parties, watchmaker, admin
- 🟡 Enforce the same matrix as Postgres RLS policies + server-side authorisation
- ❌ MFA enabled for admin and watchmaker accounts (architecture is MFA-ready)

## Data protection
- ✅ Serial numbers masked everywhere buyer-visible; full serial never rendered
- ✅ Seller address/identity never shown to buyers; buyer identity never shown to sellers pre-completion
- ✅ Seller reserve held private
- 🟡 Encrypt sensitive fields at rest (serials, DOB, addresses) — schema reserves `serial_encrypted bytea`
- 🟡 Images/documents: private buckets + signed URLs only (MVP stores downscaled images locally)
- ❌ Malware scanning on all uploads (placeholder documented)
- ❌ KYC documents held by the KYC provider, never on platform storage

## Auditability
- ✅ Append-only audit log of every state change with actor
- ✅ Soft deletion / status changes only for financial & transaction records
- ✅ Transaction timeline + chain-of-custody records
- 🟡 Device and IP logging (schema columns reserved: `audit_event.ip`, `.device`)
- ❌ Administrative action alerts (e.g. settlement release notifications to a second admin)

## Sessions & abuse
- 🟡 Session management: MVP is a mocked single-device session; production uses Supabase Auth sessions with revocation
- ❌ Rate limiting on submission, offer, and auth endpoints
- ❌ Login alerts on new device/location
- ❌ Fraud flags: velocity checks, duplicate serial detection, disposable-email screening
- ✅ Fraud-sensitive gates in domain logic: buyer transaction limits, manual buyer approval, KYC before acceptance, stolen-declaration + stolen-register check hook

## Payments
- ✅ No platform-held wallet; settlement simulated and clearly labelled
- ❌ Production: regulated third-party provider (e.g. Stripe Connect), webhook signature verification, idempotency keys on all money movements

## Transport & headers
- ✅ Security headers via vercel.json (X-Frame-Options DENY, nosniff, referrer-policy, permissions-policy)
- 🟡 CSP with nonce'd scripts once font/self-hosting is settled
- ✅ HTTPS-only hosting target (Vercel)
