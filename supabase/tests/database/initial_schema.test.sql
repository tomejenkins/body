-- Transactional synthetic fixtures only. No hosted targets or production data.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions, pg_temp;
select no_plan();
create function pg_temp.fixture_id(label text) returns uuid
language sql immutable as $$ select md5(label)::uuid $$;

insert into auth.users(id) values (pg_temp.fixture_id('alice')), (pg_temp.fixture_id('bob'));
insert into public.profiles(id, display_name) values (pg_temp.fixture_id('alice'), 'Alice'), (pg_temp.fixture_id('bob'), 'Bob');
insert into public.account_preferences(owner_id, training_goal, preferred_workouts_per_7_days, preferred_split)
values (pg_temp.fixture_id('alice'), 'strength', 4, 'upper_lower'), (pg_temp.fixture_id('bob'), 'hypertrophy', 3, 'full_body');
insert into public.movement_patterns(id, slug, name) values (pg_temp.fixture_id('pattern'), 'test_pattern', 'Test pattern');
insert into public.muscle_groups(id, slug, name) values (pg_temp.fixture_id('muscle1'), 'test_primary', 'Test primary'), (pg_temp.fixture_id('muscle2'), 'test_secondary', 'Test secondary');
insert into public.equipment_types(id, slug, name) values (pg_temp.fixture_id('equipment'), 'test_equipment', 'Test equipment');
insert into public.exercises(id, owner_id, name) values
(pg_temp.fixture_id('system'), null, 'System exercise'),
(pg_temp.fixture_id('substitute'), null, 'Substitute exercise'),
(pg_temp.fixture_id('custom_a'), pg_temp.fixture_id('alice'), 'Alice custom'),
(pg_temp.fixture_id('custom_b'), pg_temp.fixture_id('bob'), 'Bob custom');
select set_config('body_test.system_catalog_count',(select count(*)::text from public.exercises where owner_id is null),true);
insert into public.exercise_movement_patterns(exercise_id, movement_pattern_id, created_at) values (pg_temp.fixture_id('system'), pg_temp.fixture_id('pattern'), now());
insert into public.exercise_muscles values (pg_temp.fixture_id('system'), pg_temp.fixture_id('muscle1'), 'primary', now()), (pg_temp.fixture_id('system'), pg_temp.fixture_id('muscle2'), 'secondary', now());
insert into public.exercise_equipment values (pg_temp.fixture_id('system'), pg_temp.fixture_id('equipment'), now());
insert into public.user_equipment values (pg_temp.fixture_id('alice'), pg_temp.fixture_id('equipment'), now());
insert into public.user_exercise_preferences(owner_id, exercise_id, is_favorite) values (pg_temp.fixture_id('alice'), pg_temp.fixture_id('custom_a'), true);
insert into public.programs(id, owner_id, name, cycle_length, is_template) values
(pg_temp.fixture_id('p7'), pg_temp.fixture_id('alice'), 'Seven day plan', 7, false),
(pg_temp.fixture_id('p10'), pg_temp.fixture_id('alice'), 'Ten day template', 10, true),
(pg_temp.fixture_id('pb'), pg_temp.fixture_id('bob'), 'Bob plan', 7, false);
insert into public.program_days(id, owner_id, program_id, cycle_length, cycle_position, name, is_rest_day)
select pg_temp.fixture_id('p7d' || n), pg_temp.fixture_id('alice'), pg_temp.fixture_id('p7'), 7, n, 'Day ' || n, n = 7 from generate_series(1,7) n;
insert into public.program_days(id, owner_id, program_id, cycle_length, cycle_position, name, is_rest_day)
select pg_temp.fixture_id('p10d' || n), pg_temp.fixture_id('alice'), pg_temp.fixture_id('p10'), 10, n, 'Day ' || n, n in (4,10) from generate_series(1,10) n;
insert into public.program_slots(id, owner_id, program_day_id, position, movement_pattern_id, exercise_id, target_sets, target_reps_min, target_reps_max, target_weight_kg) values
(pg_temp.fixture_id('slot1'), pg_temp.fixture_id('alice'), pg_temp.fixture_id('p7d1'), 1, pg_temp.fixture_id('pattern'), pg_temp.fixture_id('system'), 3, 8, 12, 20),
(pg_temp.fixture_id('slot2'), pg_temp.fixture_id('alice'), pg_temp.fixture_id('p7d2'), 1, null, pg_temp.fixture_id('custom_a'), 1, 5, 5, 10);
insert into public.program_assignments(id, owner_id, program_id, cycle_length, state) values
(pg_temp.fixture_id('assign7'), pg_temp.fixture_id('alice'), pg_temp.fixture_id('p7'), 7, 'active'),
(pg_temp.fixture_id('assign10'), pg_temp.fixture_id('alice'), pg_temp.fixture_id('p10'), 10, 'paused');
insert into public.workout_sessions(id, owner_id, source_program_id, source_program_day_id, program_assignment_id, source_cycle_position, source_rotation, program_name_snapshot, day_name_snapshot, name, status, completion_status, started_at, finished_at) values
(pg_temp.fixture_id('session'), pg_temp.fixture_id('alice'), pg_temp.fixture_id('p7'), pg_temp.fixture_id('p7d1'), pg_temp.fixture_id('assign7'), 1, 0, 'Seven day plan', 'Day 1', 'Recorded workout', 'completed', 'full', now() - interval '1 hour', now()),
(pg_temp.fixture_id('partial'), pg_temp.fixture_id('alice'), pg_temp.fixture_id('p7'), pg_temp.fixture_id('p7d2'), pg_temp.fixture_id('assign7'), 2, 0, 'Seven day plan', 'Day 2', 'Partial workout', 'in_progress', 'partial', now(), null);
insert into public.workout_sessions(id, owner_id, name) values (pg_temp.fixture_id('adhoc'), pg_temp.fixture_id('bob'), 'Ad hoc');
insert into public.workout_sessions(id, owner_id, name, status, completion_status, started_at, finished_at) values
(pg_temp.fixture_id('abandoned'), pg_temp.fixture_id('alice'), 'Abandoned', 'abandoned', 'none', now(), now());
insert into public.workout_exercises(id, owner_id, workout_session_id, position, source_program_slot_id, exercise_id, prescribed_exercise_id, exercise_name_snapshot, prescribed_exercise_name_snapshot, status, prescribed_sets) values
(pg_temp.fixture_id('we'), pg_temp.fixture_id('alice'), pg_temp.fixture_id('session'), 1, pg_temp.fixture_id('slot1'), pg_temp.fixture_id('substitute'), pg_temp.fixture_id('system'), 'Substitute exercise', 'System exercise', 'completed', 3),
(pg_temp.fixture_id('skipped'), pg_temp.fixture_id('alice'), pg_temp.fixture_id('session'), 2, null, pg_temp.fixture_id('system'), null, 'System exercise', null, 'skipped', null),
(pg_temp.fixture_id('adhoc_ex'), pg_temp.fixture_id('bob'), pg_temp.fixture_id('adhoc'), 1, null, pg_temp.fixture_id('custom_b'), null, 'Bob custom', null, 'pending', null),
(pg_temp.fixture_id('partial_ex'), pg_temp.fixture_id('alice'), pg_temp.fixture_id('partial'), 1, pg_temp.fixture_id('slot2'), pg_temp.fixture_id('custom_a'), null, 'Alice custom', null, 'partial', 1);
insert into public.workout_sets(id, owner_id, workout_exercise_id, position, set_type, status, prescribed_reps_min, prescribed_reps_max, prescribed_weight_kg, actual_reps, actual_weight_kg, completed_at) values
(pg_temp.fixture_id('set1'), pg_temp.fixture_id('alice'), pg_temp.fixture_id('we'), 1, 'working', 'completed', 8, 12, 20, 10, 20, now()),
(pg_temp.fixture_id('set2'), pg_temp.fixture_id('alice'), pg_temp.fixture_id('we'), 2, 'warm_up', 'completed', null, null, null, 5, 10, now()),
(pg_temp.fixture_id('set3'), pg_temp.fixture_id('alice'), pg_temp.fixture_id('we'), 3, 'drop', 'pending', 8, 12, 20, null, null, null),
(pg_temp.fixture_id('set4'), pg_temp.fixture_id('alice'), pg_temp.fixture_id('we'), 4, 'rest_pause', 'skipped', null, null, null, null, null, null);

