-- Phase 6.2: server-owned continuity metadata. Legacy history is not backfilled.
begin;
alter table public.workout_sessions
 add column last_activity_at timestamptz,
 add column activity_evidence_at timestamptz,
 add column effective_finished_at timestamptz,
 add column closure_reason text check(closure_reason in('finished','abandoned','inactivity')),
 add column duration_kind text not null default 'legacy' check(duration_kind in('legacy','elapsed','estimated','unknown')),
 add column continuation_nonce uuid,
 add column continuation_count integer not null default 0 check(continuation_count>=0),
 add column idle_intervals jsonb not null default '[]'::jsonb check(jsonb_typeof(idle_intervals)='array'),
 add column recognition_enabled boolean not null default false,
 add constraint workout_effective_endpoint check(effective_finished_at is null or (finished_at is not null and effective_finished_at>=started_at and effective_finished_at<=finished_at));
revoke insert(status,completion_status,started_at,finished_at),update(completion_status,started_at,finished_at) on public.workout_sessions from authenticated;
grant update(continuation_nonce) on public.workout_sessions to authenticated;
-- Single policy source. UI consumes server classifications, never client clocks.
create function public.workout_policy() returns jsonb language sql immutable security invoker set search_path='' as $$
 select '{"quiet_minutes":30,"check_in_minutes":60,"expire_hours":12}'::jsonb;
$$;
create function body_private.manage_workout_continuity() returns trigger language plpgsql security invoker set search_path='' as $$
declare instant timestamptz:=clock_timestamp(); idle interval; total integer; done integer; missing boolean; expired boolean;
begin
 if current_user<>'authenticated' then return new; end if;
 if tg_op='INSERT' then
   new.status:='in_progress'; new.completion_status:='none'; new.started_at:=instant;new.finished_at:=null;
   new.last_activity_at:=instant;new.activity_evidence_at:=null;new.effective_finished_at:=null;new.duration_kind:='unknown';new.closure_reason:=null;
   new.continuation_nonce:=null;new.continuation_count:=0;new.idle_intervals:='[]';new.recognition_enabled:=false;return new;
 end if;
 if old.status<>'in_progress' then
   raise exception 'Workout is closed' using errcode='23514';
 end if;
 idle:=case when old.last_activity_at is null then null else instant-old.last_activity_at end;
 expired:=idle>=make_interval(hours=>(public.workout_policy()->>'expire_hours')::int);
 if expired and new.status='in_progress' then raise exception 'Workout expired; reload to review saved work' using errcode='23514'; end if;
 if new.status<>'in_progress' then
   if expired then new.status:='abandoned';new.closure_reason:='inactivity';
   else new.closure_reason:=case when new.status='completed' then 'finished' else 'abandoned' end;end if;
   new.finished_at:=instant;
   if expired or idle>=make_interval(mins=>(public.workout_policy()->>'check_in_minutes')::int) or old.last_activity_at is null and instant-old.started_at>=make_interval(mins=>(public.workout_policy()->>'check_in_minutes')::int) then
     new.effective_finished_at:=case when old.activity_evidence_at is not null then old.last_activity_at else null end;
     new.duration_kind:=case when new.effective_finished_at is null then 'unknown' else 'estimated' end;
   else new.effective_finished_at:=instant;new.duration_kind:='elapsed';end if;
   select count(*)::int,count(*) filter(where s.status='completed')::int into total,done from public.workout_exercises e join public.workout_sets s on s.workout_exercise_id=e.id and s.owner_id=e.owner_id where e.workout_session_id=old.id and e.owner_id=auth.uid() and e.removed_at is null and s.deleted_at is null;
   select not exists(select 1 from public.workout_exercises e where e.workout_session_id=old.id and e.owner_id=auth.uid() and e.removed_at is null)
     or exists(select 1 from public.workout_exercises e where e.workout_session_id=old.id and e.owner_id=auth.uid() and e.removed_at is null and (select count(*) from public.workout_sets s where s.workout_exercise_id=e.id and s.owner_id=auth.uid() and s.deleted_at is null)<greatest(coalesce(e.prescribed_sets,1),1)) into missing;
   new.completion_status:=case when done=0 then 'none' when new.status='completed' and done=total and not missing then 'full' else 'partial' end;
   new.recognition_enabled:=new.status='completed';return new;
 end if;
 if new.continuation_nonce is distinct from old.continuation_nonce then
   if new.continuation_nonce is null then raise exception 'Continuation ID required' using errcode='22023';end if;
   if idle>=make_interval(mins=>(public.workout_policy()->>'check_in_minutes')::int) or old.last_activity_at is null then
     new.idle_intervals:=old.idle_intervals||jsonb_build_array(jsonb_build_object('from',old.last_activity_at,'to',instant,'legacy_unknown',old.last_activity_at is null));
   end if;
   new.continuation_count:=old.continuation_count+1;new.last_activity_at:=instant;
 elsif pg_trigger_depth()>1 or new.name is distinct from old.name or new.notes is distinct from old.notes then
   if idle>=make_interval(mins=>(public.workout_policy()->>'check_in_minutes')::int) then new.idle_intervals:=old.idle_intervals||jsonb_build_array(jsonb_build_object('from',old.last_activity_at,'to',instant,'continued_by_activity',true));end if;
   new.last_activity_at:=instant;new.activity_evidence_at:=instant;
 end if;
 return new;
