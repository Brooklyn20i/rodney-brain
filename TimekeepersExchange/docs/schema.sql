-- ============================================================================
-- The Timekeeper's Exchange — relational schema (PostgreSQL / Supabase)
-- Mirrors web/src/lib/types.ts 1:1. Apply with psql or as a Supabase migration.
-- Conventions:
--   * No hard deletes on financial/transaction records — soft delete via
--     status columns + deleted_at where applicable.
--   * Every state change is written to audit_event (enforced in the API layer;
--     optionally by triggers).
--   * Row-level security: see docs/roles-permissions.md for the policy matrix.
-- ============================================================================

create type user_role as enum ('seller','buyer','admin','watchmaker');
create type kyc_status as enum ('not_started','in_progress','verified','failed');
create type buyer_status as enum ('applicant','under_review','verified','suspended','rejected');
create type buyer_type as enum ('dealer','professional_trader','collector','institutional');
create type submission_status as enum ('draft','submitted','under_review','info_required',
  'approved_for_offers','bidding_closed','offer_accepted','sold','declined','withdrawn','suspended');
create type watch_category as enum ('standard','vintage','specialist');
create type watch_condition as enum ('unworn','excellent','very_good','good','fair');
create type bidding_mode as enum ('sealed','managed_auction');
create type offer_type as enum ('binding_cash','subject_to_inspection','subject_to_conditions');
create type offer_status as enum ('active','accepted','declined','expired','withdrawn','lost');
create type transaction_state as enum ('offer_accepted','payment_authorised','awaiting_shipment',
  'in_transit_to_authentication','received_at_authentication','inspection_in_progress',
  'inspection_complete','buyer_review','resolution','settlement','in_transit_to_buyer',
  'completed','cancelled','disputed');
create type shipment_leg as enum ('seller_to_authenticator','authenticator_to_buyer');
create type shipment_status as enum ('label_generated','in_transit','delivered');
create type inspection_status as enum ('assigned','draft','submitted');
create type inspection_outcome as enum ('passed_as_described','passed_minor_discrepancy',
  'passed_material_discrepancy','inconclusive','failed','suspected_stolen_or_altered',
  'requires_manufacturer_review');
create type section_verdict as enum ('pass','note','issue','na');
create type dispute_type as enum ('condition_discrepancy','aftermarket_part','incorrect_accessory',
  'shipping_damage','payment_issue','authenticity_concern','seller_withdrawal','buyer_default','lost_shipment');
create type dispute_status as enum ('open','evidence','proposed_resolution','resolved','closed');
create type photo_angle as enum ('dial_straight_on','case_front','caseback','crown_side',
  'opposite_side','clasp','full_bracelet','bracelet_stretch','reference_serial','box','papers',
  'service_documents','visible_defects');

-- --- identity ---------------------------------------------------------------

create table app_user (
  id uuid primary key default gen_random_uuid(),
  role user_role not null,
  name text not null,
  email citext unique not null,
  phone text,
  created_at timestamptz not null default now(),
  deleted_at timestamptz            -- soft delete only
);

create table seller_profile (
  user_id uuid primary key references app_user(id),
  location text not null,           -- city only is ever shown to buyers
  state text not null,
  kyc_status kyc_status not null default 'not_started',
  legal_name text,
  date_of_birth date,               -- encrypt at rest (pgcrypto / vault)
  residential_address text,         -- never disclosed to buyers
  id_document_uploaded boolean default false,
  bank_account_confirmed boolean default false,
  ownership_declaration_accepted boolean default false,
  not_stolen_declaration_accepted boolean default false,
  payout_account_masked text
);

create table identity_verification ( -- provider-side KYC record
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references app_user(id),
  provider text not null,           -- stripe_identity | persona | frankieone
  provider_ref text not null,
  status kyc_status not null,
  created_at timestamptz not null default now()
);

create table buyer_profile (
  user_id uuid primary key references app_user(id),
  status buyer_status not null default 'applicant',
  buyer_type buyer_type not null,
  business_name text,
  abn text,
  business_address text,
  gst_registered boolean,
  dealer_licence text,
  transaction_limit numeric(12,2) not null default 0,
  preferred_brands text[] not null default '{}',
  price_range_min numeric(12,2),
  price_range_max numeric(12,2),
  shipping_address text,
  trust_score int not null default 0 check (trust_score between 0 and 100),
  vintage_approved boolean not null default false,
  proof_of_funds_provided boolean not null default false,
  settled_count int not null default 0,
  defaulted_count int not null default 0
);

