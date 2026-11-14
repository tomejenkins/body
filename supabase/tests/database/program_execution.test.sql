begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions,pg_temp;
select no_plan();
select ok(not has_table_privilege(r,'public.workout_movements',op),'movement '||r||' denied '||op) from unnest(array['anon','service_role']) r cross join unnest(array['SELECT','INSERT','UPDATE','DELETE']) op;
select ok(not has_column_privilege('authenticated','public.workout_movements','slot_snapshot','INSERT'),'movement snapshots have no client insert grant');
select ok(not has_table_privilege('authenticated','public.workout_movements','UPDATE') and not has_table_privilege('authenticated','public.workout_movements','DELETE'),'movement snapshots immutable to clients');
insert into auth.users(id,email_confirmed_at) values (md5('execution_a')::uuid,clock_timestamp()),(md5('execution_b')::uuid,clock_timestamp());
insert into profiles(id,display_name) values(md5('execution_a')::uuid,'A'),(md5('execution_b')::uuid,'B');
insert into account_preferences(owner_id,scheduling_timezone) values(md5('execution_a')::uuid,'UTC'),(md5('execution_b')::uuid,'UTC');

create function pg_temp.enroll(v uuid) returns void language plpgsql security invoker as $$
declare a public.program_assignments;begin
 select * into a from public.program_assignments where owner_id=auth.uid() and state='active';
 if a.id is null then perform public.program_lifecycle('start',gen_random_uuid(),null,0,v,current_date,'UTC');
 elsif a.source_version_id<>v then perform public.program_lifecycle('switch',gen_random_uuid(),a.id,a.lifecycle_revision,v,current_date,'UTC');end if;
end $$;

