-- Roles/claims exercise actual grants and RLS; fixtures and all writes roll back.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions, pg_temp;
select no_plan();
create function pg_temp.affected(statement text) returns bigint
language plpgsql security invoker as $$
declare n bigint;
begin execute statement; get diagnostics n = row_count; return n; end;
$$;
insert into auth.users(id) values (md5('alice')::uuid), (md5('bob')::uuid), (md5('carol')::uuid);


insert into public.profiles(id,display_name) values (md5('alice')::uuid,'alice');

insert into public.account_preferences(owner_id, training_goal) values (md5('alice')::uuid,'strength');

insert into public.profiles(id,display_name) values (md5('bob')::uuid,'bob');

insert into public.account_preferences(owner_id, training_goal) values (md5('bob')::uuid,'strength');

insert into public.movement_patterns(id,slug,name) values (md5('movement_patterns')::uuid,'test_catalog','Test catalog');

insert into public.muscle_groups(id,slug,name) values (md5('muscle_groups')::uuid,'test_catalog','Test catalog');

insert into public.equipment_types(id,slug,name) values (md5('equipment_types')::uuid,'test_catalog','Test catalog');

insert into public.exercises(id,name) values (md5('system')::uuid,'System exercise');

insert into public.exercises(id,owner_id,name) values (md5('custom_alice')::uuid,md5('alice')::uuid,'alice custom');

insert into public.exercise_movement_patterns(exercise_id,movement_pattern_id) values (md5('custom_alice')::uuid,md5('movement_patterns')::uuid);

insert into public.exercise_muscles(exercise_id,muscle_group_id,muscle_role) values (md5('custom_alice')::uuid,md5('muscle_groups')::uuid,'primary');

insert into public.exercise_equipment(exercise_id,equipment_type_id) values (md5('custom_alice')::uuid,md5('equipment_types')::uuid);

insert into public.user_equipment(owner_id,equipment_type_id) values (md5('alice')::uuid,md5('equipment_types')::uuid);

insert into public.user_exercise_preferences(owner_id,exercise_id) values (md5('alice')::uuid,md5('custom_alice')::uuid);

insert into public.programs(id,owner_id,name,cycle_length) values (md5('program_alice')::uuid,md5('alice')::uuid,'alice plan',7);

insert into public.program_days(id,owner_id,program_id,cycle_length,cycle_position,name,is_rest_day) select md5('alice_day_'||n)::uuid,md5('alice')::uuid,md5('program_alice')::uuid,7,n,'Day '||n,n=7 from generate_series(1,7) n;

insert into public.program_slots(id,owner_id,program_day_id,position,exercise_id,target_sets) values (md5('slot_alice')::uuid,md5('alice')::uuid,md5('alice_day_1')::uuid,1,md5('system')::uuid,3);

insert into public.program_assignments(id,owner_id,program_id,cycle_length) values (md5('assignment_alice')::uuid,md5('alice')::uuid,md5('program_alice')::uuid,7);

insert into public.workout_sessions(id,owner_id,name,status,completion_status,started_at,finished_at) values (md5('session_alice')::uuid,md5('alice')::uuid,'alice session','completed','full',now()-interval '1 hour',now());

insert into public.workout_exercises(id,owner_id,workout_session_id,position,exercise_id,exercise_name_snapshot) values (md5('we_alice')::uuid,md5('alice')::uuid,md5('session_alice')::uuid,1,md5('custom_alice')::uuid,'alice custom');

insert into public.workout_sets(id,owner_id,workout_exercise_id,position,status,actual_reps,actual_weight_kg,completed_at) values (md5('set_alice')::uuid,md5('alice')::uuid,md5('we_alice')::uuid,1,'completed',3,30,now());

insert into public.exercises(id,owner_id,name) values (md5('custom_bob')::uuid,md5('bob')::uuid,'bob custom');

insert into public.exercise_movement_patterns(exercise_id,movement_pattern_id) values (md5('custom_bob')::uuid,md5('movement_patterns')::uuid);

insert into public.exercise_muscles(exercise_id,muscle_group_id,muscle_role) values (md5('custom_bob')::uuid,md5('muscle_groups')::uuid,'primary');

insert into public.exercise_equipment(exercise_id,equipment_type_id) values (md5('custom_bob')::uuid,md5('equipment_types')::uuid);

insert into public.user_equipment(owner_id,equipment_type_id) values (md5('bob')::uuid,md5('equipment_types')::uuid);

insert into public.user_exercise_preferences(owner_id,exercise_id) values (md5('bob')::uuid,md5('custom_bob')::uuid);

insert into public.programs(id,owner_id,name,cycle_length) values (md5('program_bob')::uuid,md5('bob')::uuid,'bob plan',10);

insert into public.program_days(id,owner_id,program_id,cycle_length,cycle_position,name,is_rest_day) select md5('bob_day_'||n)::uuid,md5('bob')::uuid,md5('program_bob')::uuid,10,n,'Day '||n,n=10 from generate_series(1,10) n;

insert into public.program_slots(id,owner_id,program_day_id,position,exercise_id,target_sets) values (md5('slot_bob')::uuid,md5('bob')::uuid,md5('bob_day_1')::uuid,1,md5('system')::uuid,3);

insert into public.program_assignments(id,owner_id,program_id,cycle_length) values (md5('assignment_bob')::uuid,md5('bob')::uuid,md5('program_bob')::uuid,10);

insert into public.workout_sessions(id,owner_id,name,status,completion_status,started_at,finished_at) values (md5('session_bob')::uuid,md5('bob')::uuid,'bob session','completed','full',now()-interval '1 hour',now());

insert into public.workout_exercises(id,owner_id,workout_session_id,position,exercise_id,exercise_name_snapshot) values (md5('we_bob')::uuid,md5('bob')::uuid,md5('session_bob')::uuid,1,md5('custom_bob')::uuid,'bob custom');

insert into public.workout_sets(id,owner_id,workout_exercise_id,position,status,actual_reps,actual_weight_kg,completed_at) values (md5('set_bob')::uuid,md5('bob')::uuid,md5('we_bob')::uuid,1,'completed',3,30,now());

insert into public.exercise_movement_patterns(exercise_id,movement_pattern_id) values (md5('system')::uuid,md5('movement_patterns')::uuid);

insert into public.exercise_muscles(exercise_id,muscle_group_id,muscle_role) values (md5('system')::uuid,md5('muscle_groups')::uuid,'primary');

insert into public.exercise_equipment(exercise_id,equipment_type_id) values (md5('system')::uuid,md5('equipment_types')::uuid);

insert into public.programs(id,owner_id,name,cycle_length) values (md5('spare_bob')::uuid,md5('bob')::uuid,'Bob draft',7);

select ok((select relrowsecurity from pg_class where oid='public.movement_patterns'::regclass), 'movement_patterns: RLS enabled');

select ok((select not has_table_privilege('anon','public.movement_patterns','SELECT')), 'movement_patterns: anon has no SELECT');

select ok((select not has_table_privilege('anon','public.movement_patterns','INSERT')), 'movement_patterns: anon has no INSERT');

select ok((select not has_table_privilege('anon','public.movement_patterns','UPDATE')), 'movement_patterns: anon has no UPDATE');

select ok((select not has_table_privilege('anon','public.movement_patterns','DELETE')), 'movement_patterns: anon has no DELETE');

select ok((select not has_table_privilege('anon','public.movement_patterns','TRUNCATE')), 'movement_patterns: anon has no TRUNCATE');

select ok((select not has_table_privilege('anon','public.movement_patterns','REFERENCES')), 'movement_patterns: anon has no REFERENCES');

select ok((select not has_table_privilege('anon','public.movement_patterns','TRIGGER')), 'movement_patterns: anon has no TRIGGER');

select ok((select not has_table_privilege('anon','public.movement_patterns','MAINTAIN')), 'movement_patterns: anon has no MAINTAIN');

select ok((select not has_any_column_privilege('anon','public.movement_patterns','SELECT')), 'movement_patterns: anon has no column SELECT');

select ok((select not has_any_column_privilege('anon','public.movement_patterns','INSERT')), 'movement_patterns: anon has no column INSERT');

select ok((select not has_any_column_privilege('anon','public.movement_patterns','UPDATE')), 'movement_patterns: anon has no column UPDATE');

select ok((select not has_any_column_privilege('anon','public.movement_patterns','REFERENCES')), 'movement_patterns: anon has no column REFERENCES');

select ok((select not has_table_privilege('service_role','public.movement_patterns','SELECT')), 'movement_patterns: service_role has no SELECT');

select ok((select not has_table_privilege('service_role','public.movement_patterns','INSERT')), 'movement_patterns: service_role has no INSERT');

select ok((select not has_table_privilege('service_role','public.movement_patterns','UPDATE')), 'movement_patterns: service_role has no UPDATE');

select ok((select not has_table_privilege('service_role','public.movement_patterns','DELETE')), 'movement_patterns: service_role has no DELETE');

select ok((select not has_table_privilege('service_role','public.movement_patterns','TRUNCATE')), 'movement_patterns: service_role has no TRUNCATE');

select ok((select not has_table_privilege('service_role','public.movement_patterns','REFERENCES')), 'movement_patterns: service_role has no REFERENCES');

select ok((select not has_table_privilege('service_role','public.movement_patterns','TRIGGER')), 'movement_patterns: service_role has no TRIGGER');

select ok((select not has_table_privilege('service_role','public.movement_patterns','MAINTAIN')), 'movement_patterns: service_role has no MAINTAIN');

select ok((select not has_any_column_privilege('service_role','public.movement_patterns','SELECT')), 'movement_patterns: service_role has no column SELECT');

select ok((select not has_any_column_privilege('service_role','public.movement_patterns','INSERT')), 'movement_patterns: service_role has no column INSERT');

select ok((select not has_any_column_privilege('service_role','public.movement_patterns','UPDATE')), 'movement_patterns: service_role has no column UPDATE');

select ok((select not has_any_column_privilege('service_role','public.movement_patterns','REFERENCES')), 'movement_patterns: service_role has no column REFERENCES');

select ok((select not has_table_privilege('authenticated','public.movement_patterns','TRUNCATE')), 'movement_patterns: no broad authenticated TRUNCATE');

select ok((select not has_table_privilege('authenticated','public.movement_patterns','REFERENCES')), 'movement_patterns: no broad authenticated REFERENCES');

select ok((select not has_table_privilege('authenticated','public.movement_patterns','TRIGGER')), 'movement_patterns: no broad authenticated TRIGGER');

select ok((select not has_table_privilege('authenticated','public.movement_patterns','MAINTAIN')), 'movement_patterns: no broad authenticated MAINTAIN');

select ok((select not has_table_privilege('authenticated','public.movement_patterns','INSERT')), 'movement_patterns: no broad authenticated INSERT');

select ok((select not has_table_privilege('authenticated','public.movement_patterns','UPDATE')), 'movement_patterns: no broad authenticated UPDATE');

select ok((select has_table_privilege('authenticated','public.movement_patterns','SELECT')), 'movement_patterns: authenticated SELECT is explicit');

select ok((select has_table_privilege('authenticated','public.movement_patterns','DELETE') = false), 'movement_patterns: DELETE matches reviewed matrix');

select ok((select bool_and(has_column_privilege('authenticated','public.movement_patterns',attname,'INSERT') = (attname = any(array[]::text[]))) from pg_attribute where attrelid='public.movement_patterns'::regclass and attnum>0 and not attisdropped), 'movement_patterns: exact INSERT column allowlist');

select ok((select bool_and(has_column_privilege('authenticated','public.movement_patterns',attname,'UPDATE') = (attname = any(array[]::text[]))) from pg_attribute where attrelid='public.movement_patterns'::regclass and attnum>0 and not attisdropped), 'movement_patterns: exact UPDATE column allowlist');

select ok((select relrowsecurity from pg_class where oid='public.muscle_groups'::regclass), 'muscle_groups: RLS enabled');

select ok((select not has_table_privilege('anon','public.muscle_groups','SELECT')), 'muscle_groups: anon has no SELECT');

select ok((select not has_table_privilege('anon','public.muscle_groups','INSERT')), 'muscle_groups: anon has no INSERT');

select ok((select not has_table_privilege('anon','public.muscle_groups','UPDATE')), 'muscle_groups: anon has no UPDATE');

select ok((select not has_table_privilege('anon','public.muscle_groups','DELETE')), 'muscle_groups: anon has no DELETE');

select ok((select not has_table_privilege('anon','public.muscle_groups','TRUNCATE')), 'muscle_groups: anon has no TRUNCATE');

select ok((select not has_table_privilege('anon','public.muscle_groups','REFERENCES')), 'muscle_groups: anon has no REFERENCES');

select ok((select not has_table_privilege('anon','public.muscle_groups','TRIGGER')), 'muscle_groups: anon has no TRIGGER');

select ok((select not has_table_privilege('anon','public.muscle_groups','MAINTAIN')), 'muscle_groups: anon has no MAINTAIN');

select ok((select not has_any_column_privilege('anon','public.muscle_groups','SELECT')), 'muscle_groups: anon has no column SELECT');

select ok((select not has_any_column_privilege('anon','public.muscle_groups','INSERT')), 'muscle_groups: anon has no column INSERT');

select ok((select not has_any_column_privilege('anon','public.muscle_groups','UPDATE')), 'muscle_groups: anon has no column UPDATE');

select ok((select not has_any_column_privilege('anon','public.muscle_groups','REFERENCES')), 'muscle_groups: anon has no column REFERENCES');

select ok((select not has_table_privilege('service_role','public.muscle_groups','SELECT')), 'muscle_groups: service_role has no SELECT');

select ok((select not has_table_privilege('service_role','public.muscle_groups','INSERT')), 'muscle_groups: service_role has no INSERT');

select ok((select not has_table_privilege('service_role','public.muscle_groups','UPDATE')), 'muscle_groups: service_role has no UPDATE');

select ok((select not has_table_privilege('service_role','public.muscle_groups','DELETE')), 'muscle_groups: service_role has no DELETE');

select ok((select not has_table_privilege('service_role','public.muscle_groups','TRUNCATE')), 'muscle_groups: service_role has no TRUNCATE');

select ok((select not has_table_privilege('service_role','public.muscle_groups','REFERENCES')), 'muscle_groups: service_role has no REFERENCES');

select ok((select not has_table_privilege('service_role','public.muscle_groups','TRIGGER')), 'muscle_groups: service_role has no TRIGGER');

select ok((select not has_table_privilege('service_role','public.muscle_groups','MAINTAIN')), 'muscle_groups: service_role has no MAINTAIN');

select ok((select not has_any_column_privilege('service_role','public.muscle_groups','SELECT')), 'muscle_groups: service_role has no column SELECT');

select ok((select not has_any_column_privilege('service_role','public.muscle_groups','INSERT')), 'muscle_groups: service_role has no column INSERT');

select ok((select not has_any_column_privilege('service_role','public.muscle_groups','UPDATE')), 'muscle_groups: service_role has no column UPDATE');

select ok((select not has_any_column_privilege('service_role','public.muscle_groups','REFERENCES')), 'muscle_groups: service_role has no column REFERENCES');

select ok((select not has_table_privilege('authenticated','public.muscle_groups','TRUNCATE')), 'muscle_groups: no broad authenticated TRUNCATE');

select ok((select not has_table_privilege('authenticated','public.muscle_groups','REFERENCES')), 'muscle_groups: no broad authenticated REFERENCES');

select ok((select not has_table_privilege('authenticated','public.muscle_groups','TRIGGER')), 'muscle_groups: no broad authenticated TRIGGER');

select ok((select not has_table_privilege('authenticated','public.muscle_groups','MAINTAIN')), 'muscle_groups: no broad authenticated MAINTAIN');

select ok((select not has_table_privilege('authenticated','public.muscle_groups','INSERT')), 'muscle_groups: no broad authenticated INSERT');

select ok((select not has_table_privilege('authenticated','public.muscle_groups','UPDATE')), 'muscle_groups: no broad authenticated UPDATE');

select ok((select has_table_privilege('authenticated','public.muscle_groups','SELECT')), 'muscle_groups: authenticated SELECT is explicit');

select ok((select has_table_privilege('authenticated','public.muscle_groups','DELETE') = false), 'muscle_groups: DELETE matches reviewed matrix');

select ok((select bool_and(has_column_privilege('authenticated','public.muscle_groups',attname,'INSERT') = (attname = any(array[]::text[]))) from pg_attribute where attrelid='public.muscle_groups'::regclass and attnum>0 and not attisdropped), 'muscle_groups: exact INSERT column allowlist');

select ok((select bool_and(has_column_privilege('authenticated','public.muscle_groups',attname,'UPDATE') = (attname = any(array[]::text[]))) from pg_attribute where attrelid='public.muscle_groups'::regclass and attnum>0 and not attisdropped), 'muscle_groups: exact UPDATE column allowlist');

select ok((select relrowsecurity from pg_class where oid='public.equipment_types'::regclass), 'equipment_types: RLS enabled');

select ok((select not has_table_privilege('anon','public.equipment_types','SELECT')), 'equipment_types: anon has no SELECT');

select ok((select not has_table_privilege('anon','public.equipment_types','INSERT')), 'equipment_types: anon has no INSERT');

select ok((select not has_table_privilege('anon','public.equipment_types','UPDATE')), 'equipment_types: anon has no UPDATE');

select ok((select not has_table_privilege('anon','public.equipment_types','DELETE')), 'equipment_types: anon has no DELETE');

select ok((select not has_table_privilege('anon','public.equipment_types','TRUNCATE')), 'equipment_types: anon has no TRUNCATE');

select ok((select not has_table_privilege('anon','public.equipment_types','REFERENCES')), 'equipment_types: anon has no REFERENCES');

select ok((select not has_table_privilege('anon','public.equipment_types','TRIGGER')), 'equipment_types: anon has no TRIGGER');

select ok((select not has_table_privilege('anon','public.equipment_types','MAINTAIN')), 'equipment_types: anon has no MAINTAIN');

select ok((select not has_any_column_privilege('anon','public.equipment_types','SELECT')), 'equipment_types: anon has no column SELECT');

select ok((select not has_any_column_privilege('anon','public.equipment_types','INSERT')), 'equipment_types: anon has no column INSERT');

select ok((select not has_any_column_privilege('anon','public.equipment_types','UPDATE')), 'equipment_types: anon has no column UPDATE');

select ok((select not has_any_column_privilege('anon','public.equipment_types','REFERENCES')), 'equipment_types: anon has no column REFERENCES');

select ok((select not has_table_privilege('service_role','public.equipment_types','SELECT')), 'equipment_types: service_role has no SELECT');

select ok((select not has_table_privilege('service_role','public.equipment_types','INSERT')), 'equipment_types: service_role has no INSERT');

select ok((select not has_table_privilege('service_role','public.equipment_types','UPDATE')), 'equipment_types: service_role has no UPDATE');

select ok((select not has_table_privilege('service_role','public.equipment_types','DELETE')), 'equipment_types: service_role has no DELETE');

select ok((select not has_table_privilege('service_role','public.equipment_types','TRUNCATE')), 'equipment_types: service_role has no TRUNCATE');

select ok((select not has_table_privilege('service_role','public.equipment_types','REFERENCES')), 'equipment_types: service_role has no REFERENCES');

select ok((select not has_table_privilege('service_role','public.equipment_types','TRIGGER')), 'equipment_types: service_role has no TRIGGER');

select ok((select not has_table_privilege('service_role','public.equipment_types','MAINTAIN')), 'equipment_types: service_role has no MAINTAIN');

select ok((select not has_any_column_privilege('service_role','public.equipment_types','SELECT')), 'equipment_types: service_role has no column SELECT');

select ok((select not has_any_column_privilege('service_role','public.equipment_types','INSERT')), 'equipment_types: service_role has no column INSERT');

select ok((select not has_any_column_privilege('service_role','public.equipment_types','UPDATE')), 'equipment_types: service_role has no column UPDATE');