select ok((select count(*) = 42 from pg_tables where schemaname = 'public'), 'all forty-two model tables exist on fresh database');

select ok((select count(*) = 7 and max(cycle_position) = 7 from public.program_days where program_id = pg_temp.fixture_id('p7')), 'seven-day cycle uses ordered positions');

select ok((select count(*) = 10 and max(cycle_position) = 10 from public.program_days where program_id = pg_temp.fixture_id('p10')), 'ten-day cycle is not truncated to a week');

select ok((select count(*) = 2 from public.program_days where program_id = pg_temp.fixture_id('p10') and is_rest_day), 'rest days occupy positions within a ten-day rotation');

select ok((select count(*) = 1 from public.workout_sessions where id = pg_temp.fixture_id('adhoc') and source_program_id is null and source_program_day_id is null and program_assignment_id is null), 'ad hoc session needs no program');

select ok((select count(*) = 0 from public.workout_sets where workout_exercise_id in (pg_temp.fixture_id('adhoc_ex'), pg_temp.fixture_id('skipped'))), 'pending and skipped exercises need no fabricated sets');

select ok((select exercise_id <> prescribed_exercise_id from public.workout_exercises where id = pg_temp.fixture_id('we')), 'substitution preserves both original and performed exercises');

select ok((select sum(ws.actual_reps * ws.actual_weight_kg) = 250 from public.workout_sets ws join public.workout_exercises we on we.id = ws.workout_exercise_id join public.workout_sessions w on w.id = we.workout_session_id where ws.status = 'completed' and w.status = 'completed' and w.owner_id = pg_temp.fixture_id('alice')), 'completed volume excludes pending and skipped sets');

