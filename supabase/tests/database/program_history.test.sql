begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions,pg_temp;
select no_plan();
insert into auth.users(id) values(md5('program_stats_a')::uuid),(md5('program_stats_b')::uuid);
insert into profiles(id,display_name) values(md5('program_stats_a')::uuid,'A'),(md5('program_stats_b')::uuid,'B');
insert into account_preferences(owner_id,scheduling_timezone) values(md5('program_stats_a')::uuid,'UTC'),(md5('program_stats_b')::uuid,'UTC');
create function pg_temp.rotation(n integer,rotations integer default null) returns uuid language plpgsql security invoker as $$
declare root uuid;day uuid;
begin
 insert into public.programs(owner_id,name,cycle_length,objective,duration_rotations) values(auth.uid(),'Progression rotation '||n,n,'hypertrophy',rotations) returning id into root;
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


create function pg_temp.lift(v uuid,kg numeric,reps int,initial boolean default false,exercise_slug text default 'barbell_bench_press') returns uuid language plpgsql security invoker as $$
declare w uuid;e uuid;m uuid;s public.workout_sets;
begin
 w:=public.start_program_workout(v,1,gen_random_uuid());
 select id into m from public.workout_movements where workout_session_id=w;
 e:=public.select_program_exercise(m,(select id from public.exercises where slug=exercise_slug),null,gen_random_uuid());
 for s in select * from public.workout_sets where workout_exercise_id=e order by position loop
 perform public.log_workout_set(p_item=>e,p_id=>s.id,p_operation=>'save',p_revision=>s.revision,p_mutation=>gen_random_uuid(),p_reps=>reps,p_weight=>kg+case when initial and s.position=2 then 2 else 0 end,p_completed=>true);
 end loop;
 perform public.end_workout(w,'completed');return w;
end $$;
set local role authenticated;
select set_config('request.jwt.claims',json_build_object('sub',md5('program_stats_a')::uuid,'role','authenticated')::text,true);
select is(program_enrollment_history(),'[]'::jsonb,'empty Program History is honest');
select set_config('s.version',pg_temp.rotation(4)::text,true);
select set_config('s.assignment',program_lifecycle('start',md5('s.start')::uuid,null,0,current_setting('s.version')::uuid,current_date,'UTC')->>'assignmentId',true);
select is((program_enrollment_history()->0->>'workouts')::int,0,'new enrollment has zero real workouts');
select set_config('s.baseline',pg_temp.lift(current_setting('s.version')::uuid,50,5,true)::text,true);
select is((program_enrollment_history()->0->'comparisons'->0->>'later'),null::text,'one comparable session has no fabricated later result');
select pg_temp.lift(current_setting('s.version')::uuid,60,3);
select pg_temp.lift(current_setting('s.version')::uuid,55,5);
select pg_temp.lift(current_setting('s.version')::uuid,52,5);
select pg_temp.lift(current_setting('s.version')::uuid,80,5,false,'barbell_back_squat');
select set_config('s.partial',pg_temp.record_program(current_setting('s.version')::uuid,'partial')::text,true);
select set_config('s.stats',(program_enrollment_history()->0)::text,true);
select is((current_setting('s.stats')::jsonb->>'workouts')::int,6,'primary count is distinct exact-assignment qualifying sessions');
select is((current_setting('s.stats')::jsonb->>'fullWorkouts')::int,5,'full prescribed sessions distinguished');
select is((current_setting('s.stats')::jsonb->>'partialWorkouts')::int,1,'partial real training counts without claiming full completion');
select is((current_setting('s.stats')::jsonb->>'completedRotations')::int,0,'repeating one day does not complete a nonweekly rotation');
select is((select (c->'baseline'->>'value')::numeric from jsonb_array_elements(current_setting('s.stats')::jsonb->'comparisons')c where c->>'metric'='actual_rm' and c->>'reps'='5' and c->>'exerciseId'=(select id::text from exercises where slug='barbell_bench_press')),52::numeric,'baseline uses best exact-rep set of first qualifying session');
select is((select (c->'later'->>'value')::numeric from jsonb_array_elements(current_setting('s.stats')::jsonb->'comparisons')c where c->>'metric'='actual_rm' and c->>'reps'='5' and c->>'exerciseId'=(select id::text from exercises where slug='barbell_bench_press')),55::numeric,'comparison is best strictly later same-exercise five, not heavier triple or latest lower five');
select is((select (c->>'delta')::numeric from jsonb_array_elements(current_setting('s.stats')::jsonb->'comparisons')c where c->>'metric'='actual_rm' and c->>'reps'='5' and c->>'exerciseId'=(select id::text from exercises where slug='barbell_bench_press')),3::numeric,'canonical kg delta is derived without display rounding');
select is((select c->'later' from jsonb_array_elements(current_setting('s.stats')::jsonb->'comparisons')c where c->>'metric'='actual_rm' and c->>'reps'='3'),'null'::jsonb,'heavy triple has no invented comparable three-rep improvement');
select ok(exists(select 1 from jsonb_array_elements(current_setting('s.stats')::jsonb->'comparisons')c where c->>'metric'='estimated_1rm'),'estimated metric remains a separately identified existing metric');
select is((select c->'later' from jsonb_array_elements(current_setting('s.stats')::jsonb->'comparisons')c where c->>'metric'='actual_rm' and c->>'reps'='5' and c->>'exerciseId'=(select id::text from exercises where slug='barbell_back_squat')),'null'::jsonb,'different canonical lift never borrows bench baseline');
select set_config('s.independent',start_ad_hoc_workout()::text,true);select end_workout(current_setting('s.independent')::uuid,'completed');
select is((program_enrollment_history()->0->>'workouts')::int,6,'independent closure excluded');
select is((select count(*)::int from program_history_workouts(current_setting('s.assignment')::uuid,null,null,2)),2,'associated workouts are bounded');
select program_lifecycle('end_now',md5('s.end')::uuid,current_setting('s.assignment')::uuid,0);
select set_config('s.second',program_lifecycle('start',md5('s.restart')::uuid,null,0,current_setting('s.version')::uuid,current_date,'UTC')->>'assignmentId',true);
select is(jsonb_array_length(program_enrollment_history()),2,'same immutable program can appear as two separate enrollments');
select is((program_enrollment_history(current_setting('s.second')::uuid)->0->>'workouts')::int,0,'new enrollment counts no prior training');
select is((program_enrollment_history(current_setting('s.assignment')::uuid)->0->>'workouts')::int,6,'ended enrollment retains its own statistics');
reset role;
update workout_sets set deleted_at=clock_timestamp() where workout_exercise_id in(select id from workout_exercises where workout_session_id=current_setting('s.baseline')::uuid) and position=2;
set local role authenticated;
select is((select (c->>'delta')::numeric from jsonb_array_elements(program_enrollment_history(current_setting('s.assignment')::uuid)->0->'comparisons')c where c->>'metric'='actual_rm' and c->>'reps'='5' and c->>'exerciseId'=(select id::text from exercises where slug='barbell_bench_press')),5::numeric,'removing baseline evidence recalculates baseline and improvement');
reset role;
update workout_sets set deleted_at=null where workout_exercise_id in(select id from workout_exercises where workout_session_id=current_setting('s.baseline')::uuid) and position=2;
set local role authenticated;
select is((select (c->>'delta')::numeric from jsonb_array_elements(program_enrollment_history(current_setting('s.assignment')::uuid)->0->'comparisons')c where c->>'metric'='actual_rm' and c->>'reps'='5' and c->>'exerciseId'=(select id::text from exercises where slug='barbell_bench_press')),3::numeric,'restoration derives original comparison without a mutable best counter');

