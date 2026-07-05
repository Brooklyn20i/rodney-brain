-- 0030_pin_function_search_paths.sql
-- Security advisor: function_search_path_mutable. Pin search_path on trigger
-- helpers. No-table-reference functions are locked to empty; the two that
-- reference public tables are pinned to public. Applied to the live project
-- (uimjzehrykeebocphdna) via MCP 2026-07-05.
alter function public.set_updated_at() set search_path = '';
alter function financial.set_updated_at() set search_path = '';
alter function fitness.set_updated_at() set search_path = '';
alter function public._activity_append_only() set search_path = '';
alter function public._reject_owner_id_change() set search_path = '';
alter function public._validate_milestone_owner() set search_path = public;
alter function public._validate_work_item_owner() set search_path = public;