set local role authenticated;
select set_config('request.jwt.claims',json_build_object('sub',md5('execution_a')::uuid,'role','authenticated')::text,true);
select set_config('body_test.source',(select published_version_id::text from programs where slug='upper-lower-strength-size'),true);
select set_config('body_test.session',start_program_workout(current_setting('body_test.source')::uuid,1,md5('start1')::uuid)::text,true);
select is(start_program_workout(current_setting('body_test.source')::uuid,1,md5('start1')::uuid),current_setting('body_test.session')::uuid,'start retry is idempotent');
select is((select count(*)::int from workout_movements where workout_session_id=current_setting('body_test.session')::uuid),5,'logger starts with all ordered movement slots');
select is((select count(*)::int from workout_exercises where workout_session_id=current_setting('body_test.session')::uuid),0,'no exercise selection is fabricated before the workout');
select is((select status from workout_sessions where id=current_setting('body_test.session')::uuid),'in_progress','program begins immediately');
select ok((select source_program_version_id is not null and program_version_snapshot=1 and source_program_id in(select id from programs where owner_id=auth.uid()) from workout_sessions where id=current_setting('body_test.session')::uuid),'execution uses an independent owned version snapshot');
select throws_ok($$select start_program_workout(current_setting('body_test.source')::uuid,2,md5('start1')::uuid)$$,'23514',null,'start nonce cannot be reused for another workout');
select set_config('body_test.movement',(select id::text from workout_movements where workout_session_id=current_setting('body_test.session')::uuid and position=1),true);
select set_config('body_test.slot',(select slot_identity::text from workout_movements where id=current_setting('body_test.movement')::uuid),true);
select set_config('body_test.pick',(select id::text from exercises where slug='barbell_bench_press'),true);
select set_config('body_test.dumbbell',(select id::text from exercises where slug='dumbbell_bench_press'),true);
select set_config('body_test.fly',(select id::text from exercises where slug='standing_cable_chest_fly'),true);
select set_config('body_test.item',select_program_exercise(current_setting('body_test.movement')::uuid,current_setting('body_test.pick')::uuid,null,md5('choose1')::uuid)::text,true);
select is((select count(*)::int from workout_sets where workout_exercise_id=current_setting('body_test.item')::uuid),3,'program working-set count, not a selection wizard');
select ok((select bool_and(prescribed_reps_min=5 and prescribed_reps_max=7 and prescribed_effort_scale='rir' and prescribed_effort_value=2 and effort_scale is null and effort_value is null and not performed_to_failure and actual_reps is null and actual_weight_kg is null and not inputs_confirmed) from workout_sets where workout_exercise_id=current_setting('body_test.item')::uuid),'planned reps/effort remain separate from unset actuals');
select is(select_program_exercise(current_setting('body_test.movement')::uuid,current_setting('body_test.pick')::uuid,null,md5('choose1')::uuid),current_setting('body_test.item')::uuid,'selection retry does not duplicate tiles or sets');
select set_config('body_test.old',current_setting('body_test.item'),true);
select set_config('body_test.item',select_program_exercise(current_setting('body_test.movement')::uuid,current_setting('body_test.dumbbell')::uuid,current_setting('body_test.item')::uuid,md5('choose2')::uuid)::text,true);
select ok((select removed_at is not null from workout_exercises where id=current_setting('body_test.old')::uuid),'untouched suggestions may be replaced safely');
select ok((select prescribed_exercise_id=current_setting('body_test.pick')::uuid and exercise_id=current_setting('body_test.dumbbell')::uuid from workout_exercises where id=current_setting('body_test.item')::uuid),'creator pick is not overwritten by the actual exercise');
select ok((select bool_and(prescribed_weight_kg is null) from workout_sets where workout_exercise_id=current_setting('body_test.item')::uuid),'no invented load without exact-exercise history');
select set_config('body_test.set',(select id::text from workout_sets where workout_exercise_id=current_setting('body_test.item')::uuid order by position offset 1 limit 1),true);
select lives_ok($$select log_workout_set(p_item=>current_setting('body_test.item')::uuid,p_id=>current_setting('body_test.set')::uuid,p_operation=>'save',p_revision=>0,p_mutation=>md5('actual1')::uuid,p_reps=>7,p_weight=>40,p_completed=>true,p_effort=>'{"scale":"rpe","value":9,"failure":false}'::jsonb)$$,'existing logger records actual effort and performance');
select throws_ok($$select select_program_exercise(current_setting('body_test.movement')::uuid,current_setting('body_test.fly')::uuid,current_setting('body_test.item')::uuid,md5('choose3')::uuid)$$,'P0001',null,'recorded sets require an explicit continuation');
select throws_ok($$update workout_exercises set exercise_id=current_setting('body_test.fly')::uuid where id=current_setting('body_test.item')::uuid$$,'23514',null,'direct writes cannot relabel recorded program performance');
delete from program_slots where id=current_setting('body_test.slot')::uuid;
select ok((select source_program_slot_id is null and exercise_id=current_setting('body_test.dumbbell')::uuid from workout_exercises where id=current_setting('body_test.item')::uuid),'source-slot deletion clears provenance without changing recorded exercise');
select set_config('body_test.previous',current_setting('body_test.item'),true);
select set_config('body_test.item',select_program_exercise(current_setting('body_test.movement')::uuid,current_setting('body_test.fly')::uuid,current_setting('body_test.item')::uuid,md5('choose3')::uuid,true)::text,true);
select ok((select exercise_id=current_setting('body_test.dumbbell')::uuid and removed_at is null from workout_exercises where id=current_setting('body_test.previous')::uuid),'previous exercise identity and recorded selection remain intact');
select ok((select actual_weight_kg=40 and actual_reps=7 and effort_scale='rpe' and effort_value=9 and deleted_at is null from workout_sets where id=current_setting('body_test.set')::uuid),'substitution preserves actual sets and reported effort');
select is((select count(*)::int from workout_sets where workout_exercise_id=current_setting('body_test.item')::uuid and deleted_at is null),2,'new exercise receives only remaining planned sets');
select is((select array_agg(program_set_number order by program_set_number) from workout_sets where workout_exercise_id=current_setting('body_test.item')::uuid and deleted_at is null),array[1,3],'out-of-order completion preserves the exact remaining prescriptions');
select ok((select bool_and(prescribed_weight_kg is null and actual_weight_kg is null) from workout_sets where workout_exercise_id=current_setting('body_test.item')::uuid),'weights never transfer from dumbbell press to chest fly');
select throws_ok($$select select_program_exercise(current_setting('body_test.movement')::uuid,current_setting('body_test.pick')::uuid,current_setting('body_test.previous')::uuid,md5('stale')::uuid,true)$$,'40001',null,'concurrent stale selection cannot overwrite current binding');
select lives_ok($$select log_workout_set(p_item=>current_setting('body_test.item')::uuid,p_id=>(select id from workout_sets where workout_exercise_id=current_setting('body_test.item')::uuid order by position limit 1),p_operation=>'save',p_revision=>0,p_mutation=>md5('fly_actual')::uuid,p_reps=>6,p_weight=>10,p_completed=>true)$$,'broader muscle alternative uses existing logging');
select is((select exercise_id::text from program_last_choices(current_setting('body_test.session')::uuid) where movement_id=current_setting('body_test.movement')::uuid),null::text,'unfinished-session input is not a completed choice');
select end_workout(current_setting('body_test.session')::uuid,'completed');
select is((select completion_status from workout_sessions where id=current_setting('body_test.session')::uuid),'partial','unselected movements never become fully completed');
select set_config('body_test.session2',start_program_workout(current_setting('body_test.source')::uuid,1,md5('start2')::uuid)::text,true);
select set_config('body_test.movement2',(select id::text from workout_movements where workout_session_id=current_setting('body_test.session2')::uuid and position=1),true);
select is((select slot_identity from workout_movements where id=current_setting('body_test.movement2')::uuid),current_setting('body_test.slot')::uuid,'future executions retain exact slot identity');
select is((select exercise_id from program_last_choices(current_setting('body_test.session2')::uuid) where movement_id=current_setting('body_test.movement2')::uuid),current_setting('body_test.fly')::uuid,'last qualifying completed exercise is scoped to this exact slot');
select ok(not exists(select 1 from program_last_choices(current_setting('body_test.session2')::uuid) where movement_id<>current_setting('body_test.movement2')::uuid and exercise_id is not null),'same workout or muscle does not override other slots');
select select_program_exercise(current_setting('body_test.movement2')::uuid,current_setting('body_test.pick')::uuid,null,md5('unperformed')::uuid);
select end_workout(current_setting('body_test.session2')::uuid,'abandoned');
select is((select exercise_id from program_last_choices(current_setting('body_test.session2')::uuid) where movement_id=current_setting('body_test.movement2')::uuid),current_setting('body_test.fly')::uuid,'clicks, pending suggestions and abandoned sessions do not change last choice');