end $$;
create trigger a_workout_continuity before insert or update on public.workout_sessions for each row execute function body_private.manage_workout_continuity();
create function body_private.touch_workout_activity() returns trigger language plpgsql security invoker set search_path='' as $$
declare parent_id uuid; item_id uuid;
begin
 if current_user<>'authenticated' then return null;end if;
 if tg_table_name='workout_exercises' then
   if tg_op='DELETE' then parent_id:=old.workout_session_id;else parent_id:=new.workout_session_id;end if;
 else
   if tg_op='DELETE' then item_id:=old.workout_exercise_id;else item_id:=new.workout_exercise_id;end if;
   select workout_session_id into parent_id from public.workout_exercises where id=item_id and owner_id=auth.uid();
 end if;
 -- Existing name grant is only a trigger transport. Protected metadata has no
 -- client grant. A direct no-op name update does not count as activity.
 update public.workout_sessions set name=name where id=parent_id and owner_id=auth.uid() and status='in_progress';
 return null;
end $$;
create trigger workout_exercise_activity after insert or update or delete on public.workout_exercises for each row execute function body_private.touch_workout_activity();
create trigger workout_set_activity after insert or update or delete on public.workout_sets for each row execute function body_private.touch_workout_activity();
create function public.workout_continuity(p_session uuid default null,p_resume_nonce uuid default null) returns jsonb language plpgsql security invoker set search_path='' as $$
declare entry public.workout_sessions; instant timestamptz:=clock_timestamp(); state text; completed bigint; total bigint; policy jsonb:=public.workout_policy();
begin
 if auth.uid() is null then raise exception 'Sign in required' using errcode='42501';end if;
 if p_session is null then
   select * into entry from public.workout_sessions where owner_id=auth.uid() and status='in_progress' for update;
 else select * into entry from public.workout_sessions where owner_id=auth.uid() and id=p_session for update;end if;
 if entry.id is null then
   if p_session is not null then return null;end if;
   select * into entry from public.workout_sessions where owner_id=auth.uid() and closure_reason='inactivity' and not exists(select 1 from public.workout_sessions later where later.owner_id=auth.uid() and later.started_at>workout_sessions.started_at) order by finished_at desc,id desc limit 1;
   if entry.id is null then return null;end if;
 end if;
 instant:=clock_timestamp();
 if entry.status='in_progress' and entry.last_activity_at is not null and instant-entry.last_activity_at>=make_interval(hours=>(policy->>'expire_hours')::int) then
   update public.workout_sessions set status='abandoned' where id=entry.id and owner_id=auth.uid() returning * into entry;
 elsif p_resume_nonce is not null and entry.closure_reason is distinct from 'inactivity' then
   if entry.status<>'in_progress' then raise exception 'Workout is closed' using errcode='23514';end if;
   if entry.continuation_nonce is distinct from p_resume_nonce then update public.workout_sessions set continuation_nonce=p_resume_nonce where id=entry.id and owner_id=auth.uid() returning * into entry;end if;
 end if;
 state:=case when entry.status<>'in_progress' then case when entry.closure_reason='inactivity' then 'expired' else 'closed' end
 when entry.last_activity_at is null then case when instant-entry.started_at>=make_interval(mins=>(policy->>'check_in_minutes')::int) then 'check_in' else 'active' end
 when instant-entry.last_activity_at>=make_interval(mins=>(policy->>'check_in_minutes')::int) then 'check_in'
 when instant-entry.last_activity_at>=make_interval(mins=>(policy->>'quiet_minutes')::int) then 'quiet' else 'active' end;
 select count(*),count(*) filter(where s.status='completed') into total,completed from public.workout_exercises e join public.workout_sets s on s.workout_exercise_id=e.id and s.owner_id=e.owner_id where e.workout_session_id=entry.id and e.owner_id=auth.uid() and e.removed_at is null and s.deleted_at is null;
 return jsonb_build_object('id',entry.id,'status',entry.status,'state',state,'server_now',instant,'started_at',entry.started_at,'last_activity_at',entry.last_activity_at,'activity_evidence_at',entry.activity_evidence_at,'finished_at',entry.finished_at,'effective_finished_at',entry.effective_finished_at,'duration_kind',entry.duration_kind,'closure_reason',entry.closure_reason,'idle_intervals',entry.idle_intervals,'completed',completed,'total',total,'continuation_count',entry.continuation_count);
