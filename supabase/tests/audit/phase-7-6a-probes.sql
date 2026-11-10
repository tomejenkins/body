-- Audit observations, not assertions that the observed gaps are desired behavior.
-- Run only in a fresh disposable local replay. All writes roll back.
begin;
set local search_path=public,extensions,pg_temp;
insert into auth.users(id) values(md5('audit_76a')::uuid);
insert into profiles(id,display_name) values(md5('audit_76a')::uuid,'Audit');
insert into account_preferences(owner_id,scheduling_timezone) values(md5('audit_76a')::uuid,'UTC');
create function pg_temp.rotation(n integer) returns uuid language plpgsql security invoker as $$
declare root uuid;day uuid;
begin
 insert into public.programs(owner_id,name,cycle_length,objective,duration_rotations) values(auth.uid(),'Progression rotation '||n,n,'hypertrophy',1) returning id into root;
 for i in 1..n loop
 insert into public.program_days(owner_id,program_id,cycle_length,cycle_position,name,is_rest_day) values(auth.uid(),root,n,i,'Workout '||i,i=n) returning id into day;
 if i<>n then insert into public.program_slots(owner_id,program_day_id,position,movement_pattern_id,exercise_id,target_sets,target_reps_min,target_reps_max,required_exercise_type,primary_muscle_id) values(auth.uid(),day,1,(select id from public.movement_patterns where slug='horizontal_push'),(select id from public.exercises where slug='barbell_bench_press'),2,8,12,'compound',(select id from public.muscle_groups where slug='pectorals'));end if;
 end loop;return public.snapshot_program(root);
end $$;

set local role authenticated;
select set_config('request.jwt.claims',json_build_object('sub',md5('audit_76a')::uuid,'role','authenticated')::text,true);
select set_config('audit.version',pg_temp.rotation(3)::text,true);
select set_config('audit.session',start_program_workout(current_setting('audit.version')::uuid,1,gen_random_uuid())::text,true);
select set_config('audit.assignment',(select program_assignment_id::text from workout_sessions where id=current_setting('audit.session')::uuid),true);
do $$ declare m uuid;e uuid;s public.workout_sets; begin
select id into m from public.workout_movements where workout_session_id=current_setting('audit.session')::uuid;
e:=public.select_program_exercise(m,(select id from public.exercises where slug='barbell_bench_press'),null,gen_random_uuid());
for s in select * from public.workout_sets where workout_exercise_id=e order by position loop
perform public.log_workout_set(p_item=>e,p_id=>s.id,p_operation=>'save',p_revision=>s.revision,p_mutation=>gen_random_uuid(),p_reps=>12,p_weight=>0,p_completed=>true);
end loop;
perform public.end_workout(current_setting('audit.session')::uuid,'completed');
end $$;
select json_build_object('probe','zero_external_load','completion_status',(select completion_status from workout_sessions where id=current_setting('audit.session')::uuid),'program_sets',(select sum(completed) from program_saved_progress(current_setting('audit.session')::uuid)),'qualifying_sets',(select working_sets from workout_training_summary(array[current_setting('audit.session')::uuid])),'next_position',program_schedule_cursor(current_setting('audit.assignment')::uuid)->'position');
select set_config('audit.active_session',start_program_workout(current_setting('audit.version')::uuid,2,gen_random_uuid())::text,true);
do $$ declare m uuid;e uuid;s public.workout_sets; begin
select id into m from public.workout_movements where workout_session_id=current_setting('audit.active_session')::uuid;
e:=public.select_program_exercise(m,(select id from public.exercises where slug='barbell_bench_press'),null,gen_random_uuid());
for s in select * from public.workout_sets where workout_exercise_id=e order by position loop
perform public.log_workout_set(p_item=>e,p_id=>s.id,p_operation=>'save',p_revision=>s.revision,p_mutation=>gen_random_uuid(),p_reps=>0,p_weight=>50,p_completed=>true);
end loop;
perform public.end_workout(current_setting('audit.active_session')::uuid,'completed');
end $$;
select json_build_object('probe','zero_repetitions','completion_status',(select completion_status from workout_sessions where id=current_setting('audit.active_session')::uuid),'program_sets',(select sum(completed) from program_saved_progress(current_setting('audit.active_session')::uuid)),'next_position',program_schedule_cursor(current_setting('audit.assignment')::uuid)->'position');
select set_config('audit.active_session',start_program_workout(current_setting('audit.version')::uuid,2,gen_random_uuid())::text,true);
update program_assignments set state='archived',ended_at=clock_timestamp() where id=current_setting('audit.assignment')::uuid;
select json_build_object('probe','archive_assignment_with_active_workout','assignment_state',(select state from program_assignments where id=current_setting('audit.assignment')::uuid),'workout_state',(select status from workout_sessions where id=current_setting('audit.active_session')::uuid));
select end_workout(current_setting('audit.active_session')::uuid,'abandoned');
select set_config('audit.reenrolled',start_program_workout(current_setting('audit.version')::uuid,1,gen_random_uuid())::text,true);
select json_build_object('probe','repeat_enrollment_identity','distinct_assignment',(select program_assignment_id<>current_setting('audit.assignment')::uuid from workout_sessions where id=current_setting('audit.reenrolled')::uuid),'assignments',(select count(*) from program_assignments),'active_assignments',(select count(*) from program_assignments where state='active'),'retained_old_sessions',(select count(*) from workout_sessions where program_assignment_id=current_setting('audit.assignment')::uuid));
rollback;
