# Cadence Work — UX Review & Improvement Roadmap (July 2026)

**Scope:** the Work domain of the Cadence PWA (`Cadence/web/`), reviewed after two weeks of daily use on iPad/iPhone/PC. Financial and Health domains are out of scope except where they share infrastructure.

**Verdict in one paragraph:** Cadence Work has a strong data model, a well-factored logic layer (`lib/selectors.ts`, `lib/tasks.ts`) and three genuinely good surfaces — People, Meetings and Dashboard — built on patterns worth propagating (split master-detail, health-tinted stat tiles). But Projects and Tasks, the two screens where daily work actually happens, don't use those patterns: Projects is a 1,036-line god-file with four competing health-colour systems and a junk-drawer "Advanced" tab; Tasks is a filtered list with no detail view and a fragile meeting-action filing flow. Ace, the built-in assistant, has solid plumbing but only two entry points. The fix is not a rewrite — it's propagating the app's own best patterns into its weakest screens and letting Ace meet the user where the work is.

---

## 1. What's working (keep and propagate)

| Pattern | Where it lives | Why it works |
|---|---|---|
| Split master-detail | `People.tsx`, `Meetings.tsx` (`split-view` CSS) | Persistent selection, scannable list + rich detail, iPad-native. The single best UX in the app. |
| Health-tinted stat tiles | `Dashboard.tsx` (`dash-card`, `dash-stat-num/lbl`) | Answers "where do I look first?" at a glance; urgency sorting means the top-left card is always the most important one. |
| Avatar + initials + colour system | People/Dashboard/pickers | Consistent identity language across screens. |
| Inline quick-add & click-to-edit | People detail (topics, notes) | Zero-friction capture in context — no modal round-trip. |
| Collapsible "Recently done" | People detail | History without noise. |
| Token-swap theming | `styles.css` `:root` + `html[data-domain]` | The whole app reskins per domain by swapping ~20 CSS variables. |
| Pure logic layer | `lib/selectors.ts` (510 lines), `lib/tasks.ts` | React-free, testable, single source of business truth. The screens should lean on it far more than they do. |
| Offline-first writes | `lib/store.tsx` + `offlineQueue.ts` | Optimistic updates, client UUIDs, replay-safe. Invisible when it works — which is the point. |

## 2. Information architecture problems

1. **Dashboard is an orphan.** It's routed (`App.tsx:258`) and deep-links work (`onNavigate('dashboard')`), but it has no entry in `WORK_NAV` (`Sidebar.tsx:7-24`). A screen the user likes is unreachable from the nav.
2. **Idiosyncratic vocabulary.** "Rodney To Do", "Quick Capture", "Filed Work" label screens whose ids are `today`, `inbox`, `tasks`. Recognition-over-recall says plain nouns win; the ids already agree. *(Decision: rename to Today / Inbox / Tasks.)*
3. **Overlapping surfaces.** Today, Tasks, Board and Review all show slices of the same `work_items`, with different grouping logic on each screen. Board in particular duplicates the Task hub's job with a drag interface that is unreliable inside iPad Safari scroll containers. **Recommendation:** once the unified Task Hub ships (Phase 3), demote or retire Board.
4. **Sidebar grouping.** "Control" vs "Work" split is sensible, but Notes sits in Control while Projects/People/Meetings sit in Work; Dashboard is missing entirely. Regroup: **Control** (Dashboard, Today, Inbox, Calendar) · **Work** (Projects, Tasks, People, Meetings, Notes, Board) · **Agents** (Ace).

## 3. Screen-by-screen review

