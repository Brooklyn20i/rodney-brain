-- Correctness (applied live via MCP 2026-07-06).
--
-- A plain UNIQUE constraint counts soft-deleted (deleted_at) rows, so deleting a
-- row and re-adding the same natural key throws a unique violation — e.g. delete
-- a monthly snapshot / budget category / FX rate, re-add it, boom. Replace the
-- constraint with a partial unique index that ignores tombstones, for the tables
-- written via plain INSERT.
--
-- NOT done for fitness.body_metrics / fitness.recovery_metrics: those are
-- written via UPSERT, and PostgREST's ON CONFLICT needs a real unique
-- constraint (a partial index can't be inferred). They keep the constraint and
-- are fixed app-side instead — the fitness store's upsert() now writes
-- deleted_at = null, so re-logging a deleted day updates the tombstone back to
-- live rather than silently staying deleted.

alter table financial.budget_categories drop constraint if exists budget_categories_owner_id_kind_key_key;
create unique index if not exists budget_categories_owner_kind_key_live
  on financial.budget_categories (owner_id, kind, key) where deleted_at is null;

alter table financial.budget_fx_rates drop constraint if exists budget_fx_rates_owner_id_currency_key;
create unique index if not exists budget_fx_rates_owner_currency_live
  on financial.budget_fx_rates (owner_id, currency) where deleted_at is null;

alter table financial.monthly_metrics drop constraint if exists monthly_metrics_owner_id_period_key;
create unique index if not exists monthly_metrics_owner_period_live
  on financial.monthly_metrics (owner_id, period) where deleted_at is null;

alter table financial.allocation_policies drop constraint if exists allocation_policies_owner_id_asset_class_key;
create unique index if not exists allocation_policies_owner_asset_class_live
  on financial.allocation_policies (owner_id, asset_class) where deleted_at is null;

alter table financial.risk_policies drop constraint if exists risk_policies_owner_id_metric_key_key;
create unique index if not exists risk_policies_owner_metric_key_live
  on financial.risk_policies (owner_id, metric_key) where deleted_at is null;
