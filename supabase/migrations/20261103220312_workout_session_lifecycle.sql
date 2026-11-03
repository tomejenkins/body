-- Phase 5.1: additive lifecycle and non-destructive selection management.
begin;
-- Fail safely rather than silently abandoning existing user work.
do $$ begin
  if exists(select 1 from public.workout_sessions where status='in_progress' group by owner_id having count(*)>1) then
    raise exception 'Multiple active workouts exist: review and resolve with explicit target approval before applying this migration';
  end if;
end $$;
create unique index workout_sessions_one_active_per_owner on public.workout_sessions(owner_id) where status='in_progress';
alter table public.workout_exercises add column removed_at timestamptz;
grant update(removed_at) on public.workout_exercises to authenticated;
-- Soft removal retains all IDs/snapshots and never introduces cascading DELETE rights.
alter table public.workout_exercises drop constraint workout_exercises_workout_session_id_position_key;
alter table public.workout_exercises add constraint workout_exercises_workout_session_id_position_key unique(workout_session_id,position) deferrable initially immediate;
-- A finished session does not imply any sets were performed. Preserve the existing
-- partial/full semantics while permitting honest completion_status='none'.
do $$ declare c record; begin
 for c in select conname from pg_constraint where conrelid='public.workout_sessions'::regclass and contype='c'
   and conkey @> array[(select attnum from pg_attribute where attrelid='public.workout_sessions'::regclass and attname='status'),(select attnum from pg_attribute where attrelid='public.workout_sessions'::regclass and attname='completion_status')]::smallint[]
 loop execute format('alter table public.workout_sessions drop constraint %I',c.conname); end loop;
end $$;
alter table public.workout_sessions add constraint workout_sessions_completion_consistency check
 ((status='completed' and completion_status in ('none','partial','full')) or (status<>'completed' and completion_status in ('none','partial')));

create function body_private.guard_workout_terminal() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if old.status<>'in_progress' and new.status<>old.status then
   raise exception 'Finished workouts cannot be reopened or reclassified' using errcode='23514';
 end if;
 return new;
end $$;
create trigger workout_terminal_guard before update of status on public.workout_sessions for each row execute function body_private.guard_workout_terminal();

create function body_private.guard_workout_removal() returns trigger language plpgsql security invoker set search_path='' as $$
declare parent_status text;
begin
 if new.removed_at is distinct from old.removed_at then
   select status into parent_status from public.workout_sessions where id=new.workout_session_id and owner_id=new.owner_id for update;
   if parent_status is distinct from 'in_progress' or old.removed_at is not null or new.removed_at is null or old.status<>'pending'
     or exists(select 1 from public.workout_sets where workout_exercise_id=new.id) then
     raise exception 'Only unlogged active selections can be removed' using errcode='23514';
   end if;
 end if;
 return new;
end $$;
create trigger workout_removal_guard before update of removed_at on public.workout_exercises for each row execute function body_private.guard_workout_removal();
-- Serialize future set inserts with selection removal and finishing. Set editing
-- itself remains outside this phase; historical correction grants are preserved.
create function body_private.guard_workout_set_insert() returns trigger language plpgsql security invoker set search_path='' as $$
declare removal timestamptz; parent_id uuid;
begin
 select workout_session_id into parent_id from public.workout_exercises where id=new.workout_exercise_id and owner_id=new.owner_id;
 perform 1 from public.workout_sessions where id=parent_id and owner_id=new.owner_id for update;
 select removed_at into removal from public.workout_exercises where id=new.workout_exercise_id and owner_id=new.owner_id;
 if removal is not null then raise exception 'Removed selections cannot receive sets' using errcode='23514'; end if;
 return new;
end $$;
create trigger workout_set_selection_guard before insert on public.workout_sets for each row execute function body_private.guard_workout_set_insert();
-- Serialize direct authenticated selection writes with closing a session too.
-- Privileged historical fixture/import operations remain possible; client RLS
-- and grants still enforce ownership, with no SECURITY DEFINER bypass.
create function body_private.guard_workout_selection_state() returns trigger language plpgsql security invoker set search_path='' as $$
declare parent_status text;
begin
 select status into parent_status from public.workout_sessions where id=new.workout_session_id and owner_id=new.owner_id for update;
 if parent_status is null then raise exception 'Workout unavailable' using errcode='23503'; end if;
 if current_user='authenticated' and parent_status<>'in_progress' then raise exception 'Finished workout selections are protected' using errcode='23514'; end if;
 return new;
end $$;
create trigger workout_selection_state_guard before insert or update of position,exercise_id on public.workout_exercises for each row execute function body_private.guard_workout_selection_state();
revoke all on all functions in schema body_private from public,anon,authenticated,service_role;