select ok((select not has_any_column_privilege('service_role','public.equipment_types','REFERENCES')), 'equipment_types: service_role has no column REFERENCES');

select ok((select not has_table_privilege('authenticated','public.equipment_types','TRUNCATE')), 'equipment_types: no broad authenticated TRUNCATE');

select ok((select not has_table_privilege('authenticated','public.equipment_types','REFERENCES')), 'equipment_types: no broad authenticated REFERENCES');

select ok((select not has_table_privilege('authenticated','public.equipment_types','TRIGGER')), 'equipment_types: no broad authenticated TRIGGER');

select ok((select not has_table_privilege('authenticated','public.equipment_types','MAINTAIN')), 'equipment_types: no broad authenticated MAINTAIN');

select ok((select not has_table_privilege('authenticated','public.equipment_types','INSERT')), 'equipment_types: no broad authenticated INSERT');

select ok((select not has_table_privilege('authenticated','public.equipment_types','UPDATE')), 'equipment_types: no broad authenticated UPDATE');

select ok((select has_table_privilege('authenticated','public.equipment_types','SELECT')), 'equipment_types: authenticated SELECT is explicit');

select ok((select has_table_privilege('authenticated','public.equipment_types','DELETE') = false), 'equipment_types: DELETE matches reviewed matrix');

select ok((select bool_and(has_column_privilege('authenticated','public.equipment_types',attname,'INSERT') = (attname = any(array[]::text[]))) from pg_attribute where attrelid='public.equipment_types'::regclass and attnum>0 and not attisdropped), 'equipment_types: exact INSERT column allowlist');

select ok((select bool_and(has_column_privilege('authenticated','public.equipment_types',attname,'UPDATE') = (attname = any(array[]::text[]))) from pg_attribute where attrelid='public.equipment_types'::regclass and attnum>0 and not attisdropped), 'equipment_types: exact UPDATE column allowlist');

select ok((select relrowsecurity from pg_class where oid='public.profiles'::regclass), 'profiles: RLS enabled');

select ok((select not has_table_privilege('anon','public.profiles','SELECT')), 'profiles: anon has no SELECT');

select ok((select not has_table_privilege('anon','public.profiles','INSERT')), 'profiles: anon has no INSERT');

select ok((select not has_table_privilege('anon','public.profiles','UPDATE')), 'profiles: anon has no UPDATE');

select ok((select not has_table_privilege('anon','public.profiles','DELETE')), 'profiles: anon has no DELETE');

select ok((select not has_table_privilege('anon','public.profiles','TRUNCATE')), 'profiles: anon has no TRUNCATE');

select ok((select not has_table_privilege('anon','public.profiles','REFERENCES')), 'profiles: anon has no REFERENCES');

select ok((select not has_table_privilege('anon','public.profiles','TRIGGER')), 'profiles: anon has no TRIGGER');

select ok((select not has_table_privilege('anon','public.profiles','MAINTAIN')), 'profiles: anon has no MAINTAIN');

select ok((select not has_any_column_privilege('anon','public.profiles','SELECT')), 'profiles: anon has no column SELECT');

select ok((select not has_any_column_privilege('anon','public.profiles','INSERT')), 'profiles: anon has no column INSERT');

select ok((select not has_any_column_privilege('anon','public.profiles','UPDATE')), 'profiles: anon has no column UPDATE');

select ok((select not has_any_column_privilege('anon','public.profiles','REFERENCES')), 'profiles: anon has no column REFERENCES');

select ok((select not has_table_privilege('service_role','public.profiles','SELECT')), 'profiles: service_role has no SELECT');

select ok((select not has_table_privilege('service_role','public.profiles','INSERT')), 'profiles: service_role has no INSERT');

select ok((select not has_table_privilege('service_role','public.profiles','UPDATE')), 'profiles: service_role has no UPDATE');

select ok((select not has_table_privilege('service_role','public.profiles','DELETE')), 'profiles: service_role has no DELETE');

select ok((select not has_table_privilege('service_role','public.profiles','TRUNCATE')), 'profiles: service_role has no TRUNCATE');

select ok((select not has_table_privilege('service_role','public.profiles','REFERENCES')), 'profiles: service_role has no REFERENCES');

select ok((select not has_table_privilege('service_role','public.profiles','TRIGGER')), 'profiles: service_role has no TRIGGER');

select ok((select not has_table_privilege('service_role','public.profiles','MAINTAIN')), 'profiles: service_role has no MAINTAIN');

select ok((select not has_any_column_privilege('service_role','public.profiles','SELECT')), 'profiles: service_role has no column SELECT');

select ok((select not has_any_column_privilege('service_role','public.profiles','INSERT')), 'profiles: service_role has no column INSERT');

select ok((select not has_any_column_privilege('service_role','public.profiles','UPDATE')), 'profiles: service_role has no column UPDATE');

select ok((select not has_any_column_privilege('service_role','public.profiles','REFERENCES')), 'profiles: service_role has no column REFERENCES');

select ok((select not has_table_privilege('authenticated','public.profiles','TRUNCATE')), 'profiles: no broad authenticated TRUNCATE');

select ok((select not has_table_privilege('authenticated','public.profiles','REFERENCES')), 'profiles: no broad authenticated REFERENCES');

select ok((select not has_table_privilege('authenticated','public.profiles','TRIGGER')), 'profiles: no broad authenticated TRIGGER');

select ok((select not has_table_privilege('authenticated','public.profiles','MAINTAIN')), 'profiles: no broad authenticated MAINTAIN');

select ok((select not has_table_privilege('authenticated','public.profiles','INSERT')), 'profiles: no broad authenticated INSERT');

select ok((select not has_table_privilege('authenticated','public.profiles','UPDATE')), 'profiles: no broad authenticated UPDATE');

select ok((select has_table_privilege('authenticated','public.profiles','SELECT')), 'profiles: authenticated SELECT is explicit');

select ok((select has_table_privilege('authenticated','public.profiles','DELETE') = false), 'profiles: DELETE matches reviewed matrix');

select ok((select bool_and(has_column_privilege('authenticated','public.profiles',attname,'INSERT') = (attname = any(array['id','display_name','avatar_url']::text[]))) from pg_attribute where attrelid='public.profiles'::regclass and attnum>0 and not attisdropped), 'profiles: exact INSERT column allowlist');

select ok((select bool_and(has_column_privilege('authenticated','public.profiles',attname,'UPDATE') = (attname = any(array['display_name','avatar_url']::text[]))) from pg_attribute where attrelid='public.profiles'::regclass and attnum>0 and not attisdropped), 'profiles: exact UPDATE column allowlist');

select ok((select relrowsecurity from pg_class where oid='public.account_preferences'::regclass), 'account_preferences: RLS enabled');

select ok((select not has_table_privilege('anon','public.account_preferences','SELECT')), 'account_preferences: anon has no SELECT');

select ok((select not has_table_privilege('anon','public.account_preferences','INSERT')), 'account_preferences: anon has no INSERT');

select ok((select not has_table_privilege('anon','public.account_preferences','UPDATE')), 'account_preferences: anon has no UPDATE');

select ok((select not has_table_privilege('anon','public.account_preferences','DELETE')), 'account_preferences: anon has no DELETE');

select ok((select not has_table_privilege('anon','public.account_preferences','TRUNCATE')), 'account_preferences: anon has no TRUNCATE');

select ok((select not has_table_privilege('anon','public.account_preferences','REFERENCES')), 'account_preferences: anon has no REFERENCES');

select ok((select not has_table_privilege('anon','public.account_preferences','TRIGGER')), 'account_preferences: anon has no TRIGGER');

select ok((select not has_table_privilege('anon','public.account_preferences','MAINTAIN')), 'account_preferences: anon has no MAINTAIN');

select ok((select not has_any_column_privilege('anon','public.account_preferences','SELECT')), 'account_preferences: anon has no column SELECT');

select ok((select not has_any_column_privilege('anon','public.account_preferences','INSERT')), 'account_preferences: anon has no column INSERT');

select ok((select not has_any_column_privilege('anon','public.account_preferences','UPDATE')), 'account_preferences: anon has no column UPDATE');

select ok((select not has_any_column_privilege('anon','public.account_preferences','REFERENCES')), 'account_preferences: anon has no column REFERENCES');

select ok((select not has_table_privilege('service_role','public.account_preferences','SELECT')), 'account_preferences: service_role has no SELECT');

select ok((select not has_table_privilege('service_role','public.account_preferences','INSERT')), 'account_preferences: service_role has no INSERT');

select ok((select not has_table_privilege('service_role','public.account_preferences','UPDATE')), 'account_preferences: service_role has no UPDATE');

select ok((select not has_table_privilege('service_role','public.account_preferences','DELETE')), 'account_preferences: service_role has no DELETE');

select ok((select not has_table_privilege('service_role','public.account_preferences','TRUNCATE')), 'account_preferences: service_role has no TRUNCATE');

select ok((select not has_table_privilege('service_role','public.account_preferences','REFERENCES')), 'account_preferences: service_role has no REFERENCES');

select ok((select not has_table_privilege('service_role','public.account_preferences','TRIGGER')), 'account_preferences: service_role has no TRIGGER');

select ok((select not has_table_privilege('service_role','public.account_preferences','MAINTAIN')), 'account_preferences: service_role has no MAINTAIN');

select ok((select not has_any_column_privilege('service_role','public.account_preferences','SELECT')), 'account_preferences: service_role has no column SELECT');

select ok((select not has_any_column_privilege('service_role','public.account_preferences','INSERT')), 'account_preferences: service_role has no column INSERT');

select ok((select not has_any_column_privilege('service_role','public.account_preferences','UPDATE')), 'account_preferences: service_role has no column UPDATE');

select ok((select not has_any_column_privilege('service_role','public.account_preferences','REFERENCES')), 'account_preferences: service_role has no column REFERENCES');

select ok((select not has_table_privilege('authenticated','public.account_preferences','TRUNCATE')), 'account_preferences: no broad authenticated TRUNCATE');

select ok((select not has_table_privilege('authenticated','public.account_preferences','REFERENCES')), 'account_preferences: no broad authenticated REFERENCES');

select ok((select not has_table_privilege('authenticated','public.account_preferences','TRIGGER')), 'account_preferences: no broad authenticated TRIGGER');

select ok((select not has_table_privilege('authenticated','public.account_preferences','MAINTAIN')), 'account_preferences: no broad authenticated MAINTAIN');

select ok((select not has_table_privilege('authenticated','public.account_preferences','INSERT')), 'account_preferences: no broad authenticated INSERT');

select ok((select not has_table_privilege('authenticated','public.account_preferences','UPDATE')), 'account_preferences: no broad authenticated UPDATE');

select ok((select has_table_privilege('authenticated','public.account_preferences','SELECT')), 'account_preferences: authenticated SELECT is explicit');

select ok((select has_table_privilege('authenticated','public.account_preferences','DELETE') = false), 'account_preferences: DELETE matches reviewed matrix');

select ok((select bool_and(has_column_privilege('authenticated','public.account_preferences',attname,'INSERT') = (attname = any(array['owner_id','date_of_birth','onboarding_completed_at','training_goal','preferred_workouts_per_7_days','preferred_split','display_weight_unit']::text[]))) from pg_attribute where attrelid='public.account_preferences'::regclass and attnum>0 and not attisdropped), 'account_preferences: exact INSERT column allowlist');

select ok((select bool_and(has_column_privilege('authenticated','public.account_preferences',attname,'UPDATE') = (attname = any(array['preferred_effort_scale','date_of_birth','onboarding_completed_at','training_goal','preferred_workouts_per_7_days','preferred_split','display_weight_unit']::text[]))) from pg_attribute where attrelid='public.account_preferences'::regclass and attnum>0 and not attisdropped), 'account_preferences: exact UPDATE column allowlist');

select ok((select relrowsecurity from pg_class where oid='public.exercises'::regclass), 'exercises: RLS enabled');

select ok((select not has_table_privilege('anon','public.exercises','SELECT')), 'exercises: anon has no SELECT');

select ok((select not has_table_privilege('anon','public.exercises','INSERT')), 'exercises: anon has no INSERT');

select ok((select not has_table_privilege('anon','public.exercises','UPDATE')), 'exercises: anon has no UPDATE');

select ok((select not has_table_privilege('anon','public.exercises','DELETE')), 'exercises: anon has no DELETE');

select ok((select not has_table_privilege('anon','public.exercises','TRUNCATE')), 'exercises: anon has no TRUNCATE');

select ok((select not has_table_privilege('anon','public.exercises','REFERENCES')), 'exercises: anon has no REFERENCES');

select ok((select not has_table_privilege('anon','public.exercises','TRIGGER')), 'exercises: anon has no TRIGGER');

select ok((select not has_table_privilege('anon','public.exercises','MAINTAIN')), 'exercises: anon has no MAINTAIN');

select ok((select not has_any_column_privilege('anon','public.exercises','SELECT')), 'exercises: anon has no column SELECT');

select ok((select not has_any_column_privilege('anon','public.exercises','INSERT')), 'exercises: anon has no column INSERT');

select ok((select not has_any_column_privilege('anon','public.exercises','UPDATE')), 'exercises: anon has no column UPDATE');

select ok((select not has_any_column_privilege('anon','public.exercises','REFERENCES')), 'exercises: anon has no column REFERENCES');

select ok((select not has_table_privilege('service_role','public.exercises','SELECT')), 'exercises: service_role has no SELECT');

select ok((select not has_table_privilege('service_role','public.exercises','INSERT')), 'exercises: service_role has no INSERT');

select ok((select not has_table_privilege('service_role','public.exercises','UPDATE')), 'exercises: service_role has no UPDATE');

select ok((select not has_table_privilege('service_role','public.exercises','DELETE')), 'exercises: service_role has no DELETE');

select ok((select not has_table_privilege('service_role','public.exercises','TRUNCATE')), 'exercises: service_role has no TRUNCATE');

select ok((select not has_table_privilege('service_role','public.exercises','REFERENCES')), 'exercises: service_role has no REFERENCES');

select ok((select not has_table_privilege('service_role','public.exercises','TRIGGER')), 'exercises: service_role has no TRIGGER');

select ok((select not has_table_privilege('service_role','public.exercises','MAINTAIN')), 'exercises: service_role has no MAINTAIN');

select ok((select not has_any_column_privilege('service_role','public.exercises','SELECT')), 'exercises: service_role has no column SELECT');

select ok((select not has_any_column_privilege('service_role','public.exercises','INSERT')), 'exercises: service_role has no column INSERT');

select ok((select not has_any_column_privilege('service_role','public.exercises','UPDATE')), 'exercises: service_role has no column UPDATE');

select ok((select not has_any_column_privilege('service_role','public.exercises','REFERENCES')), 'exercises: service_role has no column REFERENCES');

select ok((select not has_table_privilege('authenticated','public.exercises','TRUNCATE')), 'exercises: no broad authenticated TRUNCATE');

select ok((select not has_table_privilege('authenticated','public.exercises','REFERENCES')), 'exercises: no broad authenticated REFERENCES');

select ok((select not has_table_privilege('authenticated','public.exercises','TRIGGER')), 'exercises: no broad authenticated TRIGGER');

select ok((select not has_table_privilege('authenticated','public.exercises','MAINTAIN')), 'exercises: no broad authenticated MAINTAIN');

select ok((select not has_table_privilege('authenticated','public.exercises','INSERT')), 'exercises: no broad authenticated INSERT');

select ok((select not has_table_privilege('authenticated','public.exercises','UPDATE')), 'exercises: no broad authenticated UPDATE');

select ok((select has_table_privilege('authenticated','public.exercises','SELECT')), 'exercises: authenticated SELECT is explicit');

select ok((select has_table_privilege('authenticated','public.exercises','DELETE') = false), 'exercises: DELETE matches reviewed matrix');

select ok((select bool_and(has_column_privilege('authenticated','public.exercises',attname,'INSERT') = (attname = any(array['id','owner_id','name','description','instructions','archived_at','exercise_type']::text[]))) from pg_attribute where attrelid='public.exercises'::regclass and attnum>0 and not attisdropped), 'exercises: exact INSERT column allowlist');

select ok((select bool_and(has_column_privilege('authenticated','public.exercises',attname,'UPDATE') = (attname = any(array['name','description','instructions','archived_at','exercise_type']::text[]))) from pg_attribute where attrelid='public.exercises'::regclass and attnum>0 and not attisdropped), 'exercises: exact UPDATE column allowlist');

select ok((select relrowsecurity from pg_class where oid='public.user_equipment'::regclass), 'user_equipment: RLS enabled');

select ok((select not has_table_privilege('anon','public.user_equipment','SELECT')), 'user_equipment: anon has no SELECT');

select ok((select not has_table_privilege('anon','public.user_equipment','INSERT')), 'user_equipment: anon has no INSERT');

select ok((select not has_table_privilege('anon','public.user_equipment','UPDATE')), 'user_equipment: anon has no UPDATE');

select ok((select not has_table_privilege('anon','public.user_equipment','DELETE')), 'user_equipment: anon has no DELETE');

select ok((select not has_table_privilege('anon','public.user_equipment','TRUNCATE')), 'user_equipment: anon has no TRUNCATE');

select ok((select not has_table_privilege('anon','public.user_equipment','REFERENCES')), 'user_equipment: anon has no REFERENCES');

select ok((select not has_table_privilege('anon','public.user_equipment','TRIGGER')), 'user_equipment: anon has no TRIGGER');

select ok((select not has_table_privilege('anon','public.user_equipment','MAINTAIN')), 'user_equipment: anon has no MAINTAIN');

select ok((select not has_any_column_privilege('anon','public.user_equipment','SELECT')), 'user_equipment: anon has no column SELECT');

select ok((select not has_any_column_privilege('anon','public.user_equipment','INSERT')), 'user_equipment: anon has no column INSERT');

select ok((select not has_any_column_privilege('anon','public.user_equipment','UPDATE')), 'user_equipment: anon has no column UPDATE');

select ok((select not has_any_column_privilege('anon','public.user_equipment','REFERENCES')), 'user_equipment: anon has no column REFERENCES');

select ok((select not has_table_privilege('service_role','public.user_equipment','SELECT')), 'user_equipment: service_role has no SELECT');

select ok((select not has_table_privilege('service_role','public.user_equipment','INSERT')), 'user_equipment: service_role has no INSERT');

select ok((select not has_table_privilege('service_role','public.user_equipment','UPDATE')), 'user_equipment: service_role has no UPDATE');

select ok((select not has_table_privilege('service_role','public.user_equipment','DELETE')), 'user_equipment: service_role has no DELETE');

select ok((select not has_table_privilege('service_role','public.user_equipment','TRUNCATE')), 'user_equipment: service_role has no TRUNCATE');

select ok((select not has_table_privilege('service_role','public.user_equipment','REFERENCES')), 'user_equipment: service_role has no REFERENCES');

select ok((select not has_table_privilege('service_role','public.user_equipment','TRIGGER')), 'user_equipment: service_role has no TRIGGER');

select ok((select not has_table_privilege('service_role','public.user_equipment','MAINTAIN')), 'user_equipment: service_role has no MAINTAIN');

select ok((select not has_any_column_privilege('service_role','public.user_equipment','SELECT')), 'user_equipment: service_role has no column SELECT');

select ok((select not has_any_column_privilege('service_role','public.user_equipment','INSERT')), 'user_equipment: service_role has no column INSERT');

select ok((select not has_any_column_privilege('service_role','public.user_equipment','UPDATE')), 'user_equipment: service_role has no column UPDATE');

select ok((select not has_any_column_privilege('service_role','public.user_equipment','REFERENCES')), 'user_equipment: service_role has no column REFERENCES');

select ok((select not has_table_privilege('authenticated','public.user_equipment','TRUNCATE')), 'user_equipment: no broad authenticated TRUNCATE');

select ok((select not has_table_privilege('authenticated','public.user_equipment','REFERENCES')), 'user_equipment: no broad authenticated REFERENCES');

select ok((select not has_table_privilege('authenticated','public.user_equipment','TRIGGER')), 'user_equipment: no broad authenticated TRIGGER');