select throws_ok($sql$insert into public.program_days(owner_id, program_id, cycle_length, cycle_position, name) values (pg_temp.fixture_id('alice'), pg_temp.fixture_id('p7'), 7, 8, 'Invalid')$sql$, '23514', null, 'cycle positions cannot exceed cycle length');

select throws_ok($sql$insert into public.program_days(owner_id, program_id, cycle_length, cycle_position, name) values (pg_temp.fixture_id('alice'), pg_temp.fixture_id('p7'), 10, 8, 'Invalid')$sql$, '23503', null, 'duplicated length cannot disagree with parent program');

select throws_ok($sql$insert into public.program_days(owner_id, program_id, cycle_length, cycle_position, name) values (pg_temp.fixture_id('alice'), pg_temp.fixture_id('pb'), 7, 1, 'Invalid')$sql$, '23503', null, 'program days cannot cross ownership boundaries');

select throws_ok($sql$insert into public.program_days(owner_id, program_id, cycle_length, cycle_position, name) values (pg_temp.fixture_id('alice'), pg_temp.fixture_id('p7'), 7, 1, 'Duplicate')$sql$, '23505', null, 'duplicate cycle position is rejected');

select throws_ok($sql$update public.programs set cycle_length = 6 where id = pg_temp.fixture_id('p7')$sql$, '23514', null, 'shrinking a cycle cannot strand an existing day or cursor');

select throws_ok($sql$insert into public.program_slots(owner_id, program_day_id, position, exercise_id, target_sets) values (pg_temp.fixture_id('alice'), pg_temp.fixture_id('p7d7'), 1, pg_temp.fixture_id('system'), 1)$sql$, '23514', null, 'rest days reject exercise slots');