create function public.start_ad_hoc_workout() returns uuid language plpgsql security invoker set search_path='' as $$
declare uid uuid:=auth.uid(); result_id uuid;
begin
 if uid is null then raise exception 'Sign in required' using errcode='42501'; end if;
 for attempt in 1..3 loop
   insert into public.workout_sessions(owner_id,name) values(uid,'Ad-hoc workout')
     on conflict(owner_id) where status='in_progress' do nothing returning id into result_id;
   if result_id is not null then return result_id; end if;
   select id into result_id from public.workout_sessions where owner_id=uid and status='in_progress';
   if result_id is not null then return result_id; end if;
 end loop;
 raise exception 'Workout changed concurrently. Retry.' using errcode='40001';
end $$;

create function public.edit_workout(p_session uuid,p_operation text,p_exercise uuid default null,p_item uuid default null,p_direction integer default null) returns uuid language plpgsql security invoker set search_path='' as $$
declare uid uuid:=auth.uid(); parent_status text; item public.workout_exercises; neighbor public.workout_exercises; source public.exercises; result_id uuid; next_position bigint;
begin
 if uid is null then raise exception 'Sign in required' using errcode='42501'; end if;
 if p_operation is null or p_operation not in ('add','remove','move') then raise exception 'Invalid operation' using errcode='22023'; end if;
 select status into parent_status from public.workout_sessions where id=p_session and owner_id=uid for update;
 if parent_status is null then raise exception 'Workout unavailable' using errcode='42501'; end if;
 if parent_status<>'in_progress' then raise exception 'Workout is already finished' using errcode='23514'; end if;
 if p_operation='add' then
   select id into result_id from public.workout_exercises where workout_session_id=p_session and owner_id=uid and exercise_id=p_exercise and removed_at is null;
   if result_id is not null then return result_id; end if;
   select * into source from public.exercises where id=p_exercise and archived_at is null;
   if source.id is null then raise exception 'Exercise unavailable' using errcode='42501'; end if;
   if (select count(*) from public.workout_exercises where workout_session_id=p_session and owner_id=uid and removed_at is null)>=100 then raise exception 'Workout selection limit reached' using errcode='22023'; end if;
   select coalesce(max(position),0)::bigint+1 into next_position from public.workout_exercises where workout_session_id=p_session and owner_id=uid;
   if next_position>2147483647 then raise exception 'Position limit reached' using errcode='22023'; end if;
   insert into public.workout_exercises(owner_id,workout_session_id,position,exercise_id,exercise_name_snapshot,exercise_instructions_snapshot)
     values(uid,p_session,next_position::integer,source.id,source.name,source.instructions) returning id into result_id;
   return result_id;
 end if;
 select * into item from public.workout_exercises where id=p_item and workout_session_id=p_session and owner_id=uid;
 if item.id is null then raise exception 'Selection unavailable' using errcode='42501'; end if;
 if p_operation='remove' then
   if item.removed_at is null then update public.workout_exercises set removed_at=clock_timestamp() where id=item.id and owner_id=uid; end if;
   return item.id;
 end if;
 if p_direction is null or p_direction not in (-1,1) or item.removed_at is not null then raise exception 'Invalid move' using errcode='22023'; end if;
 select * into neighbor from public.workout_exercises where workout_session_id=p_session and owner_id=uid and removed_at is null
   and case when p_direction=-1 then position<item.position else position>item.position end
   order by abs(position::bigint-item.position::bigint),id limit 1;
 if neighbor.id is not null then
   set constraints public.workout_exercises_workout_session_id_position_key deferred;
   update public.workout_exercises set position=case when id=item.id then neighbor.position else item.position end where id in(item.id,neighbor.id) and owner_id=uid;
   set constraints public.workout_exercises_workout_session_id_position_key immediate;
 end if;
 return item.id;
end $$;

create function public.end_workout(p_session uuid,p_outcome text) returns uuid language plpgsql security invoker set search_path='' as $$
declare uid uuid:=auth.uid(); parent_status text; has_work boolean;
begin
 if uid is null then raise exception 'Sign in required' using errcode='42501'; end if;
 if p_outcome is null or p_outcome not in ('completed','abandoned') then raise exception 'Invalid outcome' using errcode='22023'; end if;
 select status into parent_status from public.workout_sessions where id=p_session and owner_id=uid for update;
 if parent_status is null then raise exception 'Workout unavailable' using errcode='42501'; end if;
 if parent_status=p_outcome then return p_session; end if;
 if parent_status<>'in_progress' then raise exception 'Workout is already finished' using errcode='23514'; end if;
 select exists(select 1 from public.workout_sets s join public.workout_exercises e on e.id=s.workout_exercise_id and e.owner_id=s.owner_id where e.workout_session_id=p_session and e.owner_id=uid and e.removed_at is null and s.status='completed') into has_work;
 update public.workout_sessions set status=p_outcome,finished_at=clock_timestamp(),completion_status=case when has_work then 'partial' else 'none' end where id=p_session and owner_id=uid;
 return p_session;
end $$;
revoke all on function public.start_ad_hoc_workout(),public.edit_workout(uuid,text,uuid,uuid,integer),public.end_workout(uuid,text) from public,anon,service_role;
grant execute on function public.start_ad_hoc_workout(),public.edit_workout(uuid,text,uuid,uuid,integer),public.end_workout(uuid,text) to authenticated;
commit;