select ok((select not has_table_privilege('authenticated','public.user_equipment','MAINTAIN')), 'user_equipment: no broad authenticated MAINTAIN');

select ok((select not has_table_privilege('authenticated','public.user_equipment','INSERT')), 'user_equipment: no broad authenticated INSERT');

select ok((select not has_table_privilege('authenticated','public.user_equipment','UPDATE')), 'user_equipment: no broad authenticated UPDATE');

select ok((select has_table_privilege('authenticated','public.user_equipment','SELECT')), 'user_equipment: authenticated SELECT is explicit');

select ok((select has_table_privilege('authenticated','public.user_equipment','DELETE') = true), 'user_equipment: DELETE matches reviewed matrix');

select ok((select bool_and(has_column_privilege('authenticated','public.user_equipment',attname,'INSERT') = (attname = any(array['owner_id','equipment_type_id']::text[]))) from pg_attribute where attrelid='public.user_equipment'::regclass and attnum>0 and not attisdropped), 'user_equipment: exact INSERT column allowlist');

select ok((select bool_and(has_column_privilege('authenticated','public.user_equipment',attname,'UPDATE') = (attname = any(array[]::text[]))) from pg_attribute where attrelid='public.user_equipment'::regclass and attnum>0 and not attisdropped), 'user_equipment: exact UPDATE column allowlist');

select ok((select relrowsecurity from pg_class where oid='public.user_exercise_preferences'::regclass), 'user_exercise_preferences: RLS enabled');

select ok((select not has_table_privilege('anon','public.user_exercise_preferences','SELECT')), 'user_exercise_preferences: anon has no SELECT');

select ok((select not has_table_privilege('anon','public.user_exercise_preferences','INSERT')), 'user_exercise_preferences: anon has no INSERT');

select ok((select not has_table_privilege('anon','public.user_exercise_preferences','UPDATE')), 'user_exercise_preferences: anon has no UPDATE');

select ok((select not has_table_privilege('anon','public.user_exercise_preferences','DELETE')), 'user_exercise_preferences: anon has no DELETE');

select ok((select not has_table_privilege('anon','public.user_exercise_preferences','TRUNCATE')), 'user_exercise_preferences: anon has no TRUNCATE');

select ok((select not has_table_privilege('anon','public.user_exercise_preferences','REFERENCES')), 'user_exercise_preferences: anon has no REFERENCES');

select ok((select not has_table_privilege('anon','public.user_exercise_preferences','TRIGGER')), 'user_exercise_preferences: anon has no TRIGGER');

select ok((select not has_table_privilege('anon','public.user_exercise_preferences','MAINTAIN')), 'user_exercise_preferences: anon has no MAINTAIN');

select ok((select not has_any_column_privilege('anon','public.user_exercise_preferences','SELECT')), 'user_exercise_preferences: anon has no column SELECT');

select ok((select not has_any_column_privilege('anon','public.user_exercise_preferences','INSERT')), 'user_exercise_preferences: anon has no column INSERT');

select ok((select not has_any_column_privilege('anon','public.user_exercise_preferences','UPDATE')), 'user_exercise_preferences: anon has no column UPDATE');

select ok((select not has_any_column_privilege('anon','public.user_exercise_preferences','REFERENCES')), 'user_exercise_preferences: anon has no column REFERENCES');

select ok((select not has_table_privilege('service_role','public.user_exercise_preferences','SELECT')), 'user_exercise_preferences: service_role has no SELECT');

select ok((select not has_table_privilege('service_role','public.user_exercise_preferences','INSERT')), 'user_exercise_preferences: service_role has no INSERT');

select ok((select not has_table_privilege('service_role','public.user_exercise_preferences','UPDATE')), 'user_exercise_preferences: service_role has no UPDATE');

select ok((select not has_table_privilege('service_role','public.user_exercise_preferences','DELETE')), 'user_exercise_preferences: service_role has no DELETE');

select ok((select not has_table_privilege('service_role','public.user_exercise_preferences','TRUNCATE')), 'user_exercise_preferences: service_role has no TRUNCATE');

select ok((select not has_table_privilege('service_role','public.user_exercise_preferences','REFERENCES')), 'user_exercise_preferences: service_role has no REFERENCES');

select ok((select not has_table_privilege('service_role','public.user_exercise_preferences','TRIGGER')), 'user_exercise_preferences: service_role has no TRIGGER');

select ok((select not has_table_privilege('service_role','public.user_exercise_preferences','MAINTAIN')), 'user_exercise_preferences: service_role has no MAINTAIN');

select ok((select not has_any_column_privilege('service_role','public.user_exercise_preferences','SELECT')), 'user_exercise_preferences: service_role has no column SELECT');

select ok((select not has_any_column_privilege('service_role','public.user_exercise_preferences','INSERT')), 'user_exercise_preferences: service_role has no column INSERT');

select ok((select not has_any_column_privilege('service_role','public.user_exercise_preferences','UPDATE')), 'user_exercise_preferences: service_role has no column UPDATE');

select ok((select not has_any_column_privilege('service_role','public.user_exercise_preferences','REFERENCES')), 'user_exercise_preferences: service_role has no column REFERENCES');

select ok((select not has_table_privilege('authenticated','public.user_exercise_preferences','TRUNCATE')), 'user_exercise_preferences: no broad authenticated TRUNCATE');

select ok((select not has_table_privilege('authenticated','public.user_exercise_preferences','REFERENCES')), 'user_exercise_preferences: no broad authenticated REFERENCES');

select ok((select not has_table_privilege('authenticated','public.user_exercise_preferences','TRIGGER')), 'user_exercise_preferences: no broad authenticated TRIGGER');

select ok((select not has_table_privilege('authenticated','public.user_exercise_preferences','MAINTAIN')), 'user_exercise_preferences: no broad authenticated MAINTAIN');

select ok((select not has_table_privilege('authenticated','public.user_exercise_preferences','INSERT')), 'user_exercise_preferences: no broad authenticated INSERT');

select ok((select not has_table_privilege('authenticated','public.user_exercise_preferences','UPDATE')), 'user_exercise_preferences: no broad authenticated UPDATE');

select ok((select has_table_privilege('authenticated','public.user_exercise_preferences','SELECT')), 'user_exercise_preferences: authenticated SELECT is explicit');

select ok((select has_table_privilege('authenticated','public.user_exercise_preferences','DELETE') = true), 'user_exercise_preferences: DELETE matches reviewed matrix');

select ok((select bool_and(has_column_privilege('authenticated','public.user_exercise_preferences',attname,'INSERT') = (attname = any(array['owner_id','exercise_id','is_favorite','preference','notes']::text[]))) from pg_attribute where attrelid='public.user_exercise_preferences'::regclass and attnum>0 and not attisdropped), 'user_exercise_preferences: exact INSERT column allowlist');

select ok((select bool_and(has_column_privilege('authenticated','public.user_exercise_preferences',attname,'UPDATE') = (attname = any(array['is_favorite','preference','notes']::text[]))) from pg_attribute where attrelid='public.user_exercise_preferences'::regclass and attnum>0 and not attisdropped), 'user_exercise_preferences: exact UPDATE column allowlist');

select ok((select relrowsecurity from pg_class where oid='public.programs'::regclass), 'programs: RLS enabled');

select ok((select not has_table_privilege('anon','public.programs','SELECT')), 'programs: anon has no SELECT');

select ok((select not has_table_privilege('anon','public.programs','INSERT')), 'programs: anon has no INSERT');

select ok((select not has_table_privilege('anon','public.programs','UPDATE')), 'programs: anon has no UPDATE');

select ok((select not has_table_privilege('anon','public.programs','DELETE')), 'programs: anon has no DELETE');

select ok((select not has_table_privilege('anon','public.programs','TRUNCATE')), 'programs: anon has no TRUNCATE');

select ok((select not has_table_privilege('anon','public.programs','REFERENCES')), 'programs: anon has no REFERENCES');

select ok((select not has_table_privilege('anon','public.programs','TRIGGER')), 'programs: anon has no TRIGGER');

select ok((select not has_table_privilege('anon','public.programs','MAINTAIN')), 'programs: anon has no MAINTAIN');

select ok((select not has_any_column_privilege('anon','public.programs','SELECT')), 'programs: anon has no column SELECT');

select ok((select not has_any_column_privilege('anon','public.programs','INSERT')), 'programs: anon has no column INSERT');

select ok((select not has_any_column_privilege('anon','public.programs','UPDATE')), 'programs: anon has no column UPDATE');

select ok((select not has_any_column_privilege('anon','public.programs','REFERENCES')), 'programs: anon has no column REFERENCES');

select ok((select not has_table_privilege('service_role','public.programs','SELECT')), 'programs: service_role has no SELECT');

select ok((select not has_table_privilege('service_role','public.programs','INSERT')), 'programs: service_role has no INSERT');

select ok((select not has_table_privilege('service_role','public.programs','UPDATE')), 'programs: service_role has no UPDATE');

select ok((select not has_table_privilege('service_role','public.programs','DELETE')), 'programs: service_role has no DELETE');

select ok((select not has_table_privilege('service_role','public.programs','TRUNCATE')), 'programs: service_role has no TRUNCATE');

select ok((select not has_table_privilege('service_role','public.programs','REFERENCES')), 'programs: service_role has no REFERENCES');

select ok((select not has_table_privilege('service_role','public.programs','TRIGGER')), 'programs: service_role has no TRIGGER');

select ok((select not has_table_privilege('service_role','public.programs','MAINTAIN')), 'programs: service_role has no MAINTAIN');

select ok((select not has_any_column_privilege('service_role','public.programs','SELECT')), 'programs: service_role has no column SELECT');

select ok((select not has_any_column_privilege('service_role','public.programs','INSERT')), 'programs: service_role has no column INSERT');

select ok((select not has_any_column_privilege('service_role','public.programs','UPDATE')), 'programs: service_role has no column UPDATE');

select ok((select not has_any_column_privilege('service_role','public.programs','REFERENCES')), 'programs: service_role has no column REFERENCES');

select ok((select not has_table_privilege('authenticated','public.programs','TRUNCATE')), 'programs: no broad authenticated TRUNCATE');

select ok((select not has_table_privilege('authenticated','public.programs','REFERENCES')), 'programs: no broad authenticated REFERENCES');

select ok((select not has_table_privilege('authenticated','public.programs','TRIGGER')), 'programs: no broad authenticated TRIGGER');

select ok((select not has_table_privilege('authenticated','public.programs','MAINTAIN')), 'programs: no broad authenticated MAINTAIN');

select ok((select not has_table_privilege('authenticated','public.programs','INSERT')), 'programs: no broad authenticated INSERT');

select ok((select not has_table_privilege('authenticated','public.programs','UPDATE')), 'programs: no broad authenticated UPDATE');

select ok((select has_table_privilege('authenticated','public.programs','SELECT')), 'programs: authenticated SELECT is explicit');

select ok((select has_table_privilege('authenticated','public.programs','DELETE') = false), 'programs: DELETE matches reviewed matrix');

select ok((select bool_and(has_column_privilege('authenticated','public.programs',attname,'INSERT') = (attname = any(array['slug','summary','description_markdown','cover_media_id','sessions_min','sessions_max','session_minutes_min','session_minutes_max','flexible_rotation','objective','experience_level','estimated_sessions_per_week','duration_rotations','visibility','lifecycle_status','source_version_id','clone_request_id','id','owner_id','name','description','is_template','cycle_length','revision','derived_from_program_id','archived_at']::text[]))) from pg_attribute where attrelid='public.programs'::regclass and attnum>0 and not attisdropped), 'programs: exact INSERT column allowlist');

select ok((select bool_and(has_column_privilege('authenticated','public.programs',attname,'UPDATE') = (attname = any(array['slug','summary','description_markdown','cover_media_id','sessions_min','sessions_max','session_minutes_min','session_minutes_max','flexible_rotation','objective','experience_level','estimated_sessions_per_week','duration_rotations','visibility','lifecycle_status','name','description','is_template','cycle_length','revision','derived_from_program_id','archived_at']::text[]))) from pg_attribute where attrelid='public.programs'::regclass and attnum>0 and not attisdropped), 'programs: exact UPDATE column allowlist');

select ok((select relrowsecurity from pg_class where oid='public.program_days'::regclass), 'program_days: RLS enabled');

select ok((select not has_table_privilege('anon','public.program_days','SELECT')), 'program_days: anon has no SELECT');

select ok((select not has_table_privilege('anon','public.program_days','INSERT')), 'program_days: anon has no INSERT');

select ok((select not has_table_privilege('anon','public.program_days','UPDATE')), 'program_days: anon has no UPDATE');

select ok((select not has_table_privilege('anon','public.program_days','DELETE')), 'program_days: anon has no DELETE');

select ok((select not has_table_privilege('anon','public.program_days','TRUNCATE')), 'program_days: anon has no TRUNCATE');

select ok((select not has_table_privilege('anon','public.program_days','REFERENCES')), 'program_days: anon has no REFERENCES');

select ok((select not has_table_privilege('anon','public.program_days','TRIGGER')), 'program_days: anon has no TRIGGER');

select ok((select not has_table_privilege('anon','public.program_days','MAINTAIN')), 'program_days: anon has no MAINTAIN');

select ok((select not has_any_column_privilege('anon','public.program_days','SELECT')), 'program_days: anon has no column SELECT');

select ok((select not has_any_column_privilege('anon','public.program_days','INSERT')), 'program_days: anon has no column INSERT');

select ok((select not has_any_column_privilege('anon','public.program_days','UPDATE')), 'program_days: anon has no column UPDATE');

select ok((select not has_any_column_privilege('anon','public.program_days','REFERENCES')), 'program_days: anon has no column REFERENCES');

select ok((select not has_table_privilege('service_role','public.program_days','SELECT')), 'program_days: service_role has no SELECT');

select ok((select not has_table_privilege('service_role','public.program_days','INSERT')), 'program_days: service_role has no INSERT');

select ok((select not has_table_privilege('service_role','public.program_days','UPDATE')), 'program_days: service_role has no UPDATE');

select ok((select not has_table_privilege('service_role','public.program_days','DELETE')), 'program_days: service_role has no DELETE');

select ok((select not has_table_privilege('service_role','public.program_days','TRUNCATE')), 'program_days: service_role has no TRUNCATE');

select ok((select not has_table_privilege('service_role','public.program_days','REFERENCES')), 'program_days: service_role has no REFERENCES');

select ok((select not has_table_privilege('service_role','public.program_days','TRIGGER')), 'program_days: service_role has no TRIGGER');

select ok((select not has_table_privilege('service_role','public.program_days','MAINTAIN')), 'program_days: service_role has no MAINTAIN');

select ok((select not has_any_column_privilege('service_role','public.program_days','SELECT')), 'program_days: service_role has no column SELECT');

select ok((select not has_any_column_privilege('service_role','public.program_days','INSERT')), 'program_days: service_role has no column INSERT');

select ok((select not has_any_column_privilege('service_role','public.program_days','UPDATE')), 'program_days: service_role has no column UPDATE');

select ok((select not has_any_column_privilege('service_role','public.program_days','REFERENCES')), 'program_days: service_role has no column REFERENCES');

select ok((select not has_table_privilege('authenticated','public.program_days','TRUNCATE')), 'program_days: no broad authenticated TRUNCATE');

select ok((select not has_table_privilege('authenticated','public.program_days','REFERENCES')), 'program_days: no broad authenticated REFERENCES');

select ok((select not has_table_privilege('authenticated','public.program_days','TRIGGER')), 'program_days: no broad authenticated TRIGGER');

select ok((select not has_table_privilege('authenticated','public.program_days','MAINTAIN')), 'program_days: no broad authenticated MAINTAIN');

select ok((select not has_table_privilege('authenticated','public.program_days','INSERT')), 'program_days: no broad authenticated INSERT');

select ok((select not has_table_privilege('authenticated','public.program_days','UPDATE')), 'program_days: no broad authenticated UPDATE');

select ok((select has_table_privilege('authenticated','public.program_days','SELECT')), 'program_days: authenticated SELECT is explicit');

select ok((select has_table_privilege('authenticated','public.program_days','DELETE') = true), 'program_days: DELETE matches reviewed matrix');

select ok((select bool_and(has_column_privilege('authenticated','public.program_days',attname,'INSERT') = (attname = any(array['focus','phase_number','minimum_rest_hours','maximum_rest_hours','id','owner_id','program_id','cycle_length','cycle_position','name','is_rest_day','notes']::text[]))) from pg_attribute where attrelid='public.program_days'::regclass and attnum>0 and not attisdropped), 'program_days: exact INSERT column allowlist');

select ok((select bool_and(has_column_privilege('authenticated','public.program_days',attname,'UPDATE') = (attname = any(array['focus','phase_number','minimum_rest_hours','maximum_rest_hours','cycle_position','name','is_rest_day','notes']::text[]))) from pg_attribute where attrelid='public.program_days'::regclass and attnum>0 and not attisdropped), 'program_days: exact UPDATE column allowlist');

select ok((select relrowsecurity from pg_class where oid='public.program_slots'::regclass), 'program_slots: RLS enabled');

select ok((select not has_table_privilege('anon','public.program_slots','SELECT')), 'program_slots: anon has no SELECT');

select ok((select not has_table_privilege('anon','public.program_slots','INSERT')), 'program_slots: anon has no INSERT');

select ok((select not has_table_privilege('anon','public.program_slots','UPDATE')), 'program_slots: anon has no UPDATE');

select ok((select not has_table_privilege('anon','public.program_slots','DELETE')), 'program_slots: anon has no DELETE');

select ok((select not has_table_privilege('anon','public.program_slots','TRUNCATE')), 'program_slots: anon has no TRUNCATE');

select ok((select not has_table_privilege('anon','public.program_slots','REFERENCES')), 'program_slots: anon has no REFERENCES');

select ok((select not has_table_privilege('anon','public.program_slots','TRIGGER')), 'program_slots: anon has no TRIGGER');

select ok((select not has_table_privilege('anon','public.program_slots','MAINTAIN')), 'program_slots: anon has no MAINTAIN');

select ok((select not has_any_column_privilege('anon','public.program_slots','SELECT')), 'program_slots: anon has no column SELECT');

select ok((select not has_any_column_privilege('anon','public.program_slots','INSERT')), 'program_slots: anon has no column INSERT');

select ok((select not has_any_column_privilege('anon','public.program_slots','UPDATE')), 'program_slots: anon has no column UPDATE');

select ok((select not has_any_column_privilege('anon','public.program_slots','REFERENCES')), 'program_slots: anon has no column REFERENCES');

select ok((select not has_table_privilege('service_role','public.program_slots','SELECT')), 'program_slots: service_role has no SELECT');

select ok((select not has_table_privilege('service_role','public.program_slots','INSERT')), 'program_slots: service_role has no INSERT');

select ok((select not has_table_privilege('service_role','public.program_slots','UPDATE')), 'program_slots: service_role has no UPDATE');

select ok((select not has_table_privilege('service_role','public.program_slots','DELETE')), 'program_slots: service_role has no DELETE');

select ok((select not has_table_privilege('service_role','public.program_slots','TRUNCATE')), 'program_slots: service_role has no TRUNCATE');

select ok((select not has_table_privilege('service_role','public.program_slots','REFERENCES')), 'program_slots: service_role has no REFERENCES');

select ok((select not has_table_privilege('service_role','public.program_slots','TRIGGER')), 'program_slots: service_role has no TRIGGER');

select ok((select not has_table_privilege('service_role','public.program_slots','MAINTAIN')), 'program_slots: service_role has no MAINTAIN');

select ok((select not has_any_column_privilege('service_role','public.program_slots','SELECT')), 'program_slots: service_role has no column SELECT');

select ok((select not has_any_column_privilege('service_role','public.program_slots','INSERT')), 'program_slots: service_role has no column INSERT');

select ok((select not has_any_column_privilege('service_role','public.program_slots','UPDATE')), 'program_slots: service_role has no column UPDATE');

