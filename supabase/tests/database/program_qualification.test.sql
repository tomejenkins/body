begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions,pg_temp;
select no_plan();
insert into auth.users(id) values(md5('qualification_a')::uuid),(md5('qualification_b')::uuid);
insert into profiles(id,display_name) values(md5('qualification_a')::uuid,'A'),(md5('qualification_b')::uuid,'B');
insert into account_preferences(owner_id,scheduling_timezone) values(md5('qualification_a')::uuid,'UTC'),(md5('qualification_b')::uuid,'UTC');
create function pg_temp.rotation(n integer) returns uuid language plpgsql security invoker as $$
declare root uuid;day uuid;
begin
 insert into public.programs(owner_id,name,cycle_length,objective,duration_rotations) values(auth.uid(),'Progression rotation '||n,n,'hypertrophy',1) returning id into root;
 for i in 1..n loop
 insert into public.program_days(owner_id,program_id,cycle_length,cycle_position,name,is_rest_day) values(auth.uid(),root,n,i,'Workout '||i,i=n) returning id into day;
 if i<>n then insert into public.program_slots(owner_id,program_day_id,position,movement_pattern_id,exercise_id,target_sets,target_reps_min,target_reps_max,required_exercise_type,primary_muscle_id) values(auth.uid(),day,1,(select id from public.movement_patterns where slug='horizontal_push'),(select id from public.exercises where slug='barbell_bench_press'),2,8,12,'compound',(select id from public.muscle_groups where slug='pectorals'));end if;
 end loop;return public.snapshot_program(root);
end $$;


create function pg_temp.record_program(v uuid,kind text,pos int default 1) returns uuid language plpgsql security invoker as $$
declare w uuid;m uuid;e uuid;s public.workout_sets;
begin
 w:=public.start_program_workout(v,pos,gen_random_uuid());
 select id into m from public.workout_movements where workout_session_id=w;
 e:=public.select_program_exercise(m,(select id from public.exercises where slug=case when kind='bodyweight' then 'push_up' else 'barbell_bench_press' end),null,gen_random_uuid());
 if kind<>'pending' then
 for s in select * from public.workout_sets where workout_exercise_id=e order by position loop
 if kind='partial' and s.position>1 then continue;end if;
 perform public.log_workout_set(p_item=>e,p_id=>s.id,p_operation=>'save',p_revision=>s.revision,p_mutation=>gen_random_uuid(),p_reps=>case when kind='zero_reps' then 0 else 12 end,p_weight=>case when kind='bodyweight' then null when kind='zero_load' then 0 else 50 end,p_type=>case when kind='warmup' then 'warm_up' else 'working' end,p_mode=>case when kind='bodyweight' then 'bodyweight' else 'external' end,p_completed=>true);
 end loop;end if;
 if kind='deleted' then select * into s from public.workout_sets where workout_exercise_id=e and position=2;perform public.log_workout_set(p_item=>e,p_id=>s.id,p_operation=>'remove',p_revision=>s.revision,p_mutation=>gen_random_uuid());end if;
 perform public.end_workout(w,'completed');return w;
end $$;
set local role authenticated;
select set_config('request.jwt.claims',json_build_object('sub',md5('qualification_a')::uuid,'role','authenticated')::text,true);
select set_config('q.version',pg_temp.rotation(4)::text,true);

select set_config('q.session',pg_temp.record_program(current_setting('q.version')::uuid,'zero_reps')::text,true);
select is((select completion_status from workout_sessions where id=current_setting('q.session')::uuid),'none','zero_reps: new stored classification matches eligible prescribed work');
select is((select completion_status from workout_program_classifications(array[current_setting('q.session')::uuid])),'none','zero_reps: derived classification agrees');
select is((select sum(completed)::int from program_saved_progress(current_setting('q.session')::uuid)),0,'zero_reps: prescribed progress shares qualification');
select is((select working_sets::int from workout_training_summary(array[current_setting('q.session')::uuid])),0,'zero_reps: performance statistics agree');
select is((program_schedule_cursor((select program_assignment_id from workout_sessions where id=current_setting('q.session')::uuid))->>'position')::int,1,'zero_reps: unresolved first position remains pending');

