begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions,pg_temp;
select no_plan();
insert into auth.users(id) values(md5('retention_a')::uuid),(md5('retention_b')::uuid);
insert into profiles(id,display_name) values(md5('retention_a')::uuid,'A'),(md5('retention_b')::uuid,'B');
insert into account_preferences(owner_id,scheduling_timezone) values(md5('retention_a')::uuid,'UTC'),(md5('retention_b')::uuid,'UTC');
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


create function pg_temp.adhoc(kg numeric default 50) returns uuid language plpgsql security invoker as $$
declare w uuid;e uuid;s public.workout_sets;begin
 w:=public.start_ad_hoc_workout();e:=public.edit_workout(w,'add',(select id from public.exercises where slug='barbell_bench_press'));
 for s in select * from public.workout_sets where workout_exercise_id=e order by position loop
 perform public.log_workout_set(p_item=>e,p_id=>s.id,p_operation=>'save',p_revision=>s.revision,p_mutation=>gen_random_uuid(),p_reps=>5,p_weight=>kg,p_completed=>true);end loop;
 perform public.end_workout(w,'completed');return w;end $$;
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
select set_config('request.jwt.claims',json_build_object('sub',md5('retention_a')::uuid,'role','authenticated')::text,true);
select set_config('r.lower',pg_temp.adhoc(50)::text,true);
select set_config('r.peak',pg_temp.adhoc(100)::text,true);
select set_config('r.before',(select jsonb_build_object('started',started_at,'finished',finished_at,'last',last_activity_at,'pause',manual_pause_intervals,'status',status)::text from workout_sessions where id=current_setting('r.peak')::uuid),true);
select set_config('r.archive',retain_workout(current_setting('r.peak')::uuid,'archive',md5('r.archive')::uuid,0)::text,true);
select is(retain_workout(current_setting('r.peak')::uuid,'archive',md5('r.archive')::uuid,0),current_setting('r.archive')::jsonb,'exact archive retry returns durable result');
select throws_ok($$select retain_workout(current_setting('r.peak')::uuid,'restore',md5('r.archive')::uuid,1)$$,'23514',null,'request UUID cannot change intent');
select is((select count(*)::int from workout_history() where id=current_setting('r.peak')::uuid),0,'archived workout hidden from ordinary History');
select is((select count(*)::int from workout_history('archived') where id=current_setting('r.peak')::uuid),1,'archived workout present in bounded archived History');
select is((select jsonb_build_object('started',started_at,'finished',finished_at,'last',last_activity_at,'pause',manual_pause_intervals,'status',status)::text from workout_sessions where id=current_setting('r.peak')::uuid),current_setting('r.before'),'archive preserves execution and timing exactly');
select is((select count(*)::int from qualifying_workout_sets(current_setting('r.peak')::uuid)),0,'archive excludes active qualifying evidence');
select is((select count(*)::int from workout_evidence_sets(p_session=>current_setting('r.peak')::uuid,p_retained=>true)),3,'archived original working evidence is retained for detail');
select is((select max(value) from record_metrics((select id from exercises where slug='barbell_bench_press')) where metric='actual_rm' and load_key=5),50::numeric,'next best retained record replaces archived peak');
select is((select max(weight_kg) from previous_exercise_sets((select id from exercises where slug='barbell_bench_press'))),50::numeric,'smart defaults fall back to previous active eligible history');
select is((exercise_history((select id from exercises where slug='barbell_bench_press'))->>'total_sessions')::int,1,'Look Back excludes archived session');
select throws_ok($$update workout_sessions set archived_at=null where id=current_setting('r.peak')::uuid$$,'42501',null,'raw retention state is protected');
select throws_ok($$delete from workout_sessions where id=current_setting('r.peak')::uuid$$,'23514',null,'raw deletion requires validated nested receipt');
select throws_ok($$select retain_workout(current_setting('r.peak')::uuid,'restore',gen_random_uuid(),0)$$,'40001',null,'stale retention revision denied');
select retain_workout(current_setting('r.peak')::uuid,'restore',md5('r.restore')::uuid,1);
select is((select max(value) from record_metrics((select id from exercises where slug='barbell_bench_press')) where metric='actual_rm' and load_key=5),100::numeric,'restore reinstates eligible original evidence');
select is((select count(*)::int from workout_history() where id=current_setting('r.peak')::uuid),1,'restored original identity appears once');
select set_config('r.favorite',save_favorite_workout('completed_ad_hoc',current_setting('r.peak')::uuid,null,'Reusable press',md5('r.favorite')::uuid)::text,true);
select set_config('r.structure',(select definition::text from favorite_workouts where id=current_setting('r.favorite')::uuid),true);
select retain_workout(current_setting('r.peak')::uuid,'delete',md5('r.delete')::uuid,2);
select is(retain_workout(current_setting('r.peak')::uuid,'delete',md5('r.delete')::uuid,2)->>'kind','delete','exact delete retry works after physical removal');
select is((select count(*)::int from workout_sessions where id=current_setting('r.peak')::uuid),0,'deleted session is physically absent');
select is((select count(*)::int from workout_exercises where workout_session_id=current_setting('r.peak')::uuid),0,'deleted selections are removed');
select is((select count(*)::int from workout_movements where workout_session_id=current_setting('r.peak')::uuid),0,'deleted movements are removed');
select is((select max(value) from record_metrics((select id from exercises where slug='barbell_bench_press')) where metric='actual_rm' and load_key=5),50::numeric,'deleted actuals cannot remain current PR');
select is((select definition::text from favorite_workouts where id=current_setting('r.favorite')::uuid),current_setting('r.structure'),'Favorite structural snapshot survives source deletion unchanged');
select ok((select source_session_id is null from favorite_workouts where id=current_setting('r.favorite')::uuid),'Favorite source reference safely nulled');
select set_config('r.launch',start_favorite_workout(current_setting('r.favorite')::uuid,md5('r.launch')::uuid)::text,true);
select lives_ok($$select end_workout(current_setting('r.launch')::uuid,'abandoned')$$,'Favorite remains launchable independently after deletion');
select retain_workout(current_setting('r.launch')::uuid,'delete',gen_random_uuid(),0);
select throws_ok($$select start_favorite_workout(current_setting('r.favorite')::uuid,md5('r.launch')::uuid)$$,'23514',null,'deleted Favorite start nonce cannot resurrect old actual training');
select throws_ok($$update workout_retention_receipts set created_at=clock_timestamp()$$,'42501',null,'retention receipts cannot be rewritten');
select throws_ok($$delete from workout_retention_receipts$$,'42501',null,'retention receipts cannot be erased by application user');
select set_config('r.active',start_ad_hoc_workout()::text,true);
select throws_ok($$select retain_workout(current_setting('r.active')::uuid,'archive',gen_random_uuid(),0)$$,'23514',null,'in-progress archival denied');
select throws_ok($$select retain_workout(current_setting('r.active')::uuid,'delete',gen_random_uuid(),0)$$,'23514',null,'active deletion denied');
select end_workout(current_setting('r.active')::uuid,'abandoned');
select retain_workout(current_setting('r.active')::uuid,'archive',gen_random_uuid(),0);
select retain_workout(current_setting('r.active')::uuid,'delete',gen_random_uuid(),1);
select is((select count(*)::int from workout_sessions where id=current_setting('r.active')::uuid),0,'abandoned archived session can be deleted');
select set_config('r.version',pg_temp.rotation(3,1)::text,true);
select set_config('r.assignment',program_lifecycle('start',md5('r.enroll')::uuid,null,0,current_setting('r.version')::uuid,current_date,'UTC')->>'assignmentId',true);
select set_config('r.first',pg_temp.record_program(current_setting('r.version')::uuid,'full',1)::text,true);
select program_lifecycle('end_after_next',md5('r.end_request')::uuid,current_setting('r.assignment')::uuid,0);
select set_config('r.last',pg_temp.record_program(current_setting('r.version')::uuid,'full',2)::text,true);
select is((select terminal_reason from program_assignments where id=current_setting('r.assignment')::uuid),'completed','fixed-duration program genuinely completed before retention');
select retain_workout(current_setting('r.last')::uuid,'archive',md5('r.program_archive')::uuid,0);
select is((program_enrollment_history(current_setting('r.assignment')::uuid)->0->>'workouts')::int,1,'program qualifying count excludes archived triggering workout');
select is(program_enrollment_history(current_setting('r.assignment')::uuid)->0->>'status','Ended','no false current full program completion after archive');
select is((select completion_status from workout_evidence_classifications(array[current_setting('r.last')::uuid],true)),'full','archived detail still classifies retained prescribed work accurately');
select retain_workout(current_setting('r.last')::uuid,'restore',md5('r.program_restore')::uuid,1);
select is((select lifecycle_revision::int from program_assignments where id=current_setting('r.assignment')::uuid),2,'restore does not replay completion or lifecycle revision');
select is(program_enrollment_history(current_setting('r.assignment')::uuid)->0->>'status','Completed','restored evidence reinstates derived full status');
select retain_workout(current_setting('r.last')::uuid,'delete',md5('r.program_delete')::uuid,2);
select is((select terminal_reason from program_assignments where id=current_setting('r.assignment')::uuid),'completed','deletion preserves original lifecycle reason');
select ok((select terminal_session_id is null and state='completed' from program_assignments where id=current_setting('r.assignment')::uuid),'trigger reference nulled without reactivating enrollment');
select is((select count(*)::int from program_history_workouts(current_setting('r.assignment')::uuid)),1,'deleted workout absent from associated program history');
select retain_workout(current_setting('r.first')::uuid,'delete',md5('r.first_delete')::uuid,0);
select is((program_enrollment_history(current_setting('r.assignment')::uuid)->0->>'workouts')::int,0,'all actual evidence removed while enrollment remains');
select is((select count(*)::int from program_assignments where id=current_setting('r.assignment')::uuid),1,'program enrollment remains intact');