select throws_ok($sql$update public.program_days set is_rest_day = true where id = pg_temp.fixture_id('p7d1')$sql$, '23514', null, 'a populated training day cannot silently become rest');

select throws_ok($sql$insert into public.program_slots(owner_id, program_day_id, position, exercise_id, target_sets) values (pg_temp.fixture_id('alice'), pg_temp.fixture_id('p7d2'), 2, pg_temp.fixture_id('custom_b'), 1)$sql$, '23514', null, 'private exercises cannot be used by another user in a plan');

select throws_ok($sql$insert into public.user_exercise_preferences(owner_id, exercise_id) values (pg_temp.fixture_id('alice'), pg_temp.fixture_id('custom_b'))$sql$, '23514', null, 'private exercise preferences cannot reference another user custom entry');

select throws_ok($sql$insert into public.program_slots(owner_id, program_day_id, position, target_sets) values (pg_temp.fixture_id('alice'), pg_temp.fixture_id('p7d2'), 2, 1)$sql$, '23514', null, 'slots require a movement classification or a specific exercise');

select throws_ok($sql$update public.program_slots set target_reps_min = 20, target_reps_max = 10 where id = pg_temp.fixture_id('slot1')$sql$, '23514', null, 'prescription rep ranges must be ordered');

select throws_ok($sql$update public.program_assignments set next_cycle_position = 11 where id = pg_temp.fixture_id('assign10')$sql$, '23514', null, 'cursor cannot leave its cycle');

select throws_ok($sql$update public.program_assignments set state = 'active' where id = pg_temp.fixture_id('assign10')$sql$, '23505', null, 'at most one program assignment is active for a user');

select throws_ok($sql$insert into public.workout_sessions(owner_id, source_program_id, source_program_day_id, source_cycle_position, program_name_snapshot, day_name_snapshot, name) values (pg_temp.fixture_id('alice'), pg_temp.fixture_id('p7'), pg_temp.fixture_id('p7d7'), 7, 'Plan', 'Rest', 'Invalid')$sql$, '23514', null, 'rest positions are not fake workout sessions');

select throws_ok($sql$update public.workout_sessions set source_program_day_id = pg_temp.fixture_id('p7d2') where id = pg_temp.fixture_id('session')$sql$, '23514', null, 'session source attribution remains stable after creation');

select throws_ok($sql$insert into public.workout_exercises(owner_id, workout_session_id, position, exercise_id, exercise_name_snapshot) values (pg_temp.fixture_id('bob'), pg_temp.fixture_id('session'), 3, pg_temp.fixture_id('system'), 'System')$sql$, '23503', null, 'performed exercises cannot join another user session');

select throws_ok($sql$insert into public.workout_exercises(owner_id, workout_session_id, position, source_program_slot_id, exercise_id, exercise_name_snapshot) values (pg_temp.fixture_id('alice'), pg_temp.fixture_id('session'), 3, pg_temp.fixture_id('slot2'), pg_temp.fixture_id('system'), 'System')$sql$, '23514', null, 'snapshot source slots must match the original source day');

select throws_ok($sql$insert into public.workout_exercises(owner_id, workout_session_id, position, exercise_id, exercise_name_snapshot) values (pg_temp.fixture_id('alice'), pg_temp.fixture_id('session'), 3, pg_temp.fixture_id('custom_b'), 'Private')$sql$, '23514', null, 'performed exercises cannot use another user private custom entry');

select throws_ok($sql$insert into public.workout_sets(owner_id, workout_exercise_id, position) values (pg_temp.fixture_id('bob'), pg_temp.fixture_id('we'), 5)$sql$, '23503', null, 'sets cannot cross ownership boundaries');

select throws_ok($sql$insert into public.workout_sets(owner_id, workout_exercise_id, position) values (pg_temp.fixture_id('alice'), pg_temp.fixture_id('we'), 1)$sql$, '23505', null, 'set positions are unique within the parent exercise');

