-- Phase 2.2: forward-only authorization. No changes to the Phase 2.1 migration.
begin;

-- Exercise ownership cannot change (Phase 2.1 immutable_owner trigger).
-- FK checks protect against concurrent deletion. Ordinary SELECT is sufficient;
-- FOR SHARE would require mutation privileges/policies on read-only system rows.
create or replace function body_private.check_exercise_access() returns trigger
language plpgsql security invoker set search_path = '' as $$
declare
  column_name text;
  exercise_uuid uuid;
  exercise_owner uuid;
begin
  foreach column_name in array tg_argv loop
    exercise_uuid := (to_jsonb(new) ->> column_name)::uuid;
    if exercise_uuid is not null then
      select owner_id into exercise_owner from public.exercises where id = exercise_uuid;
      if not found then
        raise exception 'Referenced exercise does not exist or is not accessible' using errcode = '23503';
      end if;
      if exercise_owner is not null and exercise_owner <> new.owner_id then
        raise exception 'Cannot reference another user custom exercise' using errcode = '23514';
      end if;
    end if;
  end loop;
  return new;
end;
$$;
-- No internal helpers, privileged RPCs, or service-role access are exposed.
revoke all on schema body_private from public, anon, authenticated, service_role;
revoke all on all functions in schema body_private from public, anon, authenticated, service_role;

-- Read-only taxonomy: authenticated identity required, no client catalog administration.
grant select on table public.movement_patterns to authenticated;
create policy catalog_read on public.movement_patterns for select to authenticated
using ((select auth.uid()) is not null);

-- Read-only taxonomy: authenticated identity required, no client catalog administration.
grant select on table public.muscle_groups to authenticated;
create policy catalog_read on public.muscle_groups for select to authenticated
using ((select auth.uid()) is not null);

-- Read-only taxonomy: authenticated identity required, no client catalog administration.
grant select on table public.equipment_types to authenticated;
create policy catalog_read on public.equipment_types for select to authenticated
using ((select auth.uid()) is not null);

-- profiles: column-limited writes; ownership checked independently of submitted values.
grant select on table public.profiles to authenticated;
grant insert (id, display_name, avatar_url) on table public.profiles to authenticated;
create policy owner_read on public.profiles for select to authenticated
using (((select auth.uid()) = id));
create policy owner_insert on public.profiles for insert to authenticated
with check ((select auth.uid()) = id);

grant update (display_name, avatar_url) on table public.profiles to authenticated;
create policy owner_update on public.profiles for update to authenticated
using ((select auth.uid()) = id) with check ((select auth.uid()) = id);

-- account_preferences: column-limited writes; ownership checked independently of submitted values.
grant select on table public.account_preferences to authenticated;
grant insert (owner_id, date_of_birth, onboarding_completed_at, training_goal, preferred_workouts_per_7_days, preferred_split, display_weight_unit) on table public.account_preferences to authenticated;
create policy owner_read on public.account_preferences for select to authenticated
using (((select auth.uid()) = owner_id));
create policy owner_insert on public.account_preferences for insert to authenticated
with check ((select auth.uid()) = owner_id);

grant update (date_of_birth, onboarding_completed_at, training_goal, preferred_workouts_per_7_days, preferred_split, display_weight_unit) on table public.account_preferences to authenticated;
create policy owner_update on public.account_preferences for update to authenticated
using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);

-- exercises: column-limited writes; ownership checked independently of submitted values.
grant select on table public.exercises to authenticated;
grant insert (id, owner_id, name, description, instructions, archived_at) on table public.exercises to authenticated;
create policy exercise_read on public.exercises for select to authenticated
using (((select auth.uid()) is not null and (owner_id is null or (select auth.uid()) = owner_id)));
create policy owner_insert on public.exercises for insert to authenticated
with check ((select auth.uid()) = owner_id);

grant update (name, description, instructions, archived_at) on table public.exercises to authenticated;
create policy owner_update on public.exercises for update to authenticated
using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);

-- user_equipment: column-limited writes; ownership checked independently of submitted values.
grant select on table public.user_equipment to authenticated;
grant insert (owner_id, equipment_type_id) on table public.user_equipment to authenticated;
create policy owner_read on public.user_equipment for select to authenticated
using (((select auth.uid()) = owner_id));
create policy owner_insert on public.user_equipment for insert to authenticated
with check ((select auth.uid()) = owner_id);

grant delete on table public.user_equipment to authenticated;
create policy owner_delete on public.user_equipment for delete to authenticated
using ((select auth.uid()) = owner_id);

-- user_exercise_preferences: column-limited writes; ownership checked independently of submitted values.
grant select on table public.user_exercise_preferences to authenticated;
grant insert (owner_id, exercise_id, is_favorite, preference, notes) on table public.user_exercise_preferences to authenticated;
create policy owner_read on public.user_exercise_preferences for select to authenticated
using (((select auth.uid()) = owner_id));
create policy owner_insert on public.user_exercise_preferences for insert to authenticated
with check ((select auth.uid()) = owner_id);