end $$;
-- Rejected expired RPCs return a committed empty result rather than raising an
-- exception that would roll back expiration. Direct DML is rejected by guards;
-- the next authenticated continuity request performs authoritative lazy cleanup.
create or replace function public.end_workout(p_session uuid,p_outcome text) returns uuid language plpgsql security invoker set search_path='' as $$
declare entry jsonb; saved_status text;
begin
 if p_outcome is null or p_outcome not in('completed','abandoned') then raise exception 'Invalid outcome' using errcode='22023';end if;
 entry:=public.workout_continuity(p_session);
 if entry is null then raise exception 'Workout unavailable' using errcode='42501';end if;
 if entry->>'state'='expired' then return null;end if;
 if entry->>'status'=p_outcome then return p_session;end if;
 if entry->>'status'<>'in_progress' then raise exception 'Workout is already finished' using errcode='23514';end if;
 update public.workout_sessions set status=p_outcome where id=p_session and owner_id=auth.uid() returning status into saved_status;
 if saved_status<>p_outcome then return null;end if;return p_session;
end $$;
create or replace function public.edit_workout(p_session uuid,p_operation text,p_exercise uuid default null,p_item uuid default null,p_direction integer default null) returns uuid language plpgsql security invoker set search_path='' as $$
declare uid uuid:=auth.uid(); parent_status text; item public.workout_exercises; neighbor public.workout_exercises; source public.exercises; result_id uuid; next_position bigint;
begin
 if uid is null then raise exception 'Sign in required' using errcode='42501'; end if;
 if p_operation is null or p_operation not in ('add','remove','move') then raise exception 'Invalid operation' using errcode='22023'; end if;
 select status into parent_status from public.workout_sessions where id=p_session and owner_id=uid for update;
 if parent_status is null then raise exception 'Workout unavailable' using errcode='42501'; end if;
 if (public.workout_continuity(p_session)->>'state')='expired' then return null;end if;
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