### Projects (`screens/Projects.tsx`, 1,036 lines) — the weakest screen
- **God-file:** ~20 components in one file (ProjectCard, ProjectDetail, ProjectControlSheet, UpdateTab, PlanTab, AdvancedTab, ProjectModal, StrategyModal, ScoreboardView, …). Unmaintainable and the reason drift keeps creeping in.
- **Four competing health systems:** `HEALTH_COLOR/HEALTH_BG/HEALTH_LABEL` (Projects.tsx:201-203), `HEALTHS` (:268), `HEALTH_PILL` (:741) and another `HEALTH_LABEL` in `Dashboard.tsx:20`. The same project health can render in different colours on different screens — a live consistency bug class.
- **No master-detail.** Projects uses full-screen push navigation while People (which the user likes) uses split view. The list view can't show a project's context while scanning.
- **"Advanced" tab is a junk drawer** (Phases + RACI + RAID + links + completed items). Nothing called "Advanced" is scannable.
- **`next_action` is editable in two tabs** (Control sheet and Plan) with duplicated local-state/onBlur logic — edits in one can silently clobber the other.
- **Schema-drift handling smeared through the UI:** inserts wrap regexes on error messages (`/does not exist|relation/i`) to show "run migration 0006" banners. This concern already has a proper home in `lib/supabaseWrite.ts` (`dropMissingColumn`).
- **Portfolio grouping is hard-coded:** `selectors.ts:262-266` matches literal project names ("promace", "itppm", "tendering") by regex. Renaming a project silently re-buckets it.
- **Strategy/KPIs as JSON-in-notes** (`__CADENCE_STRATEGY__`) is a *deliberate* privacy design (`strategy.ts` header: confidential text stays behind auth, off the static site). Keep the storage; improve the surfacing.

### Tasks / "Filed Work" (`screens/Tasks.tsx`, 271 lines)
- **Shows only "filed" tasks** — the user's full open-work picture is split across Today (do now), Inbox (unprocessed), Tasks (filed) and Board. No single place answers "what's on my plate?"
- **No detail view.** Editing means opening `ItemModal` — a modal round-trip for every field change, vs People's in-context editing.
- **Third copy of date-bucket logic** (`dueBucket`, Tasks.tsx:29-36) alongside `Inbox.tsx`'s `bucketOf` and `selectors.ts`'s `getTodoGroups` buckets. Three implementations of overdue/today/week/later that can (and will) drift.
- **Meeting-action filing is fragile:** `fileAction` (Tasks.tsx:121-148) manually parses/serialises meeting-note JSON with `useRef<Set>` double-tap guards and "re-read the freshest body" workarounds. It works, but it's a concurrency patch, not a design — and it's conceptually duplicated in `Meetings.tsx` (`handleSend`).

### Today (`Today.tsx`, 195 lines) — good bones
Do now / Decide / 1:1s / Waiting / With Kobe is the right cockpit. Weaknesses: the header title ("Rodney To Do / Control") and footnote expose internal jargon; inline styles throughout; will benefit from the shared stat-tile strip and the Ace briefing echo.

### Dashboard (`Dashboard.tsx`, 258 lines) — good, orphaned
The best summary surface in the app, unreachable from the nav. Should become the briefing home: Ace daily briefing card, "Needs attention" (stale work), KPI tiles from the strategy note.

### People (`People.tsx`, 531) & Meetings (`Meetings.tsx`, 537) — the reference UX
Master-detail, tabbed detail, quick-add, recently-done. Main debts: heavy inline styles, and `MeetingNoteModal.tsx` at 924 lines needs decomposition eventually (not this pass). Meeting groups piggybacking on the `people` table (`type='meeting_group'`) is odd but harmless and shared with other clients — leave it.