select ok((select not has_any_column_privilege('service_role','public.program_slots','REFERENCES')), 'program_slots: service_role has no column REFERENCES');

select ok((select not has_table_privilege('authenticated','public.program_slots','TRUNCATE')), 'program_slots: no broad authenticated TRUNCATE');

select ok((select not has_table_privilege('authenticated','public.program_slots','REFERENCES')), 'program_slots: no broad authenticated REFERENCES');

select ok((select not has_table_privilege('authenticated','public.program_slots','TRIGGER')), 'program_slots: no broad authenticated TRIGGER');

select ok((select not has_table_privilege('authenticated','public.program_slots','MAINTAIN')), 'program_slots: no broad authenticated MAINTAIN');

select ok((select not has_table_privilege('authenticated','public.program_slots','INSERT')), 'program_slots: no broad authenticated INSERT');

select ok((select not has_table_privilege('authenticated','public.program_slots','UPDATE')), 'program_slots: no broad authenticated UPDATE');

select ok((select has_table_privilege('authenticated','public.program_slots','SELECT')), 'program_slots: authenticated SELECT is explicit');

select ok((select has_table_privilege('authenticated','public.program_slots','DELETE') = true), 'program_slots: DELETE matches reviewed matrix');

select ok((select bool_and(has_column_privilege('authenticated','public.program_slots',attname,'INSERT') = (attname = any(array['primary_muscle_id','required_exercise_type','exercise_locked','is_optional','rest_seconds_max','progression_rule_id','id','owner_id','program_day_id','position','movement_pattern_id','exercise_id','target_sets','target_reps_min','target_reps_max','target_weight_kg','rest_seconds','notes']::text[]))) from pg_attribute where attrelid='public.program_slots'::regclass and attnum>0 and not attisdropped), 'program_slots: exact INSERT column allowlist');

select ok((select bool_and(has_column_privilege('authenticated','public.program_slots',attname,'UPDATE') = (attname = any(array['primary_muscle_id','required_exercise_type','exercise_locked','is_optional','rest_seconds_max','progression_rule_id','position','movement_pattern_id','exercise_id','target_sets','target_reps_min','target_reps_max','target_weight_kg','rest_seconds','notes']::text[]))) from pg_attribute where attrelid='public.program_slots'::regclass and attnum>0 and not attisdropped), 'program_slots: exact UPDATE column allowlist');

select ok((select relrowsecurity from pg_class where oid='public.program_assignments'::regclass), 'program_assignments: RLS enabled');

select ok((select not has_table_privilege('anon','public.program_assignments','SELECT')), 'program_assignments: anon has no SELECT');

select ok((select not has_table_privilege('anon','public.program_assignments','INSERT')), 'program_assignments: anon has no INSERT');

select ok((select not has_table_privilege('anon','public.program_assignments','UPDATE')), 'program_assignments: anon has no UPDATE');

select ok((select not has_table_privilege('anon','public.program_assignments','DELETE')), 'program_assignments: anon has no DELETE');

select ok((select not has_table_privilege('anon','public.program_assignments','TRUNCATE')), 'program_assignments: anon has no TRUNCATE');

select ok((select not has_table_privilege('anon','public.program_assignments','REFERENCES')), 'program_assignments: anon has no REFERENCES');

select ok((select not has_table_privilege('anon','public.program_assignments','TRIGGER')), 'program_assignments: anon has no TRIGGER');

select ok((select not has_table_privilege('anon','public.program_assignments','MAINTAIN')), 'program_assignments: anon has no MAINTAIN');

select ok((select not has_any_column_privilege('anon','public.program_assignments','SELECT')), 'program_assignments: anon has no column SELECT');

select ok((select not has_any_column_privilege('anon','public.program_assignments','INSERT')), 'program_assignments: anon has no column INSERT');

select ok((select not has_any_column_privilege('anon','public.program_assignments','UPDATE')), 'program_assignments: anon has no column UPDATE');

select ok((select not has_any_column_privilege('anon','public.program_assignments','REFERENCES')), 'program_assignments: anon has no column REFERENCES');

select ok((select not has_table_privilege('service_role','public.program_assignments','SELECT')), 'program_assignments: service_role has no SELECT');

select ok((select not has_table_privilege('service_role','public.program_assignments','INSERT')), 'program_assignments: service_role has no INSERT');

select ok((select not has_table_privilege('service_role','public.program_assignments','UPDATE')), 'program_assignments: service_role has no UPDATE');

select ok((select not has_table_privilege('service_role','public.program_assignments','DELETE')), 'program_assignments: service_role has no DELETE');

select ok((select not has_table_privilege('service_role','public.program_assignments','TRUNCATE')), 'program_assignments: service_role has no TRUNCATE');

select ok((select not has_table_privilege('service_role','public.program_assignments','REFERENCES')), 'program_assignments: service_role has no REFERENCES');

select ok((select not has_table_privilege('service_role','public.program_assignments','TRIGGER')), 'program_assignments: service_role has no TRIGGER');

select ok((select not has_table_privilege('service_role','public.program_assignments','MAINTAIN')), 'program_assignments: service_role has no MAINTAIN');

select ok((select not has_any_column_privilege('service_role','public.program_assignments','SELECT')), 'program_assignments: service_role has no column SELECT');

select ok((select not has_any_column_privilege('service_role','public.program_assignments','INSERT')), 'program_assignments: service_role has no column INSERT');

select ok((select not has_any_column_privilege('service_role','public.program_assignments','UPDATE')), 'program_assignments: service_role has no column UPDATE');

select ok((select not has_any_column_privilege('service_role','public.program_assignments','REFERENCES')), 'program_assignments: service_role has no column REFERENCES');

select ok((select not has_table_privilege('authenticated','public.program_assignments','TRUNCATE')), 'program_assignments: no broad authenticated TRUNCATE');

select ok((select not has_table_privilege('authenticated','public.program_assignments','REFERENCES')), 'program_assignments: no broad authenticated REFERENCES');

select ok((select not has_table_privilege('authenticated','public.program_assignments','TRIGGER')), 'program_assignments: no broad authenticated TRIGGER');

select ok((select not has_table_privilege('authenticated','public.program_assignments','MAINTAIN')), 'program_assignments: no broad authenticated MAINTAIN');

select ok((select not has_table_privilege('authenticated','public.program_assignments','INSERT')), 'program_assignments: no broad authenticated INSERT');

select ok((select not has_table_privilege('authenticated','public.program_assignments','UPDATE')), 'program_assignments: no broad authenticated UPDATE');

select ok((select has_table_privilege('authenticated','public.program_assignments','SELECT')), 'program_assignments: authenticated SELECT is explicit');

select ok((select has_table_privilege('authenticated','public.program_assignments','DELETE') = false), 'program_assignments: DELETE matches reviewed matrix');

select ok((select bool_and(has_column_privilege('authenticated','public.program_assignments',attname,'INSERT') = (attname = any(array['id','owner_id','program_id','cycle_length','state','next_cycle_position','completed_rotations','started_at','ended_at','source_version_id']::text[]))) from pg_attribute where attrelid='public.program_assignments'::regclass and attnum>0 and not attisdropped), 'program_assignments: exact INSERT column allowlist');

select ok((select bool_and(has_column_privilege('authenticated','public.program_assignments',attname,'UPDATE') = (attname = any(array['state','next_cycle_position','completed_rotations','ended_at']::text[]))) from pg_attribute where attrelid='public.program_assignments'::regclass and attnum>0 and not attisdropped), 'program_assignments: exact UPDATE column allowlist');

select ok((select relrowsecurity from pg_class where oid='public.workout_sessions'::regclass), 'workout_sessions: RLS enabled');

select ok((select not has_table_privilege('anon','public.workout_sessions','SELECT')), 'workout_sessions: anon has no SELECT');

select ok((select not has_table_privilege('anon','public.workout_sessions','INSERT')), 'workout_sessions: anon has no INSERT');

select ok((select not has_table_privilege('anon','public.workout_sessions','UPDATE')), 'workout_sessions: anon has no UPDATE');

select ok((select not has_table_privilege('anon','public.workout_sessions','DELETE')), 'workout_sessions: anon has no DELETE');

select ok((select not has_table_privilege('anon','public.workout_sessions','TRUNCATE')), 'workout_sessions: anon has no TRUNCATE');

select ok((select not has_table_privilege('anon','public.workout_sessions','REFERENCES')), 'workout_sessions: anon has no REFERENCES');

select ok((select not has_table_privilege('anon','public.workout_sessions','TRIGGER')), 'workout_sessions: anon has no TRIGGER');

select ok((select not has_table_privilege('anon','public.workout_sessions','MAINTAIN')), 'workout_sessions: anon has no MAINTAIN');

select ok((select not has_any_column_privilege('anon','public.workout_sessions','SELECT')), 'workout_sessions: anon has no column SELECT');

select ok((select not has_any_column_privilege('anon','public.workout_sessions','INSERT')), 'workout_sessions: anon has no column INSERT');

select ok((select not has_any_column_privilege('anon','public.workout_sessions','UPDATE')), 'workout_sessions: anon has no column UPDATE');

select ok((select not has_any_column_privilege('anon','public.workout_sessions','REFERENCES')), 'workout_sessions: anon has no column REFERENCES');

select ok((select not has_table_privilege('service_role','public.workout_sessions','SELECT')), 'workout_sessions: service_role has no SELECT');

select ok((select not has_table_privilege('service_role','public.workout_sessions','INSERT')), 'workout_sessions: service_role has no INSERT');

select ok((select not has_table_privilege('service_role','public.workout_sessions','UPDATE')), 'workout_sessions: service_role has no UPDATE');

select ok((select not has_table_privilege('service_role','public.workout_sessions','DELETE')), 'workout_sessions: service_role has no DELETE');

select ok((select not has_table_privilege('service_role','public.workout_sessions','TRUNCATE')), 'workout_sessions: service_role has no TRUNCATE');

select ok((select not has_table_privilege('service_role','public.workout_sessions','REFERENCES')), 'workout_sessions: service_role has no REFERENCES');

select ok((select not has_table_privilege('service_role','public.workout_sessions','TRIGGER')), 'workout_sessions: service_role has no TRIGGER');

select ok((select not has_table_privilege('service_role','public.workout_sessions','MAINTAIN')), 'workout_sessions: service_role has no MAINTAIN');

select ok((select not has_any_column_privilege('service_role','public.workout_sessions','SELECT')), 'workout_sessions: service_role has no column SELECT');

select ok((select not has_any_column_privilege('service_role','public.workout_sessions','INSERT')), 'workout_sessions: service_role has no column INSERT');

select ok((select not has_any_column_privilege('service_role','public.workout_sessions','UPDATE')), 'workout_sessions: service_role has no column UPDATE');

select ok((select not has_any_column_privilege('service_role','public.workout_sessions','REFERENCES')), 'workout_sessions: service_role has no column REFERENCES');

select ok((select not has_table_privilege('authenticated','public.workout_sessions','TRUNCATE')), 'workout_sessions: no broad authenticated TRUNCATE');

select ok((select not has_table_privilege('authenticated','public.workout_sessions','REFERENCES')), 'workout_sessions: no broad authenticated REFERENCES');

select ok((select not has_table_privilege('authenticated','public.workout_sessions','TRIGGER')), 'workout_sessions: no broad authenticated TRIGGER');

select ok((select not has_table_privilege('authenticated','public.workout_sessions','MAINTAIN')), 'workout_sessions: no broad authenticated MAINTAIN');

select ok((select not has_table_privilege('authenticated','public.workout_sessions','INSERT')), 'workout_sessions: no broad authenticated INSERT');

select ok((select not has_table_privilege('authenticated','public.workout_sessions','UPDATE')), 'workout_sessions: no broad authenticated UPDATE');

select ok((select has_table_privilege('authenticated','public.workout_sessions','SELECT')), 'workout_sessions: authenticated SELECT is explicit');

select ok((select has_table_privilege('authenticated','public.workout_sessions','DELETE') = false), 'workout_sessions: DELETE matches reviewed matrix');

select ok((select bool_and(has_column_privilege('authenticated','public.workout_sessions',attname,'INSERT') = (attname = any(array['ad_hoc_focus','ad_hoc_start_nonce','source_program_version_id','program_start_nonce','id','owner_id','source_program_id','source_program_day_id','program_assignment_id','source_cycle_position','source_rotation','program_name_snapshot','day_name_snapshot','name','notes']::text[]))) from pg_attribute where attrelid='public.workout_sessions'::regclass and attnum>0 and not attisdropped), 'workout_sessions: exact INSERT column allowlist');

select ok((select bool_and(has_column_privilege('authenticated','public.workout_sessions',attname,'UPDATE') = (attname = any(array['continuation_nonce','timer_command','name','status','notes','program_name_snapshot','day_name_snapshot']::text[]))) from pg_attribute where attrelid='public.workout_sessions'::regclass and attnum>0 and not attisdropped), 'workout_sessions: exact UPDATE column allowlist');

select ok((select relrowsecurity from pg_class where oid='public.workout_exercises'::regclass), 'workout_exercises: RLS enabled');

select ok((select not has_table_privilege('anon','public.workout_exercises','SELECT')), 'workout_exercises: anon has no SELECT');

select ok((select not has_table_privilege('anon','public.workout_exercises','INSERT')), 'workout_exercises: anon has no INSERT');

select ok((select not has_table_privilege('anon','public.workout_exercises','UPDATE')), 'workout_exercises: anon has no UPDATE');

select ok((select not has_table_privilege('anon','public.workout_exercises','DELETE')), 'workout_exercises: anon has no DELETE');

select ok((select not has_table_privilege('anon','public.workout_exercises','TRUNCATE')), 'workout_exercises: anon has no TRUNCATE');

select ok((select not has_table_privilege('anon','public.workout_exercises','REFERENCES')), 'workout_exercises: anon has no REFERENCES');

select ok((select not has_table_privilege('anon','public.workout_exercises','TRIGGER')), 'workout_exercises: anon has no TRIGGER');

select ok((select not has_table_privilege('anon','public.workout_exercises','MAINTAIN')), 'workout_exercises: anon has no MAINTAIN');

select ok((select not has_any_column_privilege('anon','public.workout_exercises','SELECT')), 'workout_exercises: anon has no column SELECT');

select ok((select not has_any_column_privilege('anon','public.workout_exercises','INSERT')), 'workout_exercises: anon has no column INSERT');

select ok((select not has_any_column_privilege('anon','public.workout_exercises','UPDATE')), 'workout_exercises: anon has no column UPDATE');

select ok((select not has_any_column_privilege('anon','public.workout_exercises','REFERENCES')), 'workout_exercises: anon has no column REFERENCES');

select ok((select not has_table_privilege('service_role','public.workout_exercises','SELECT')), 'workout_exercises: service_role has no SELECT');

select ok((select not has_table_privilege('service_role','public.workout_exercises','INSERT')), 'workout_exercises: service_role has no INSERT');

select ok((select not has_table_privilege('service_role','public.workout_exercises','UPDATE')), 'workout_exercises: service_role has no UPDATE');

select ok((select not has_table_privilege('service_role','public.workout_exercises','DELETE')), 'workout_exercises: service_role has no DELETE');

select ok((select not has_table_privilege('service_role','public.workout_exercises','TRUNCATE')), 'workout_exercises: service_role has no TRUNCATE');

select ok((select not has_table_privilege('service_role','public.workout_exercises','REFERENCES')), 'workout_exercises: service_role has no REFERENCES');

select ok((select not has_table_privilege('service_role','public.workout_exercises','TRIGGER')), 'workout_exercises: service_role has no TRIGGER');

select ok((select not has_table_privilege('service_role','public.workout_exercises','MAINTAIN')), 'workout_exercises: service_role has no MAINTAIN');

select ok((select not has_any_column_privilege('service_role','public.workout_exercises','SELECT')), 'workout_exercises: service_role has no column SELECT');

select ok((select not has_any_column_privilege('service_role','public.workout_exercises','INSERT')), 'workout_exercises: service_role has no column INSERT');

select ok((select not has_any_column_privilege('service_role','public.workout_exercises','UPDATE')), 'workout_exercises: service_role has no column UPDATE');

select ok((select not has_any_column_privilege('service_role','public.workout_exercises','REFERENCES')), 'workout_exercises: service_role has no column REFERENCES');

select ok((select not has_table_privilege('authenticated','public.workout_exercises','TRUNCATE')), 'workout_exercises: no broad authenticated TRUNCATE');

select ok((select not has_table_privilege('authenticated','public.workout_exercises','REFERENCES')), 'workout_exercises: no broad authenticated REFERENCES');

select ok((select not has_table_privilege('authenticated','public.workout_exercises','TRIGGER')), 'workout_exercises: no broad authenticated TRIGGER');

select ok((select not has_table_privilege('authenticated','public.workout_exercises','MAINTAIN')), 'workout_exercises: no broad authenticated MAINTAIN');

select ok((select not has_table_privilege('authenticated','public.workout_exercises','INSERT')), 'workout_exercises: no broad authenticated INSERT');

select ok((select not has_table_privilege('authenticated','public.workout_exercises','UPDATE')), 'workout_exercises: no broad authenticated UPDATE');

select ok((select has_table_privilege('authenticated','public.workout_exercises','SELECT')), 'workout_exercises: authenticated SELECT is explicit');

select ok((select has_table_privilege('authenticated','public.workout_exercises','DELETE') = false), 'workout_exercises: DELETE matches reviewed matrix');

select ok((select bool_and(has_column_privilege('authenticated','public.workout_exercises',attname,'INSERT') = (attname = any(array['program_movement_id','selection_nonce','id','owner_id','workout_session_id','position','source_program_slot_id','exercise_id','prescribed_exercise_id','exercise_name_snapshot','exercise_instructions_snapshot','prescribed_exercise_name_snapshot','status','prescribed_sets','prescribed_rest_seconds','notes']::text[]))) from pg_attribute where attrelid='public.workout_exercises'::regclass and attnum>0 and not attisdropped), 'workout_exercises: exact INSERT column allowlist');

select ok((select bool_and(has_column_privilege('authenticated','public.workout_exercises',attname,'UPDATE') = (attname = any(array['position','exercise_id','prescribed_exercise_id','exercise_name_snapshot','exercise_instructions_snapshot','prescribed_exercise_name_snapshot','status','prescribed_sets','prescribed_rest_seconds','notes','removed_at']::text[]))) from pg_attribute where attrelid='public.workout_exercises'::regclass and attnum>0 and not attisdropped), 'workout_exercises: exact UPDATE column allowlist');

select ok((select relrowsecurity from pg_class where oid='public.workout_sets'::regclass), 'workout_sets: RLS enabled');

select ok((select not has_table_privilege('anon','public.workout_sets','SELECT')), 'workout_sets: anon has no SELECT');

select ok((select not has_table_privilege('anon','public.workout_sets','INSERT')), 'workout_sets: anon has no INSERT');

select ok((select not has_table_privilege('anon','public.workout_sets','UPDATE')), 'workout_sets: anon has no UPDATE');

select ok((select not has_table_privilege('anon','public.workout_sets','DELETE')), 'workout_sets: anon has no DELETE');

select ok((select not has_table_privilege('anon','public.workout_sets','TRUNCATE')), 'workout_sets: anon has no TRUNCATE');

select ok((select not has_table_privilege('anon','public.workout_sets','REFERENCES')), 'workout_sets: anon has no REFERENCES');

select ok((select not has_table_privilege('anon','public.workout_sets','TRIGGER')), 'workout_sets: anon has no TRIGGER');

select ok((select not has_table_privilege('anon','public.workout_sets','MAINTAIN')), 'workout_sets: anon has no MAINTAIN');

select ok((select not has_any_column_privilege('anon','public.workout_sets','SELECT')), 'workout_sets: anon has no column SELECT');

select ok((select not has_any_column_privilege('anon','public.workout_sets','INSERT')), 'workout_sets: anon has no column INSERT');

select ok((select not has_any_column_privilege('anon','public.workout_sets','UPDATE')), 'workout_sets: anon has no column UPDATE');