create or replace function public.start_ad_hoc_workout() returns uuid language plpgsql security invoker set search_path='' as $$
declare uid uuid:=auth.uid(); result_id uuid;
begin
 if uid is null then raise exception 'Sign in required' using errcode='42501'; end if;
 perform public.workout_continuity();
 for attempt in 1..3 loop
   insert into public.workout_sessions(owner_id,name) values(uid,'Workout')
     on conflict(owner_id) where status='in_progress' do nothing returning id into result_id;
   if result_id is not null then return result_id; end if;
   select id into result_id from public.workout_sessions where owner_id=uid and status='in_progress';
   if result_id is not null then return result_id; end if;
 end loop;
 raise exception 'Workout changed concurrently. Retry.' using errcode='40001';
end $$;

create or replace function public.log_workout_set(p_item uuid,p_id uuid,p_operation text,p_revision integer,p_mutation uuid,p_reps integer default null,p_weight numeric default null,p_type text default 'working',p_mode text default 'external',p_completed boolean default false,p_direction integer default null,p_entered_weight numeric default null,p_entered_unit text default null)
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
create or replace function body_private.guard_set_logging() returns trigger language plpgsql security invoker set search_path='' as $$
declare item_id uuid; session_id uuid; parent_status text; removal timestamptz; allowed_bodyweight boolean;
begin
 if tg_op='DELETE' then item_id:=old.workout_exercise_id; else item_id:=new.workout_exercise_id; end if;
 if current_user='authenticated' then
   select workout_session_id into session_id from public.workout_exercises where id=item_id and owner_id=auth.uid();
   if session_id is null then raise exception 'Selection unavailable' using errcode='23503'; end if;
   select status into parent_status from public.workout_sessions where id=session_id and owner_id=auth.uid() for update nowait;
   select removed_at into removal from public.workout_exercises where id=item_id and owner_id=auth.uid();
   if exists(select 1 from public.workout_sessions w where w.id=session_id and w.owner_id=auth.uid() and w.last_activity_at is not null and clock_timestamp()-w.last_activity_at>=make_interval(hours=>(public.workout_policy()->>'expire_hours')::int)) then raise exception 'Workout expired' using errcode='23514';end if;
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
 -- Existing invoker grants support logging, but submitted completion times are
 -- never authoritative. Completed corrections retain the original event time.
 if current_user='authenticated' then
   if new.status='completed' then
     if tg_op='UPDATE' and old.status='completed' then new.completed_at:=coalesce(old.completed_at,clock_timestamp());
     else new.completed_at:=clock_timestamp();end if;
   else new.completed_at:=null;end if;
 end if;
 if new.entered_weight is not null and round(new.entered_weight*case when new.entered_unit='lb' then 0.45359237 else 1 end,3) is distinct from (case when new.inputs_confirmed then new.actual_weight_kg else new.prescribed_weight_kg end) then
   raise exception 'Entered load must match canonical load' using errcode='22023';
 end if;
 return new;
end $$;
create or replace function body_private.guard_workout_selection_state() returns trigger language plpgsql security invoker set search_path='' as $$
declare parent_status text;
begin
 select status into parent_status from public.workout_sessions where id=new.workout_session_id and owner_id=new.owner_id for update nowait;
 if current_user='authenticated' and exists(select 1 from public.workout_sessions w where w.id=new.workout_session_id and w.owner_id=auth.uid() and w.last_activity_at is not null and clock_timestamp()-w.last_activity_at>=make_interval(hours=>(public.workout_policy()->>'expire_hours')::int)) then raise exception 'Workout expired' using errcode='23514';end if;
 if parent_status is null then raise exception 'Workout unavailable' using errcode='23503'; end if;
 if current_user='authenticated' and parent_status<>'in_progress' then raise exception 'Finished workout selections are protected' using errcode='23514'; end if;
 return new;
end $$;
create or replace function body_private.guard_workout_set_insert() returns trigger language plpgsql security invoker set search_path='' as $$
declare removal timestamptz; parent_id uuid;
begin
 select workout_session_id into parent_id from public.workout_exercises where id=new.workout_exercise_id and owner_id=new.owner_id;
 perform 1 from public.workout_sessions where id=parent_id and owner_id=new.owner_id for update nowait;
 select removed_at into removal from public.workout_exercises where id=new.workout_exercise_id and owner_id=new.owner_id;
 if removal is not null then raise exception 'Removed selections cannot receive sets' using errcode='23514'; end if;
 return new;