grant update (is_favorite, preference, notes) on table public.user_exercise_preferences to authenticated;
create policy owner_update on public.user_exercise_preferences for update to authenticated
using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);

grant delete on table public.user_exercise_preferences to authenticated;
create policy owner_delete on public.user_exercise_preferences for delete to authenticated
using ((select auth.uid()) = owner_id);

-- programs: column-limited writes; ownership checked independently of submitted values.
grant select on table public.programs to authenticated;
grant insert (id, owner_id, name, description, is_template, cycle_length, revision, derived_from_program_id, archived_at) on table public.programs to authenticated;
create policy owner_read on public.programs for select to authenticated
using (((select auth.uid()) = owner_id));
create policy owner_insert on public.programs for insert to authenticated
with check ((select auth.uid()) = owner_id);

grant update (name, description, is_template, cycle_length, revision, derived_from_program_id, archived_at) on table public.programs to authenticated;
create policy owner_update on public.programs for update to authenticated
using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);

-- program_days: column-limited writes; ownership checked independently of submitted values.
grant select on table public.program_days to authenticated;
grant insert (id, owner_id, program_id, cycle_length, cycle_position, name, is_rest_day, notes) on table public.program_days to authenticated;
create policy owner_read on public.program_days for select to authenticated
using (((select auth.uid()) = owner_id));
create policy owner_insert on public.program_days for insert to authenticated
with check ((select auth.uid()) = owner_id);

grant update (cycle_position, name, is_rest_day, notes) on table public.program_days to authenticated;
create policy owner_update on public.program_days for update to authenticated
using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);

grant delete on table public.program_days to authenticated;
create policy owner_delete on public.program_days for delete to authenticated
using ((select auth.uid()) = owner_id);

-- program_slots: column-limited writes; ownership checked independently of submitted values.
grant select on table public.program_slots to authenticated;
grant insert (id, owner_id, program_day_id, position, movement_pattern_id, exercise_id, target_sets, target_reps_min, target_reps_max, target_weight_kg, rest_seconds, notes) on table public.program_slots to authenticated;
create policy owner_read on public.program_slots for select to authenticated
using (((select auth.uid()) = owner_id));
create policy owner_insert on public.program_slots for insert to authenticated
with check ((select auth.uid()) = owner_id);

grant update (position, movement_pattern_id, exercise_id, target_sets, target_reps_min, target_reps_max, target_weight_kg, rest_seconds, notes) on table public.program_slots to authenticated;
create policy owner_update on public.program_slots for update to authenticated
using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);

grant delete on table public.program_slots to authenticated;
create policy owner_delete on public.program_slots for delete to authenticated
using ((select auth.uid()) = owner_id);

-- program_assignments: column-limited writes; ownership checked independently of submitted values.
grant select on table public.program_assignments to authenticated;
grant insert (id, owner_id, program_id, cycle_length, state, next_cycle_position, completed_rotations, started_at, ended_at) on table public.program_assignments to authenticated;
create policy owner_read on public.program_assignments for select to authenticated
using (((select auth.uid()) = owner_id));
create policy owner_insert on public.program_assignments for insert to authenticated
with check ((select auth.uid()) = owner_id);

grant update (state, next_cycle_position, completed_rotations, ended_at) on table public.program_assignments to authenticated;
create policy owner_update on public.program_assignments for update to authenticated
using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);

-- workout_sessions: column-limited writes; ownership checked independently of submitted values.
grant select on table public.workout_sessions to authenticated;
grant insert (id, owner_id, source_program_id, source_program_day_id, program_assignment_id, source_cycle_position, source_rotation, program_name_snapshot, day_name_snapshot, name, status, completion_status, started_at, finished_at, notes) on table public.workout_sessions to authenticated;
create policy owner_read on public.workout_sessions for select to authenticated
using (((select auth.uid()) = owner_id));
create policy owner_insert on public.workout_sessions for insert to authenticated
with check ((select auth.uid()) = owner_id);

grant update (name, status, completion_status, started_at, finished_at, notes, program_name_snapshot, day_name_snapshot) on table public.workout_sessions to authenticated;
create policy owner_update on public.workout_sessions for update to authenticated
using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);

-- workout_exercises: column-limited writes; ownership checked independently of submitted values.
grant select on table public.workout_exercises to authenticated;
grant insert (id, owner_id, workout_session_id, position, source_program_slot_id, exercise_id, prescribed_exercise_id, exercise_name_snapshot, exercise_instructions_snapshot, prescribed_exercise_name_snapshot, status, prescribed_sets, prescribed_rest_seconds, notes) on table public.workout_exercises to authenticated;
create policy owner_read on public.workout_exercises for select to authenticated
using (((select auth.uid()) = owner_id));
create policy owner_insert on public.workout_exercises for insert to authenticated
with check ((select auth.uid()) = owner_id);