select ok((select not has_any_column_privilege('anon','public.workout_sets','REFERENCES')), 'workout_sets: anon has no column REFERENCES');

select ok((select not has_table_privilege('service_role','public.workout_sets','SELECT')), 'workout_sets: service_role has no SELECT');

select ok((select not has_table_privilege('service_role','public.workout_sets','INSERT')), 'workout_sets: service_role has no INSERT');

select ok((select not has_table_privilege('service_role','public.workout_sets','UPDATE')), 'workout_sets: service_role has no UPDATE');

select ok((select not has_table_privilege('service_role','public.workout_sets','DELETE')), 'workout_sets: service_role has no DELETE');

select ok((select not has_table_privilege('service_role','public.workout_sets','TRUNCATE')), 'workout_sets: service_role has no TRUNCATE');

select ok((select not has_table_privilege('service_role','public.workout_sets','REFERENCES')), 'workout_sets: service_role has no REFERENCES');

select ok((select not has_table_privilege('service_role','public.workout_sets','TRIGGER')), 'workout_sets: service_role has no TRIGGER');

select ok((select not has_table_privilege('service_role','public.workout_sets','MAINTAIN')), 'workout_sets: service_role has no MAINTAIN');

select ok((select not has_any_column_privilege('service_role','public.workout_sets','SELECT')), 'workout_sets: service_role has no column SELECT');

select ok((select not has_any_column_privilege('service_role','public.workout_sets','INSERT')), 'workout_sets: service_role has no column INSERT');

select ok((select not has_any_column_privilege('service_role','public.workout_sets','UPDATE')), 'workout_sets: service_role has no column UPDATE');

select ok((select not has_any_column_privilege('service_role','public.workout_sets','REFERENCES')), 'workout_sets: service_role has no column REFERENCES');

select ok((select not has_table_privilege('authenticated','public.workout_sets','TRUNCATE')), 'workout_sets: no broad authenticated TRUNCATE');

select ok((select not has_table_privilege('authenticated','public.workout_sets','REFERENCES')), 'workout_sets: no broad authenticated REFERENCES');

select ok((select not has_table_privilege('authenticated','public.workout_sets','TRIGGER')), 'workout_sets: no broad authenticated TRIGGER');

select ok((select not has_table_privilege('authenticated','public.workout_sets','MAINTAIN')), 'workout_sets: no broad authenticated MAINTAIN');

select ok((select not has_table_privilege('authenticated','public.workout_sets','INSERT')), 'workout_sets: no broad authenticated INSERT');

select ok((select not has_table_privilege('authenticated','public.workout_sets','UPDATE')), 'workout_sets: no broad authenticated UPDATE');

select ok((select has_table_privilege('authenticated','public.workout_sets','SELECT')), 'workout_sets: authenticated SELECT is explicit');

select ok((select has_table_privilege('authenticated','public.workout_sets','DELETE') = true), 'workout_sets: DELETE matches reviewed matrix');

select ok((select bool_and(has_column_privilege('authenticated','public.workout_sets',attname,'INSERT') = (attname = any(array['effort_scale','effort_value','performed_to_failure','id','owner_id','workout_exercise_id','position','set_type','status','prescribed_reps_min','prescribed_reps_max','prescribed_weight_kg','actual_reps','actual_weight_kg','completed_at','notes','load_mode','last_mutation_id','is_automatic','inputs_confirmed','suggested_from_date','entered_weight','entered_unit']::text[]))) from pg_attribute where attrelid='public.workout_sets'::regclass and attnum>0 and not attisdropped), 'workout_sets: exact INSERT column allowlist');

select ok((select bool_and(has_column_privilege('authenticated','public.workout_sets',attname,'UPDATE') = (attname = any(array['effort_scale','effort_value','performed_to_failure','position','set_type','status','prescribed_reps_min','prescribed_reps_max','prescribed_weight_kg','actual_reps','actual_weight_kg','completed_at','notes','load_mode','last_mutation_id','deleted_at','entered_weight','entered_unit']::text[]))) from pg_attribute where attrelid='public.workout_sets'::regclass and attnum>0 and not attisdropped), 'workout_sets: exact UPDATE column allowlist');

select ok((select relrowsecurity from pg_class where oid='public.exercise_movement_patterns'::regclass), 'exercise_movement_patterns: RLS enabled');

select ok((select not has_table_privilege('anon','public.exercise_movement_patterns','SELECT')), 'exercise_movement_patterns: anon has no SELECT');

select ok((select not has_table_privilege('anon','public.exercise_movement_patterns','INSERT')), 'exercise_movement_patterns: anon has no INSERT');

select ok((select not has_table_privilege('anon','public.exercise_movement_patterns','UPDATE')), 'exercise_movement_patterns: anon has no UPDATE');

select ok((select not has_table_privilege('anon','public.exercise_movement_patterns','DELETE')), 'exercise_movement_patterns: anon has no DELETE');

select ok((select not has_table_privilege('anon','public.exercise_movement_patterns','TRUNCATE')), 'exercise_movement_patterns: anon has no TRUNCATE');

select ok((select not has_table_privilege('anon','public.exercise_movement_patterns','REFERENCES')), 'exercise_movement_patterns: anon has no REFERENCES');

select ok((select not has_table_privilege('anon','public.exercise_movement_patterns','TRIGGER')), 'exercise_movement_patterns: anon has no TRIGGER');

select ok((select not has_table_privilege('anon','public.exercise_movement_patterns','MAINTAIN')), 'exercise_movement_patterns: anon has no MAINTAIN');

select ok((select not has_any_column_privilege('anon','public.exercise_movement_patterns','SELECT')), 'exercise_movement_patterns: anon has no column SELECT');

select ok((select not has_any_column_privilege('anon','public.exercise_movement_patterns','INSERT')), 'exercise_movement_patterns: anon has no column INSERT');

select ok((select not has_any_column_privilege('anon','public.exercise_movement_patterns','UPDATE')), 'exercise_movement_patterns: anon has no column UPDATE');

select ok((select not has_any_column_privilege('anon','public.exercise_movement_patterns','REFERENCES')), 'exercise_movement_patterns: anon has no column REFERENCES');

select ok((select not has_table_privilege('service_role','public.exercise_movement_patterns','SELECT')), 'exercise_movement_patterns: service_role has no SELECT');

select ok((select not has_table_privilege('service_role','public.exercise_movement_patterns','INSERT')), 'exercise_movement_patterns: service_role has no INSERT');

select ok((select not has_table_privilege('service_role','public.exercise_movement_patterns','UPDATE')), 'exercise_movement_patterns: service_role has no UPDATE');

select ok((select not has_table_privilege('service_role','public.exercise_movement_patterns','DELETE')), 'exercise_movement_patterns: service_role has no DELETE');

select ok((select not has_table_privilege('service_role','public.exercise_movement_patterns','TRUNCATE')), 'exercise_movement_patterns: service_role has no TRUNCATE');

select ok((select not has_table_privilege('service_role','public.exercise_movement_patterns','REFERENCES')), 'exercise_movement_patterns: service_role has no REFERENCES');

select ok((select not has_table_privilege('service_role','public.exercise_movement_patterns','TRIGGER')), 'exercise_movement_patterns: service_role has no TRIGGER');

select ok((select not has_table_privilege('service_role','public.exercise_movement_patterns','MAINTAIN')), 'exercise_movement_patterns: service_role has no MAINTAIN');

select ok((select not has_any_column_privilege('service_role','public.exercise_movement_patterns','SELECT')), 'exercise_movement_patterns: service_role has no column SELECT');

select ok((select not has_any_column_privilege('service_role','public.exercise_movement_patterns','INSERT')), 'exercise_movement_patterns: service_role has no column INSERT');

select ok((select not has_any_column_privilege('service_role','public.exercise_movement_patterns','UPDATE')), 'exercise_movement_patterns: service_role has no column UPDATE');

select ok((select not has_any_column_privilege('service_role','public.exercise_movement_patterns','REFERENCES')), 'exercise_movement_patterns: service_role has no column REFERENCES');

select ok((select not has_table_privilege('authenticated','public.exercise_movement_patterns','TRUNCATE')), 'exercise_movement_patterns: no broad authenticated TRUNCATE');

select ok((select not has_table_privilege('authenticated','public.exercise_movement_patterns','REFERENCES')), 'exercise_movement_patterns: no broad authenticated REFERENCES');

select ok((select not has_table_privilege('authenticated','public.exercise_movement_patterns','TRIGGER')), 'exercise_movement_patterns: no broad authenticated TRIGGER');

select ok((select not has_table_privilege('authenticated','public.exercise_movement_patterns','MAINTAIN')), 'exercise_movement_patterns: no broad authenticated MAINTAIN');

select ok((select not has_table_privilege('authenticated','public.exercise_movement_patterns','INSERT')), 'exercise_movement_patterns: no broad authenticated INSERT');

select ok((select not has_table_privilege('authenticated','public.exercise_movement_patterns','UPDATE')), 'exercise_movement_patterns: no broad authenticated UPDATE');

select ok((select has_table_privilege('authenticated','public.exercise_movement_patterns','SELECT')), 'exercise_movement_patterns: authenticated SELECT is explicit');

select ok((select has_table_privilege('authenticated','public.exercise_movement_patterns','DELETE') = true), 'exercise_movement_patterns: DELETE matches reviewed matrix');

select ok((select bool_and(has_column_privilege('authenticated','public.exercise_movement_patterns',attname,'INSERT') = (attname = any(array['exercise_id','movement_pattern_id','is_primary']::text[]))) from pg_attribute where attrelid='public.exercise_movement_patterns'::regclass and attnum>0 and not attisdropped), 'exercise_movement_patterns: exact INSERT column allowlist');

select ok((select bool_and(has_column_privilege('authenticated','public.exercise_movement_patterns',attname,'UPDATE') = (attname = any(array[]::text[]))) from pg_attribute where attrelid='public.exercise_movement_patterns'::regclass and attnum>0 and not attisdropped), 'exercise_movement_patterns: exact UPDATE column allowlist');

select ok((select relrowsecurity from pg_class where oid='public.exercise_muscles'::regclass), 'exercise_muscles: RLS enabled');

select ok((select not has_table_privilege('anon','public.exercise_muscles','SELECT')), 'exercise_muscles: anon has no SELECT');

select ok((select not has_table_privilege('anon','public.exercise_muscles','INSERT')), 'exercise_muscles: anon has no INSERT');

select ok((select not has_table_privilege('anon','public.exercise_muscles','UPDATE')), 'exercise_muscles: anon has no UPDATE');

select ok((select not has_table_privilege('anon','public.exercise_muscles','DELETE')), 'exercise_muscles: anon has no DELETE');

select ok((select not has_table_privilege('anon','public.exercise_muscles','TRUNCATE')), 'exercise_muscles: anon has no TRUNCATE');

select ok((select not has_table_privilege('anon','public.exercise_muscles','REFERENCES')), 'exercise_muscles: anon has no REFERENCES');

select ok((select not has_table_privilege('anon','public.exercise_muscles','TRIGGER')), 'exercise_muscles: anon has no TRIGGER');

select ok((select not has_table_privilege('anon','public.exercise_muscles','MAINTAIN')), 'exercise_muscles: anon has no MAINTAIN');

select ok((select not has_any_column_privilege('anon','public.exercise_muscles','SELECT')), 'exercise_muscles: anon has no column SELECT');

select ok((select not has_any_column_privilege('anon','public.exercise_muscles','INSERT')), 'exercise_muscles: anon has no column INSERT');

select ok((select not has_any_column_privilege('anon','public.exercise_muscles','UPDATE')), 'exercise_muscles: anon has no column UPDATE');

select ok((select not has_any_column_privilege('anon','public.exercise_muscles','REFERENCES')), 'exercise_muscles: anon has no column REFERENCES');

select ok((select not has_table_privilege('service_role','public.exercise_muscles','SELECT')), 'exercise_muscles: service_role has no SELECT');

select ok((select not has_table_privilege('service_role','public.exercise_muscles','INSERT')), 'exercise_muscles: service_role has no INSERT');

select ok((select not has_table_privilege('service_role','public.exercise_muscles','UPDATE')), 'exercise_muscles: service_role has no UPDATE');

select ok((select not has_table_privilege('service_role','public.exercise_muscles','DELETE')), 'exercise_muscles: service_role has no DELETE');

select ok((select not has_table_privilege('service_role','public.exercise_muscles','TRUNCATE')), 'exercise_muscles: service_role has no TRUNCATE');

select ok((select not has_table_privilege('service_role','public.exercise_muscles','REFERENCES')), 'exercise_muscles: service_role has no REFERENCES');

select ok((select not has_table_privilege('service_role','public.exercise_muscles','TRIGGER')), 'exercise_muscles: service_role has no TRIGGER');

select ok((select not has_table_privilege('service_role','public.exercise_muscles','MAINTAIN')), 'exercise_muscles: service_role has no MAINTAIN');

select ok((select not has_any_column_privilege('service_role','public.exercise_muscles','SELECT')), 'exercise_muscles: service_role has no column SELECT');

select ok((select not has_any_column_privilege('service_role','public.exercise_muscles','INSERT')), 'exercise_muscles: service_role has no column INSERT');

select ok((select not has_any_column_privilege('service_role','public.exercise_muscles','UPDATE')), 'exercise_muscles: service_role has no column UPDATE');

select ok((select not has_any_column_privilege('service_role','public.exercise_muscles','REFERENCES')), 'exercise_muscles: service_role has no column REFERENCES');

select ok((select not has_table_privilege('authenticated','public.exercise_muscles','TRUNCATE')), 'exercise_muscles: no broad authenticated TRUNCATE');

select ok((select not has_table_privilege('authenticated','public.exercise_muscles','REFERENCES')), 'exercise_muscles: no broad authenticated REFERENCES');

select ok((select not has_table_privilege('authenticated','public.exercise_muscles','TRIGGER')), 'exercise_muscles: no broad authenticated TRIGGER');

select ok((select not has_table_privilege('authenticated','public.exercise_muscles','MAINTAIN')), 'exercise_muscles: no broad authenticated MAINTAIN');

select ok((select not has_table_privilege('authenticated','public.exercise_muscles','INSERT')), 'exercise_muscles: no broad authenticated INSERT');

select ok((select not has_table_privilege('authenticated','public.exercise_muscles','UPDATE')), 'exercise_muscles: no broad authenticated UPDATE');

select ok((select has_table_privilege('authenticated','public.exercise_muscles','SELECT')), 'exercise_muscles: authenticated SELECT is explicit');

select ok((select has_table_privilege('authenticated','public.exercise_muscles','DELETE') = true), 'exercise_muscles: DELETE matches reviewed matrix');

select ok((select bool_and(has_column_privilege('authenticated','public.exercise_muscles',attname,'INSERT') = (attname = any(array['exercise_id','muscle_group_id','muscle_role']::text[]))) from pg_attribute where attrelid='public.exercise_muscles'::regclass and attnum>0 and not attisdropped), 'exercise_muscles: exact INSERT column allowlist');

select ok((select bool_and(has_column_privilege('authenticated','public.exercise_muscles',attname,'UPDATE') = (attname = any(array['muscle_role']::text[]))) from pg_attribute where attrelid='public.exercise_muscles'::regclass and attnum>0 and not attisdropped), 'exercise_muscles: exact UPDATE column allowlist');

select ok((select relrowsecurity from pg_class where oid='public.exercise_equipment'::regclass), 'exercise_equipment: RLS enabled');

select ok((select not has_table_privilege('anon','public.exercise_equipment','SELECT')), 'exercise_equipment: anon has no SELECT');

select ok((select not has_table_privilege('anon','public.exercise_equipment','INSERT')), 'exercise_equipment: anon has no INSERT');

select ok((select not has_table_privilege('anon','public.exercise_equipment','UPDATE')), 'exercise_equipment: anon has no UPDATE');

select ok((select not has_table_privilege('anon','public.exercise_equipment','DELETE')), 'exercise_equipment: anon has no DELETE');

select ok((select not has_table_privilege('anon','public.exercise_equipment','TRUNCATE')), 'exercise_equipment: anon has no TRUNCATE');

select ok((select not has_table_privilege('anon','public.exercise_equipment','REFERENCES')), 'exercise_equipment: anon has no REFERENCES');

select ok((select not has_table_privilege('anon','public.exercise_equipment','TRIGGER')), 'exercise_equipment: anon has no TRIGGER');

select ok((select not has_table_privilege('anon','public.exercise_equipment','MAINTAIN')), 'exercise_equipment: anon has no MAINTAIN');

select ok((select not has_any_column_privilege('anon','public.exercise_equipment','SELECT')), 'exercise_equipment: anon has no column SELECT');

select ok((select not has_any_column_privilege('anon','public.exercise_equipment','INSERT')), 'exercise_equipment: anon has no column INSERT');

select ok((select not has_any_column_privilege('anon','public.exercise_equipment','UPDATE')), 'exercise_equipment: anon has no column UPDATE');

select ok((select not has_any_column_privilege('anon','public.exercise_equipment','REFERENCES')), 'exercise_equipment: anon has no column REFERENCES');

select ok((select not has_table_privilege('service_role','public.exercise_equipment','SELECT')), 'exercise_equipment: service_role has no SELECT');

select ok((select not has_table_privilege('service_role','public.exercise_equipment','INSERT')), 'exercise_equipment: service_role has no INSERT');

select ok((select not has_table_privilege('service_role','public.exercise_equipment','UPDATE')), 'exercise_equipment: service_role has no UPDATE');

select ok((select not has_table_privilege('service_role','public.exercise_equipment','DELETE')), 'exercise_equipment: service_role has no DELETE');

select ok((select not has_table_privilege('service_role','public.exercise_equipment','TRUNCATE')), 'exercise_equipment: service_role has no TRUNCATE');

select ok((select not has_table_privilege('service_role','public.exercise_equipment','REFERENCES')), 'exercise_equipment: service_role has no REFERENCES');

select ok((select not has_table_privilege('service_role','public.exercise_equipment','TRIGGER')), 'exercise_equipment: service_role has no TRIGGER');

select ok((select not has_table_privilege('service_role','public.exercise_equipment','MAINTAIN')), 'exercise_equipment: service_role has no MAINTAIN');

select ok((select not has_any_column_privilege('service_role','public.exercise_equipment','SELECT')), 'exercise_equipment: service_role has no column SELECT');

select ok((select not has_any_column_privilege('service_role','public.exercise_equipment','INSERT')), 'exercise_equipment: service_role has no column INSERT');

select ok((select not has_any_column_privilege('service_role','public.exercise_equipment','UPDATE')), 'exercise_equipment: service_role has no column UPDATE');

select ok((select not has_any_column_privilege('service_role','public.exercise_equipment','REFERENCES')), 'exercise_equipment: service_role has no column REFERENCES');

select ok((select not has_table_privilege('authenticated','public.exercise_equipment','TRUNCATE')), 'exercise_equipment: no broad authenticated TRUNCATE');

select ok((select not has_table_privilege('authenticated','public.exercise_equipment','REFERENCES')), 'exercise_equipment: no broad authenticated REFERENCES');

select ok((select not has_table_privilege('authenticated','public.exercise_equipment','TRIGGER')), 'exercise_equipment: no broad authenticated TRIGGER');

select ok((select not has_table_privilege('authenticated','public.exercise_equipment','MAINTAIN')), 'exercise_equipment: no broad authenticated MAINTAIN');

select ok((select not has_table_privilege('authenticated','public.exercise_equipment','INSERT')), 'exercise_equipment: no broad authenticated INSERT');

select ok((select not has_table_privilege('authenticated','public.exercise_equipment','UPDATE')), 'exercise_equipment: no broad authenticated UPDATE');

select ok((select has_table_privilege('authenticated','public.exercise_equipment','SELECT')), 'exercise_equipment: authenticated SELECT is explicit');

select ok((select has_table_privilege('authenticated','public.exercise_equipment','DELETE') = true), 'exercise_equipment: DELETE matches reviewed matrix');

