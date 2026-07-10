-- Ace turn idempotency (additive; safe to run against live data).
--
-- The ace-chat Edge Function accepts a user turn by inserting a single
-- agent_messages row, then calls the model and may run write tools. If the
-- browser retries a send that failed after acceptance, we must not create a
-- second accepted turn (which would re-run create_task / update_task /
-- create_note). The client now stamps each distinct turn with a request id in
-- metadata.request_id and reuses it across transport retries; this partial
-- unique index makes a duplicate accepted turn impossible even under a
-- concurrent double-submit — the second INSERT raises unique_violation (23505),
-- which the function treats as "already accepted" and returns without touching
-- the model or tools.
--
-- Scope is deliberately narrow:
--   * only Ace user turns (recipient_key = 'agent:ace', sender_type = 'user')
--   * only rows that actually carry a request id
--   * only live rows (deleted_at is null), consistent with 0037
-- Existing rows — and every Kobe/other row, and any Ace row without a request
-- id — are excluded from the index and therefore completely unaffected.
--
-- No RLS change: indexes don't alter row visibility, and the function continues
-- to write under the caller's JWT (owner-scoped by cadence_can_access).

create unique index if not exists agent_messages_ace_user_request_live
  on public.agent_messages (owner_id, (metadata ->> 'request_id'))
  where recipient_key = 'agent:ace'
    and sender_type = 'user'
    and (metadata ->> 'request_id') is not null
    and deleted_at is null;
