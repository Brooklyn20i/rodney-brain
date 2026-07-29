# Roles & permissions matrix

Roles: **Visitor**, **Seller**, **Buyer (verified)**, **Watchmaker**, **Admin**.
In production this matrix becomes Postgres RLS policies + API-layer checks; in the MVP it is
enforced by the store's guards and route-level role gates (`PortalLayout`).

| Capability | Visitor | Seller | Buyer | Watchmaker | Admin |
|---|---|---|---|---|---|
| View public site, fees, policies | ✅ | ✅ | ✅ | ✅ | ✅ |
| Create seller account / submit a watch | ✅ (becomes seller) | ✅ | — | — | ✅ (on behalf) |
| See own submissions, valuation, offers (count/highest per config) | — | ✅ own | — | — | ✅ all |
| See buyer identities before acceptance | — | ❌ | n/a | — | ✅ |
| Complete KYC / accept an offer | — | ✅ own (KYC-gated) | — | — | — |
| Apply as buyer | ✅ | — | — | — | — |
| Approve/suspend buyers, set limits, tiers, vintage access | — | — | — | — | ✅ |
| See opportunity feed | — | — | ✅ invited + verified only | — | ✅ |
| See seller identity / address / reserve / serial | — | own only | ❌ (city + masked serial only) | serial at bench | ✅ (address never needed for buyers) |
| Place / revise sealed offer (within limit) | — | — | ✅ | — | — |
| See competing bids | — | ❌ (aggregates per config) | ❌ | — | ✅ |
| Review submissions, request info, approve/decline, set bid window, invite buyers | — | — | — | — | ✅ |
| Generate label / mark shipped (seller leg) | — | ✅ own tx | — | — | ✅ |
| Record package arrival, chain of custody | — | — | — | ✅ assigned tx | ✅ |
| Complete & submit inspection | — | — | — | ✅ assigned only | ❌ (read) |
| View authentication report | — | ✅ party | ✅ party | ✅ author | ✅ |
| Buyer discrepancy decision (proceed/amend/cancel) | — | — | ✅ own tx | — | ✅ (on behalf) |
| Accept amended amount | — | ✅ own tx | — | — | ✅ (on behalf) |
| Release settlement | — | — | — | — | ✅ |
| Confirm delivery | — | — | ✅ own tx | — | ✅ |
| Open / manage disputes | — | ✅ own (open) | ✅ own (open) | ✅ escalate | ✅ manage |
| Fees & configuration | — | — | — | — | ✅ |
| Audit log | — | — | — | — | ✅ |

Notes:

- Watchmakers see **only inspections assigned to them** — never bidding, prices, or party
  identities beyond what the bench work requires.
- Buyer↔seller contact details are never exchanged before completion, and not after completion
  unless operationally required. All Q&A is platform-mediated.
- All admin actions are audit-logged with actor identity.