grant update (position, exercise_id, prescribed_exercise_id, exercise_name_snapshot, exercise_instructions_snapshot, prescribed_exercise_name_snapshot, status, prescribed_sets, prescribed_rest_seconds, notes) on table public.workout_exercises to authenticated;
create policy owner_update on public.workout_exercises for update to authenticated
using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);

-- No client DELETE on performed exercises: the parent FK cascades to recorded sets.

-- workout_sets: column-limited writes; ownership checked independently of submitted values.
grant select on table public.workout_sets to authenticated;
grant insert (id, owner_id, workout_exercise_id, position, set_type, status, prescribed_reps_min, prescribed_reps_max, prescribed_weight_kg, actual_reps, actual_weight_kg, completed_at, notes) on table public.workout_sets to authenticated;
create policy owner_read on public.workout_sets for select to authenticated
using (((select auth.uid()) = owner_id));
create policy owner_insert on public.workout_sets for insert to authenticated
with check ((select auth.uid()) = owner_id);

grant update (position, set_type, status, prescribed_reps_min, prescribed_reps_max, prescribed_weight_kg, actual_reps, actual_weight_kg, completed_at, notes) on table public.workout_sets to authenticated;
create policy owner_update on public.workout_sets for update to authenticated
using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);

grant delete on table public.workout_sets to authenticated;
create policy owner_delete on public.workout_sets for delete to authenticated
using ((select auth.uid()) = owner_id);

-- Classification permissions follow the parent exercise; no cycles in policy dependencies.
grant select, delete on table public.exercise_movement_patterns to authenticated;
grant insert (exercise_id, movement_pattern_id) on table public.exercise_movement_patterns to authenticated;
create policy exercise_read on public.exercise_movement_patterns for select to authenticated using (exists (select 1 from public.exercises e where e.id = exercise_movement_patterns.exercise_id and (e.owner_id is null or e.owner_id = (select auth.uid()))));
create policy custom_insert on public.exercise_movement_patterns for insert to authenticated with check (exists (select 1 from public.exercises e where e.id = exercise_movement_patterns.exercise_id and e.owner_id = (select auth.uid())));
create policy custom_delete on public.exercise_movement_patterns for delete to authenticated using (exists (select 1 from public.exercises e where e.id = exercise_movement_patterns.exercise_id and e.owner_id = (select auth.uid())));

-- Classification permissions follow the parent exercise; no cycles in policy dependencies.
grant select, delete on table public.exercise_muscles to authenticated;
grant insert (exercise_id, muscle_group_id, muscle_role) on table public.exercise_muscles to authenticated;
create policy exercise_read on public.exercise_muscles for select to authenticated using (exists (select 1 from public.exercises e where e.id = exercise_muscles.exercise_id and (e.owner_id is null or e.owner_id = (select auth.uid()))));
create policy custom_insert on public.exercise_muscles for insert to authenticated with check (exists (select 1 from public.exercises e where e.id = exercise_muscles.exercise_id and e.owner_id = (select auth.uid())));
create policy custom_delete on public.exercise_muscles for delete to authenticated using (exists (select 1 from public.exercises e where e.id = exercise_muscles.exercise_id and e.owner_id = (select auth.uid())));

grant update (muscle_role) on table public.exercise_muscles to authenticated;
create policy custom_update on public.exercise_muscles for update to authenticated
using (exists (select 1 from public.exercises e where e.id = exercise_muscles.exercise_id and e.owner_id = (select auth.uid()))) with check (exists (select 1 from public.exercises e where e.id = exercise_muscles.exercise_id and e.owner_id = (select auth.uid())));

-- Classification permissions follow the parent exercise; no cycles in policy dependencies.
grant select, delete on table public.exercise_equipment to authenticated;
grant insert (exercise_id, equipment_type_id) on table public.exercise_equipment to authenticated;
create policy exercise_read on public.exercise_equipment for select to authenticated using (exists (select 1 from public.exercises e where e.id = exercise_equipment.exercise_id and (e.owner_id is null or e.owner_id = (select auth.uid()))));
create policy custom_insert on public.exercise_equipment for insert to authenticated with check (exists (select 1 from public.exercises e where e.id = exercise_equipment.exercise_id and e.owner_id = (select auth.uid())));
create policy custom_delete on public.exercise_equipment for delete to authenticated using (exists (select 1 from public.exercises e where e.id = exercise_equipment.exercise_id and e.owner_id = (select auth.uid())));

-- Intentionally no anon grants, broad table UPDATE/INSERT, DELETE for profiles,
-- account_preferences, exercises, programs, assignments or workout_sessions,
-- TRUNCATE/REFERENCES/TRIGGER/MAINTAIN privileges, or service-role grants.
-- Existing owner, cycle, rest-day and historical constraints remain unchanged.
commit;
