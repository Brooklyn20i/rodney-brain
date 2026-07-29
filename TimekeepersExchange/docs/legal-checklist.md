# Pre-launch legal & regulatory checklist (Australia)

**The existence of this software does not make the platform compliant.** Every item below
requires review by qualified Australian counsel/advisers before real transactions occur.
UI placeholders and warnings referencing these obligations are present in the product
(fees page, admin configuration, legal pages).

## Consumer & contract law
- [ ] Australian Consumer Law review: guarantees, misleading/deceptive conduct, unfair contract terms (Terms, Seller Agreement, Buyer Agreement are placeholder structures)
- [ ] Enforceability of "binding sealed offer + acceptance subject to inspection" mechanism, incl. amended-offer and cancellation rules
- [ ] Marketplace liability position (platform as intermediary, not vendor); disclaimers vs ACL limits
- [ ] Refund/cancellation rules per state of transaction, published and consistent with the state machine

## Licensing & registration
- [ ] Second-hand dealers / pawnbrokers licensing per state (NSW, VIC, QLD differ) — for the platform, partner watchmakers, and dealer buyers
- [ ] Payment & escrow: confirm the settlement provider's AFSL/authorisations; platform must not hold funds (no unlicensed wallet — MVP simulates only)
- [ ] Whether any platform activity constitutes a financial service or non-cash payment facility (ASIC)

## AML/CTF & crime
- [ ] AML/CTF Act assessment (high-value dealers regime; AUSTRAC reporting obligations, incl. the 2026 tranche-2 expansion) — KYC/KYB program design
- [ ] Stolen-property checks: process with police registers / insurer databases; escalation protocol for `suspected_stolen_or_altered` outcomes
- [ ] Sanctions screening for international buyers (later phase)

## Tax
- [ ] GST treatment: platform fees (taxable) vs second-hand goods margin scheme; private seller vs GST-registered dealer sellers; invoices/RCTIs
- [ ] Buyer-side GST disclosure on itemised totals (currently modelled on platform services only)

## Privacy & data
- [ ] Privacy Act 1988 / APP compliance; privacy policy finalisation; data breach response plan
- [ ] KYC data handling: provider-held documents, retention schedule, cross-border disclosure
- [ ] Direct marketing / Spam Act compliance for notifications

## Insurance
- [ ] Transit insurance terms (per-shipment cover to accepted amount; who is insured party in each leg)
- [ ] Custody insurance at authentication centres; watchmaker professional indemnity
- [ ] Platform professional indemnity / cyber cover

## Operational agreements
- [ ] Watchmaker/authentication centre agreements (standards, turnaround, liability, chain of custody)
- [ ] Courier agreements for high-value insured freight
- [ ] Dispute policy alignment with external ADR options and small claims pathways
