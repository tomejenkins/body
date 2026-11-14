-- Run only with docker exec against body_entitlement_isolated. Entire fixture rolls back.
\set ON_ERROR_STOP on
begin;
set local search_path=public,pg_temp;
insert into auth.users(id,email_confirmed_at) values(md5('entitlement_benchmark')::uuid,clock_timestamp());
insert into profiles(id,display_name) values(md5('entitlement_benchmark')::uuid,'Disposable benchmark');
insert into account_preferences(owner_id) values(md5('entitlement_benchmark')::uuid);
select set_config('request.jwt.claims',json_build_object('sub',md5('entitlement_benchmark')::uuid,'role','authenticated')::text,true);
set local role authenticated;
select activate_account_trial();
do $$declare t timestamptz:=clock_timestamp();begin for i in 1..100 loop perform account_access();end loop;raise notice 'account summary mean ms: %',extract(epoch from(clock_timestamp()-t))*1000/100;end$$;
\timing on
select set_config('benchmark.session',start_ad_hoc_workout()::text,true);
\timing off
select set_config('benchmark.item',edit_workout(current_setting('benchmark.session')::uuid,'add',(select id from exercises where slug='barbell_bench_press'))::text,true);
select set_config('benchmark.item2',edit_workout(current_setting('benchmark.session')::uuid,'add',(select id from exercises where slug='standing_dumbbell_curl'))::text,true);
select set_config('benchmark.set',(select id::text from workout_sets where workout_exercise_id=current_setting('benchmark.item')::uuid order by position limit 1),true);
do $$declare t timestamptz:=clock_timestamp();begin for i in 1..50 loop perform * from log_workout_set(current_setting('benchmark.item')::uuid,current_setting('benchmark.set')::uuid,'save',i-1,gen_random_uuid(),8,60,'working','external',true);end loop;raise notice 'set save mean ms: %',extract(epoch from(clock_timestamp()-t))*1000/50;end$$;
select set_config('benchmark.group',gen_random_uuid()::text,true);
select change_workout_group(current_setting('benchmark.session')::uuid,current_setting('benchmark.group')::uuid,'create',0,jsonb_build_array(jsonb_build_object('type','selection','id',current_setting('benchmark.item')),jsonb_build_object('type','selection','id',current_setting('benchmark.item2'))),gen_random_uuid());
do $$declare t timestamptz:=clock_timestamp();members jsonb;begin for i in 1..50 loop members:=case when i%2=1 then jsonb_build_array(jsonb_build_object('type','selection','id',current_setting('benchmark.item2')),jsonb_build_object('type','selection','id',current_setting('benchmark.item'))) else jsonb_build_array(jsonb_build_object('type','selection','id',current_setting('benchmark.item')),jsonb_build_object('type','selection','id',current_setting('benchmark.item2'))) end;perform change_workout_group(current_setting('benchmark.session')::uuid,current_setting('benchmark.group')::uuid,'edit',i,members,gen_random_uuid());end loop;raise notice 'Superset edit mean ms: %',extract(epoch from(clock_timestamp()-t))*1000/50;end$$;
select set_config('benchmark.cardio',gen_random_uuid()::text,true);
select record_workout_cardio(current_setting('benchmark.session')::uuid,current_setting('benchmark.cardio')::uuid,'add',0,'bike',null,gen_random_uuid());
do $$declare t timestamptz:=clock_timestamp();begin for i in 1..50 loop perform record_workout_cardio(current_setting('benchmark.session')::uuid,current_setting('benchmark.cardio')::uuid,'save',i,'bike',600,gen_random_uuid());end loop;raise notice 'cardio save mean ms: %',extract(epoch from(clock_timestamp()-t))*1000/50;end$$;
select end_workout(current_setting('benchmark.session')::uuid,'completed');
reset role;
update body_private.access_grants set valid_from=statement_timestamp()-interval '15 days',expires_at=statement_timestamp()-interval '1 day' where owner_id=md5('entitlement_benchmark')::uuid;
set local role authenticated;
do $$declare t timestamptz:=clock_timestamp();begin for i in 1..100 loop perform * from workout_history();end loop;raise notice 'expired History mean ms: %',extract(epoch from(clock_timestamp()-t))*1000/100;end$$;
rollback;
