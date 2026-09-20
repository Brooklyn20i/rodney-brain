# Cadence iPhone — Product Brief

## Product decision

Cadence will become a native iPhone control surface for the human-agent operating system, backed by the existing Supabase source of truth.

It will not be a thin website wrapper and it will not duplicate the entire desktop product before delivering value.

## Job to be done

On iPhone, a human must be able to open Cadence and immediately understand:

1. What needs my attention?
2. What have my agents completed?
3. What requires my decision or approval?
4. What is at risk or overdue?
5. What can I capture or delegate now?

## Product architecture

- **Backend:** existing Supabase Auth, Postgres, RLS, Realtime and Edge Functions.
- **Native client:** SwiftUI, iOS 17+, iPhone-first and iPad-compatible.
- **Shared context:** the same people, meetings, decisions, commitments, evidence and agent-message records used by the web app and MCP agents.
- **Authentication:** Supabase user session, persisted in Keychain; no service-role or agent credentials in the app.
- **Offline:** encrypted local read cache and queued low-risk capture; server remains authoritative.
- **Agent boundary:** Ace is the native in-app agent. Kobe remains Rodney's external control layer.

## v0.1 vertical slice

The first production-grade slice must prove the complete native path rather than reproduce every screen:

1. Native email/password authentication against Supabase.
2. Secure session restoration and sign-out.
3. Native executive brief showing open decisions, overdue work, due-today work and waiting-on commitments from the live workspace.
4. Pull-to-refresh and explicit loading, empty and failure states.
5. One governed write path: complete an existing work item with a server acknowledgement and no optimistic false completion.
6. iPhone-first navigation and safe-area behaviour.
7. Unit tests for request construction, decoding, brief classification and write acknowledgement.
8. Simulator build and exercised UI before merge.

## v0.2

- Native Ace conversation with visible approval requests and evidence.
- Quick Capture for text, voice, photo/share-sheet and meeting notes.
- Push notifications for decisions, approvals and material exceptions.
- Deep links into decisions, work items, meetings and agent outputs.
- Realtime updates and resilient offline capture.

## v0.3 / TestFlight-ready breadth

- Meetings and decision detail.
- Human-agent activity and evidence timeline.
- Workspace and account settings.
- Privacy controls, export and deletion entry points.
- Production telemetry, crash reporting and support diagnostics without private-content leakage.
- Accessibility, Dynamic Type, VoiceOver, reduced-motion and complete phone-size QA.
- TestFlight distribution, App Store privacy declarations and review assets.

## Explicit exclusions from the first slice

- Rebuilding every Work, Wealth and Health screen natively.
- Embedding privileged MCP or service-role credentials.
- A generic chatbot detached from Cadence context.
- Unapproved autonomous high-risk actions.
- A WebView-only App Store shell.

## Acceptance gates

The first slice is complete only when:

- the project targets iPhone and iPad;
- credentials are never logged or committed;
- authentication and reads use the user's RLS-scoped token;
- failed writes remain visibly incomplete;
- tests pass;
- the app builds and launches in an iPhone simulator;
- the brief renders realistic synthetic data without clipping;
- the exact reviewed commit is the one proposed for merge;
- TestFlight/App Store release remains approval-gated.

## Delivery constraint discovered 2026-09-20

The Mac currently has Apple Command Line Tools and Swift 6.2, but not the full Xcode application. Core networking and domain logic can be built and tested with Swift Package Manager now. iPhone simulator, signing, archive and TestFlight verification require full Xcode plus Rodney's Apple Developer team selection.
