-- CI/local only: caller opens transaction and sets cadence.life_test_mode=on.
-- All fixture writes must roll back. Never run as a migration.
do $$ begin
  if current_setting('cadence.life_test_mode', true) is distinct from 'on' then
    raise exception 'Refusing Life test fixtures without transaction-scoped test mode';
  end if;
  if to_regprocedure('life.complete_obligation(uuid,date,date)') is null then
    raise exception 'Life atomic completion RPC is missing';
  end if;
end $$;

insert into auth.users(id) values
 ('f0100000-0000-4000-8000-000000000001'),
 ('f0100000-0000-4000-8000-000000000002');
set local role authenticated;
select set_config('request.jwt.claim.sub','f0100000-0000-4000-8000-000000000001',true);
insert into life.obligations(id,owner_id,name,next_due,cadence_months)
values ('f0100000-0000-4000-8000-000000000011',auth.uid(),'QA renewal','2026-01-31',1);
select life.complete_obligation('f0100000-0000-4000-8000-000000000011','2026-01-31','2026-02-01');
select life.complete_obligation('f0100000-0000-4000-8000-000000000011','2026-01-31','2026-02-01');
do $$ begin
 begin
  insert into life.life_items(owner_id,title,status,completed_at,due_date,obligation_id) values(auth.uid(),'Forged history','done',now(),'2026-03-31','f0100000-0000-4000-8000-000000000011');
  raise exception 'direct history insertion accepted';
 exception when insufficient_privilege then null; end;
 update life.life_items set title='Changed history' where obligation_id='f0100000-0000-4000-8000-000000000011';
 if found then raise exception 'direct history update accepted'; end if;
 delete from life.life_items where obligation_id='f0100000-0000-4000-8000-000000000011';
 if found then raise exception 'direct history delete accepted'; end if;
 if (select count(*) from life.life_items where obligation_id='f0100000-0000-4000-8000-000000000011') <> 1 then raise exception 'retry duplicated cycle'; end if;
 if (select next_due from life.obligations where id='f0100000-0000-4000-8000-000000000011') <> '2026-02-28'::date then raise exception 'month clamp or retry advanced incorrectly'; end if;
 begin
  perform life.complete_obligation('f0100000-0000-4000-8000-000000000011','2025-12-31','2026-02-01');
  raise exception 'stale cycle accepted';
 exception when serialization_failure then null; end;
 begin
  insert into life.obligations(owner_id,name,next_due,cadence_months) values(auth.uid(),'Bad cycle','2026-01-01',0);
  raise exception 'zero cadence accepted';
 exception when check_violation then null; end;
 begin
  insert into life.life_items(owner_id,title,status) values(auth.uid(),'Bad done','done');
  raise exception 'done without timestamp accepted';
 exception when check_violation then null; end;
end $$;
select set_config('request.jwt.claim.sub','f0100000-0000-4000-8000-000000000002',true);
do $$ begin
 if exists(select 1 from life.obligations where id='f0100000-0000-4000-8000-000000000011') then raise exception 'cross owner read'; end if;
 begin
  perform life.complete_obligation('f0100000-0000-4000-8000-000000000011','2026-02-28','2026-02-01');
  raise exception 'cross owner RPC accepted';
 exception when insufficient_privilege then null; end;
 begin
  insert into life.life_items(owner_id,title,status,completed_at,due_date,obligation_id) values(auth.uid(),'Wrong parent','done',now(),'2026-02-28','f0100000-0000-4000-8000-000000000011');
  raise exception 'cross owner parent accepted';
 exception when foreign_key_violation or insufficient_privilege then null; end;
end $$;
reset role;
select 'Life atomic completion and owner isolation PASS' as result;
