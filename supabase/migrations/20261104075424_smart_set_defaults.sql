-- Phase 5.3: suggestions are not actual performance. No historical backfill.
begin;
alter table public.account_preferences alter column display_weight_unit set default 'lb';
alter table public.workout_sets
 add column is_automatic boolean not null default false,
 add column inputs_confirmed boolean not null default true,
 add column suggested_from_date timestamptz,
 add column entered_weight numeric(13,6),
 add column entered_unit text check(entered_unit in('kg','lb')),
 add constraint workout_sets_unconfirmed_actuals check(inputs_confirmed or (is_automatic and status='pending' and actual_reps is null and actual_weight_kg is null and completed_at is null)),
 add constraint workout_sets_entry_pair check((entered_weight is null)=(entered_unit is null)),
 add constraint workout_sets_entry_range check(entered_weight>=0 and entered_weight<>'NaN'::numeric and entered_weight<1000000);
grant insert(is_automatic,inputs_confirmed,suggested_from_date,entered_weight,entered_unit), update(entered_weight,entered_unit) on public.workout_sets to authenticated;

-- Reusable owner-only historical lookup: one prior meaningful completed selection.
create function public.previous_exercise_sets(p_exercise uuid)
returns table(source_id uuid,set_type text,reps integer,weight_kg numeric,load_mode text,performed_at timestamptz,entered_weight numeric,entered_unit text)
language sql stable security invoker set search_path='' as $$
 with source as (
   select e.id,w.finished_at from public.workout_exercises e
   join public.workout_sessions w on w.id=e.workout_session_id and w.owner_id=e.owner_id
   where e.owner_id=auth.uid() and e.exercise_id=p_exercise and e.removed_at is null and w.status='completed'
     and exists(select 1 from public.workout_sets s where s.workout_exercise_id=e.id and s.owner_id=auth.uid() and s.status='completed' and s.deleted_at is null)
   order by w.finished_at desc,w.id,e.position,e.id limit 1
 )
 select s.id,s.set_type,s.actual_reps,s.actual_weight_kg,s.load_mode,source.finished_at,s.entered_weight,s.entered_unit
 from source join public.workout_sets s on s.workout_exercise_id=source.id
 where s.owner_id=auth.uid() and s.status='completed' and s.deleted_at is null order by s.position,s.id limit 100;
$$;
create function public.initialize_workout_sets(p_item uuid,p_default_count integer default 3)
returns setof public.workout_sets language plpgsql security invoker set search_path='' as $$
declare uid uuid:=auth.uid(); parent_id uuid; state text; removal timestamptz; exercise uuid; bw boolean; prior record; n integer:=0;
begin
 if uid is null then raise exception 'Sign in required' using errcode='42501'; end if;
 if p_default_count is null or p_default_count<1 or p_default_count>100 then raise exception 'Invalid initial set count' using errcode='22023'; end if;
 select workout_session_id,exercise_id into parent_id,exercise from public.workout_exercises where id=p_item and owner_id=uid;
 select status into state from public.workout_sessions where id=parent_id and owner_id=uid for update;
 if state is null then raise exception 'Selection unavailable' using errcode='42501'; end if;
 select removed_at into removal from public.workout_exercises where id=p_item and owner_id=uid;
 if state<>'in_progress' or removal is not null then raise exception 'Selection closed or removed' using errcode='23514'; end if;
 -- Including tombstones: deleting every visible row must never recreate defaults.
 if exists(select 1 from public.workout_sets where workout_exercise_id=p_item and owner_id=uid) then
   return query select * from public.workout_sets where workout_exercise_id=p_item and owner_id=uid order by position; return;
 end if;
 select exists(select 1 from public.exercise_equipment q where q.exercise_id=exercise)
   and not exists(select 1 from public.exercise_equipment q join public.equipment_types t on t.id=q.equipment_type_id where q.exercise_id=exercise and t.slug not in('none','pull_up_bar','neutral_grip_handles','parallel_bars','step','suspension_trainer')) into bw;
 for prior in select * from public.previous_exercise_sets(exercise) loop
   n:=n+1;
   insert into public.workout_sets(owner_id,workout_exercise_id,position,set_type,load_mode,prescribed_reps_min,prescribed_reps_max,prescribed_weight_kg,is_automatic,inputs_confirmed,suggested_from_date,entered_weight,entered_unit)
   values(uid,p_item,n,prior.set_type,case when prior.load_mode='bodyweight' and not bw then 'external' else prior.load_mode end,prior.reps,prior.reps,prior.weight_kg,true,false,prior.performed_at,prior.entered_weight,prior.entered_unit);
 end loop;
 if n=0 then
   insert into public.workout_sets(owner_id,workout_exercise_id,position,load_mode,is_automatic,inputs_confirmed)
   select uid,p_item,i,case when bw then 'bodyweight' else 'external' end,true,false from generate_series(1,p_default_count) i;
 end if;
 return query select * from public.workout_sets where workout_exercise_id=p_item and owner_id=uid order by position;
