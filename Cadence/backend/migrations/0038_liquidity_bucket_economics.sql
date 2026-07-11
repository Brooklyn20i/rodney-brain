-- 0038_liquidity_bucket_economics.sql
-- Cadence Financial — make a dollar of "cash" economically distinct.
--
-- Liquidity buckets previously carried only `amount` + `protected_minimum`, so
-- every cash dollar looked identical. In reality the "cash & offsets" headline
-- blends two very different things: cash sitting in a loan offset (earns the
-- loan rate, tax-free, capped at the loan balance) and cash in a savings
-- account (earns a headline rate, fully taxable, and — when held in a trust —
-- owned by a different entity than the person). This migration adds the three
-- attributes that separate them so the app can split "working as offset" from
-- "earning interest":
--   1. interest_rate  — annual rate as a decimal (e.g. 0.0465 = 4.65%)
--   2. tax_treatment  — 'offset' | 'taxable' | 'tax_free'
--   3. entity_id      — which entity owns the cash (personal / joint / trust)
-- Additive and idempotent; existing rows default to a tax-free offset at 0%.

set search_path to financial, public;

alter table liquidity_buckets add column if not exists interest_rate numeric(6,4) not null default 0;
alter table liquidity_buckets add column if not exists tax_treatment text not null default 'offset';
alter table liquidity_buckets add column if not exists entity_id uuid references entities(id) on delete set null;

alter table liquidity_buckets drop constraint if exists liquidity_buckets_tax_treatment_check;
alter table liquidity_buckets add constraint liquidity_buckets_tax_treatment_check
  check (tax_treatment in ('offset', 'taxable', 'tax_free'));
