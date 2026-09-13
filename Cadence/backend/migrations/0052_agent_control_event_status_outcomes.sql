-- Cadence — explicit agent-control terminal outcomes
--
-- `failed` remains a terminal status for genuine technical/runtime failures.
-- Safe or authority-preserving stops are not failures: use these explicit
-- terminal statuses so reporting does not misclassify correct control outcomes.
--
-- This migration is deliberately additive and does not rewrite historical rows.
-- Historical failed rows can only be reclassified with a separately reviewed,
-- deterministic evidence rule.

alter table public.agent_control_events
  drop constraint if exists agent_control_events_status_check;

alter table public.agent_control_events
  add constraint agent_control_events_status_check
  check (status in (
    'pending',
    'processing',
    'processed',
    'failed',
    'ignored',
    'requires_approval',
    'blocked_authorization',
    'refused_safely'
  ));

comment on column public.agent_control_events.status is
  'Lifecycle/status: pending, processing, processed, ignored, failed for technical errors, or explicit safety/authority outcomes requires_approval, blocked_authorization, refused_safely.';