-- Mixed planned types retain exact prescription identity across continuation.
insert into programs(id,owner_id,name,cycle_length) values(md5('mixed_program')::uuid,auth.uid(),'Mixed set intent',1);
insert into program_days(id,owner_id,program_id,cycle_length,cycle_position,name) values(md5('mixed_day')::uuid,auth.uid(),md5('mixed_program')::uuid,1,1,'Chest Day');
insert into program_slots(id,owner_id,program_day_id,position,exercise_id,target_sets) values(md5('mixed_slot')::uuid,auth.uid(),md5('mixed_day')::uuid,9,current_setting('body_test.pick')::uuid,3);
insert into program_set_prescriptions(slot_id,owner_id,position,set_type,reps_min,reps_max,intended_to_failure) values(md5('mixed_slot')::uuid,auth.uid(),1,'warm_up',5,5,false),(md5('mixed_slot')::uuid,auth.uid(),2,'working',5,8,false),(md5('mixed_slot')::uuid,auth.uid(),3,'drop',8,12,true);
select set_config('body_test.mixed_version',snapshot_program(md5('mixed_program')::uuid)::text,true);
select pg_temp.enroll(current_setting('body_test.mixed_version')::uuid);
select set_config('body_test.mixed_session',start_program_workout(current_setting('body_test.mixed_version')::uuid,1,md5('mixed_start')::uuid)::text,true);
select set_config('body_test.mixed_movement',(select id::text from workout_movements where workout_session_id=current_setting('body_test.mixed_session')::uuid),true);
select is((select position from workout_movements where id=current_setting('body_test.mixed_movement')::uuid),1,'gapped author ordering becomes contiguous consumer Movement numbering');
select set_config('body_test.mixed_item',select_program_exercise(current_setting('body_test.mixed_movement')::uuid,current_setting('body_test.pick')::uuid,null,md5('mixed_pick')::uuid)::text,true);
select is((select array_agg(set_type order by position) from workout_sets where workout_exercise_id=current_setting('body_test.mixed_item')::uuid),array['warm_up','working','drop'],'planned warm-up, working and drop types remain distinct');
select log_workout_set(p_item=>current_setting('body_test.mixed_item')::uuid,p_id=>(select id from workout_sets where workout_exercise_id=current_setting('body_test.mixed_item')::uuid and position=1),p_operation=>'save',p_revision=>0,p_mutation=>md5('mixed_warm')::uuid,p_reps=>5,p_weight=>20,p_type=>'warm_up',p_completed=>true);
select log_workout_set(p_item=>current_setting('body_test.mixed_item')::uuid,p_id=>(select id from workout_sets where workout_exercise_id=current_setting('body_test.mixed_item')::uuid and position=2),p_operation=>'save',p_revision=>0,p_mutation=>md5('mixed_work')::uuid,p_reps=>6,p_weight=>50,p_completed=>true);
select set_config('body_test.mixed_item',select_program_exercise(current_setting('body_test.mixed_movement')::uuid,current_setting('body_test.dumbbell')::uuid,current_setting('body_test.mixed_item')::uuid,md5('mixed_continue')::uuid,true)::text,true);
select ok((select set_type='drop' and program_set_number=3 and prescribed_reps_min=8 and prescribed_reps_max=12 and prescribed_to_failure and not performed_to_failure and effort_scale is null from workout_sets where workout_exercise_id=current_setting('body_test.mixed_item')::uuid),'remaining drop prescription retains optional failure intent without reporting actual failure');
select is((select count(*)::int from workout_sets where workout_exercise_id=current_setting('body_test.mixed_item')::uuid),1,'completed warm-up and working prescription are not duplicated');
select is((select prescribed_weight_kg from workout_sets where workout_exercise_id=current_setting('body_test.mixed_item')::uuid),null::numeric,'drop set without matching-type history never borrows another set type or exercise load');
select log_workout_set(p_item=>current_setting('body_test.mixed_item')::uuid,p_id=>(select id from workout_sets where workout_exercise_id=current_setting('body_test.mixed_item')::uuid),p_operation=>'save',p_revision=>0,p_mutation=>md5('mixed_drop')::uuid,p_reps=>8,p_weight=>25,p_type=>'drop',p_completed=>true);
select end_workout(current_setting('body_test.mixed_session')::uuid,'completed');
select is((select completion_status from workout_sessions where id=current_setting('body_test.mixed_session')::uuid),'full','full completion counts prescribed working/drop sets without mistaking warm-ups for working targets');