select ok((select bool_and(has_column_privilege('authenticated','public.exercise_equipment',attname,'INSERT') = (attname = any(array['exercise_id','equipment_type_id']::text[]))) from pg_attribute where attrelid='public.exercise_equipment'::regclass and attnum>0 and not attisdropped), 'exercise_equipment: exact INSERT column allowlist');

select ok((select bool_and(has_column_privilege('authenticated','public.exercise_equipment',attname,'UPDATE') = (attname = any(array[]::text[]))) from pg_attribute where attrelid='public.exercise_equipment'::regclass and attnum>0 and not attisdropped), 'exercise_equipment: exact UPDATE column allowlist');

select ok((select bool_and(polroles = array['authenticated'::regrole::oid]) from pg_policy where polrelid in (select oid from pg_class where relnamespace='public'::regnamespace)), 'policies apply only to authenticated role');

select ok((select bool_and(polqual is not null and polwithcheck is not null) from pg_policy where polcmd='w' and polrelid in (select oid from pg_class where relnamespace='public'::regnamespace)), 'every UPDATE policy has USING and WITH CHECK');

select ok((select bool_and(not prosecdef) from pg_proc where pronamespace='body_private'::regnamespace), 'internal triggers remain security invoker');

select ok((select not has_schema_privilege('authenticated','body_private','USAGE') and not has_schema_privilege('anon','body_private','USAGE')), 'private helper schema remains inaccessible');

select ok((select bool_and(not has_function_privilege('authenticated',oid,'EXECUTE')) from pg_proc where pronamespace='body_private'::regnamespace), 'no direct execution grant on private helpers');

reset role;

set local role anon;

set local "request.jwt.claim.sub" = '';

select throws_ok($sql$select * from public.movement_patterns$sql$, '42501', null, 'movement_patterns: anonymous SELECT denied');

select throws_ok($sql$delete from public.movement_patterns$sql$, '42501', null, 'movement_patterns: anonymous DELETE denied');

select throws_ok($sql$insert into public.movement_patterns default values$sql$, '42501', null, 'movement_patterns: anonymous INSERT denied');

select throws_ok($sql$update public.movement_patterns set id=id$sql$, '42501', null, 'movement_patterns: anonymous UPDATE denied');

select throws_ok($sql$select * from public.muscle_groups$sql$, '42501', null, 'muscle_groups: anonymous SELECT denied');

select throws_ok($sql$delete from public.muscle_groups$sql$, '42501', null, 'muscle_groups: anonymous DELETE denied');

select throws_ok($sql$insert into public.muscle_groups default values$sql$, '42501', null, 'muscle_groups: anonymous INSERT denied');

select throws_ok($sql$update public.muscle_groups set id=id$sql$, '42501', null, 'muscle_groups: anonymous UPDATE denied');

select throws_ok($sql$select * from public.equipment_types$sql$, '42501', null, 'equipment_types: anonymous SELECT denied');

select throws_ok($sql$delete from public.equipment_types$sql$, '42501', null, 'equipment_types: anonymous DELETE denied');

select throws_ok($sql$insert into public.equipment_types default values$sql$, '42501', null, 'equipment_types: anonymous INSERT denied');

select throws_ok($sql$update public.equipment_types set id=id$sql$, '42501', null, 'equipment_types: anonymous UPDATE denied');

select throws_ok($sql$select * from public.profiles$sql$, '42501', null, 'profiles: anonymous SELECT denied');

select throws_ok($sql$delete from public.profiles$sql$, '42501', null, 'profiles: anonymous DELETE denied');

select throws_ok($sql$insert into public.profiles default values$sql$, '42501', null, 'profiles: anonymous INSERT denied');

select throws_ok($sql$update public.profiles set id=id$sql$, '42501', null, 'profiles: anonymous UPDATE denied');

select throws_ok($sql$select * from public.account_preferences$sql$, '42501', null, 'account_preferences: anonymous SELECT denied');

select throws_ok($sql$delete from public.account_preferences$sql$, '42501', null, 'account_preferences: anonymous DELETE denied');

select throws_ok($sql$insert into public.account_preferences default values$sql$, '42501', null, 'account_preferences: anonymous INSERT denied');

select throws_ok($sql$update public.account_preferences set owner_id=owner_id$sql$, '42501', null, 'account_preferences: anonymous UPDATE denied');

select throws_ok($sql$select * from public.exercises$sql$, '42501', null, 'exercises: anonymous SELECT denied');

select throws_ok($sql$delete from public.exercises$sql$, '42501', null, 'exercises: anonymous DELETE denied');

select throws_ok($sql$insert into public.exercises default values$sql$, '42501', null, 'exercises: anonymous INSERT denied');

select throws_ok($sql$update public.exercises set id=id$sql$, '42501', null, 'exercises: anonymous UPDATE denied');

select throws_ok($sql$select * from public.user_equipment$sql$, '42501', null, 'user_equipment: anonymous SELECT denied');

select throws_ok($sql$delete from public.user_equipment$sql$, '42501', null, 'user_equipment: anonymous DELETE denied');

select throws_ok($sql$insert into public.user_equipment default values$sql$, '42501', null, 'user_equipment: anonymous INSERT denied');

select throws_ok($sql$update public.user_equipment set owner_id=owner_id$sql$, '42501', null, 'user_equipment: anonymous UPDATE denied');

select throws_ok($sql$select * from public.user_exercise_preferences$sql$, '42501', null, 'user_exercise_preferences: anonymous SELECT denied');

select throws_ok($sql$delete from public.user_exercise_preferences$sql$, '42501', null, 'user_exercise_preferences: anonymous DELETE denied');

select throws_ok($sql$insert into public.user_exercise_preferences default values$sql$, '42501', null, 'user_exercise_preferences: anonymous INSERT denied');

select throws_ok($sql$update public.user_exercise_preferences set owner_id=owner_id$sql$, '42501', null, 'user_exercise_preferences: anonymous UPDATE denied');

select throws_ok($sql$select * from public.programs$sql$, '42501', null, 'programs: anonymous SELECT denied');

select throws_ok($sql$delete from public.programs$sql$, '42501', null, 'programs: anonymous DELETE denied');

select throws_ok($sql$insert into public.programs default values$sql$, '42501', null, 'programs: anonymous INSERT denied');

select throws_ok($sql$update public.programs set id=id$sql$, '42501', null, 'programs: anonymous UPDATE denied');

select throws_ok($sql$select * from public.program_days$sql$, '42501', null, 'program_days: anonymous SELECT denied');

select throws_ok($sql$delete from public.program_days$sql$, '42501', null, 'program_days: anonymous DELETE denied');

select throws_ok($sql$insert into public.program_days default values$sql$, '42501', null, 'program_days: anonymous INSERT denied');

select throws_ok($sql$update public.program_days set id=id$sql$, '42501', null, 'program_days: anonymous UPDATE denied');

select throws_ok($sql$select * from public.program_slots$sql$, '42501', null, 'program_slots: anonymous SELECT denied');

select throws_ok($sql$delete from public.program_slots$sql$, '42501', null, 'program_slots: anonymous DELETE denied');

select throws_ok($sql$insert into public.program_slots default values$sql$, '42501', null, 'program_slots: anonymous INSERT denied');

select throws_ok($sql$update public.program_slots set id=id$sql$, '42501', null, 'program_slots: anonymous UPDATE denied');

select throws_ok($sql$select * from public.program_assignments$sql$, '42501', null, 'program_assignments: anonymous SELECT denied');

select throws_ok($sql$delete from public.program_assignments$sql$, '42501', null, 'program_assignments: anonymous DELETE denied');

select throws_ok($sql$insert into public.program_assignments default values$sql$, '42501', null, 'program_assignments: anonymous INSERT denied');

select throws_ok($sql$update public.program_assignments set id=id$sql$, '42501', null, 'program_assignments: anonymous UPDATE denied');

select throws_ok($sql$select * from public.workout_sessions$sql$, '42501', null, 'workout_sessions: anonymous SELECT denied');

select throws_ok($sql$delete from public.workout_sessions$sql$, '42501', null, 'workout_sessions: anonymous DELETE denied');

select throws_ok($sql$insert into public.workout_sessions default values$sql$, '42501', null, 'workout_sessions: anonymous INSERT denied');

select throws_ok($sql$update public.workout_sessions set id=id$sql$, '42501', null, 'workout_sessions: anonymous UPDATE denied');

select throws_ok($sql$select * from public.workout_exercises$sql$, '42501', null, 'workout_exercises: anonymous SELECT denied');

select throws_ok($sql$delete from public.workout_exercises$sql$, '42501', null, 'workout_exercises: anonymous DELETE denied');

select throws_ok($sql$insert into public.workout_exercises default values$sql$, '42501', null, 'workout_exercises: anonymous INSERT denied');

select throws_ok($sql$update public.workout_exercises set id=id$sql$, '42501', null, 'workout_exercises: anonymous UPDATE denied');

select throws_ok($sql$select * from public.workout_sets$sql$, '42501', null, 'workout_sets: anonymous SELECT denied');

select throws_ok($sql$delete from public.workout_sets$sql$, '42501', null, 'workout_sets: anonymous DELETE denied');

select throws_ok($sql$insert into public.workout_sets default values$sql$, '42501', null, 'workout_sets: anonymous INSERT denied');

select throws_ok($sql$update public.workout_sets set id=id$sql$, '42501', null, 'workout_sets: anonymous UPDATE denied');

select throws_ok($sql$select * from public.exercise_movement_patterns$sql$, '42501', null, 'exercise_movement_patterns: anonymous SELECT denied');

select throws_ok($sql$delete from public.exercise_movement_patterns$sql$, '42501', null, 'exercise_movement_patterns: anonymous DELETE denied');

select throws_ok($sql$insert into public.exercise_movement_patterns default values$sql$, '42501', null, 'exercise_movement_patterns: anonymous INSERT denied');

select throws_ok($sql$update public.exercise_movement_patterns set exercise_id=exercise_id$sql$, '42501', null, 'exercise_movement_patterns: anonymous UPDATE denied');

select throws_ok($sql$select * from public.exercise_muscles$sql$, '42501', null, 'exercise_muscles: anonymous SELECT denied');

select throws_ok($sql$delete from public.exercise_muscles$sql$, '42501', null, 'exercise_muscles: anonymous DELETE denied');

select throws_ok($sql$insert into public.exercise_muscles default values$sql$, '42501', null, 'exercise_muscles: anonymous INSERT denied');

select throws_ok($sql$update public.exercise_muscles set exercise_id=exercise_id$sql$, '42501', null, 'exercise_muscles: anonymous UPDATE denied');

select throws_ok($sql$select * from public.exercise_equipment$sql$, '42501', null, 'exercise_equipment: anonymous SELECT denied');

select throws_ok($sql$delete from public.exercise_equipment$sql$, '42501', null, 'exercise_equipment: anonymous DELETE denied');

select throws_ok($sql$insert into public.exercise_equipment default values$sql$, '42501', null, 'exercise_equipment: anonymous INSERT denied');

select throws_ok($sql$update public.exercise_equipment set exercise_id=exercise_id$sql$, '42501', null, 'exercise_equipment: anonymous UPDATE denied');

reset role;

set local role authenticated;

set local "request.jwt.claim.sub" = '';

select ok((select count(*)=0 from public.movement_patterns), 'movement_patterns: authenticated role without UID fails closed');

select ok((select count(*)=0 from public.muscle_groups), 'muscle_groups: authenticated role without UID fails closed');

select ok((select count(*)=0 from public.equipment_types), 'equipment_types: authenticated role without UID fails closed');

select ok((select count(*)=0 from public.profiles), 'profiles: authenticated role without UID fails closed');

select ok((select count(*)=0 from public.account_preferences), 'account_preferences: authenticated role without UID fails closed');

select ok((select count(*)=0 from public.exercises), 'exercises: authenticated role without UID fails closed');

select ok((select count(*)=0 from public.user_equipment), 'user_equipment: authenticated role without UID fails closed');

select ok((select count(*)=0 from public.user_exercise_preferences), 'user_exercise_preferences: authenticated role without UID fails closed');

select ok((select count(*)=0 from public.programs), 'programs: authenticated role without UID fails closed');

select ok((select count(*)=0 from public.program_days), 'program_days: authenticated role without UID fails closed');

select ok((select count(*)=0 from public.program_slots), 'program_slots: authenticated role without UID fails closed');

select ok((select count(*)=0 from public.program_assignments), 'program_assignments: authenticated role without UID fails closed');

select ok((select count(*)=0 from public.workout_sessions), 'workout_sessions: authenticated role without UID fails closed');

select ok((select count(*)=0 from public.workout_exercises), 'workout_exercises: authenticated role without UID fails closed');

select ok((select count(*)=0 from public.workout_sets), 'workout_sets: authenticated role without UID fails closed');

select ok((select count(*)=0 from public.exercise_movement_patterns), 'exercise_movement_patterns: authenticated role without UID fails closed');

select ok((select count(*)=0 from public.exercise_muscles), 'exercise_muscles: authenticated role without UID fails closed');

select ok((select count(*)=0 from public.exercise_equipment), 'exercise_equipment: authenticated role without UID fails closed');

reset role;

set local role authenticated;

set local "request.jwt.claim.sub" = 'a9a01980-10a6-073d-b964-34f6cc5f22a8';

select ok((select auth.uid()=md5('carol')::uuid), 'authenticated test identity is Carol');

select lives_ok($sql$insert into public.profiles(id,display_name) values (md5('carol')::uuid,'Carol')$sql$, 'profiles: authenticated own INSERT succeeds');

select lives_ok($sql$insert into public.account_preferences(owner_id,training_goal) values (md5('carol')::uuid,'hypertrophy')$sql$, 'account_preferences: authenticated own INSERT succeeds');

select lives_ok($sql$insert into public.exercises(id,owner_id,name) values (md5('custom_carol')::uuid,md5('carol')::uuid,'Carol custom')$sql$, 'exercises: authenticated own INSERT succeeds');

select lives_ok($sql$insert into public.user_equipment(owner_id,equipment_type_id) values (md5('carol')::uuid,md5('equipment_types')::uuid)$sql$, 'user_equipment: authenticated own INSERT succeeds');

select lives_ok($sql$insert into public.user_exercise_preferences(owner_id,exercise_id,is_favorite) values (md5('carol')::uuid,md5('system')::uuid,true)$sql$, 'user_exercise_preferences: authenticated own INSERT succeeds');

select lives_ok($sql$insert into public.programs(id,owner_id,name,cycle_length) values (md5('program_carol')::uuid,md5('carol')::uuid,'Carol plan',7)$sql$, 'programs: authenticated own INSERT succeeds');

select lives_ok($sql$insert into public.program_days(id,owner_id,program_id,cycle_length,cycle_position,name) values (md5('carol_day_1')::uuid,md5('carol')::uuid,md5('program_carol')::uuid,7,1,'Carol day')$sql$, 'program_days: authenticated own INSERT succeeds');

select lives_ok($sql$insert into public.program_slots(id,owner_id,program_day_id,position,exercise_id,target_sets) values (md5('slot_carol')::uuid,md5('carol')::uuid,md5('carol_day_1')::uuid,1,md5('system')::uuid,3)$sql$, 'program_slots: authenticated own INSERT succeeds');

select lives_ok($sql$insert into public.program_assignments(id,owner_id,program_id,cycle_length) values (md5('assignment_carol')::uuid,md5('carol')::uuid,md5('program_carol')::uuid,7)$sql$, 'program_assignments: authenticated own INSERT succeeds');

select lives_ok($sql$insert into public.workout_sessions(id,owner_id,name,source_program_id,source_program_day_id,program_assignment_id,source_cycle_position,source_rotation,program_name_snapshot,day_name_snapshot) values (md5('session_carol')::uuid,md5('carol')::uuid,'Carol session',md5('program_carol')::uuid,md5('carol_day_1')::uuid,md5('assignment_carol')::uuid,1,0,'Carol plan','Carol day')$sql$, 'workout_sessions: authenticated own INSERT succeeds');

select lives_ok($sql$insert into public.workout_exercises(id,owner_id,workout_session_id,source_program_slot_id,position,exercise_id,exercise_name_snapshot,prescribed_sets) values (md5('we_carol')::uuid,md5('carol')::uuid,md5('session_carol')::uuid,md5('slot_carol')::uuid,1,md5('system')::uuid,'System exercise',3)$sql$, 'workout_exercises: authenticated own INSERT succeeds');

-- Isolate the original manual-set authorization matrix from new auto templates.
reset role;
delete from public.workout_sets where workout_exercise_id=md5('we_carol')::uuid and is_automatic;
set local role authenticated;
select lives_ok($sql$insert into public.workout_sets(id,owner_id,workout_exercise_id,position,prescribed_reps_min,prescribed_reps_max,prescribed_weight_kg,status,actual_reps,actual_weight_kg,completed_at) values (md5('set_carol')::uuid,md5('carol')::uuid,md5('we_carol')::uuid,1,8,12,20,'completed',3,30,now())$sql$, 'workout_sets: authenticated own INSERT succeeds');

select lives_ok($sql$insert into public.exercise_movement_patterns(exercise_id,movement_pattern_id) values (md5('custom_carol')::uuid,md5('movement_patterns')::uuid)$sql$, 'exercise_movement_patterns: custom classification INSERT succeeds');

select lives_ok($sql$insert into public.exercise_muscles(exercise_id,muscle_group_id,muscle_role) values (md5('custom_carol')::uuid,md5('muscle_groups')::uuid,'primary')$sql$, 'exercise_muscles: custom classification INSERT succeeds');

select lives_ok($sql$insert into public.exercise_equipment(exercise_id,equipment_type_id) values (md5('custom_carol')::uuid,md5('equipment_types')::uuid)$sql$, 'exercise_equipment: custom classification INSERT succeeds');

select ok((select count(*)=1 from public.movement_patterns where slug='test_catalog'), 'movement_patterns: authenticated taxonomy read succeeds');

select throws_ok($sql$insert into public.movement_patterns(slug,name) values ('forged','Forged')$sql$, '42501', null, 'movement_patterns: client catalog INSERT denied');

select throws_ok($sql$update public.movement_patterns set name='Forged'$sql$, '42501', null, 'movement_patterns: client catalog UPDATE denied');

select throws_ok($sql$delete from public.movement_patterns$sql$, '42501', null, 'movement_patterns: client catalog DELETE denied');

select ok((select count(*)=1 from public.muscle_groups where slug='test_catalog'), 'muscle_groups: authenticated taxonomy read succeeds');

select throws_ok($sql$insert into public.muscle_groups(slug,name) values ('forged','Forged')$sql$, '42501', null, 'muscle_groups: client catalog INSERT denied');

select throws_ok($sql$update public.muscle_groups set name='Forged'$sql$, '42501', null, 'muscle_groups: client catalog UPDATE denied');

select throws_ok($sql$delete from public.muscle_groups$sql$, '42501', null, 'muscle_groups: client catalog DELETE denied');

select ok((select count(*)=1 from public.equipment_types where slug='test_catalog'), 'equipment_types: authenticated taxonomy read succeeds');

select throws_ok($sql$insert into public.equipment_types(slug,name) values ('forged','Forged')$sql$, '42501', null, 'equipment_types: client catalog INSERT denied');

select throws_ok($sql$update public.equipment_types set name='Forged'$sql$, '42501', null, 'equipment_types: client catalog UPDATE denied');

select throws_ok($sql$delete from public.equipment_types$sql$, '42501', null, 'equipment_types: client catalog DELETE denied');

select ok((select count(*)=1 from public.profiles where id=md5('carol')::uuid), 'profiles: own SELECT succeeds');

select ok((select count(*)=0 from public.profiles where id=md5('bob')::uuid), 'profiles: other-owner SELECT hidden');

select ok((select count(*)=1 from public.account_preferences where owner_id=md5('carol')::uuid), 'account_preferences: own SELECT succeeds');

select ok((select count(*)=0 from public.account_preferences where owner_id=md5('bob')::uuid), 'account_preferences: other-owner SELECT hidden');

