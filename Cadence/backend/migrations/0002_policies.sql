-- Cadence — Row-Level Security (Phase 0)
-- Every row belongs to one account (owner_id). These policies guarantee a
-- logged-in user can only ever read or write their OWN rows, enforced by the
-- database itself — not by client code. Later migrations may add explicit,
-- revocable delegated-agent access; do not bypass this with service-role client
-- code for normal agent operations.

do $$
declare t text;
begin
  foreach t in array array['projects','milestones','project_updates','people',
    'talking_points','work_items','comments','decisions','notes','outbox',
    'links','activity']
  loop
    execute format('alter table %s enable row level security;', t);

    -- read your own rows
    execute format('drop policy if exists %1$s_select on %1$s;', t);
    execute format('create policy %1$s_select on %1$s
                    for select using (owner_id = auth.uid());', t);

    -- insert rows owned by you
    execute format('drop policy if exists %1$s_insert on %1$s;', t);
    execute format('create policy %1$s_insert on %1$s
                    for insert with check (owner_id = auth.uid());', t);

    -- update only your rows
    execute format('drop policy if exists %1$s_update on %1$s;', t);
    execute format('create policy %1$s_update on %1$s
                    for update using (owner_id = auth.uid())
                    with check (owner_id = auth.uid());', t);

    -- delete only your rows (we mostly soft-delete, but hard delete is yours too)
    execute format('drop policy if exists %1$s_delete on %1$s;', t);
    execute format('create policy %1$s_delete on %1$s
                    for delete using (owner_id = auth.uid());', t);
  end loop;
end $$;
