# The Timekeeper's Exchange

**Verified offers for exceptional watches.** An Australia-first managed marketplace MVP for
pre-owned luxury watches (~A$10k+): private sellers submit a watch once, verified buyers compete
with sealed offers, and accepted transactions complete through independent authentication,
insured logistics, and secure settlement. The watch stays with the seller until an offer is
accepted.

> One watch. Multiple verified offers. One secure transaction.

This is a **demonstration MVP**: the full product experience and transaction workflow are real
and run end to end; payments, KYC, logistics, and AI checks are high-quality mocks behind
documented interfaces (see [`docs/mocked-integrations.md`](docs/mocked-integrations.md)).

## Quick start

```bash
cd TimekeepersExchange/web
npm install
npm run dev        # http://localhost:5173
npm test           # 11 unit tests: transaction state machine + fee economics
npm run build      # type-check + production build to dist/
```

End-to-end smoke test (drives the complete transaction through the real UI):

```bash
npm run build
npx vite preview --port 4173 &
node e2e/smoke.mjs   # set CHROMIUM_PATH if Chromium isn't at the default location
```

## Test accounts

Sign-in is mocked (one click on `/signin`). Production swaps in email/password, magic link,
Google/Apple, MFA-ready auth.

| Account | Role | What to demo |
|---|---|---|
| Alexandra Chen | Seller | Rolex GMT "Batgirl" with 5 live sealed offers — accept one and drive the full transaction |
| Marcus Webb | Seller | AP Royal Oak mid-transaction (minor discrepancy at inspection) |
| James Halloran | Buyer (dealer) | Verified dealer; active offers; one completed purchase |
| Priya Nair | Buyer (dealer) | Holds the leading A$22,400 sealed offer on the GMT |
| Grace Liu | Buyer (trader) | Must decide on the Royal Oak discrepancy: proceed / amend / cancel |
| Oliver Stanton | Buyer (vintage) | Approved for vintage/specialist lots (Heuer Carrera) |
| Henrik Larsen | Watchmaker | Inspection queue, 20-section inspection form, report issuance |
| Eleanor Voss | Admin | Review queue, buyer approvals, bidding config, settlement, disputes, audit log |

## Demo script (10 minutes)

1. **Public site** — home, how it works, fees, trust. Note the comparison table and the
   illustrative GMT example transaction.
2. **Seller** (Alexandra) — open the GMT: 5 sealed offers, highest A$22,400, estimated net
   proceeds after itemised fees, indicative valuation with liquidity and value factors.
   Accept the top offer → binding transaction created.
3. **Buyer** (Priya) — action banner → authorise payment (simulated escrow) → shipping
   instructions issued to the seller.
4. **Seller** — generate insured label, view packing guide, lodge shipment.
5. **Watchmaker** (Henrik) — record package arrival (chain of custody), complete the
   20-section inspection, submit *Passed as described* → automatic move to settlement.
6. **Admin** (Eleanor) — release settlement → watch dispatched, seller paid (simulated).
7. **Buyer** — confirm delivery → transaction complete; open the authentication report.
8. **Discrepancy path** (Grace) — the Royal Oak inspection found extra polishing:
   proceed at price, propose an amended offer, or cancel under the platform rules.
9. **Specialist path** (admin) — the vintage Heuer Carrera: information request sent,
   restricted to approved vintage buyers, enhanced inspection flag.

Demo data resets automatically per browser profile (clear site data to reseed).

## Deliverables map

| Deliverable | Where |
|---|---|
| Source code | `web/` |
| Database schema | [`docs/schema.sql`](docs/schema.sql) (mirrors `web/src/lib/types.ts` 1:1) |
| Seeded demo data | `web/src/lib/seed.ts` |
| Env-var template | `web/.env.example` |
| Architecture explanation | [`ARCHITECTURE.md`](ARCHITECTURE.md) |
| Transaction state diagram | [`docs/state-machine.md`](docs/state-machine.md) |
| Role & permission matrix | [`docs/roles-permissions.md`](docs/roles-permissions.md) |
| Security checklist | [`docs/security-checklist.md`](docs/security-checklist.md) |
| Legal & regulatory checklist | [`docs/legal-checklist.md`](docs/legal-checklist.md) |
| Phase 2 backlog | [`docs/phase2-backlog.md`](docs/phase2-backlog.md) |
| Automated tests | `web/src/lib/*.test.ts` (state machine, fees) + `web/e2e/smoke.mjs` |
| Manual QA script | [`docs/qa-script.md`](docs/qa-script.md) |
| Mocked integrations | [`docs/mocked-integrations.md`](docs/mocked-integrations.md) |

## Deployment

The build is a static SPA (`web/dist/`) deployable to Vercel as-is:

```bash
cd web && npx vercel deploy        # project root: TimekeepersExchange/web
```

`vercel.json` includes SPA rewrites and security headers. No environment variables are needed
for the demonstration build. Uses hash routing so it also runs from any static host.

## Honest status

- ✅ Working: full transaction lifecycle, all four portals, sealed bidding, inspection &
  report, disputes, audit trail, notifications, fee engine, demo scenarios, mobile-responsive.
- 🟡 Mocked (documented interfaces): payments/escrow, KYC, couriers, AI photo checks,
  email/SMS delivery, image storage (browser-local, downscaled).
- ❌ Not legal/compliance-ready: see [`docs/legal-checklist.md`](docs/legal-checklist.md).
  The software existing does not make the platform compliant.