end $$;
-- Trigger participates in the same add-selection transaction; lookup failures roll
-- back selection and sets together, leaving a recoverable retry in the selector.
create function body_private.initialize_selection_sets() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if current_user='authenticated' then perform public.initialize_workout_sets(new.id,coalesce(new.prescribed_sets,3)); end if;
 return new;
end $$;
create trigger initialize_selection_sets after insert on public.workout_exercises for each row execute function body_private.initialize_selection_sets();
create or replace function body_private.guard_set_logging() returns trigger language plpgsql security invoker set search_path='' as $$
declare item_id uuid; session_id uuid; parent_status text; removal timestamptz; allowed_bodyweight boolean;
begin
 if tg_op='DELETE' then item_id:=old.workout_exercise_id; else item_id:=new.workout_exercise_id; end if;
 if current_user='authenticated' then
   select workout_session_id into session_id from public.workout_exercises where id=item_id and owner_id=auth.uid();
   if session_id is null then raise exception 'Selection unavailable' using errcode='23503'; end if;
   select status into parent_status from public.workout_sessions where id=session_id and owner_id=auth.uid() for update;
   select removed_at into removal from public.workout_exercises where id=item_id and owner_id=auth.uid();
   if parent_status is distinct from 'in_progress' or removal is not null then raise exception 'Set editing requires an active, visible workout selection' using errcode='23514'; end if;
   if tg_op<>'INSERT' and old.deleted_at is not null then raise exception 'Deleted sets are immutable' using errcode='23514'; end if;
   if tg_op<>'DELETE' and new.load_mode='bodyweight' then
     select exists(select 1 from public.exercise_equipment q where q.exercise_id=e.exercise_id)
       and not exists(select 1 from public.exercise_equipment q join public.equipment_types t on t.id=q.equipment_type_id where q.exercise_id=e.exercise_id and t.slug not in('none','pull_up_bar','neutral_grip_handles','parallel_bars','step','suspension_trainer'))
       into allowed_bodyweight from public.workout_exercises e where e.id=item_id and e.owner_id=auth.uid();
     if allowed_bodyweight is distinct from true then raise exception 'This exercise requires external load recording' using errcode='22023'; end if;
   end if;
 end if;
 if tg_op='DELETE' then return old; end if;
 if tg_op='UPDATE' then
   new.revision:=old.revision+1;
   if new.actual_reps is distinct from old.actual_reps or new.actual_weight_kg is distinct from old.actual_weight_kg or new.status is distinct from old.status
     or new.set_type is distinct from old.set_type or new.load_mode is distinct from old.load_mode then new.inputs_confirmed:=true; end if;
   -- Direct legacy writes cannot retain stale entered-unit metadata.
   if new.actual_weight_kg is distinct from old.actual_weight_kg and new.entered_weight is not distinct from old.entered_weight and new.entered_unit is not distinct from old.entered_unit and round(new.entered_weight*case when new.entered_unit='lb' then 0.45359237 else 1 end,3) is distinct from new.actual_weight_kg then
     new.entered_weight:=null; new.entered_unit:=null;
   end if;
 end if;
 if new.entered_weight is not null and round(new.entered_weight*case when new.entered_unit='lb' then 0.45359237 else 1 end,3) is distinct from (case when new.inputs_confirmed then new.actual_weight_kg else new.prescribed_weight_kg end) then
   raise exception 'Entered load must match canonical load' using errcode='22023';
 end if;
 return new;
end $$;
create or replace function body_private.guard_workout_removal() returns trigger language plpgsql security invoker set search_path='' as $$
declare parent_status text;
begin
 if new.removed_at is distinct from old.removed_at then
   select status into parent_status from public.workout_sessions where id=new.workout_session_id and owner_id=new.owner_id for update;
   if parent_status is distinct from 'in_progress' or old.removed_at is not null or new.removed_at is null or old.status<>'pending'
     or exists(select 1 from public.workout_sets where workout_exercise_id=new.id and (not is_automatic or inputs_confirmed or actual_reps is not null or actual_weight_kg is not null or status<>'pending')) then
     raise exception 'Only unlogged active selections can be removed' using errcode='23514';
   end if;
 end if;
 return new;
