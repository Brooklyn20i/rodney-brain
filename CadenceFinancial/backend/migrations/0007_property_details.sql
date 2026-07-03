-- Cadence Financial — richer property-investment fields
--
-- Extends `properties` with the acquisition economics, physical detail, lease
-- and depreciation data that a real property-investment tool needs so the app
-- can compute cash-on-cash, yield-on-cost, LVR, capital-growth CAGR, gearing
-- and after-depreciation tax position per property (see propertyCalc.ts).
--
-- All columns are nullable / defaulted, so existing rows and the CSV importer
-- stay valid. Idempotent (add column if not exists). Values are entered in-app.

alter table properties add column if not exists purchase_price      numeric(14,2);
alter table properties add column if not exists purchase_date       date;
alter table properties add column if not exists cash_invested       numeric(14,2);
alter table properties add column if not exists land_value          numeric(14,2);
alter table properties add column if not exists depreciation_annual numeric(12,2);
alter table properties add column if not exists property_type       text
  check (property_type is null or property_type in
         ('house','townhouse','unit','land','commercial','other'));
alter table properties add column if not exists bedrooms            integer;
alter table properties add column if not exists bathrooms           integer;
alter table properties add column if not exists car_spaces          integer;
alter table properties add column if not exists land_size_sqm       numeric(10,2);
alter table properties add column if not exists ownership_share     numeric(6,4);
alter table properties add column if not exists weekly_rent         numeric(12,2);
alter table properties add column if not exists lease_start         date;
alter table properties add column if not exists lease_end           date;
alter table properties add column if not exists tenant              text;
