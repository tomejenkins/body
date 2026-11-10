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

select set_config('audit.item',select_program_exercise((select id from workout_movements where workout_session_id=current_setting('audit.session')::uuid),(select id from exercises where slug='barbell_bench_press'),null,gen_random_uuid())::text,true);
select set_config('audit.set',(select id::text from workout_sets where workout_exercise_id=current_setting('audit.item')::uuid order by position limit 1),true);
create temp table audit_timing(ms numeric);
do $$ declare started timestamptz;rev integer;begin
 for i in 1..30 loop
 select revision into rev from public.workout_sets where id=current_setting('audit.set')::uuid;
 started:=clock_timestamp();
 perform public.log_workout_set(p_item=>current_setting('audit.item')::uuid,p_id=>current_setting('audit.set')::uuid,p_operation=>'save',p_revision=>rev,p_mutation=>gen_random_uuid(),p_reps=>12,p_weight=>50,p_completed=>true);
 insert into audit_timing values(extract(epoch from clock_timestamp()-started)*1000);
 end loop;
end $$;
select json_build_object('samples',count(*),'min_ms',min(ms),'mean_ms',avg(ms),'median_ms',percentile_cont(0.5) within group(order by ms),'p95_ms',percentile_cont(0.95) within group(order by ms),'max_ms',max(ms)) from audit_timing;
explain(analyze,buffers,format json) select * from public.log_workout_set(p_item=>current_setting('audit.item')::uuid,p_id=>current_setting('audit.set')::uuid,p_operation=>'save',p_revision=>(select revision from workout_sets where id=current_setting('audit.set')::uuid),p_mutation=>gen_random_uuid(),p_reps=>12,p_weight=>50,p_completed=>true);
rollback;
