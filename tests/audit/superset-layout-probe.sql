-- Disposable local Supabase only; synthetic fixture, fully rolled back.
begin;
insert into auth.users(id) values(md5('77c_local_layout_probe')::uuid);
insert into public.profiles(id,display_name) values(md5('77c_local_layout_probe')::uuid,'Local structural probe');
insert into public.account_preferences(owner_id) values(md5('77c_local_layout_probe')::uuid);
select set_config('request.jwt.claims',json_build_object('sub',md5('77c_local_layout_probe')::uuid,'role','authenticated')::text,true) is not null as local_identity;
set local role authenticated;
do $$declare w uuid;a uuid;b uuid;g uuid:=gen_random_uuid();m jsonb;begin
 w:=public.start_ad_hoc_workout();
 a:=public.edit_workout(w,'add',(select id from public.exercises where slug='barbell_bench_press'));
 b:=public.edit_workout(w,'add',(select id from public.exercises where slug='standing_dumbbell_curl'));
 m:=jsonb_build_array(jsonb_build_object('type','selection','id',a),jsonb_build_object('type','selection','id',b));
 perform public.change_workout_group(w,g,'create',0,m,gen_random_uuid());
 for i in 1..200 loop perform public.change_workout_group(w,g,'edit',i,m,gen_random_uuid());end loop;
 perform set_config('probe.session',w::text,true);
end $$;
select count(*) as bounded_command_count from public.workout_group_commands;
explain(analyze,buffers) select public.workout_group_layout(current_setting('probe.session')::uuid);
explain(analyze,buffers) select public.workout_group_layout(current_setting('probe.session')::uuid);
explain(analyze,buffers) select public.workout_group_layout(current_setting('probe.session')::uuid);
rollback;
