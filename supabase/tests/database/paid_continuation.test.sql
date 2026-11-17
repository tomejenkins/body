begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions,pg_temp;
select no_plan();
insert into auth.users(id,email_confirmed_at) values(md5('paid_cont')::uuid,clock_timestamp());
insert into profiles(id,display_name) values(md5('paid_cont')::uuid,'Paid continuation');
insert into account_preferences(owner_id) values(md5('paid_cont')::uuid);
-- Protected setup; these are never client-created grants.
insert into body_private.account_trials(owner_id,activated_at,expires_at,policy_version,provenance)
values(md5('paid_cont')::uuid,statement_timestamp()-interval '20 days',statement_timestamp()-interval '6 days','14d-v1','verified_activation');
insert into body_private.access_grants(owner_id,kind,source,source_reference,valid_from,expires_at)
values(md5('paid_cont')::uuid,'subscription','stripe:test','sub_cont/il_first',clock_timestamp()-interval '29 days',clock_timestamp()+interval '1 minute');
select set_config('request.jwt.claims',json_build_object('sub',md5('paid_cont')::uuid,'role','authenticated')::text,true);
set local role authenticated;
select is(account_access()->>'source','subscription','paid grant overrides expired trial');
select set_config('paid.w',start_ad_hoc_workout()::text,true);
select set_config('paid.deadline',(select access_continuation_until::text from workout_sessions where id=current_setting('paid.w')::uuid),true);
reset role;
-- Simulate elapsed database time through isolated fixture facts, never real sleeps.
update body_private.access_grants set expires_at=clock_timestamp()-interval '1 minute' where owner_id=md5('paid_cont')::uuid;
update workout_sessions set access_authorized_at=clock_timestamp()-interval '2 minutes',access_continuation_until=clock_timestamp()+interval '239 minutes' where id=current_setting('paid.w')::uuid;
set local role authenticated;
select is(account_access()->>'allowed','false','expired paid period denies full access');
select is(account_access(current_setting('paid.w')::uuid)->>'continuationAllowed','true','same paid session continues within fixed window');
select throws_ok($$insert into workout_sessions(owner_id,name) values(auth.uid(),'Paid bypass')$$,'P7701',null,'paid continuation cannot create another workout');
select set_config('paid.item',gen_random_uuid()::text,true);
select lives_ok($$select record_workout_cardio(current_setting('paid.w')::uuid,current_setting('paid.item')::uuid,'add',0,'bike',null,gen_random_uuid())$$,'same-session cardio creation permitted during paid continuation');
select set_config('paid.command',gen_random_uuid()::text,true);
select lives_ok($$select record_workout_cardio(current_setting('paid.w')::uuid,current_setting('paid.item')::uuid,'save',1,'bike',600,current_setting('paid.command')::uuid)$$,'same-session cardio permitted after paid expiration');
reset role;
select set_config('paid.fixed',(select access_continuation_until::text from workout_sessions where id=current_setting('paid.w')::uuid),true);
insert into body_private.access_grants(owner_id,kind,source,source_reference,valid_from,expires_at)
values(md5('paid_cont')::uuid,'subscription','stripe:test','sub_cont/il_renewal',clock_timestamp(),clock_timestamp()+interval '30 days');
select is((select access_continuation_until::text from workout_sessions where id=current_setting('paid.w')::uuid),current_setting('paid.fixed'),'renewal does not extend session snapshot');
set local role authenticated;
select is(account_access()->>'allowed','true','renewal restores ordinary authority');
select lives_ok($$select end_workout(current_setting('paid.w')::uuid,'completed')$$,'finish under renewed authority');
select is((select status from workout_sessions where id=current_setting('paid.w')::uuid),'completed','factual completion preserved');
select throws_ok($$select record_workout_cardio(current_setting('paid.w')::uuid,gen_random_uuid(),'save',0,'bike',700,gen_random_uuid())$$,'23514',null,'valid paid access cannot reopen terminal session');
select lives_ok($$select record_workout_cardio(current_setting('paid.w')::uuid,current_setting('paid.item')::uuid,'save',1,'bike',600,current_setting('paid.command')::uuid)$$,'identical committed receipt recovers after closure');
select throws_ok($$select record_workout_cardio(current_setting('paid.w')::uuid,current_setting('paid.item')::uuid,'save',1,'bike',601,current_setting('paid.command')::uuid)$$,'23514',null,'receipt exception cannot alter payload');
select lives_ok('select * from workout_history()','paid historical evidence remains readable');
select * from finish();
rollback;