select set_config('q.session',pg_temp.record_program(current_setting('q.version')::uuid,'zero_load')::text,true);
select is((select completion_status from workout_sessions where id=current_setting('q.session')::uuid),'none','zero_load: new stored classification matches eligible prescribed work');
select is((select completion_status from workout_program_classifications(array[current_setting('q.session')::uuid])),'none','zero_load: derived classification agrees');
select is((select sum(completed)::int from program_saved_progress(current_setting('q.session')::uuid)),0,'zero_load: prescribed progress shares qualification');
select is((select working_sets::int from workout_training_summary(array[current_setting('q.session')::uuid])),0,'zero_load: performance statistics agree');
select is((program_schedule_cursor((select program_assignment_id from workout_sessions where id=current_setting('q.session')::uuid))->>'position')::int,1,'zero_load: unresolved first position remains pending');

select set_config('q.session',pg_temp.record_program(current_setting('q.version')::uuid,'warmup')::text,true);
select is((select completion_status from workout_sessions where id=current_setting('q.session')::uuid),'none','warmup: new stored classification matches eligible prescribed work');
select is((select completion_status from workout_program_classifications(array[current_setting('q.session')::uuid])),'none','warmup: derived classification agrees');
select is((select sum(completed)::int from program_saved_progress(current_setting('q.session')::uuid)),0,'warmup: prescribed progress shares qualification');
select is((select working_sets::int from workout_training_summary(array[current_setting('q.session')::uuid])),0,'warmup: performance statistics agree');
select is((program_schedule_cursor((select program_assignment_id from workout_sessions where id=current_setting('q.session')::uuid))->>'position')::int,1,'warmup: unresolved first position remains pending');

select set_config('q.session',pg_temp.record_program(current_setting('q.version')::uuid,'pending')::text,true);
select is((select completion_status from workout_sessions where id=current_setting('q.session')::uuid),'none','pending: new stored classification matches eligible prescribed work');
select is((select completion_status from workout_program_classifications(array[current_setting('q.session')::uuid])),'none','pending: derived classification agrees');
select is((select sum(completed)::int from program_saved_progress(current_setting('q.session')::uuid)),0,'pending: prescribed progress shares qualification');
select is((select working_sets::int from workout_training_summary(array[current_setting('q.session')::uuid])),0,'pending: performance statistics agree');
select is((program_schedule_cursor((select program_assignment_id from workout_sessions where id=current_setting('q.session')::uuid))->>'position')::int,1,'pending: unresolved first position remains pending');

select set_config('q.session',pg_temp.record_program(current_setting('q.version')::uuid,'partial')::text,true);
select is((select completion_status from workout_sessions where id=current_setting('q.session')::uuid),'partial','partial: new stored classification matches eligible prescribed work');
select is((select completion_status from workout_program_classifications(array[current_setting('q.session')::uuid])),'partial','partial: derived classification agrees');
select is((select sum(completed)::int from program_saved_progress(current_setting('q.session')::uuid)),1,'partial: prescribed progress shares qualification');
select is((select working_sets::int from workout_training_summary(array[current_setting('q.session')::uuid])),1,'partial: performance statistics agree');
select is((program_schedule_cursor((select program_assignment_id from workout_sessions where id=current_setting('q.session')::uuid))->>'position')::int,1,'partial: unresolved first position remains pending');

select set_config('q.session',pg_temp.record_program(current_setting('q.version')::uuid,'deleted')::text,true);
select is((select completion_status from workout_sessions where id=current_setting('q.session')::uuid),'partial','deleted: new stored classification matches eligible prescribed work');
select is((select completion_status from workout_program_classifications(array[current_setting('q.session')::uuid])),'partial','deleted: derived classification agrees');
select is((select sum(completed)::int from program_saved_progress(current_setting('q.session')::uuid)),1,'deleted: prescribed progress shares qualification');
select is((select working_sets::int from workout_training_summary(array[current_setting('q.session')::uuid])),1,'deleted: performance statistics agree');
select is((program_schedule_cursor((select program_assignment_id from workout_sessions where id=current_setting('q.session')::uuid))->>'position')::int,1,'deleted: unresolved first position remains pending');