end $$;
create or replace function body_private.guard_workout_removal() returns trigger language plpgsql security invoker set search_path='' as $$
declare parent_status text;
begin
 if new.removed_at is distinct from old.removed_at then
   select status into parent_status from public.workout_sessions where id=new.workout_session_id and owner_id=new.owner_id for update nowait;
   if parent_status is distinct from 'in_progress' or old.removed_at is not null or new.removed_at is null or old.status<>'pending'
     or exists(select 1 from public.workout_sets where workout_exercise_id=new.id and (not is_automatic or inputs_confirmed or actual_reps is not null or actual_weight_kg is not null or status<>'pending')) then
     raise exception 'Only unlogged active selections can be removed' using errcode='23514';
   end if;
 end if;
 return new;
end $$;
revoke all on function public.workout_policy(),public.workout_continuity(uuid,uuid) from public,anon,service_role;
grant execute on function public.workout_policy(),public.workout_continuity(uuid,uuid) to authenticated;
revoke all on all functions in schema body_private from public,anon,authenticated,service_role;
drop function public.workout_history(text,timestamptz,uuid,integer);
create function public.workout_history(p_filter text default 'all',p_before timestamptz default null,p_before_id uuid default null,p_limit integer default 21)
returns table(id uuid,name text,status text,completion_status text,started_at timestamptz,finished_at timestamptz,exercise_count bigint,working_sets bigint,warm_up_sets bigint,incomplete_sets bigint,effective_finished_at timestamptz,duration_kind text,closure_reason text,idle_intervals jsonb,recognition_enabled boolean)
language plpgsql stable security invoker set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'Sign in required' using errcode='42501'; end if;
 if p_filter is null or p_filter not in('all','completed','incomplete','abandoned') or p_limit is null or p_limit<1 or p_limit>51 or (p_before is null)<>(p_before_id is null) then raise exception 'Invalid history page' using errcode='22023'; end if;
 return query with page as materialized (
 select w.* from public.workout_sessions w where w.owner_id=auth.uid()
 and (p_before is null or (w.started_at,w.id)<(p_before,p_before_id))
 and (p_filter='all' or p_filter='completed' and w.status='completed' or p_filter='abandoned' and w.status='abandoned' or p_filter='incomplete' and (w.status='in_progress' or w.status='completed' and w.completion_status<>'full'))
 order by w.started_at desc,w.id desc limit p_limit
 ) select w.id,w.name,w.status,w.completion_status,w.started_at,w.finished_at,
 (select count(*) from public.workout_exercises e where e.workout_session_id=w.id and e.owner_id=auth.uid() and e.removed_at is null),
 count(s.id) filter(where s.status='completed' and s.set_type<>'warm_up' and coalesce(nullif(e.logging_kind,'legacy'),public.exercise_logging_kind(e.exercise_id)) not in('assisted','duration')),
 count(s.id) filter(where s.status='completed' and s.set_type='warm_up' and coalesce(nullif(e.logging_kind,'legacy'),public.exercise_logging_kind(e.exercise_id)) not in('assisted','duration')),
 count(s.id) filter(where s.status<>'completed'),w.effective_finished_at,w.duration_kind,w.closure_reason,w.idle_intervals,w.recognition_enabled
 from page w left join public.workout_exercises e on e.workout_session_id=w.id and e.owner_id=auth.uid() and e.removed_at is null
 left join public.workout_sets s on s.workout_exercise_id=e.id and s.owner_id=auth.uid() and s.deleted_at is null
 group by w.id,w.name,w.status,w.completion_status,w.started_at,w.finished_at,w.effective_finished_at,w.duration_kind,w.closure_reason,w.idle_intervals,w.recognition_enabled order by w.started_at desc,w.id desc;
end $$;
revoke all on function public.workout_history(text,timestamptz,uuid,integer) from public,anon,service_role;
grant execute on function public.workout_history(text,timestamptz,uuid,integer) to authenticated;
commit;
