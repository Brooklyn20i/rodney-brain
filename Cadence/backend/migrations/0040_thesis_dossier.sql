-- 0040_thesis_dossier.sql
-- Cadence Financial — upgrade investment theses from a card to a dossier.
--
-- 1. Price discipline on the thesis itself: entry (what I paid / where I'd
--    start), add-below (accumulation level), target (where I'd take profit /
--    fair value), stop (thesis-invalidated exit). Levels are in the asset's
--    native currency per unit so they compare 1:1 with live quotes.
-- 2. Long-form research: bull_case / bear_case / catalysts alongside the
--    existing thesis + kill_criteria.
-- 3. thesis_notes: a dated journal per thesis — freeform notes, review
--    minutes, decisions, and saved articles/links (kind + optional url).

set search_path to financial, public;

-- ── 1+2. dossier fields on investment_theses ────────────────────────────────
alter table investment_theses add column if not exists entry_price    numeric(18,6);
alter table investment_theses add column if not exists entry_date     date;
alter table investment_theses add column if not exists add_below      numeric(18,6);
alter table investment_theses add column if not exists target_price   numeric(18,6);
alter table investment_theses add column if not exists stop_price     numeric(18,6);
alter table investment_theses add column if not exists price_currency text not null default '';
alter table investment_theses add column if not exists bull_case      text not null default '';
alter table investment_theses add column if not exists bear_case      text not null default '';
alter table investment_theses add column if not exists catalysts      text not null default '';

-- ── 3. thesis_notes (journal + article library) ─────────────────────────────
create table if not exists thesis_notes (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references auth.users(id) on delete cascade default auth.uid(),
  thesis_id   uuid not null references investment_theses(id) on delete cascade,
  note_date   date not null default current_date,
  kind        text not null default 'note'
              check (kind in ('note','review','article','decision')),
  title       text not null default '',
  body        text not null default '',
  url         text not null default '',
  source      text not null default '',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz
);

create index if not exists thesis_notes_thesis_idx on thesis_notes(thesis_id) where deleted_at is null;
create index if not exists thesis_notes_owner_idx on thesis_notes(owner_id) where deleted_at is null;

drop trigger if exists trg_thesis_notes_updated on thesis_notes;
create trigger trg_thesis_notes_updated
  before update on thesis_notes
  for each row execute function set_updated_at();

alter table thesis_notes enable row level security;

drop policy if exists thesis_notes_select on thesis_notes;
create policy thesis_notes_select on thesis_notes for select using (
  owner_id = auth.uid() or financial.financial_can_access_owner(owner_id, 'read'));

drop policy if exists thesis_notes_insert on thesis_notes;
create policy thesis_notes_insert on thesis_notes for insert with check (
  owner_id = auth.uid() or financial.financial_can_access_owner(owner_id, 'write'));

drop policy if exists thesis_notes_update on thesis_notes;
create policy thesis_notes_update on thesis_notes for update using (
  owner_id = auth.uid() or financial.financial_can_access_owner(owner_id, 'write')
) with check (
  owner_id = auth.uid() or financial.financial_can_access_owner(owner_id, 'write'));

drop policy if exists thesis_notes_delete on thesis_notes;
create policy thesis_notes_delete on thesis_notes for delete using (
  owner_id = auth.uid() or financial.financial_can_access_owner(owner_id, 'write'));

grant select, insert, update, delete on thesis_notes to authenticated;

reset search_path;