end $$;
drop function public.log_workout_set(uuid,uuid,text,integer,uuid,integer,numeric,text,text,boolean,integer);
create function public.log_workout_set(p_item uuid,p_id uuid,p_operation text,p_revision integer,p_mutation uuid,p_reps integer default null,p_weight numeric default null,p_type text default 'working',p_mode text default 'external',p_completed boolean default false,p_direction integer default null,p_entered_weight numeric default null,p_entered_unit text default null)
returns setof public.workout_sets language plpgsql security invoker set search_path='' as $$
declare uid uuid:=auth.uid(); parent_status text; session_id uuid; removal timestamptz; entry public.workout_sets; neighbor public.workout_sets; next_pos bigint;
begin
 if uid is null then raise exception 'Sign in required' using errcode='42501'; end if;
 if p_id is null or p_mutation is null or p_operation is null or p_operation not in('add','save','remove','move') then raise exception 'Invalid operation' using errcode='22023'; end if;
 select workout_session_id into session_id from public.workout_exercises where id=p_item and owner_id=uid;
 select status into parent_status from public.workout_sessions where id=session_id and owner_id=uid for update;
 if parent_status is null then raise exception 'Selection unavailable' using errcode='42501'; end if;
 select removed_at into removal from public.workout_exercises where id=p_item and owner_id=uid;
 if parent_status<>'in_progress' or removal is not null then raise exception 'Selection is closed or removed' using errcode='23514'; end if;
 select * into entry from public.workout_sets where id=p_id and owner_id=uid;
 if entry.id is not null and entry.workout_exercise_id<>p_item then raise exception 'Set unavailable' using errcode='42501'; end if;
 if entry.id is not null and (entry.last_mutation_id=p_mutation or p_operation='add') then
   return query select * from public.workout_sets where workout_exercise_id=p_item and owner_id=uid order by position; return;
 end if;
 if p_operation<>'add' and (entry.id is null or entry.deleted_at is not null) then raise exception 'Set unavailable' using errcode='42501'; end if;
 if p_operation<>'add' and (p_revision is null or entry.revision<>p_revision) then raise exception 'Set changed on another device' using errcode='40001'; end if;
 if p_operation in('add','save') then
   if p_type is null or p_type not in('working','warm_up','drop','rest_pause') or p_mode is null or p_mode not in('external','bodyweight') or p_completed is null
     or p_reps<0 or p_reps>1000 or p_weight<0 or p_weight>100000 or p_weight='NaN'::numeric
     or (p_mode='bodyweight' and p_weight is not null) then raise exception 'Invalid performance values' using errcode='22023'; end if;
   if p_operation='add' then
     if (select count(*) from public.workout_sets where workout_exercise_id=p_item and owner_id=uid and deleted_at is null)>=100 then raise exception 'Set limit reached' using errcode='22023'; end if;
     select coalesce(max(position),0)::bigint+1 into next_pos from public.workout_sets where workout_exercise_id=p_item and owner_id=uid;
     if next_pos>2147483647 then raise exception 'Position limit reached' using errcode='22023'; end if;
     insert into public.workout_sets(id,owner_id,workout_exercise_id,position,set_type,load_mode,actual_reps,actual_weight_kg,last_mutation_id,entered_weight,entered_unit)
       values(p_id,uid,p_item,next_pos::integer,p_type,p_mode,p_reps,p_weight,p_mutation,p_entered_weight,p_entered_unit);
   else
     if p_completed and (p_reps is null or (p_mode='external' and p_weight is null)) then raise exception 'Enter actual reps and external load before completing' using errcode='22023'; end if;
     update public.workout_sets set actual_reps=p_reps,actual_weight_kg=p_weight,entered_weight=p_entered_weight,entered_unit=p_entered_unit,set_type=p_type,load_mode=p_mode,status=case when p_completed then 'completed' else 'pending' end,
       completed_at=case when p_completed then coalesce(entry.completed_at,clock_timestamp()) else null end,last_mutation_id=p_mutation where id=p_id and owner_id=uid;
   end if;
 elsif p_operation='remove' then
   update public.workout_sets set deleted_at=clock_timestamp(),last_mutation_id=p_mutation where id=p_id and owner_id=uid;
 else
   if p_direction is null or p_direction not in(-1,1) then raise exception 'Invalid direction' using errcode='22023'; end if;
   select * into neighbor from public.workout_sets where workout_exercise_id=p_item and owner_id=uid and deleted_at is null and case when p_direction=-1 then position<entry.position else position>entry.position end order by abs(position::bigint-entry.position::bigint),id limit 1;
   if neighbor.id is not null then
     set constraints public.workout_sets_workout_exercise_id_position_key deferred;
     update public.workout_sets set position=case when id=p_id then neighbor.position else entry.position end,last_mutation_id=case when id=p_id then p_mutation else last_mutation_id end where owner_id=uid and id in(p_id,neighbor.id);
     set constraints public.workout_sets_workout_exercise_id_position_key immediate;
   else update public.workout_sets set last_mutation_id=p_mutation where id=p_id and owner_id=uid; end if;
 end if;
 update public.workout_exercises e set status=case
   when not exists(select 1 from public.workout_sets s where s.workout_exercise_id=e.id and s.deleted_at is null and s.status='completed') then 'pending'
   when exists(select 1 from public.workout_sets s where s.workout_exercise_id=e.id and s.deleted_at is null and s.status<>'completed') then 'partial' else 'completed' end
 where e.id=p_item and e.owner_id=uid;
 return query select * from public.workout_sets where workout_exercise_id=p_item and owner_id=uid order by position;
end $$;
revoke all on function public.log_workout_set(uuid,uuid,text,integer,uuid,integer,numeric,text,text,boolean,integer,numeric,text),public.previous_exercise_sets(uuid),public.initialize_workout_sets(uuid,integer) from public,anon,service_role;
grant execute on function public.log_workout_set(uuid,uuid,text,integer,uuid,integer,numeric,text,text,boolean,integer,numeric,text),public.previous_exercise_sets(uuid),public.initialize_workout_sets(uuid,integer) to authenticated;
revoke all on all functions in schema body_private from public,anon,authenticated,service_role;
commit;