create table watchmaker_profile (
  user_id uuid primary key references app_user(id),
  business_name text not null,
  location text not null,
  accreditations text[] not null default '{}',
  specialisms text[] not null default '{}'
);

create table payout_account (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references app_user(id),
  provider_ref text not null,       -- token at the payment provider; no raw account numbers
  masked text not null,
  verified_at timestamptz
);

-- --- submissions ------------------------------------------------------------

create table watch_submission (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid not null references app_user(id),
  status submission_status not null default 'draft',
  category watch_category not null default 'standard',
  brand text not null default '',
  model text not null default '',
  reference text not null default '',
  year text not null default '',
  case_material text not null default '',
  dial_colour text not null default '',
  bracelet_or_strap text not null default '',
  condition watch_condition not null default 'excellent',
  box_included boolean not null default false,
  papers_included boolean not null default false,
  service_history text not null default '',
  polishing_history text not null default '',
  aftermarket_parts text not null default '',
  known_flaws text,
  seller_location text not null default '', -- city only
  sale_timing text not null default '',
  minimum_price numeric(12,2),      -- private reserve; never exposed to buyers
  purchase_info text,
  serial_encrypted bytea,           -- full serial encrypted; only masked form served
  serial_masked text not null default '',
  ai_identification jsonb,          -- {brand,model,likelyReference,confidence,evidence[],limitations[],humanReviewRequired}
  valuation jsonb,                  -- indicative valuation payload
  buyer_summary text,
  headline text,
  info_requests text[] not null default '{}',
  flagged_enhanced_inspection boolean not null default false,
  restricted_to_vintage_buyers boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table watch_image (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references watch_submission(id),
  angle photo_angle not null,
  storage_key text,                 -- private bucket; served via signed URLs only
  file_name text,
  ai_checks jsonb,                  -- {watchDetected,sharpness,notes[],confidence}
  uploaded_at timestamptz,
  unique (submission_id, angle)
);

create table watch_document (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references watch_submission(id),
  kind text not null,               -- papers | service | receipt | other
  storage_key text not null,
  uploaded_at timestamptz not null default now()
);

create table admin_note (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references watch_submission(id),
  author_id uuid not null references app_user(id),
  text text not null,
  created_at timestamptz not null default now()
);

create table stolen_watch_check (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references watch_submission(id),
  provider text not null,           -- e.g. police register / insurer database
  result text not null,             -- clear | flagged | error
  checked_at timestamptz not null default now()
);

-- --- bidding ----------------------------------------------------------------

create table bid_window (
  submission_id uuid primary key references watch_submission(id),
  mode bidding_mode not null default 'sealed',
  opens_at timestamptz not null,
  closes_at timestamptz not null,
  reserve numeric(12,2),
  minimum_increment numeric(12,2),
  extensions_used int not null default 0,
  seller_sees_leading_price boolean not null default true
);

create table buyer_invitation (
  submission_id uuid not null references watch_submission(id),
  buyer_id uuid not null references app_user(id),
  invited_at timestamptz not null default now(),
  primary key (submission_id, buyer_id)
);

create table offer (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references watch_submission(id),
  buyer_id uuid not null references app_user(id),
  amount numeric(12,2) not null check (amount > 0),
  type offer_type not null,
  conditions text,
  note_to_admin text,
  validity_days int not null default 7,
  status offer_status not null default 'active',
  binding_acknowledged boolean not null default false,
  created_at timestamptz not null default now()
);
create index on offer (submission_id, status);

-- --- transactions -----------------------------------------------------------

create table transaction (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references watch_submission(id),
  offer_id uuid not null references offer(id),
  seller_id uuid not null references app_user(id),
  buyer_id uuid not null references app_user(id),
  watchmaker_id uuid references app_user(id),
  state transaction_state not null default 'offer_accepted',
  accepted_amount numeric(12,2) not null,
  amended_amount numeric(12,2),
  fees jsonb not null,              -- immutable FeeBreakdown snapshot at acceptance
  payment_authorised_at timestamptz,
  settlement_released_at timestamptz,
  completed_at timestamptz,
  cancellation_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table transaction_event (    -- timeline; append-only
  id bigint generated always as identity primary key,
  transaction_id uuid not null references transaction(id),
  at timestamptz not null default now(),
  state text not null,
  label text not null,
  actor text not null
);

create table payment (              -- provider-side records; platform never holds funds
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references transaction(id),
  provider text not null,           -- stripe_connect | escrow_provider
  provider_ref text not null,
  kind text not null,               -- authorisation | capture | payout | refund | adjustment
  amount numeric(12,2) not null,
  status text not null,
  created_at timestamptz not null default now()
);

create table fee (                  -- itemised, disclosed fees per transaction
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references transaction(id),
  payer user_role not null,
  kind text not null,               -- seller_fee | buyer_platform_fee | authentication | shipping | gst
  amount numeric(12,2) not null
);

-- --- logistics --------------------------------------------------------------

create table shipment (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references transaction(id),
  leg shipment_leg not null,
  carrier text not null,
  tracking_number text not null,
  insured_value numeric(12,2) not null,
  status shipment_status not null default 'label_generated',
  label_generated_at timestamptz not null default now(),
  delivered_at timestamptz
);

create table insurance_policy (
  id uuid primary key default gen_random_uuid(),
  shipment_id uuid not null references shipment(id),
  provider text not null,
  policy_ref text not null,
  insured_value numeric(12,2) not null
);

create table chain_of_custody_event ( -- append-only
  id bigint generated always as identity primary key,
  transaction_id uuid not null references transaction(id),
  at timestamptz not null default now(),
  actor text not null,
  event text not null
);

-- --- inspection -------------------------------------------------------------

create table inspection (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid unique not null references transaction(id),
  watchmaker_id uuid not null references app_user(id),
  status inspection_status not null default 'assigned',
  timegrapher_rate text,
  amplitude text,
  beat_error text,
  outcome inspection_outcome,
  discrepancy_summary text,
  service_recommendation text,
  conclusion text,
  report_number text unique,
  submitted_at timestamptz
);

create table inspection_item (
  inspection_id uuid not null references inspection(id),
  section text not null,            -- one of the 20 fixed sections
  verdict section_verdict not null default 'pass',
  notes text not null default '',
  measurements text,
  primary key (inspection_id, section)
);

create table inspection_image (
  id uuid primary key default gen_random_uuid(),
  inspection_id uuid not null references inspection(id),
  section text,
  storage_key text not null,
  uploaded_at timestamptz not null default now()
);

-- authentication_report is generated from inspection + items (view or job);
-- persisted PDFs are stored in private object storage keyed by report_number.

-- --- disputes ---------------------------------------------------------------

create table dispute (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references transaction(id),
  type dispute_type not null,
  status dispute_status not null default 'open',
  owner_id uuid not null references app_user(id),
  summary text not null,
  proposed_resolution text,
  financial_adjustment numeric(12,2),
  final_decision text,
  opened_at timestamptz not null default now()
);

create table dispute_message (
  id bigint generated always as identity primary key,
  dispute_id uuid not null references dispute(id),
  at timestamptz not null default now(),
  author text not null,
  text text not null
);

-- --- platform ---------------------------------------------------------------

create table message (              -- platform-mediated Q&A (no direct buyer↔seller contact)
  id uuid primary key default gen_random_uuid(),
  submission_id uuid references watch_submission(id),
  transaction_id uuid references transaction(id),
  from_user uuid not null references app_user(id),
  via_admin boolean not null default true,
  body text not null,
  created_at timestamptz not null default now()
);

create table notification (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references app_user(id),
  at timestamptz not null default now(),
  title text not null,
  body text not null,
  link text,
  read boolean not null default false
);

create table review (               -- structured post-completion feedback
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references transaction(id),
  author_id uuid not null references app_user(id),
  scores jsonb not null,            -- {communication, accuracy, timeliness}
  comment text,
  created_at timestamptz not null default now()
);

create table audit_event (          -- append-only; every state change
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  actor_id uuid,
  actor_name text not null,
  action text not null,
  entity text not null,
  entity_id text not null,
  detail text,
  ip inet,                          -- device/IP logging architecture
  device text
);

create table fee_config (
  id int primary key default 1 check (id = 1),
  seller_flat_fee numeric(12,2) not null,
  buyer_fee_pct numeric(6,4) not null,
  buyer_fee_min numeric(12,2) not null,
  authentication_fee numeric(12,2) not null,
  shipping_fee numeric(12,2) not null,
  gst_rate numeric(4,3) not null default 0.10
);