select ok((select count(*)=1 from public.exercises where id=md5('custom_carol')::uuid), 'exercises: own SELECT succeeds');

select ok((select count(*)=0 from public.exercises where id=md5('custom_bob')::uuid), 'exercises: other-owner SELECT hidden');

select ok((select count(*)=1 from public.user_equipment where owner_id=md5('carol')::uuid), 'user_equipment: own SELECT succeeds');

select ok((select count(*)=0 from public.user_equipment where owner_id=md5('bob')::uuid), 'user_equipment: other-owner SELECT hidden');

select ok((select count(*)=1 from public.user_exercise_preferences where owner_id=md5('carol')::uuid), 'user_exercise_preferences: own SELECT succeeds');

select ok((select count(*)=0 from public.user_exercise_preferences where owner_id=md5('bob')::uuid), 'user_exercise_preferences: other-owner SELECT hidden');

select ok((select count(*)=1 from public.programs where id=md5('program_carol')::uuid), 'programs: own SELECT succeeds');

select ok((select count(*)=0 from public.programs where id=md5('program_bob')::uuid), 'programs: other-owner SELECT hidden');

select ok((select count(*)=1 from public.program_days where id=md5('carol_day_1')::uuid), 'program_days: own SELECT succeeds');

select ok((select count(*)=0 from public.program_days where id=md5('bob_day_1')::uuid), 'program_days: other-owner SELECT hidden');

select ok((select count(*)=1 from public.program_slots where id=md5('slot_carol')::uuid), 'program_slots: own SELECT succeeds');

select ok((select count(*)=0 from public.program_slots where id=md5('slot_bob')::uuid), 'program_slots: other-owner SELECT hidden');

select ok((select count(*)=1 from public.program_assignments where id=md5('assignment_carol')::uuid), 'program_assignments: own SELECT succeeds');

select ok((select count(*)=0 from public.program_assignments where id=md5('assignment_bob')::uuid), 'program_assignments: other-owner SELECT hidden');

select ok((select count(*)=1 from public.workout_sessions where id=md5('session_carol')::uuid), 'workout_sessions: own SELECT succeeds');

select ok((select count(*)=0 from public.workout_sessions where id=md5('session_bob')::uuid), 'workout_sessions: other-owner SELECT hidden');

select ok((select count(*)=1 from public.workout_exercises where id=md5('we_carol')::uuid), 'workout_exercises: own SELECT succeeds');

select ok((select count(*)=0 from public.workout_exercises where id=md5('we_bob')::uuid), 'workout_exercises: other-owner SELECT hidden');

select ok((select count(*)=1 from public.workout_sets where id=md5('set_carol')::uuid), 'workout_sets: own SELECT succeeds');

select ok((select count(*)=0 from public.workout_sets where id=md5('set_bob')::uuid), 'workout_sets: other-owner SELECT hidden');

select ok((select count(*)=1 from public.exercise_movement_patterns where exercise_id=md5('custom_carol')::uuid), 'exercise_movement_patterns: own SELECT succeeds');

select ok((select count(*)=0 from public.exercise_movement_patterns where exercise_id=md5('custom_bob')::uuid), 'exercise_movement_patterns: other-owner SELECT hidden');

select ok((select count(*)=1 from public.exercise_muscles where exercise_id=md5('custom_carol')::uuid), 'exercise_muscles: own SELECT succeeds');

select ok((select count(*)=0 from public.exercise_muscles where exercise_id=md5('custom_bob')::uuid), 'exercise_muscles: other-owner SELECT hidden');

select ok((select count(*)=1 from public.exercise_equipment where exercise_id=md5('custom_carol')::uuid), 'exercise_equipment: own SELECT succeeds');

select ok((select count(*)=0 from public.exercise_equipment where exercise_id=md5('custom_bob')::uuid), 'exercise_equipment: other-owner SELECT hidden');

select is(pg_temp.affected($sql$update public.profiles set display_name='Carol updated' where id=md5('carol')::uuid$sql$), 1::bigint, 'profiles: allowed own UPDATE affects one row');

select ok((select display_name='Carol updated' from public.profiles where id=md5('carol')::uuid), 'profiles: own UPDATE persisted its intended state');

select is(pg_temp.affected($sql$update public.account_preferences set preferred_split='upper_lower' where owner_id=md5('carol')::uuid$sql$), 1::bigint, 'account_preferences: allowed own UPDATE affects one row');

select ok((select preferred_split='upper_lower' from public.account_preferences where owner_id=md5('carol')::uuid), 'account_preferences: own UPDATE persisted its intended state');

select is(pg_temp.affected($sql$update public.exercises set archived_at=now() where id=md5('custom_carol')::uuid$sql$), 1::bigint, 'exercises: allowed own UPDATE affects one row');

select ok((select archived_at is not null from public.exercises where id=md5('custom_carol')::uuid), 'exercises: own UPDATE persisted its intended state');

select is(pg_temp.affected($sql$update public.user_exercise_preferences set preference='preferred' where owner_id=md5('carol')::uuid$sql$), 1::bigint, 'user_exercise_preferences: allowed own UPDATE affects one row');

select ok((select preference='preferred' from public.user_exercise_preferences where owner_id=md5('carol')::uuid), 'user_exercise_preferences: own UPDATE persisted its intended state');

select is(pg_temp.affected($sql$update public.programs set name='Updated plan' where id=md5('program_carol')::uuid$sql$), 1::bigint, 'programs: allowed own UPDATE affects one row');

select ok((select name='Updated plan' from public.programs where id=md5('program_carol')::uuid), 'programs: own UPDATE persisted its intended state');

select is(pg_temp.affected($sql$update public.program_days set name='Updated day' where id=md5('carol_day_1')::uuid$sql$), 1::bigint, 'program_days: allowed own UPDATE affects one row');

select ok((select name='Updated day' from public.program_days where id=md5('carol_day_1')::uuid), 'program_days: own UPDATE persisted its intended state');

select is(pg_temp.affected($sql$update public.program_slots set target_sets=4 where id=md5('slot_carol')::uuid$sql$), 1::bigint, 'program_slots: allowed own UPDATE affects one row');

select ok((select target_sets=4 from public.program_slots where id=md5('slot_carol')::uuid), 'program_slots: own UPDATE persisted its intended state');

select is(pg_temp.affected($sql$update public.program_assignments set state='paused' where id=md5('assignment_carol')::uuid$sql$), 1::bigint, 'program_assignments: allowed own UPDATE affects one row');

select ok((select state='paused' from public.program_assignments where id=md5('assignment_carol')::uuid), 'program_assignments: own UPDATE persisted its intended state');

select is(pg_temp.affected($sql$update public.workout_sessions set notes='Corrected session' where id=md5('session_carol')::uuid$sql$), 1::bigint, 'workout_sessions: allowed own UPDATE affects one row');

select ok((select notes='Corrected session' from public.workout_sessions where id=md5('session_carol')::uuid), 'workout_sessions: own UPDATE persisted its intended state');

select is(pg_temp.affected($sql$update public.workout_exercises set notes='Corrected exercise' where id=md5('we_carol')::uuid$sql$), 1::bigint, 'workout_exercises: allowed own UPDATE affects one row');

select ok((select notes='Corrected exercise' from public.workout_exercises where id=md5('we_carol')::uuid), 'workout_exercises: own UPDATE persisted its intended state');

select is(pg_temp.affected($sql$update public.workout_sets set actual_weight_kg=35 where id=md5('set_carol')::uuid$sql$), 1::bigint, 'workout_sets: allowed own UPDATE affects one row');

select ok((select actual_weight_kg=35 from public.workout_sets where id=md5('set_carol')::uuid), 'workout_sets: own UPDATE persisted its intended state');

select is(pg_temp.affected($sql$update public.exercise_muscles set muscle_role='secondary' where exercise_id=md5('custom_carol')::uuid$sql$), 1::bigint, 'exercise_muscles: allowed own UPDATE affects one row');

select ok((select muscle_role='secondary' from public.exercise_muscles where exercise_id=md5('custom_carol')::uuid), 'exercise_muscles: own UPDATE persisted its intended state');

select throws_ok($sql$update public.profiles set id=md5('bob')::uuid where id=md5('carol')::uuid$sql$, '42501', null, 'profiles: protected key UPDATE denied');

select throws_ok($sql$update public.account_preferences set owner_id=md5('bob')::uuid where owner_id=md5('carol')::uuid$sql$, '42501', null, 'account_preferences: protected key UPDATE denied');

select throws_ok($sql$update public.exercises set owner_id=md5('bob')::uuid where id=md5('custom_carol')::uuid$sql$, '42501', null, 'exercises: protected key UPDATE denied');

select throws_ok($sql$update public.user_equipment set owner_id=md5('bob')::uuid where owner_id=md5('carol')::uuid$sql$, '42501', null, 'user_equipment: protected key UPDATE denied');

select throws_ok($sql$update public.user_exercise_preferences set owner_id=md5('bob')::uuid where owner_id=md5('carol')::uuid$sql$, '42501', null, 'user_exercise_preferences: protected key UPDATE denied');

select throws_ok($sql$update public.programs set owner_id=md5('bob')::uuid where id=md5('program_carol')::uuid$sql$, '42501', null, 'programs: protected key UPDATE denied');

select throws_ok($sql$update public.program_days set owner_id=md5('bob')::uuid where id=md5('carol_day_1')::uuid$sql$, '42501', null, 'program_days: protected key UPDATE denied');

select throws_ok($sql$update public.program_slots set owner_id=md5('bob')::uuid where id=md5('slot_carol')::uuid$sql$, '42501', null, 'program_slots: protected key UPDATE denied');

select throws_ok($sql$update public.program_assignments set owner_id=md5('bob')::uuid where id=md5('assignment_carol')::uuid$sql$, '42501', null, 'program_assignments: protected key UPDATE denied');

select throws_ok($sql$update public.workout_sessions set owner_id=md5('bob')::uuid where id=md5('session_carol')::uuid$sql$, '42501', null, 'workout_sessions: protected key UPDATE denied');

select throws_ok($sql$update public.workout_exercises set owner_id=md5('bob')::uuid where id=md5('we_carol')::uuid$sql$, '42501', null, 'workout_exercises: protected key UPDATE denied');

select throws_ok($sql$update public.workout_sets set owner_id=md5('bob')::uuid where id=md5('set_carol')::uuid$sql$, '42501', null, 'workout_sets: protected key UPDATE denied');

select throws_ok($sql$update public.exercise_movement_patterns set exercise_id=exercise_id where exercise_id=md5('custom_carol')::uuid$sql$, '42501', null, 'exercise_movement_patterns: protected key UPDATE denied');

select throws_ok($sql$update public.exercise_muscles set exercise_id=exercise_id where exercise_id=md5('custom_carol')::uuid$sql$, '42501', null, 'exercise_muscles: protected key UPDATE denied');

select throws_ok($sql$update public.exercise_equipment set exercise_id=exercise_id where exercise_id=md5('custom_carol')::uuid$sql$, '42501', null, 'exercise_equipment: protected key UPDATE denied');

select throws_ok($sql$update public.exercise_movement_patterns set exercise_id=exercise_id$sql$, '42501', null, 'exercise_movement_patterns: immutable link uses delete/insert rather than UPDATE');

select throws_ok($sql$update public.exercise_equipment set exercise_id=exercise_id$sql$, '42501', null, 'exercise_equipment: immutable link uses delete/insert rather than UPDATE');

select throws_ok($sql$update public.user_equipment set owner_id=owner_id$sql$, '42501', null, 'user_equipment: immutable link uses delete/insert rather than UPDATE');

reset role;

set local role authenticated;

set local "request.jwt.claim.sub" = '9f9d51bc-70ef-21ca-5c14-f307980a29d8';

select ok((select count(*)=0 from public.profiles where id=md5('carol')::uuid), 'profiles: Bob cannot SELECT Carol rows');

select is(pg_temp.affected($sql$update public.profiles set display_name='Carol updated' where id=md5('carol')::uuid$sql$), 0::bigint, 'profiles: unauthorized UPDATE affects zero rows');

select throws_ok($sql$delete from public.profiles where id=md5('carol')::uuid$sql$, '42501', null, 'profiles: destructive DELETE has no grant');

select ok((select count(*)=0 from public.account_preferences where owner_id=md5('carol')::uuid), 'account_preferences: Bob cannot SELECT Carol rows');

select is(pg_temp.affected($sql$update public.account_preferences set preferred_split='upper_lower' where owner_id=md5('carol')::uuid$sql$), 0::bigint, 'account_preferences: unauthorized UPDATE affects zero rows');

select throws_ok($sql$delete from public.account_preferences where owner_id=md5('carol')::uuid$sql$, '42501', null, 'account_preferences: destructive DELETE has no grant');

select ok((select count(*)=0 from public.exercises where id=md5('custom_carol')::uuid), 'exercises: Bob cannot SELECT Carol rows');

select is(pg_temp.affected($sql$update public.exercises set archived_at=now() where id=md5('custom_carol')::uuid$sql$), 0::bigint, 'exercises: unauthorized UPDATE affects zero rows');

select throws_ok($sql$delete from public.exercises where id=md5('custom_carol')::uuid$sql$, '42501', null, 'exercises: destructive DELETE has no grant');

select ok((select count(*)=0 from public.user_equipment where owner_id=md5('carol')::uuid), 'user_equipment: Bob cannot SELECT Carol rows');

select is(pg_temp.affected($sql$delete from public.user_equipment where owner_id=md5('carol')::uuid$sql$), 0::bigint, 'user_equipment: unauthorized DELETE affects zero rows');

select ok((select count(*)=0 from public.user_exercise_preferences where owner_id=md5('carol')::uuid), 'user_exercise_preferences: Bob cannot SELECT Carol rows');

select is(pg_temp.affected($sql$update public.user_exercise_preferences set preference='preferred' where owner_id=md5('carol')::uuid$sql$), 0::bigint, 'user_exercise_preferences: unauthorized UPDATE affects zero rows');

select is(pg_temp.affected($sql$delete from public.user_exercise_preferences where owner_id=md5('carol')::uuid$sql$), 0::bigint, 'user_exercise_preferences: unauthorized DELETE affects zero rows');

select ok((select count(*)=0 from public.programs where id=md5('program_carol')::uuid), 'programs: Bob cannot SELECT Carol rows');

select is(pg_temp.affected($sql$update public.programs set name='Updated plan' where id=md5('program_carol')::uuid$sql$), 0::bigint, 'programs: unauthorized UPDATE affects zero rows');

select throws_ok($sql$delete from public.programs where id=md5('program_carol')::uuid$sql$, '42501', null, 'programs: destructive DELETE has no grant');

select ok((select count(*)=0 from public.program_days where id=md5('carol_day_1')::uuid), 'program_days: Bob cannot SELECT Carol rows');

select is(pg_temp.affected($sql$update public.program_days set name='Updated day' where id=md5('carol_day_1')::uuid$sql$), 0::bigint, 'program_days: unauthorized UPDATE affects zero rows');

select is(pg_temp.affected($sql$delete from public.program_days where id=md5('carol_day_1')::uuid$sql$), 0::bigint, 'program_days: unauthorized DELETE affects zero rows');

select ok((select count(*)=0 from public.program_slots where id=md5('slot_carol')::uuid), 'program_slots: Bob cannot SELECT Carol rows');

select is(pg_temp.affected($sql$update public.program_slots set target_sets=4 where id=md5('slot_carol')::uuid$sql$), 0::bigint, 'program_slots: unauthorized UPDATE affects zero rows');

select is(pg_temp.affected($sql$delete from public.program_slots where id=md5('slot_carol')::uuid$sql$), 0::bigint, 'program_slots: unauthorized DELETE affects zero rows');

select ok((select count(*)=0 from public.program_assignments where id=md5('assignment_carol')::uuid), 'program_assignments: Bob cannot SELECT Carol rows');

select is(pg_temp.affected($sql$update public.program_assignments set state='paused' where id=md5('assignment_carol')::uuid$sql$), 0::bigint, 'program_assignments: unauthorized UPDATE affects zero rows');

select throws_ok($sql$delete from public.program_assignments where id=md5('assignment_carol')::uuid$sql$, '42501', null, 'program_assignments: destructive DELETE has no grant');

select ok((select count(*)=0 from public.workout_sessions where id=md5('session_carol')::uuid), 'workout_sessions: Bob cannot SELECT Carol rows');

select is(pg_temp.affected($sql$update public.workout_sessions set notes='Corrected session' where id=md5('session_carol')::uuid$sql$), 0::bigint, 'workout_sessions: unauthorized UPDATE affects zero rows');

select throws_ok($sql$delete from public.workout_sessions where id=md5('session_carol')::uuid$sql$, '42501', null, 'workout_sessions: destructive DELETE has no grant');

select ok((select count(*)=0 from public.workout_exercises where id=md5('we_carol')::uuid), 'workout_exercises: Bob cannot SELECT Carol rows');

select is(pg_temp.affected($sql$update public.workout_exercises set notes='Corrected exercise' where id=md5('we_carol')::uuid$sql$), 0::bigint, 'workout_exercises: unauthorized UPDATE affects zero rows');

select throws_ok($sql$delete from public.workout_exercises where id=md5('we_carol')::uuid$sql$, '42501', null, 'workout_exercises: destructive DELETE has no grant');

select ok((select count(*)=0 from public.workout_sets where id=md5('set_carol')::uuid), 'workout_sets: Bob cannot SELECT Carol rows');

select is(pg_temp.affected($sql$update public.workout_sets set actual_weight_kg=35 where id=md5('set_carol')::uuid$sql$), 0::bigint, 'workout_sets: unauthorized UPDATE affects zero rows');

select is(pg_temp.affected($sql$delete from public.workout_sets where id=md5('set_carol')::uuid$sql$), 0::bigint, 'workout_sets: unauthorized DELETE affects zero rows');

select ok((select count(*)=0 from public.exercise_movement_patterns where exercise_id=md5('custom_carol')::uuid), 'exercise_movement_patterns: Bob cannot SELECT Carol rows');

select is(pg_temp.affected($sql$delete from public.exercise_movement_patterns where exercise_id=md5('custom_carol')::uuid$sql$), 0::bigint, 'exercise_movement_patterns: unauthorized DELETE affects zero rows');

select ok((select count(*)=0 from public.exercise_muscles where exercise_id=md5('custom_carol')::uuid), 'exercise_muscles: Bob cannot SELECT Carol rows');

select is(pg_temp.affected($sql$update public.exercise_muscles set muscle_role='secondary' where exercise_id=md5('custom_carol')::uuid$sql$), 0::bigint, 'exercise_muscles: unauthorized UPDATE affects zero rows');

select is(pg_temp.affected($sql$delete from public.exercise_muscles where exercise_id=md5('custom_carol')::uuid$sql$), 0::bigint, 'exercise_muscles: unauthorized DELETE affects zero rows');

select ok((select count(*)=0 from public.exercise_equipment where exercise_id=md5('custom_carol')::uuid), 'exercise_equipment: Bob cannot SELECT Carol rows');

select is(pg_temp.affected($sql$delete from public.exercise_equipment where exercise_id=md5('custom_carol')::uuid$sql$), 0::bigint, 'exercise_equipment: unauthorized DELETE affects zero rows');

reset role;

set local role authenticated;

set local "request.jwt.claim.sub" = '6384e2b2-184b-cbf5-8ecc-f10ca7a6563c';

select ok((select count(*)=1 from public.profiles where id=md5('alice')::uuid), 'profiles: Alice reads her own pre-existing row');

select ok((select count(*)=1 from public.account_preferences where owner_id=md5('alice')::uuid), 'account_preferences: Alice reads her own pre-existing row');

select ok((select count(*)=1 from public.exercises where id=md5('custom_alice')::uuid), 'exercises: Alice reads her own pre-existing row');

select ok((select count(*)=1 from public.user_equipment where owner_id=md5('alice')::uuid), 'user_equipment: Alice reads her own pre-existing row');

