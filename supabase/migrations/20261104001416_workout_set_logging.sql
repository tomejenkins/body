-- Phase 5.2: additive logging metadata and invoker-only mutations.
-- Earlier migrations are immutable; all operations use existing RLS/grants.
begin;
alter table public.workout_sets add column revision integer not null default 0 check(revision>=0);
alter table public.workout_sets add column last_mutation_id uuid;
alter table public.workout_sets add column deleted_at timestamptz;
alter table public.workout_sets add column load_mode text not null default 'external' check(load_mode in('external','bodyweight'));
grant insert(load_mode,last_mutation_id),update(load_mode,last_mutation_id,deleted_at) on public.workout_sets to authenticated;
alter table public.workout_sets drop constraint workout_sets_workout_exercise_id_position_key;
alter table public.workout_sets add constraint workout_sets_workout_exercise_id_position_key unique(workout_exercise_id,position) deferrable initially immediate;
-- Replace only the former completed-performance check, retaining skipped invariants.
do $$ declare c record; begin
 for c in select conname from pg_constraint where conrelid='public.workout_sets'::regclass and contype='c'
 and pg_get_constraintdef(oid) like '%completed%' and conkey @> array[(select attnum from pg_attribute where attrelid='public.workout_sets'::regclass and attname='status'),(select attnum from pg_attribute where attrelid='public.workout_sets'::regclass and attname='actual_reps'),(select attnum from pg_attribute where attrelid='public.workout_sets'::regclass and attname='actual_weight_kg')]::smallint[]
 loop execute format('alter table public.workout_sets drop constraint %I',c.conname); end loop;
end $$;
alter table public.workout_sets add constraint workout_sets_actual_completion check(status<>'completed' or (actual_reps is not null and ((load_mode='external' and actual_weight_kg is not null) or (load_mode='bodyweight' and actual_weight_kg is null))));
alter table public.workout_sets add constraint workout_sets_bodyweight_null check(load_mode<>'bodyweight' or actual_weight_kg is null);
-- Guard ordinary direct DML as well as RPC calls; privileged historical repair
-- remains a separately approved administrator operation.
create function body_private.guard_set_logging() returns trigger language plpgsql security invoker set search_path='' as $$
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
 if tg_op='UPDATE' then new.revision:=old.revision+1; end if;
 return new;
end $$;
create trigger set_logging_guard before insert or update or delete on public.workout_sets for each row execute function body_private.guard_set_logging();
revoke all on all functions in schema body_private from public,anon,authenticated,service_role;

-- Lock the session first, then compare the server revision. Stable IDs and the
-- last acknowledged nonce make immediate response-loss retries idempotent.
create function public.log_workout_set(p_item uuid,p_id uuid,p_operation text,p_revision integer,p_mutation uuid,p_reps integer default null,p_weight numeric default null,p_type text default 'working',p_mode text default 'external',p_completed boolean default false,p_direction integer default null)
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
     insert into public.workout_sets(id,owner_id,workout_exercise_id,position,set_type,load_mode,actual_reps,actual_weight_kg,last_mutation_id)
       values(p_id,uid,p_item,next_pos::integer,p_type,p_mode,p_reps,p_weight,p_mutation);
   else
     if p_completed and (p_reps is null or (p_mode='external' and p_weight is null)) then raise exception 'Enter actual reps and external load before completing' using errcode='22023'; end if;
     update public.workout_sets set actual_reps=p_reps,actual_weight_kg=p_weight,set_type=p_type,load_mode=p_mode,status=case when p_completed then 'completed' else 'pending' end,
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
revoke all on function public.log_workout_set(uuid,uuid,text,integer,uuid,integer,numeric,text,text,boolean,integer) from public,anon,service_role;
grant execute on function public.log_workout_set(uuid,uuid,text,integer,uuid,integer,numeric,text,text,boolean,integer) to authenticated;

-- Closing preserves actual/pending rows and derives completeness without
-- inventing sets or satisfying missing prescribed counts.
create or replace function public.end_workout(p_session uuid,p_outcome text) returns uuid language plpgsql security invoker set search_path='' as $$
declare uid uuid:=auth.uid(); parent_status text; total integer; done integer; missing boolean;
begin
 if uid is null then raise exception 'Sign in required' using errcode='42501'; end if;
 if p_outcome is null or p_outcome not in('completed','abandoned') then raise exception 'Invalid outcome' using errcode='22023'; end if;
 select status into parent_status from public.workout_sessions where id=p_session and owner_id=uid for update;
 if parent_status is null then raise exception 'Workout unavailable' using errcode='42501'; end if;
 if parent_status=p_outcome then return p_session; end if;
 if parent_status<>'in_progress' then raise exception 'Workout is already finished' using errcode='23514'; end if;
 select count(*)::integer,count(*) filter(where s.status='completed')::integer into total,done from public.workout_sets s join public.workout_exercises e on e.id=s.workout_exercise_id and e.owner_id=s.owner_id where e.workout_session_id=p_session and e.owner_id=uid and e.removed_at is null and s.deleted_at is null;
 select not exists(select 1 from public.workout_exercises where workout_session_id=p_session and owner_id=uid and removed_at is null)
   or exists(select 1 from public.workout_exercises e where e.workout_session_id=p_session and e.owner_id=uid and e.removed_at is null and (not exists(select 1 from public.workout_sets s where s.workout_exercise_id=e.id and s.deleted_at is null) or (e.prescribed_sets is not null and e.prescribed_sets>(select count(*) from public.workout_sets s where s.workout_exercise_id=e.id and s.deleted_at is null)))) into missing;
 update public.workout_sessions set status=p_outcome,finished_at=clock_timestamp(),completion_status=case when done=0 then 'none' when p_outcome='completed' and done=total and not missing then 'full' else 'partial' end where id=p_session and owner_id=uid;
 return p_session;
end $$;
commit;
