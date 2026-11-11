\set ON_ERROR_STOP on
begin;
set local statement_timeout='90s';
insert into auth.users(id) values(md5('readiness-scale')::uuid);
insert into public.profiles(id,display_name) values(md5('readiness-scale')::uuid,'Synthetic scale profile');
insert into public.workout_sessions(id,owner_id,name,status,completion_status,started_at,finished_at,archived_at)
select md5('scale-session-'||i)::uuid,md5('readiness-scale')::uuid,'Synthetic workout','completed','full','2015-01-01'::timestamptz+i*interval '1 day','2015-01-01'::timestamptz+i*interval '1 day'+interval '1 hour',case when i%5=0 then '2030-01-01'::timestamptz else null end from generate_series(1,2000)i;
insert into public.workout_exercises(id,owner_id,workout_session_id,position,exercise_id,exercise_name_snapshot)
select md5('scale-item-'||i||'-'||j)::uuid,md5('readiness-scale')::uuid,md5('scale-session-'||i)::uuid,j,e.id,e.name from generate_series(1,2000)i cross join generate_series(1,5)j cross join public.exercises e where e.slug='barbell_bench_press';
insert into public.workout_sets(id,owner_id,workout_exercise_id,position,status,actual_reps,actual_weight_kg,completed_at,deleted_at)
select md5('scale-set-'||i||'-'||j||'-'||k)::uuid,md5('readiness-scale')::uuid,md5('scale-item-'||i||'-'||j)::uuid,k,'completed',5,60+k,'2015-01-01'::timestamptz+i*interval '1 day',case when k=6 then '2030-01-01'::timestamptz else null end from generate_series(1,2000)i cross join generate_series(1,5)j cross join generate_series(1,6)k;
analyze public.workout_sessions;analyze public.workout_exercises;analyze public.workout_sets;
set local role authenticated;
select set_config('request.jwt.claims',json_build_object('sub',md5('readiness-scale')::uuid,'role','authenticated')::text,true);
explain(analyze,buffers) select * from public.workout_history('all',null,null,21);
select octet_length(jsonb_agg(h)::text) as history_payload_bytes from public.workout_history('all',null,null,21) h;
explain(analyze,buffers) select public.exercise_history((select id from public.exercises where slug='barbell_bench_press'));
select octet_length(public.exercise_history((select id from public.exercises where slug='barbell_bench_press'))::text) as exercise_history_payload_bytes;
rollback;
