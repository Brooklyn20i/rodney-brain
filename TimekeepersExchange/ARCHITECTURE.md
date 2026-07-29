# Architecture

## What this MVP is

A React + TypeScript single-page application (Vite) with a **fully client-side mocked data
layer** that implements the entire domain: users and role profiles, submissions, valuations,
sealed bidding, the transaction state machine, logistics, inspections, disputes, notifications,
fees, and an append-only audit trail. The mock persists to `localStorage` and seeds realistic
demo scenarios on first load.

This shape was chosen deliberately for the MVP milestone: it demonstrates the complete managed
transaction **workflow** end to end with zero infrastructure, deploys anywhere as static files,
and keeps a crisp seam for the production backend.

## The production seam

Page components never touch data directly — they call actions on a single `Store`
(`web/src/lib/store.tsx`). Every action maps 1:1 to a server endpoint/RPC:

```
UI pages ──> Store actions (acceptOffer, submitInspection, releaseSettlement, …)
                 │  MVP: in-memory Db + localStorage
                 └─ Production: API client → Next.js/Supabase RPC → Postgres (RLS)
```

Replacing `store.tsx` with an API client is the entire migration surface. The relational
schema in `docs/schema.sql` mirrors `web/src/lib/types.ts` 1:1, so the domain model carries
over unchanged.

## Module map

| Module | Responsibility |
|---|---|
| `lib/types.ts` | Canonical domain model (source of truth) |
| `lib/stateMachine.ts` | Transaction states, legal transitions, outcome mapping, per-state guidance (what's next / who's responsible / what's binding) |
| `lib/fees.ts` | Fee engine — transparent, itemised; no hidden spread |
| `lib/ai.ts` | Mock AI: identification, valuation from mock comparables, photo QA, buyer summaries, serial masking. Every conclusion carries confidence/evidence/limitations/human-review |
| `lib/store.tsx` | All domain actions + audit + notifications + persistence |
| `lib/seed.ts` | Demo scenarios (GMT live bidding, AP discrepancy, vintage Heuer, completed Omega, Santos in queue) |
| `components/` | Design system components + public/portal layouts |
| `pages/{public,seller,buyer,admin,watchmaker,shared}` | Route components per role |

## Key invariants (enforced in code)

1. **The watch stays with the seller until an offer is accepted** — shipping actions only
   exist on transactions, which only exist after acceptance.
2. **Illegal state transitions throw** — `moveState()` validates against the transition table;
   the state machine is unit-tested.
3. **Sealed bidding** — buyers query only their own offers; the seller sees counts/highest
   (configurable), never buyer identities before acceptance.
4. **KYC before acceptance** — `acceptOffer` refuses unless the seller profile is verified.
5. **Transaction limits** — `placeOffer` refuses offers above the buyer's approved limit,
   and opportunities are visible only to invited, verified (and where flagged,
   vintage-approved) buyers.
6. **Everything audited** — every mutation appends an `AuditEvent`; nothing sensitive is
   hard-deleted (status changes / soft deletion only).
7. **AI never claims authenticity** — identification is labelled preliminary; authentication
   happens physically, after acceptance.

## Production target stack (unchanged from the brief)

Next.js + TypeScript + Tailwind on Vercel; Postgres via Supabase (RLS per
`docs/roles-permissions.md`); Supabase Auth (email/password, magic link, Google/Apple, MFA);
object storage with signed URLs (no public buckets); background jobs for notifications and
PDF report generation; Stripe Connect (or equivalent AU-compatible provider) for managed
payments — **no platform-held wallet**; KYC via Stripe Identity / Persona / FrankieOne;
insured courier abstraction (AusPost / DHL / FedEx / specialist). Interfaces for each are
documented in `docs/mocked-integrations.md`.

## Design system

Single stylesheet (`src/styles.css`) with design tokens: warm ivory ground, charcoal/graphite
ink, muted oxblood + olive accents, restrained gold; Fraunces (editorial serif) for headings
with Georgia fallback, Inter for product/pricing data; generous spacing, restrained motion,
no discount/bargain visual language.