select set_config('body_test.repeat_session',start_program_workout(current_setting('body_test.mixed_version')::uuid,1,md5('mixed_repeat')::uuid)::text,true);
select set_config('body_test.repeat_movement',(select id::text from workout_movements where workout_session_id=current_setting('body_test.repeat_session')::uuid),true);
select set_config('body_test.repeat_item',select_program_exercise(current_setting('body_test.repeat_movement')::uuid,current_setting('body_test.pick')::uuid,null,md5('mixed_repeat_pick')::uuid)::text,true);
select is((select array_agg(prescribed_weight_kg order by position) from workout_sets where workout_exercise_id=current_setting('body_test.repeat_item')::uuid),array[20::numeric,50::numeric,null],'historical warm-up and working loads align within their own set types; missing drop history stays blank');
select ok((select bool_and(actual_reps is null and actual_weight_kg is null and effort_scale is null and not performed_to_failure) from workout_sets where workout_exercise_id=current_setting('body_test.repeat_item')::uuid),'history suggestions and intended failure never fabricate actual performance or effort');
select end_workout(current_setting('body_test.repeat_session')::uuid,'abandoned');

select set_config('body_test.expired',start_ad_hoc_workout()::text,true);
reset role;
update workout_sessions set started_at=clock_timestamp()-interval '13 hours',last_activity_at=clock_timestamp()-interval '13 hours' where id=current_setting('body_test.expired')::uuid;
set local role authenticated;
select is(start_program_workout(md5('missing_program_version')::uuid,1,md5('expired_invalid_start')::uuid),null::uuid,'invalid new program start returns a committed expired-session cleanup sentinel');
select is((select status from workout_sessions where id=current_setting('body_test.expired')::uuid),'abandoned','failed new start does not roll back inactivity cleanup');

select set_config('request.jwt.claims',json_build_object('sub',md5('execution_b')::uuid,'role','authenticated')::text,true);
select is((select count(*)::int from workout_movements),0,'cross-owner movement reads denied');
select throws_ok($$select select_program_exercise(current_setting('body_test.movement')::uuid,current_setting('body_test.pick')::uuid,null,gen_random_uuid())$$,'42501',null,'cross-owner selections denied');
select is((select count(*)::int from program_last_choices(current_setting('body_test.session')::uuid)),0,'cross-owner last choices hidden');
select set_config('request.jwt.claims','{}',true);
select throws_ok($$select start_program_workout(current_setting('body_test.source')::uuid,1,gen_random_uuid())$$,'42501',null,'verified identity required');
reset role;
select * from finish();rollback;