select pg_temp.lift(current_setting('s.version')::uuid,50,5);
select pg_temp.lift(current_setting('s.version')::uuid,45,5);
select is((select (c->>'delta')::numeric from jsonb_array_elements(program_enrollment_history(current_setting('s.second')::uuid)->0->'comparisons')c where c->>'metric'='actual_rm' and c->>'reps'='5'),(-5)::numeric,'negative change remains truthful in detail, never relabeled positive');
select pg_temp.record_program(current_setting('s.version')::uuid,'bodyweight');
select is((program_enrollment_history(current_setting('s.second')::uuid)->0->>'workouts')::int,3,'valid unweighted bodyweight training contributes to exact enrollment count');
select ok(exists(select 1 from jsonb_array_elements(program_enrollment_history(current_setting('s.second')::uuid)->0->'comparisons')c where c->>'category'='bodyweight' and c->>'metric'='bodyweight_reps'),'bodyweight metric stays repetitions, without invented resistance');
select ok(not exists(select 1 from jsonb_array_elements(program_enrollment_history(current_setting('s.second')::uuid)->0->'comparisons')c where c->>'category'='bodyweight' and c->>'metric'='actual_rm'),'no fabricated bodyweight exact-load strength result');
select throws_ok($$select program_enrollment_history(null,now(),null,11)$$,'22023',null,'malformed enrollment keyset cursor rejected');
select throws_ok($$select * from program_history_workouts(current_setting('s.second')::uuid,null,null,52)$$,'22023',null,'associated workout window is bounded server-side');
select is(jsonb_array_length(program_enrollment_history(null,null,null,1)),1,'enrollment page bound is authoritative');
reset role;
update program_assignments set enrollment_provenance='legacy' where id=current_setting('s.second')::uuid;
set local role authenticated;
select is(program_enrollment_history(current_setting('s.second')::uuid)->0->>'provenance','legacy','legacy time provenance remains explicit');
reset role;
update program_assignments set state='paused' where id=current_setting('s.second')::uuid;
set local role authenticated;
select is(program_enrollment_history(current_setting('s.second')::uuid)->0->>'status','Inactive','legacy pause is not mislabeled as a terminal ending');
update programs set archived_at=clock_timestamp() where id=(select program_id from program_versions where id=current_setting('s.version')::uuid);
select is((program_enrollment_history(current_setting('s.assignment')::uuid)->0->>'workouts')::int,6,'archived program root retains private immutable enrollment history');
select set_config('request.jwt.claims',json_build_object('sub',md5('program_stats_b')::uuid,'role','authenticated')::text,true);
select is(program_enrollment_history(current_setting('s.assignment')::uuid),'[]'::jsonb,'foreign enrollment detail is private');
select is((select count(*)::int from program_history_workouts(current_setting('s.assignment')::uuid)),0,'foreign enrollment workouts private');
select throws_ok($$select program_enrollment_statistics(array(select gen_random_uuid() from generate_series(1,22)))$$,'22023',null,'statistics batch is bounded');
reset role;set local role anon;
select throws_ok($$select program_enrollment_history()$$,'42501',null,'anonymous Program History denied');
reset role;select * from finish();rollback;
