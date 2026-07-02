-- Cadence Financial — add amount_aud to investment_transactions
--
-- The app's currency-mixing fix (see git history) added `amount_aud` to the
-- TypeScript InvestmentTransaction type -- the AUD-equivalent amount at
-- purchase date, required because a foreign-currency transaction has no
-- single "current" FX rate that correctly restates it after the fact. This
-- migration catches the Postgres schema up: 0001_init.sql predates that fix.
--
-- Backfilled to `amount` for existing rows (correct for AUD-currency rows;
-- an approximation for any already-imported foreign-currency rows until
-- corrected with the real historical FX-converted figure).

alter table investment_transactions
  add column if not exists amount_aud numeric(14,2) not null default 0;

update investment_transactions
  set amount_aud = amount
  where amount_aud = 0;