select set_config('q.session',pg_temp.record_program(current_setting('q.version')::uuid,'bodyweight')::text,true);
select is((select completion_status from workout_sessions where id=current_setting('q.session')::uuid),'full','bodyweight: new stored classification matches eligible prescribed work');
select is((select completion_status from workout_program_classifications(array[current_setting('q.session')::uuid])),'full','bodyweight: derived classification agrees');
select is((select sum(completed)::int from program_saved_progress(current_setting('q.session')::uuid)),2,'bodyweight: prescribed progress shares qualification');
select is((select working_sets::int from workout_training_summary(array[current_setting('q.session')::uuid])),2,'bodyweight: performance statistics agree');

select set_config('q.session',pg_temp.record_program(current_setting('q.version')::uuid,'full')::text,true);
select is((select completion_status from workout_sessions where id=current_setting('q.session')::uuid),'full','full: new stored classification matches eligible prescribed work');
select is((select completion_status from workout_program_classifications(array[current_setting('q.session')::uuid])),'full','full: derived classification agrees');
select is((select sum(completed)::int from program_saved_progress(current_setting('q.session')::uuid)),2,'full: prescribed progress shares qualification');
select is((select working_sets::int from workout_training_summary(array[current_setting('q.session')::uuid])),2,'full: performance statistics agree');

select set_config('q.assignment',(select program_assignment_id::text from workout_sessions where id=current_setting('q.session')::uuid),true);
select is((program_schedule_cursor(current_setting('q.assignment')::uuid)->>'position')::int,2,'fully prescribed work advances to exact next nonweekly position');
select is((program_schedule_cursor(current_setting('q.assignment')::uuid)->>'completedRotations')::int,0,'repeated full day does not fabricate a rotation');
select set_config('q.out_of_order',pg_temp.record_program(current_setting('q.version')::uuid,'full',3)::text,true);
select is((program_schedule_cursor(current_setting('q.assignment')::uuid)->>'position')::int,2,'out-of-order completion retains original gap');
select set_config('q.full',pg_temp.record_program(current_setting('q.version')::uuid,'full',2)::text,true);
select is((program_schedule_cursor(current_setting('q.assignment')::uuid)->>'completedRotations')::int,1,'all three training positions complete one four-day rotation');
select is((program_schedule_cursor(current_setting('q.assignment')::uuid)->>'complete')::boolean,true,'fixed duration reflects actual full rotation');
reset role;
-- Privileged historical-correction fixture only; no ordinary closed-history write is granted.
update workout_exercises set logging_kind='duration' where workout_session_id=current_setting('q.full')::uuid;
set local role authenticated;
select is((select completion_status from workout_program_classifications(array[current_setting('q.full')::uuid])),'none','unsupported legacy correction recomputes authoritative classification');
select is((select completion_status from workout_history() where id=current_setting('q.full')::uuid),'none','History projects corrected classification instead of stale full flag');
select is((select count(*)::int from workout_history('incomplete') where id=current_setting('q.full')::uuid),1,'incomplete filter includes corrected program evidence');
select is((program_schedule_cursor(current_setting('q.assignment')::uuid)->>'completedRotations')::int,0,'withdrawn evidence removes full-rotation completion');
reset role;
update workout_exercises set logging_kind='loaded' where workout_session_id=current_setting('q.full')::uuid;
set local role authenticated;
select is((select completion_status from workout_program_classifications(array[current_setting('q.full')::uuid])),'full','reinstated eligible evidence derives full without copying sets');
select set_config('request.jwt.claims',json_build_object('sub',md5('qualification_b')::uuid,'role','authenticated')::text,true);
select is((select count(*)::int from workout_program_classifications(array[current_setting('q.full')::uuid])),0,'foreign classification is private');
select is((select count(*)::int from program_saved_progress(current_setting('q.full')::uuid)),0,'foreign program evidence is private');
select throws_ok($$select * from workout_program_classifications(array(select gen_random_uuid() from generate_series(1,52)))$$,'22023',null,'classification batch bounded');
reset role;set local role anon;
select throws_ok($$select * from qualifying_workout_sets()$$,'42501',null,'anonymous common evidence denied');
reset role;select * from finish();rollback;
