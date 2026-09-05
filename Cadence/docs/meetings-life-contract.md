# Meetings and Life: persistence contract

## Meetings

- Executable commitments are `public.work_items`. A meeting is a dated `notes` row under `__mtg__<person-or-series-id>`; canonical action ownership lives on the work item, not prose.
- New meeting notes contain rich-text HTML. Legacy `{agenda,actions,notes}` bodies remain readable and are not rewritten on open. When edited, `meetingDocumentBody()` preserves all original JSON keys/identifiers and stores the current rich narrative in `document_html`; `meetingDocHtml()` and previews read that overlay first. Original structured arrays are compatibility/history, not a second independently updated task board.
- Agent edits must inspect the existing body. Preserve original structured fields and update `document_html` when present. Do not replace HTML with legacy JSON, or flatten legacy JSON and discard identifiers. Narrow tidying must not create/complete actions implicitly.
- New action capture includes person/series links and note provenance, with a stable work-item UUID for retry. Reopening a meeting derives current open commitments from the same canonical rows, not duplicated meeting-local arrays.
- `I owe` creates a filed task; `they owe` creates filed `waitingFor`. Source provenance alone does not assign work to Kobe. Group meetings require a named person for delegated work.
- Critical meeting saves use strict server-acknowledged writes. Offline/failed is not saved. Failed drafts stay open; navigation must not discard an unacknowledged edit.

## Life

- Personal tasks and recurring obligations live only in `life.life_items` and `life.obligations`. They are not Financial actuals or Work tasks. This release does not move existing private records between domains.
- Deploy additive prerequisites `0049_life_schema.sql` and `0050_life_completion_integrity.sql` before merging dependent UI. Expose only the `life` API schema in addition to the existing schema allowlist; no anonymous table access.
- User-owned RLS restricts Life records. Composite owner/parent constraints prevent cross-owner completion links. Ordinary clients cannot fabricate, mutate or delete obligation completion history.
- Complete a recurring cycle through `life.complete_obligation(p_obligation_id,p_expected_due,p_today)`. The fixed-search-path, owner-checked function locks the obligation, records one history row per original due date, and advances to the first future interval atomically. Retrying the same due-date request returns the prior result; it does not advance again.
- A future renewal can be explicitly completed early; its next date advances by at least one interval. Monthly day-of-month clamping matches normal calendar arithmetic. No bank payment or financial ledger entry is implied by completion.
- `life_completion_assertions.sql` is test-only, mode-guarded, and must run inside a transaction that rolls back. It is deliberately outside the numbered migrations.

## Release gates

Focused failure-path tests, full type/lint/unit/static/build gates, responsive browser workflows, independent exact-diff review, migration replay/RLS assertions, green PR and main CI, production commit readback, authenticated disposable workflow and cleanup. A rendered shell alone does not demonstrate persistence.
