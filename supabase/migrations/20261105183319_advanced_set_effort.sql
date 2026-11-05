-- Phase 7.1: independently reported effort, never inferred from targets or reps.
begin;
create function public.valid_effort(scale text,value numeric) returns boolean language sql immutable security invoker set search_path='' as $$
 select coalesce((scale is null and value is null) or (scale='rpe' and value between 6 and 10 and value*2=trunc(value*2)) or (scale='rir' and value between 0 and 5 and value=trunc(value)),false);
$$;
alter table public.account_preferences add column preferred_effort_scale text not null default 'rpe' check(preferred_effort_scale in('rpe','rir'));
grant update(preferred_effort_scale) on public.account_preferences to authenticated;
alter table public.workout_sets add column effort_scale text,add column effort_value numeric,add column performed_to_failure boolean not null default false,
 add constraint workout_set_effort_valid check(public.valid_effort(effort_scale,effort_value)),
 add constraint workout_set_failure_type check(not performed_to_failure or set_type<>'warm_up'),
 add constraint workout_set_effort_confirmed check(inputs_confirmed or (effort_scale is null and not performed_to_failure));
grant insert(effort_scale,effort_value,performed_to_failure),update(effort_scale,effort_value,performed_to_failure) on public.workout_sets to authenticated;
create function body_private.confirm_reported_effort() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if tg_op='UPDATE' and (new.effort_scale is distinct from old.effort_scale or new.effort_value is distinct from old.effort_value or new.performed_to_failure is distinct from old.performed_to_failure) then new.inputs_confirmed:=true;end if;
 return new;
end $$;
create trigger z_confirm_reported_effort before insert or update on public.workout_sets for each row execute function body_private.confirm_reported_effort();
-- Keep old named calls compatible: omitted p_effort preserves existing actuals.
drop function public.log_workout_set(uuid,uuid,text,integer,uuid,integer,numeric,text,text,boolean,integer,numeric,text);
create or replace function public.log_workout_set(p_item uuid,p_id uuid,p_operation text,p_revision integer,p_mutation uuid,p_reps integer default null,p_weight numeric default null,p_type text default 'working',p_mode text default 'external',p_completed boolean default false,p_direction integer default null,p_entered_weight numeric default null,p_entered_unit text default null,p_effort jsonb default null)
returns setof public.workout_sets language plpgsql security invoker set search_path='' as $$
declare uid uuid:=auth.uid(); parent_status text; session_id uuid; removal timestamptz; entry public.workout_sets; neighbor public.workout_sets; next_pos bigint;
begin
 if uid is null then raise exception 'Sign in required' using errcode='42501'; end if;
 if p_id is null or p_mutation is null or p_operation is null or p_operation not in('add','save','remove','move') then raise exception 'Invalid operation' using errcode='22023'; end if;
 select workout_session_id into session_id from public.workout_exercises where id=p_item and owner_id=uid;
 select status into parent_status from public.workout_sessions where id=session_id and owner_id=uid for update;
 if parent_status is null then raise exception 'Selection unavailable' using errcode='42501'; end if;
 select removed_at into removal from public.workout_exercises where id=p_item and owner_id=uid;
 if (public.workout_continuity(session_id)->>'state')='expired' then return;end if;
 if parent_status<>'in_progress' or removal is not null then raise exception 'Selection is closed or removed' using errcode='23514'; end if;
 select * into entry from public.workout_sets where id=p_id and owner_id=uid;
 if entry.id is not null and entry.workout_exercise_id<>p_item then raise exception 'Set unavailable' using errcode='42501'; end if;
 if entry.id is not null and (entry.last_mutation_id=p_mutation or p_operation='add') then
   return query select * from public.workout_sets where workout_exercise_id=p_item and owner_id=uid order by position; return;
 end if;
 if p_operation<>'add' and (entry.id is null or entry.deleted_at is not null) then raise exception 'Set unavailable' using errcode='42501'; end if;
 if p_operation<>'add' and (p_revision is null or entry.revision<>p_revision) then raise exception 'Set changed on another device' using errcode='40001'; end if;
 if p_effort is not null and (jsonb_typeof(p_effort)<>'object' or not(p_effort ?& array['scale','value','failure']) or p_effort-array['scale','value','failure']<>'{}'::jsonb or jsonb_typeof(p_effort->'scale') not in('string','null') or jsonb_typeof(p_effort->'value') not in('number','null') or jsonb_typeof(p_effort->'failure')<>'boolean') then raise exception 'Invalid effort payload' using errcode='22023';end if;
 if p_effort is not null and (not public.valid_effort(p_effort->>'scale',(p_effort->>'value')::numeric) or p_type='warm_up' and (p_effort->>'failure')::boolean) then raise exception 'Invalid reported effort' using errcode='22023';end if;
 if p_operation in('add','save') then
   if p_type is null or p_type not in('working','warm_up','drop','rest_pause') or p_mode is null or p_mode not in('external','bodyweight') or p_completed is null
     or p_reps<0 or p_reps>1000 or p_weight<0 or p_weight>100000 or p_weight='NaN'::numeric
     or (p_mode='bodyweight' and p_weight is not null) then raise exception 'Invalid performance values' using errcode='22023'; end if;
   if p_operation='add' then
     if (select count(*) from public.workout_sets where workout_exercise_id=p_item and owner_id=uid and deleted_at is null)>=100 then raise exception 'Set limit reached' using errcode='22023'; end if;
     select coalesce(max(position),0)::bigint+1 into next_pos from public.workout_sets where workout_exercise_id=p_item and owner_id=uid;
     if next_pos>2147483647 then raise exception 'Position limit reached' using errcode='22023'; end if;
     insert into public.workout_sets(id,owner_id,workout_exercise_id,position,set_type,load_mode,actual_reps,actual_weight_kg,last_mutation_id,entered_weight,entered_unit,effort_scale,effort_value,performed_to_failure)
       values(p_id,uid,p_item,next_pos::integer,p_type,p_mode,p_reps,p_weight,p_mutation,p_entered_weight,p_entered_unit,p_effort->>'scale',(p_effort->>'value')::numeric,coalesce((p_effort->>'failure')::boolean,false));
   else
     if p_completed and (p_reps is null or (p_mode='external' and p_weight is null)) then raise exception 'Enter actual reps and external load before completing' using errcode='22023'; end if;
     update public.workout_sets set effort_scale=case when p_effort is null then entry.effort_scale else p_effort->>'scale' end,effort_value=case when p_effort is null then entry.effort_value else (p_effort->>'value')::numeric end,performed_to_failure=case when p_effort is null then entry.performed_to_failure else (p_effort->>'failure')::boolean end,actual_reps=p_reps,actual_weight_kg=p_weight,entered_weight=p_entered_weight,entered_unit=p_entered_unit,set_type=p_type,load_mode=p_mode,status=case when p_completed then 'completed' else 'pending' end,
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

revoke all on function public.valid_effort(text,numeric),public.log_workout_set(uuid,uuid,text,integer,uuid,integer,numeric,text,text,boolean,integer,numeric,text,jsonb) from public,anon,service_role;
grant execute on function public.valid_effort(text,numeric),public.log_workout_set(uuid,uuid,text,integer,uuid,integer,numeric,text,text,boolean,integer,numeric,text,jsonb) to authenticated;
revoke all on function body_private.confirm_reported_effort() from public,anon,authenticated,service_role;
commit;