select ok((select count(*)=1 from public.user_exercise_preferences where owner_id=md5('alice')::uuid), 'user_exercise_preferences: Alice reads her own pre-existing row');

select ok((select count(*)=1 from public.programs where id=md5('program_alice')::uuid), 'programs: Alice reads her own pre-existing row');

select ok((select count(*)=1 from public.program_days where id=md5('alice_day_1')::uuid), 'program_days: Alice reads her own pre-existing row');

select ok((select count(*)=1 from public.program_slots where id=md5('slot_alice')::uuid), 'program_slots: Alice reads her own pre-existing row');

select ok((select count(*)=1 from public.program_assignments where id=md5('assignment_alice')::uuid), 'program_assignments: Alice reads her own pre-existing row');

select ok((select count(*)=1 from public.workout_sessions where id=md5('session_alice')::uuid), 'workout_sessions: Alice reads her own pre-existing row');

select ok((select count(*)=1 from public.workout_exercises where id=md5('we_alice')::uuid), 'workout_exercises: Alice reads her own pre-existing row');

select ok((select count(*)=1 from public.workout_sets where id=md5('set_alice')::uuid), 'workout_sets: Alice reads her own pre-existing row');

select ok((select count(*)=1 from public.exercise_movement_patterns where exercise_id=md5('custom_alice')::uuid), 'exercise_movement_patterns: Alice reads her own pre-existing row');

select ok((select count(*)=1 from public.exercise_muscles where exercise_id=md5('custom_alice')::uuid), 'exercise_muscles: Alice reads her own pre-existing row');

select ok((select count(*)=1 from public.exercise_equipment where exercise_id=md5('custom_alice')::uuid), 'exercise_equipment: Alice reads her own pre-existing row');

select is(pg_temp.affected($sql$update public.account_preferences set preferred_split='alice_new_split' where owner_id=md5('alice')::uuid$sql$), 1::bigint, 'Alice updates her own preferences');

select is(pg_temp.affected($sql$update public.programs set name='Alice revised plan' where id=md5('program_alice')::uuid$sql$), 1::bigint, 'Alice edits her own existing program');

select ok((select count(*)=1 from public.exercises where id=md5('system')::uuid), 'Alice reads system exercise');

select is(pg_temp.affected($sql$update public.exercises set name='Unauthorized system edit' where id=md5('system')::uuid$sql$), 0::bigint, 'system exercise UPDATE affects zero rows for ordinary user');

select is(pg_temp.affected($sql$delete from public.exercise_movement_patterns where exercise_id=md5('system')::uuid$sql$), 0::bigint, 'exercise_movement_patterns: system classifications cannot be deleted');

select throws_ok($sql$insert into public.exercise_movement_patterns(exercise_id,movement_pattern_id) values (md5('system')::uuid,md5('movement_patterns')::uuid)$sql$, '42501', null, 'exercise_movement_patterns: system classification INSERT denied');

select is(pg_temp.affected($sql$delete from public.exercise_muscles where exercise_id=md5('system')::uuid$sql$), 0::bigint, 'exercise_muscles: system classifications cannot be deleted');

select is(pg_temp.affected($sql$update public.exercise_muscles set muscle_role='secondary' where exercise_id=md5('system')::uuid$sql$), 0::bigint, 'exercise_muscles: system classification UPDATE affects zero rows');

select throws_ok($sql$insert into public.exercise_muscles(exercise_id,muscle_group_id,muscle_role) values (md5('system')::uuid,md5('muscle_groups')::uuid,'secondary')$sql$, '42501', null, 'exercise_muscles: system classification INSERT denied');

select is(pg_temp.affected($sql$delete from public.exercise_equipment where exercise_id=md5('system')::uuid$sql$), 0::bigint, 'exercise_equipment: system classifications cannot be deleted');

select throws_ok($sql$insert into public.exercise_equipment(exercise_id,equipment_type_id) values (md5('system')::uuid,md5('equipment_types')::uuid)$sql$, '42501', null, 'exercise_equipment: system classification INSERT denied');

reset role;

set local role authenticated;

set local "request.jwt.claim.sub" = 'a9a01980-10a6-073d-b964-34f6cc5f22a8';

select ok((select display_name='Carol updated' from public.profiles where id=md5('carol')::uuid), 'profiles: state unchanged by other-owner UPDATE/DELETE attempts');

select ok((select preferred_split='upper_lower' from public.account_preferences where owner_id=md5('carol')::uuid), 'account_preferences: state unchanged by other-owner UPDATE/DELETE attempts');

select ok((select archived_at is not null from public.exercises where id=md5('custom_carol')::uuid), 'exercises: state unchanged by other-owner UPDATE/DELETE attempts');

select ok((select preference='preferred' from public.user_exercise_preferences where owner_id=md5('carol')::uuid), 'user_exercise_preferences: state unchanged by other-owner UPDATE/DELETE attempts');

select ok((select name='Updated plan' from public.programs where id=md5('program_carol')::uuid), 'programs: state unchanged by other-owner UPDATE/DELETE attempts');

select ok((select name='Updated day' from public.program_days where id=md5('carol_day_1')::uuid), 'program_days: state unchanged by other-owner UPDATE/DELETE attempts');

select ok((select target_sets=4 from public.program_slots where id=md5('slot_carol')::uuid), 'program_slots: state unchanged by other-owner UPDATE/DELETE attempts');

select ok((select state='paused' from public.program_assignments where id=md5('assignment_carol')::uuid), 'program_assignments: state unchanged by other-owner UPDATE/DELETE attempts');

select ok((select notes='Corrected session' from public.workout_sessions where id=md5('session_carol')::uuid), 'workout_sessions: state unchanged by other-owner UPDATE/DELETE attempts');

select ok((select notes='Corrected exercise' from public.workout_exercises where id=md5('we_carol')::uuid), 'workout_exercises: state unchanged by other-owner UPDATE/DELETE attempts');

select ok((select actual_weight_kg=35 from public.workout_sets where id=md5('set_carol')::uuid), 'workout_sets: state unchanged by other-owner UPDATE/DELETE attempts');

select ok((select muscle_role='secondary' from public.exercise_muscles where exercise_id=md5('custom_carol')::uuid), 'exercise_muscles: state unchanged by other-owner UPDATE/DELETE attempts');

select throws_ok($sql$insert into public.profiles(id,display_name) values (md5('bob')::uuid,'Forged')$sql$, '42501', null, 'cannot bootstrap another user profile');

select throws_ok($sql$insert into public.exercises(owner_id,name) values (null,'Forged system entry')$sql$, '42501', null, 'cannot create a system exercise by using NULL owner');

select throws_ok($sql$insert into public.exercises(owner_id,name) values (md5('bob')::uuid,'Forged custom')$sql$, '42501', null, 'cannot create a custom exercise for another owner');

select throws_ok($sql$insert into public.account_preferences(owner_id) values (md5('bob')::uuid)$sql$, '42501', null, 'cannot create another owner preferences');

select throws_ok($sql$insert into public.user_equipment(owner_id,equipment_type_id) values (md5('bob')::uuid,md5('equipment_types')::uuid)$sql$, '42501', null, 'cannot create another user equipment preference');

select throws_ok($sql$insert into public.user_exercise_preferences(owner_id,exercise_id) values (md5('carol')::uuid,md5('custom_bob')::uuid)$sql$, '23503', null, 'private exercise preference reference is inaccessible');

select lives_ok($sql$insert into public.user_exercise_preferences(owner_id,exercise_id) values (md5('carol')::uuid,md5('custom_carol')::uuid)$sql$, 'own custom exercise preference is permitted alongside system reference');

select throws_ok($sql$insert into public.programs(owner_id,name,cycle_length) values (md5('bob')::uuid,'Forged',7)$sql$, '42501', null, 'cannot forge program ownership');

select throws_ok($sql$insert into public.program_days(owner_id,program_id,cycle_length,cycle_position,name) values (md5('carol')::uuid,md5('spare_bob')::uuid,7,1,'Forged')$sql$, '42501', null, 'cannot create a day under another user program');

select throws_ok($sql$insert into public.program_slots(owner_id,program_day_id,position,exercise_id,target_sets) values (md5('carol')::uuid,md5('bob_day_1')::uuid,2,md5('system')::uuid,1)$sql$, '42501', null, 'cannot create a slot under another user day');

select throws_ok($sql$insert into public.program_slots(owner_id,program_day_id,position,exercise_id,target_sets) values (md5('carol')::uuid,md5('carol_day_1')::uuid,2,md5('custom_bob')::uuid,1)$sql$, '23503', null, 'cannot use another private custom exercise in own plan');

select throws_ok($sql$insert into public.program_assignments(owner_id,program_id,cycle_length,state,next_cycle_position) values (md5('carol')::uuid,md5('program_bob')::uuid,10,'paused',1)$sql$, '23503', null, 'cannot assign another user program');

select throws_ok($sql$update public.programs set derived_from_program_id=md5('program_bob')::uuid where id=md5('program_carol')::uuid$sql$, '23503', null, 'cannot forge cross-owner template lineage');

select throws_ok($sql$insert into public.workout_sessions(owner_id,name) values (md5('bob')::uuid,'Forged')$sql$, '42501', null, 'cannot create another user workout session');

select throws_ok($sql$insert into public.workout_exercises(owner_id,workout_session_id,position,exercise_id,exercise_name_snapshot) values (md5('carol')::uuid,md5('session_bob')::uuid,2,md5('system')::uuid,'Forged')$sql$, '23503', null, 'cannot append an exercise under another user session');

select throws_ok($sql$insert into public.workout_sets(owner_id,workout_exercise_id,position) values (md5('carol')::uuid,md5('we_bob')::uuid,2)$sql$, '23503', null, 'cannot append a set under another user workout exercise');

select throws_ok($sql$update public.workout_exercises set exercise_id=md5('custom_bob')::uuid where id=md5('we_carol')::uuid$sql$, '23503', null, 'cannot substitute another private custom exercise');

select throws_ok($sql$update public.workout_exercises set prescribed_exercise_id=md5('custom_bob')::uuid,prescribed_exercise_name_snapshot='Forged' where id=md5('we_carol')::uuid$sql$, '23503', null, 'cannot forge an original private exercise prescription');

select throws_ok($sql$insert into public.exercise_movement_patterns(exercise_id,movement_pattern_id) values (md5('custom_bob')::uuid,md5('movement_patterns')::uuid)$sql$, '42501', null, 'exercise_movement_patterns: another owner custom relationship INSERT denied');

select throws_ok($sql$insert into public.exercise_muscles(exercise_id,muscle_group_id,muscle_role) values (md5('custom_bob')::uuid,md5('muscle_groups')::uuid,'primary')$sql$, '42501', null, 'exercise_muscles: another owner custom relationship INSERT denied');

select throws_ok($sql$insert into public.exercise_equipment(exercise_id,equipment_type_id) values (md5('custom_bob')::uuid,md5('equipment_types')::uuid)$sql$, '42501', null, 'exercise_equipment: another owner custom relationship INSERT denied');

select ok((select program_name_snapshot='Carol plan' and day_name_snapshot='Carol day' from public.workout_sessions where id=md5('session_carol')::uuid), 'owner edits to program/day do not rewrite session snapshots');

select ok((select prescribed_sets=3 from public.workout_exercises where id=md5('we_carol')::uuid), 'owner edit of program targets does not rewrite historical prescription');

select ok((select prescribed_weight_kg=20 and actual_weight_kg=35 from public.workout_sets where id=md5('set_carol')::uuid), 'history edits correct actual data without rewriting prescribed values');

select ok((select next_cycle_position=1 from public.program_assignments where id=md5('assignment_carol')::uuid), 'record edits never advance cycle implicitly');

select is(pg_temp.affected($sql$update public.programs set cycle_length=10 where id=md5('program_carol')::uuid$sql$), 1::bigint, 'owner can expand a seven-position plan to ten positions');
select ok((select cycle_length=10 from public.program_days where id=md5('carol_day_1')::uuid), 'program cycle expansion cascades to protected day length');
select ok((select cycle_length=10 from public.program_assignments where id=md5('assignment_carol')::uuid), 'program cycle expansion cascades to protected assignment length');
select lives_ok($sql$insert into public.program_days(id,owner_id,program_id,cycle_length,cycle_position,name,is_rest_day) values (md5('carol_rest10')::uuid,md5('carol')::uuid,md5('program_carol')::uuid,10,10,'Rest',true)$sql$, 'owner creates a rest position beyond the calendar week');
select throws_ok($sql$insert into public.program_slots(owner_id,program_day_id,position,exercise_id,target_sets) values (md5('carol')::uuid,md5('carol_rest10')::uuid,1,md5('system')::uuid,1)$sql$, '23514', null, 'owner writes still enforce rest-day slot guard');
select throws_ok($sql$insert into public.workout_sessions(owner_id,name,source_program_id,source_program_day_id,source_cycle_position,program_name_snapshot,day_name_snapshot) values (md5('carol')::uuid,'Invalid rest workout',md5('program_carol')::uuid,md5('carol_rest10')::uuid,10,'Plan','Rest')$sql$, '23514', null, 'owner cannot turn a rest position into a fabricated workout');
select is(pg_temp.affected($sql$update public.program_assignments set next_cycle_position=10 where id=md5('assignment_carol')::uuid$sql$), 1::bigint, 'owner explicitly selects a tenth-position rest cursor');
select is(pg_temp.affected($sql$update public.program_assignments set next_cycle_position=1, completed_rotations=1 where id=md5('assignment_carol')::uuid$sql$), 1::bigint, 'owner explicitly wraps a ten-position rotation');

select throws_ok($sql$insert into public.workout_sessions(owner_id,name) values (md5('carol')::uuid,'Ad hoc')$sql$, '23505', null, 'second active workout is denied by unique index');

select throws_ok($sql$insert into public.workout_sessions(owner_id,name,status,completion_status,finished_at) values (md5('carol')::uuid,'Abandoned','abandoned','partial',now())$sql$, '42501', null, 'owner cannot submit protected closure fields');

select is(public.end_workout(md5('session_carol')::uuid,'completed'),md5('session_carol')::uuid,'owner can finish through authoritative lifecycle');

set local "request.jwt.claims" = '{"sub":"a9a01980-10a6-073d-b964-34f6cc5f22a8","user_metadata":{"role":"admin","owner_id":"bob"}}';

select ok((select count(*)=0 from public.profiles where id=md5('bob')::uuid), 'forged user metadata does not expose another profile');

select is(pg_temp.affected($sql$update public.exercises set name='Fake admin' where id=md5('system')::uuid$sql$), 0::bigint, 'user metadata cannot enable catalog administration');

select throws_ok($sql$delete from public.profiles where id=md5('carol')::uuid$sql$, '42501', null, 'profiles: own destructive DELETE deliberately denied');

select throws_ok($sql$delete from public.account_preferences where owner_id=md5('carol')::uuid$sql$, '42501', null, 'account_preferences: own destructive DELETE deliberately denied');

select throws_ok($sql$delete from public.exercises where id=md5('custom_carol')::uuid$sql$, '42501', null, 'exercises: own destructive DELETE deliberately denied');

select throws_ok($sql$delete from public.programs where id=md5('program_carol')::uuid$sql$, '42501', null, 'programs: own destructive DELETE deliberately denied');

select throws_ok($sql$delete from public.program_assignments where id=md5('assignment_carol')::uuid$sql$, '42501', null, 'program_assignments: own destructive DELETE deliberately denied');

select throws_ok($sql$delete from public.workout_sessions where id=md5('session_carol')::uuid$sql$, '42501', null, 'workout_sessions: own destructive DELETE deliberately denied');

select throws_ok($sql$delete from public.workout_exercises where id=md5('we_carol')::uuid$sql$, '42501', null, 'workout_exercises: own destructive DELETE deliberately denied');

select ok((select name='System exercise' from public.exercises where id=md5('system')::uuid), 'system exercise state survived ordinary and fake-admin updates');
select ok((select muscle_role='primary' from public.exercise_muscles where exercise_id=md5('system')::uuid), 'system muscle classification state survived unauthorized updates/deletes');
select ok((select count(*)=1 from public.exercise_movement_patterns where exercise_id=md5('system')::uuid), 'system pattern relation survived unauthorized deletes');
select ok((select count(*)=1 from public.exercise_equipment where exercise_id=md5('system')::uuid), 'system equipment relation survived unauthorized deletes');
select throws_ok($sql$update public.workout_sessions set source_program_id=md5('program_bob')::uuid where id=md5('session_carol')::uuid$sql$, '42501', null, 'session source cannot be rewritten through client update grants');
select throws_ok($sql$update public.workout_sets set workout_exercise_id=md5('we_bob')::uuid where id=md5('set_carol')::uuid$sql$, '42501', null, 'performed set parent cannot be retargeted');

select lives_ok($sql$insert into public.program_days(id,owner_id,program_id,cycle_length,cycle_position,name) values (md5('delete_day')::uuid,md5('carol')::uuid,md5('program_carol')::uuid,10,2,'Disposable')$sql$, 'owner creates unused draft day for deletion');

select is(pg_temp.affected($sql$delete from public.program_days where id=md5('delete_day')::uuid$sql$), 1::bigint, 'owner can delete an unused draft day');

select ok((select count(*)=0 from public.program_days where id=md5('delete_day')::uuid), 'draft day deletion persisted');

select throws_ok($sql$delete from public.program_days where id=md5('carol_day_1')::uuid$sql$, '23503', null, 'recorded or assigned day cannot cascade away history');

select throws_ok($sql$delete from public.workout_sets where id=md5('set_carol')::uuid$sql$, '23514', null, 'workout_sets: closed history DELETE denied');

select ok((select count(*)=1 from public.workout_sets where id=md5('set_carol')::uuid), 'workout_sets: closed recorded history preserved');

select is(pg_temp.affected($sql$delete from public.user_exercise_preferences where owner_id=md5('carol')::uuid$sql$), 2::bigint, 'user_exercise_preferences: own DELETE succeeds');

select ok((select count(*)=0 from public.user_exercise_preferences where owner_id=md5('carol')::uuid), 'user_exercise_preferences: DELETE persisted');

select is(pg_temp.affected($sql$delete from public.user_equipment where owner_id=md5('carol')::uuid$sql$), 1::bigint, 'user_equipment: own DELETE succeeds');

select ok((select count(*)=0 from public.user_equipment where owner_id=md5('carol')::uuid), 'user_equipment: DELETE persisted');

select is(pg_temp.affected($sql$delete from public.exercise_movement_patterns where exercise_id=md5('custom_carol')::uuid$sql$), 1::bigint, 'exercise_movement_patterns: own DELETE succeeds');

select ok((select count(*)=0 from public.exercise_movement_patterns where exercise_id=md5('custom_carol')::uuid), 'exercise_movement_patterns: DELETE persisted');

select is(pg_temp.affected($sql$delete from public.exercise_muscles where exercise_id=md5('custom_carol')::uuid$sql$), 1::bigint, 'exercise_muscles: own DELETE succeeds');

select ok((select count(*)=0 from public.exercise_muscles where exercise_id=md5('custom_carol')::uuid), 'exercise_muscles: DELETE persisted');

select is(pg_temp.affected($sql$delete from public.exercise_equipment where exercise_id=md5('custom_carol')::uuid$sql$), 1::bigint, 'exercise_equipment: own DELETE succeeds');

select ok((select count(*)=0 from public.exercise_equipment where exercise_id=md5('custom_carol')::uuid), 'exercise_equipment: DELETE persisted');

select is(pg_temp.affected($sql$delete from public.program_slots where id=md5('slot_carol')::uuid$sql$), 1::bigint, 'program_slots: own DELETE succeeds');

select ok((select count(*)=0 from public.program_slots where id=md5('slot_carol')::uuid), 'program_slots: DELETE persisted');

select ok((select source_program_slot_id is null and prescribed_sets=3 from public.workout_exercises where id=md5('we_carol')::uuid), 'deleting planned slot clears provenance without deleting performed history');

reset role;

select * from finish();

rollback;