-- Withdrawal reopens accepted partial work; later explicit intent supersedes earlier intent.
create function pg_temp.decide(kind text,session uuid default null) returns uuid language plpgsql security invoker as $$
declare c jsonb;begin
 c:=public.program_schedule_cursor(current_setting('r.assignment')::uuid);
 return public.decide_program_schedule(current_setting('r.assignment')::uuid,current_setting('r.version')::uuid,(c->>'dayId')::uuid,(c->>'rotation')::int,(c->>'workIndex')::bigint,(c->>'decisionRevision')::bigint,kind,gen_random_uuid(),session);
end $$;
select set_config('r.version',pg_temp.rotation(4)::text,true);
select set_config('r.assignment',program_lifecycle('start',gen_random_uuid(),null,0,current_setting('r.version')::uuid,current_date,'UTC')->>'assignmentId',true);
select set_config('r.partialA',pg_temp.record_program(current_setting('r.version')::uuid,'partial',1)::text,true);
select pg_temp.decide('accept_partial',current_setting('r.partialA')::uuid);
select retain_workout(current_setting('r.partialA')::uuid,'archive',gen_random_uuid(),0);
select is((program_schedule_cursor(current_setting('r.assignment')::uuid)->>'workIndex')::int,0,'archiving accepted partial reopens its exact position');
select lives_ok($$select pg_temp.decide('skip')$$,'explicit skip can resolve withdrawn accepted partial without unique-index dead end');
select retain_workout(current_setting('r.partialA')::uuid,'restore',gen_random_uuid(),1);
select is((select resolution from program_schedule_resolutions(current_setting('r.assignment')::uuid) where work_index=0),'skip','restored old acceptance cannot override newer skip intent');
select retain_workout(current_setting('r.partialA')::uuid,'delete',gen_random_uuid(),2);
select ok((select session_id is null from program_schedule_decisions where assignment_id=current_setting('r.assignment')::uuid and kind='accept_partial'),'delete nulls accepted source while retaining explicit decision history');
select set_config('r.partialA',pg_temp.record_program(current_setting('r.version')::uuid,'partial',2)::text,true);
select pg_temp.decide('accept_partial',current_setting('r.partialA')::uuid);
select retain_workout(current_setting('r.partialA')::uuid,'archive',gen_random_uuid(),0);
select set_config('r.partialB',pg_temp.record_program(current_setting('r.version')::uuid,'partial',2)::text,true);
select lives_ok($$select pg_temp.decide('accept_partial',current_setting('r.partialB')::uuid)$$,'a new partial can deliberately resolve a reopened position');
select retain_workout(current_setting('r.partialA')::uuid,'restore',gen_random_uuid(),1);
select retain_workout(current_setting('r.partialB')::uuid,'delete',gen_random_uuid(),0);
select is((program_schedule_cursor(current_setting('r.assignment')::uuid)->>'workIndex')::int,1,'withdrawn latest acceptance cannot silently fall back to superseded older partial');
select lives_ok($$select pg_temp.decide('accept_partial',current_setting('r.partialA')::uuid)$$,'restored older evidence can be deliberately accepted again under current cursor');
select is((program_schedule_cursor(current_setting('r.assignment')::uuid)->>'workIndex')::int,2,'explicit reacceptance advances exactly once');
select program_lifecycle('end_after_next',gen_random_uuid(),current_setting('r.assignment')::uuid,0);
select set_config('r.bodyweight',pg_temp.record_program(current_setting('r.version')::uuid,'bodyweight',3)::text,true);
select is((select terminal_reason from program_assignments where id=current_setting('r.assignment')::uuid),'ended_after_next','valid bodyweight full training satisfies pending end');
select retain_workout(current_setting('r.bodyweight')::uuid,'archive',gen_random_uuid(),0);
select ok((program_enrollment_history(current_setting('r.assignment')::uuid)->0->>'completionEvidenceChanged')::boolean,'withdrawn bodyweight terminal evidence is disclosed');
select retain_workout(current_setting('r.bodyweight')::uuid,'restore',gen_random_uuid(),1);
select is((select lifecycle_revision::int from program_assignments where id=current_setting('r.assignment')::uuid),2,'bodyweight restore does not replay terminal lifecycle');
-- Enrollment comparison baseline and later best derive from surviving actual evidence.
select set_config('r.version',pg_temp.rotation(4)::text,true);
select set_config('r.assignment',program_lifecycle('start',gen_random_uuid(),null,0,current_setting('r.version')::uuid,current_date,'UTC')->>'assignmentId',true);
select set_config('r.metricBaseline',pg_temp.lift(current_setting('r.version')::uuid,50,5,true)::text,true);
select set_config('r.metricLater',pg_temp.lift(current_setting('r.version')::uuid,60,5)::text,true);
select is((select (c->>'delta')::numeric from jsonb_array_elements(program_enrollment_history(current_setting('r.assignment')::uuid)->0->'comparisons')c where c->>'metric'='actual_rm' and c->>'reps'='5'),8::numeric,'exact enrollment initially has real comparable improvement');
select retain_workout(current_setting('r.metricBaseline')::uuid,'archive',gen_random_uuid(),0);
select is((select c->'later' from jsonb_array_elements(program_enrollment_history(current_setting('r.assignment')::uuid)->0->'comparisons')c where c->>'metric'='actual_rm' and c->>'reps'='5'),'null'::jsonb,'archiving baseline leaves no invented comparison from one surviving workout');
select retain_workout(current_setting('r.metricBaseline')::uuid,'restore',gen_random_uuid(),1);
select is((select (c->>'delta')::numeric from jsonb_array_elements(program_enrollment_history(current_setting('r.assignment')::uuid)->0->'comparisons')c where c->>'metric'='actual_rm' and c->>'reps'='5'),8::numeric,'restoring baseline reinstates exact original comparison');
select retain_workout(current_setting('r.metricLater')::uuid,'delete',gen_random_uuid(),0);
select is((select c->'later' from jsonb_array_elements(program_enrollment_history(current_setting('r.assignment')::uuid)->0->'comparisons')c where c->>'metric'='actual_rm' and c->>'reps'='5'),'null'::jsonb,'deleting later best removes improvement without stale assignment totals');
-- A failed physical cleanup is wholly atomic, including receipt and earlier child deletions.
reset role;
create table public.retention_delete_blocker(session_id uuid references public.workout_sessions(id));
insert into retention_delete_blocker values(current_setting('r.lower')::uuid);
set local role authenticated;
select throws_ok($$select retain_workout(current_setting('r.lower')::uuid,'delete',md5('r.blocked')::uuid,0)$$,'23503',null,'referential cleanup failure rejects whole deletion transaction');
select is((select count(*)::int from workout_retention_receipts where request_id=md5('r.blocked')::uuid),0,'failed delete leaves no successful command receipt');
select is((select count(*)::int from workout_evidence_sets(p_session=>current_setting('r.lower')::uuid)),3,'failed delete restores all actual sets');
select set_config('request.jwt.claims',json_build_object('sub',md5('retention_b')::uuid,'role','authenticated')::text,true);
select throws_ok($$select retain_workout(current_setting('r.lower')::uuid,'delete',gen_random_uuid(),0)$$,'42501',null,'cross-owner retention denied');
select is((select count(*)::int from workout_retention_receipts),0,'cross-owner receipts private');
reset role;set local role anon;
select throws_ok($$select retain_workout(gen_random_uuid(),'delete',gen_random_uuid(),0)$$,'42501',null,'anonymous retention denied');
reset role;select * from finish();rollback;
