# Cadence — Architecture & Roadmap

_Status: agreed direction, 2026-06-10. This is the reference doc; we build against it._

## 1. Decisions

1. **Cadence is one product with three front-ends on one shared backend:**
   - **Native iPhone/iPad app** — the flagship (SwiftUI; we already have a scaffold).
   - **Web app** — for the work PC and any browser (the PWA, rebuilt as a real client).
   - **Agent** — Hermes/Claude, via the same backend API.
2. **The backend is a managed cloud database and is the single source of truth.**
   Recommended: **Supabase** (managed Postgres + Auth + Row-Level Security +
   Realtime + auto REST and official Swift/JS SDKs). Free tier is ample to start.
3. **Sync is server-authoritative.** No more client-side merge, no gist, no JSON
   file as a store. Each client reads/writes the DB; Realtime pushes changes.
4. **One canonical schema** (below), defined once in the DB and shared by every
   client. We retire the three divergent schemas (`workItems` / `work_items` /
   Swift structs) in favour of it.

## 2. Target architecture

```
                ┌───────────────────────────────────────────────┐
                │              Supabase (cloud)                  │
                │  Postgres  •  Auth  •  Row-Level Security       │
                │  Realtime  •  auto REST API  •  Storage         │
                │            ← single source of truth →           │
                └───────────────────────────────────────────────┘
                   ▲                  ▲                   ▲
        Swift SDK  │       JS SDK     │      REST + key   │
            ┌──────┴──────┐   ┌───────┴───────┐   ┌───────┴────────┐
            │ Native app  │   │   Web app     │   │  Agent (MCP /  │
            │ iPhone/iPad │   │ (work PC etc) │   │  cadence_core) │
            │  SwiftUI    │   │  rebuilt PWA  │   │                │
            └─────────────┘   └───────────────┘   └────────────────┘
```

- Each device authenticates (your login). RLS guarantees you only ever see your
  own rows. The agent uses a service key scoped to your account.
- Offline: clients cache locally and reconcile with the server when back online
  (native via SwiftData/local cache; web via local cache + Realtime).
- **Screenshots/OCR stay on-device** — only extracted work items sync. (Privacy
  principle preserved from day one.)

## 3. Canonical data model (Postgres tables)

All rows carry `id uuid`, `owner_id uuid` (the account), `created_at`,
`updated_at` (server-managed), and a `deleted_at` for soft deletes.

| Table | Key fields |
|---|---|
| `projects` | name, goal, status(active/onHold/completed), health(green/amber/red), owner, target_date, next_action, color |
| `milestones` | project_id, title, due_date, done |
| `project_updates` | project_id, text, health, author, created_at |
| `work_items` | title, type(task/decision/followUp/waitingFor/risk/action), priority(high/medium/low), due_date, project_id, person_id, notes, done, inboxed, source, completed_at |
| `comments` | work_item_id, text, author |
| `people` | name, role, email, notes |
| `talking_points` | person_id, text, done, author |
| `decisions` | title, status(pending/decided/deferred), due_date, context, outcome |
| `notes` | title, body, (outliner markdown) |
| `outbox` | to, cc, subject, body, status(draft/queued/sent/cancelled), related_project_id, related_work_item_id, sent_at, sent_via |
| `links` | parent_type(project/work_item), parent_id, url, title |
| `activity` | actor, action, detail (audit trail) |

This is the existing `cadence_core.py` model, normalised into real tables.

## 4. Tech stack per layer

- **Backend:** Supabase. Schema + RLS as versioned SQL migrations in `backend/`.
- **Web app:** rebuilt from the single HTML file into a small, modular app with a
  build step (Vite). Keeps the current visual design and IA. Talks to Supabase
  via `supabase-js`. Deployed as static hosting (GitHub Pages or Netlify).
- **Native app:** the existing SwiftUI app, re-pointed from local-only SwiftData
  to the Supabase Swift SDK (SwiftData as the offline cache, Supabase as sync).
  Built/installed via Xcode on a Mac; distributed via TestFlight.
- **Agent:** `cadence_core.py` becomes a thin client over the Supabase REST API
  (instead of a local JSON file); the MCP server stays the same interface.

## 5. What we retire / consolidate

- ❌ Gist sync + token flow (replaced by real auth + server sync).
- ❌ `localStorage` as the store; ❌ `cadence_data.json` file store.
- ❌ Hand-duplicated `docs/` and `Cadence/docs/` (one web app, one deploy).
- ✅ Keep: the UX/IA, prioritisation logic, project/health/milestone model,
  outbox/agent bridge concept, on-device screenshot privacy.

## 6. Phased roadmap

- **Phase 0 — Foundation (no accounts needed yet):** write the Postgres schema +
  RLS policies + seed as SQL migrations; finalise this doc. _(I can do this now.)_
- **Phase 1 — Stand up the backend:** create the Supabase project, apply
  migrations, configure auth. _(Needs your Supabase account; ~10 min, I guide.)_
- **Phase 2 — Web app on the backend:** rebuild the PWA as a modular app with
  login + real sync. **You can use this immediately on the work PC and the iPad
  browser** — this is where the "it finally just syncs" moment happens.
- **Phase 3 — Native iPhone/iPad app:** wire the SwiftUI app to the backend.
  _(I write the code; you build/install on a Mac with Xcode + Apple Dev account.)_
- **Phase 4 — Agent on the backend:** repoint `cadence_core`/MCP to the API so
  Hermes/Claude drive the same data.
- **Phase 5 — Project-planning depth:** dependencies, timelines, richer reviews,
  notifications — built once, on a real DB, surfaced in every client.

## 7. What we need from you

1. A **Supabase account** (free) when we reach Phase 1 — I'll walk you through
   creating the project and pasting two keys into the clients.
2. For the native app: a **Mac with Xcode** to build, and an **Apple Developer
   account ($99/yr)** to install on your devices / TestFlight.
3. A choice of web hosting (GitHub Pages is fine to start).

## 8. Privacy & security posture

- Confidential data lives in a managed Postgres DB behind your login, protected
  by Row-Level Security — not a public repo, not a public gist.
- Screenshots and raw OCR text never leave the device; only resulting items sync.
- No analytics, no third-party trackers. Service keys kept out of the repo.
- Can migrate to self-hosted Postgres later without changing the clients.