select throws_ok($sql$update public.workout_sets set actual_weight_kg = -1 where id = pg_temp.fixture_id('set1')$sql$, '23514', null, 'negative normalized loads are rejected');

select throws_ok($sql$update public.workout_sets set actual_weight_kg = 'NaN' where id = pg_temp.fixture_id('set1')$sql$, '23514', null, 'NaN loads cannot poison volume calculations');

select throws_ok($sql$update public.workout_sets set status = 'completed', completed_at = now() where id = pg_temp.fixture_id('set3')$sql$, '23514', null, 'completed sets require actual measurements');

select throws_ok($sql$update public.workout_sets set status = 'skipped', completed_at = null where id = pg_temp.fixture_id('set1')$sql$, '23514', null, 'skipped sets cannot retain performed measurements');

select throws_ok($sql$update public.workout_sessions set status = 'completed' where id = pg_temp.fixture_id('partial')$sql$, '23514', null, 'completed sessions require a finish timestamp');

select throws_ok($sql$update public.workout_sessions set finished_at = started_at - interval '1 second' where id = pg_temp.fixture_id('session')$sql$, '23514', null, 'finish cannot precede start');

select throws_ok($sql$update public.exercises set owner_id = pg_temp.fixture_id('alice') where id = pg_temp.fixture_id('system')$sql$, '23514', null, 'system and custom exercise ownership cannot be reassigned');

-- Source edits and archive never rewrite recorded names or prescription snapshots.
update public.programs set name = 'Revised plan', archived_at = now(), revision = 2 where id = pg_temp.fixture_id('p7');
update public.program_days set name = 'Revised day' where id = pg_temp.fixture_id('p7d1');
update public.program_slots set target_sets = 5, target_reps_min = 1, target_reps_max = 3, target_weight_kg = 100 where id = pg_temp.fixture_id('slot1');
update public.exercises set name = 'Revised exercise', archived_at = now() where id = pg_temp.fixture_id('substitute');

select ok((select program_name_snapshot = 'Seven day plan' and day_name_snapshot = 'Day 1' from public.workout_sessions where id = pg_temp.fixture_id('session')), 'program and day snapshots survive source editing and archival');

select ok((select exercise_name_snapshot = 'Substitute exercise' and prescribed_sets = 3 from public.workout_exercises where id = pg_temp.fixture_id('we')), 'exercise snapshots survive catalog and prescription edits');

select ok((select prescribed_reps_min = 8 and prescribed_reps_max = 12 and prescribed_weight_kg = 20 from public.workout_sets where id = pg_temp.fixture_id('set1')), 'per-set prescription history is independent of program targets');

delete from public.program_slots where id = pg_temp.fixture_id('slot1');

select ok((select source_program_slot_id is null and prescribed_sets = 3 from public.workout_exercises where id = pg_temp.fixture_id('we')), 'slot deletion clears provenance only without losing performed records');

select throws_ok($sql$delete from public.exercises where id = pg_temp.fixture_id('substitute')$sql$, '23503', null, 'recorded exercises must be archived rather than deleted');

update public.workout_sessions set status = 'completed', completion_status = 'partial', finished_at = now() where id = pg_temp.fixture_id('partial');

select ok((select next_cycle_position = 1 and completed_rotations = 0 from public.program_assignments where id = pg_temp.fixture_id('assign7')), 'completed partial and abandoned sessions never automatically advance rotation');

update public.program_assignments set next_cycle_position = 7 where id = pg_temp.fixture_id('assign7');

select ok((select next_cycle_position = 7 from public.program_assignments where id = pg_temp.fixture_id('assign7')), 'rest days remain explicit cursor positions without synthetic sessions');

update public.program_assignments set next_cycle_position = 1, completed_rotations = 1 where id = pg_temp.fixture_id('assign7');