### Ace (`screens/Ace.tsx` + `backend/functions/ace-chat/`)
Plumbing is genuinely good: auth-gated agentic tool loop, idempotent request ids (migration 0041's partial unique index), realtime delivery, workspace-scoped tools. UX gaps:
- **Destination, not assistant.** Using Ace means leaving your context and navigating to a chat tab, then describing what you were looking at. Assistants earn use when they're one tap away *in context*.
- **Only two entry points** (the Ace screen, and PrepBriefPanel's summary button — which has its own duplicate wiring instead of a shared client).
- **Purely reactive.** Ace never volunteers anything: no daily briefing, no stale-work nudges, no meeting prep unless asked.

## 4. Cross-cutting duplication (fix once, in `lib/`)

| Duplication | Copies | Consolidation |
|---|---|---|
| Health → label/colour/bg maps | 4 (Projects ×3, Dashboard ×1) | `lib/health.ts` |
| Due-date bucketing | 3 (Tasks, Inbox, selectors) | `lib/dateBuckets.ts` |
| `next_action` editors | 2 (Control sheet, Plan tab) | one `NextActionEditor` |
| Meeting-action → task filing | 2 (Tasks, Meetings) | `lib/meetingActions.ts` |
| Ace send/thread wiring | 2 (Ace.tsx, PrepBriefPanel) | `lib/aceClient.ts` |
| Stat-tile markup | 3+ (Dashboard, Today load strip, ad-hoc) | `components/StatTile.tsx` |

Plus: ~2,160-line single stylesheet undermined by dozens of inline `style={{}}` objects in the screens — styling truth is split between two places.

## 5. The Ace integration model

**Contextual ("Ace everywhere"):** a slide-over panel (right sheet on iPad/desktop, full sheet on phone) openable from any screen, rendering the *same* `agent:ace` thread as the Ace screen, with a pre-filled, user-editable prompt. Entry points: project detail (Summarise / Draft update / What's at risk), task detail (break down, draft follow-up), person detail (prep my 1:1), meeting notes (summarise actions). Prompts are pure builder functions (`lib/acePrompts.ts`) so they're unit-testable without an LLM. No backend change needed.

**Proactive:** three tiers, cheapest first —
1. *Deterministic flags (no LLM):* stale tasks/projects (~14 days untouched) computed in `selectors.ts`, shown as chips and a Dashboard "Needs attention" card. Instant, free, works offline.
2. *Daily briefing (auto):* on first open of the day, the Dashboard auto-fires a briefing prompt with deterministic request id `briefing:<date>`; migration 0041's unique index makes double-fires harmless and repeated opens just re-read today's message. **Trade-off noted:** a scheduled edge function could generate briefings before the app opens (push-style), but needs pg_cron + secret plumbing and generates briefings on days the app never opens. Client-triggered wins for a single daily user; revisit if push notifications are ever wanted.
3. *Meeting prep:* today's meetings surfaced on Today/Dashboard with one-tap "Prep me" into the Ace panel.

## 6. Roadmap (each phase merges to `main` independently)

| Phase | What ships |
|---|---|
| 0 | This document |
| 1 | `lib/health.ts` + `lib/dateBuckets.ts` consolidation (zero visual change) |
| 2 | Nav IA: Dashboard in sidebar, plain names (Today/Inbox/Tasks), regrouped sections |
| 3 | **Task Hub**: all open tasks, stat strip, lane filters (Mine/Waiting/Agent), due-bucket grouping, split-view detail panel, robust meeting-action filing |
| 4 | **Projects redesign**: master-detail, Overview/Plan/Governance tabs, single next-action editor, portfolio as a real DB column (additive migration, regex fallback) |
| 5 | **Ace everywhere**: aceClient/acePrompts extraction, slide-over AcePanel, contextual actions on projects/tasks/people/meetings |
| 6 | **Proactive Ace**: staleness flags, auto daily briefing, meeting prep surfacing |
| 7 | Design-system pass: spacing/type tokens, shared StatTile, inline-style sweep, Dashboard as briefing+KPI home; Board retirement decision |

**Contract safety throughout:** `lib/types.ts` is the canonical contract shared with the Swift and Python clients — additive, nullable migrations only; JSON-in-notes formats preserve unknown keys (`meetingData.ts` already does this).

**Verification per phase:** `npm run test:all` (typecheck, eslint --max-warnings 0, check-cadence, vitest) pre-merge; unit tests on every new lib module; workflow tests via the e2e provider mock; `npm run smoke:prod` after the Vercel deploy goes green.