select ok((select next_cycle_position = 1 and completed_rotations = 1 from public.program_assignments where id = pg_temp.fixture_id('assign7')), 'cursor wraps only through an explicit update');

update public.workout_sets set actual_reps = 3, actual_weight_kg = 30, notes = 'Corrected history' where id = pg_temp.fixture_id('set1');

select ok((select sum(actual_reps * actual_weight_kg) = 140 from public.workout_sets where workout_exercise_id = pg_temp.fixture_id('we') and status = 'completed'), 'volume recomputes from corrected history without stale aggregates');

select ok((select actual_weight_kg = 30 and actual_reps = 3 from public.workout_sets where id = pg_temp.fixture_id('set1') and status = 'completed'), 'stable set supports a corrected three-repetition record');

select ok((select updated_at >= created_at from public.workout_sets where id = pg_temp.fixture_id('set1')), 'historical corrections update their timestamp');

select ok((select bool_and(c.convalidated) from pg_constraint c join pg_namespace n on n.oid = c.connamespace where n.nspname = 'public'), 'all model constraints are validated');
select ok((select count(*) = 42 from pg_constraint c join pg_namespace n on n.oid = c.connamespace where n.nspname = 'public' and c.contype = 'p'), 'every model table has a primary key');
select ok((select count(*) > 30 from pg_constraint c join pg_namespace n on n.oid = c.connamespace where n.nspname = 'public' and c.contype = 'f'), 'normalized relationships have validated foreign keys');
select ok((select pg_get_expr(i.indpred, i.indrelid) like '%completed%' from pg_index i where i.indexrelid = 'public.workout_sets_completed_history'::regclass), 'completed-set history has a partial index');
select ok((select indisunique from pg_index where indexrelid = 'public.program_assignments_one_active_per_user'::regclass), 'active-assignment uniqueness is indexed');
select ok((select exists (select 1 from pg_indexes where schemaname = 'public' and indexname = 'workout_exercises_lookup_1' and indexdef like '%owner_id, exercise_id, workout_session_id%')), 'owner exercise performance lookup is indexed');
select ok((select exists (select 1 from pg_constraint where conrelid = 'public.profiles'::regclass and confrelid = 'auth.users'::regclass and contype = 'f')), 'profiles reference managed auth identity without an auth trigger');
select ok((select count(*) = 2 from public.exercise_muscles where exercise_id = pg_temp.fixture_id('system')), 'exercise can target distinct primary and secondary muscles');
select ok((select display_weight_unit = 'lb' and onboarding_completed_at is null from public.account_preferences where owner_id = pg_temp.fixture_id('alice')), 'private preferences have explicit weight units and incomplete onboarding');
select ok((select count(*) = 4 from public.workout_sets where workout_exercise_id = pg_temp.fixture_id('we') and set_type in ('warm_up', 'working', 'drop', 'rest_pause')), 'all four prescribed set types are supported');

select lives_ok($sql$delete from auth.users where id = pg_temp.fixture_id('bob')$sql$, 'deleting synthetic auth identity cascades its private account data');
select ok((select count(*) = 0 from public.workout_sessions where owner_id = pg_temp.fixture_id('bob')), 'account deletion removes its sessions');
select ok((select count(*) = 0 from public.exercises where owner_id = pg_temp.fixture_id('bob')), 'account deletion removes its custom exercises');
select ok((select count(*) = 1 from public.profiles where id = pg_temp.fixture_id('alice')), 'other accounts survive account deletion');
select lives_ok($sql$delete from auth.users where id = pg_temp.fixture_id('alice')$sql$, 'full planned history cascades cleanly when its synthetic account is deleted');
select ok((select count(*) = 0 from public.workout_sets where owner_id = pg_temp.fixture_id('alice')), 'account cascade does not leave orphaned performed sets');
select ok((select count(*) = current_setting('body_test.system_catalog_count')::bigint from public.exercises where owner_id is null), 'account deletion preserves the system exercise catalog');
select * from finish();
rollback;
