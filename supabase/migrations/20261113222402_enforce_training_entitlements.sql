begin;
-- Only guards use this function. Session locks precede grant locks; future grant
-- writers must lock grant rows without acquiring session locks in reverse order.
create function body_private.require_training_access(p_session uuid default null) returns uuid
language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); instant timestamptz;g body_private.access_grants;w public.workout_sessions;locked_grants uuid[];
begin
 if uid is null then raise exception 'Sign in required' using errcode='42501';end if;
 -- Compatible old clients also activate their one initial verified trial on first write.
 if not exists(select 1 from body_private.account_trials where owner_id=uid) then perform public.activate_account_trial();end if;
 if p_session is not null then
  select * into w from public.workout_sessions where id=p_session and owner_id=uid for update nowait;
  if w.id is null or w.status<>'in_progress' or w.archived_at is not null then raise exception 'Active owned workout required' using errcode='42501';end if;
 end if;
 -- Lock all owner grants before sampling time: a concurrent revocation cannot pass
 -- unnoticed, and a long lock wait cannot reuse a transaction-start timestamp.
 -- Only those locked IDs may authorize: a concurrently inserted grant is considered
 -- on the next request, never selected unlocked from a later READ COMMITTED snapshot.
 select array_agg(locked.id) into locked_grants from (select id from body_private.access_grants where owner_id=uid order by id for share) locked;
 instant:=clock_timestamp();
 if w.id is not null and w.last_activity_at is not null and instant>=w.last_activity_at+interval '12 hours' then raise exception 'Workout lifecycle expired' using errcode='42501';end if;
 select * into g from body_private.access_grants where owner_id=uid and id=any(locked_grants) and revoked_at is null and body_private.grant_valid_at(valid_from,expires_at,revoked_at,instant)
 order by expires_at desc nulls first,valid_from,id limit 1;
 if g.id is not null then return g.id;end if;
 if w.id is not null and w.last_activity_at is not null and instant<w.access_continuation_until and exists(select 1 from body_private.access_grants x where x.id=w.access_grant_id and x.id=any(locked_grants) and x.owner_id=uid and x.revoked_at is null and x.valid_from<=w.access_authorized_at and w.access_authorized_at<x.expires_at) then return w.access_grant_id;end if;
 raise exception 'Training access required; your saved history is still available' using errcode='P7701';
end $$;
revoke all on function body_private.require_training_access(uuid) from public,anon,authenticated,service_role;

create function body_private.entitlement_session_guard() returns trigger language plpgsql security definer set search_path='' as $$
declare grant_id uuid;g body_private.access_grants;
begin
 if current_setting('role',true)<>'authenticated' then return new;end if;
 if new.owner_id is distinct from auth.uid() then raise exception 'Owned workout required' using errcode='42501';end if;
 if tg_op='INSERT' then
  grant_id:=body_private.require_training_access();
  select * into g from body_private.access_grants where id=grant_id;
  new.access_grant_id:=g.id;new.access_authorized_at:=clock_timestamp();
  -- Recheck at snapshot creation, not a browser-supplied started_at.
  if g.expires_at is not null and new.access_authorized_at>=g.expires_at then raise exception 'Training access required' using errcode='P7701';end if;
  new.access_continuation_until:=g.expires_at+interval '4 hours';
 else
  if row(new.access_grant_id,new.access_authorized_at,new.access_continuation_until) is distinct from row(old.access_grant_id,old.access_authorized_at,old.access_continuation_until) then raise exception 'Server-owned access snapshot' using errcode='42501';end if;
  -- Retention and explicit abandonment never depend on payment. Normal completion,
  -- pause/resume, name/notes edits and child activity require same-session authority.
  if old.status='in_progress' and new.status<>'abandoned' and new.retention_command is not distinct from old.retention_command then
   perform body_private.require_training_access(old.id);
  end if;
 end if;
 return new;
end $$;
create trigger zz_entitlement_session before insert or update on public.workout_sessions for each row execute function body_private.entitlement_session_guard();

create function body_private.entitlement_training_guard() returns trigger language plpgsql security definer set search_path='' as $$
declare sid uuid;payload jsonb:=to_jsonb(new);old_payload jsonb;
begin
 if current_setting('role',true)<>'authenticated' then return new;end if;
 if payload ? 'owner_id' and (payload->>'owner_id')::uuid is distinct from auth.uid() then raise exception 'Owned training required' using errcode='42501';end if;
 if tg_table_name='workout_exercises' and tg_op='UPDATE' then
  if new.source_program_slot_id is null and old.source_program_slot_id is not null and (to_jsonb(new)-array['source_program_slot_id','updated_at'])=(to_jsonb(old)-array['source_program_slot_id','updated_at']) then return new;end if;
 end if;
 if tg_table_name='workout_sets' then
  select workout_session_id into sid from public.workout_exercises where id=new.workout_exercise_id and owner_id=auth.uid();
 elsif payload ? 'workout_session_id' then sid:=(payload->>'workout_session_id')::uuid;
 elsif tg_table_name='program_lifecycle_receipts' then
  if new.kind in('end_now','end_after_next') then return new;end if;
 elsif tg_table_name='program_assignments' and tg_op='UPDATE' then
  old_payload:=to_jsonb(old);
  -- Lifecycle receipts have their own guarded input. Closure hooks only derive
  -- enrollment cleanup from the existing qualified completion authority.
  if new.schedule_command is not distinct from old.schedule_command then return new;end if;
 end if;
 perform body_private.require_training_access(sid);
 return new;
end $$;
-- BEFORE guards run before any training row can be accepted, including direct DML.
create trigger zzzz_entitlement before insert or update on public.workout_exercises for each row execute function body_private.entitlement_training_guard();
create trigger zzzz_entitlement before insert or update on public.workout_movements for each row execute function body_private.entitlement_training_guard();
create trigger zzzz_entitlement before insert or update on public.workout_sets for each row execute function body_private.entitlement_training_guard();
create trigger zzzz_entitlement before insert on public.workout_cardio_commands for each row execute function body_private.entitlement_training_guard();
create trigger zzzz_entitlement before insert on public.workout_group_commands for each row execute function body_private.entitlement_training_guard();
create trigger zzzz_entitlement before insert on public.program_lifecycle_receipts for each row execute function body_private.entitlement_training_guard();
create trigger zzzz_entitlement before insert or update on public.program_assignments for each row execute function body_private.entitlement_training_guard();
create trigger zzzz_entitlement before insert on public.program_schedule_decisions for each row execute function body_private.entitlement_training_guard();
create trigger zzzz_entitlement before insert on public.favorite_workouts for each row execute function body_private.entitlement_training_guard();
create trigger zzzz_entitlement before insert on public.exercises for each row execute function body_private.entitlement_training_guard();
create trigger zzzz_entitlement before insert on public.programs for each row execute function body_private.entitlement_training_guard();
-- Draft/template expansion is also training; owner archival/deletion stays governed
-- by the retained policies. Immutable published versions cannot be edited by clients.
create trigger zzzz_entitlement before insert or update on public.program_days for each row execute function body_private.entitlement_training_guard();
create trigger zzzz_entitlement before insert or update on public.program_slots for each row execute function body_private.entitlement_training_guard();
create trigger zzzz_entitlement before insert or update on public.program_day_groups for each row execute function body_private.entitlement_training_guard();
create trigger zzzz_entitlement before insert or update on public.program_set_prescriptions for each row execute function body_private.entitlement_training_guard();
create trigger zzzz_entitlement before insert or update on public.program_progression_rules for each row execute function body_private.entitlement_training_guard();
create trigger zzzz_entitlement before insert on public.program_versions for each row execute function body_private.entitlement_training_guard();
create trigger zzzz_entitlement before insert on public.program_slot_alternatives for each row execute function body_private.entitlement_training_guard();
create trigger zzzz_entitlement before insert on public.program_slot_equipment for each row execute function body_private.entitlement_training_guard();
create trigger zzzz_entitlement before insert on public.program_equipment for each row execute function body_private.entitlement_training_guard();
revoke all on function body_private.entitlement_session_guard(),body_private.entitlement_training_guard() from public,anon,authenticated,service_role;
-- Payload-bound set receipts preserve committed recovery after entitlement deadlines.
-- Receipts authorize no new training; their recovery branch returns owner reads only.
create table public.workout_set_receipts (
 owner_id uuid not null default auth.uid(),mutation_id uuid not null,
 workout_session_id uuid not null,workout_exercise_id uuid not null,set_id uuid not null references public.workout_sets(id) on delete cascade,
 payload jsonb not null check(jsonb_typeof(payload)='object' and pg_column_size(payload)<=8192),
 resulting_revision integer not null,created_at timestamptz not null default clock_timestamp(),
 primary key(owner_id,mutation_id),
 foreign key(workout_session_id,owner_id) references public.workout_sessions(id,owner_id) on delete cascade,
 foreign key(workout_exercise_id,owner_id) references public.workout_exercises(id,owner_id) on delete cascade
);
create index set_receipt_session on public.workout_set_receipts(workout_session_id,owner_id);
create index set_receipt_selection on public.workout_set_receipts(workout_exercise_id,owner_id);
create index set_receipt_set on public.workout_set_receipts(set_id);
alter table public.workout_set_receipts enable row level security;
revoke all on public.workout_set_receipts from public,anon,authenticated,service_role;
grant select on public.workout_set_receipts to authenticated;
grant insert(mutation_id,workout_session_id,workout_exercise_id,set_id,payload) on public.workout_set_receipts to authenticated;
create policy owner_read on public.workout_set_receipts for select to authenticated using(owner_id=(select auth.uid()));
create policy owner_insert on public.workout_set_receipts for insert to authenticated with check(owner_id=(select auth.uid()));
create function body_private.set_receipt_input() returns trigger language plpgsql security invoker set search_path='' as $$
declare s public.workout_sets;p jsonb:=new.payload;op text:=p->>'operation';expected integer:=(p->>'revision')::integer;
begin
 if current_user<>'authenticated' then return new;end if;
 if new.owner_id is distinct from auth.uid() then raise exception 'Owned receipt required' using errcode='42501';end if;
 perform 1 from public.workout_sessions where id=new.workout_session_id and owner_id=auth.uid() for update nowait;
 select * into s from public.workout_sets where id=new.set_id and owner_id=auth.uid();
 if s.id is null or s.workout_exercise_id<>new.workout_exercise_id or s.last_mutation_id is distinct from new.mutation_id
 or not exists(select 1 from public.workout_exercises where id=new.workout_exercise_id and owner_id=auth.uid() and workout_session_id=new.workout_session_id)
 then raise exception 'Committed owned set required' using errcode='42501';end if;
 if (select count(*) from jsonb_object_keys(p))<>14 or not(p ?& array['item','id','operation','revision','mutation','reps','weight','type','mode','completed','direction','enteredWeight','enteredUnit','effort'])
 or (p->>'item')::uuid is distinct from new.workout_exercise_id or (p->>'id')::uuid is distinct from new.set_id or (p->>'mutation')::uuid is distinct from new.mutation_id
 or op is null or op not in('add','save','remove','move') then raise exception 'Invalid set receipt' using errcode='23514';end if;
 if op='add' and s.revision<>0 or op<>'add' and (expected is null or s.revision<>expected+1) then raise exception 'Set receipt revision mismatch' using errcode='23514';end if;
 if op in('add','save') and (s.actual_reps is distinct from (p->>'reps')::integer or s.actual_weight_kg is distinct from round((p->>'weight')::numeric,3)
 or s.set_type is distinct from p->>'type' or s.load_mode is distinct from p->>'mode' or s.entered_weight is distinct from (p->>'enteredWeight')::numeric or s.entered_unit is distinct from p->>'enteredUnit'
 or op='save' and (s.status='completed') is distinct from (p->>'completed')::boolean
 or p->'effort'<>'null'::jsonb and (s.effort_scale is distinct from p->'effort'->>'scale' or s.effort_value is distinct from (p->'effort'->>'value')::numeric or s.performed_to_failure is distinct from (p->'effort'->>'failure')::boolean))
 then raise exception 'Set receipt payload mismatch' using errcode='23514';end if;
 if op<>'remove' and s.deleted_at is not null then raise exception 'Set receipt cannot restore deleted data' using errcode='23514';end if;
 if op='remove' and s.deleted_at is null or op='move' and coalesce((p->>'direction')::integer,0) not in(-1,1) then raise exception 'Set receipt operation mismatch' using errcode='23514';end if;
 new.resulting_revision:=s.revision;new.created_at:=clock_timestamp();return new;
end $$;
create trigger set_receipt_input before insert on public.workout_set_receipts for each row execute function body_private.set_receipt_input();
create trigger zzzz_entitlement before insert on public.workout_set_receipts for each row execute function body_private.entitlement_training_guard();
revoke all on function body_private.set_receipt_input() from public,anon,authenticated,service_role;

create or replace function public.log_workout_set(p_item uuid,p_id uuid,p_operation text,p_revision integer,p_mutation uuid,p_reps integer default null,p_weight numeric default null,p_type text default 'working',p_mode text default 'external',p_completed boolean default false,p_direction integer default null,p_entered_weight numeric default null,p_entered_unit text default null,p_effort jsonb default null)
returns setof public.workout_sets language plpgsql security invoker set search_path='' as $$
declare uid uuid:=auth.uid(); parent_status text; session_id uuid; removal timestamptz; entry public.workout_sets; neighbor public.workout_sets; next_pos bigint; receipt public.workout_set_receipts; command jsonb;
begin
 if uid is null then raise exception 'Sign in required' using errcode='42501'; end if;
 if p_id is null or p_mutation is null or p_operation is null or p_operation not in('add','save','remove','move') then raise exception 'Invalid operation' using errcode='22023'; end if;
 select workout_session_id into session_id from public.workout_exercises where id=p_item and owner_id=uid;
 select status into parent_status from public.workout_sessions where id=session_id and owner_id=uid for update;
 if parent_status is null then raise exception 'Selection unavailable' using errcode='42501'; end if;
 select removed_at into removal from public.workout_exercises where id=p_item and owner_id=uid;
 command:=jsonb_build_object('item',p_item,'id',p_id,'operation',p_operation,'revision',p_revision,'mutation',p_mutation,'reps',p_reps,'weight',p_weight,'type',p_type,'mode',p_mode,'completed',p_completed,'direction',p_direction,'enteredWeight',p_entered_weight,'enteredUnit',p_entered_unit,'effort',p_effort);
 select * into receipt from public.workout_set_receipts where owner_id=uid and mutation_id=p_mutation;
 if receipt.mutation_id is not null then
  if receipt.payload is distinct from command or receipt.workout_exercise_id<>p_item or receipt.set_id<>p_id then raise exception 'Set request reused with different payload' using errcode='23514';end if;
  return query select * from public.workout_sets where workout_exercise_id=p_item and owner_id=uid order by position;return;
 end if;
 if (public.workout_continuity(session_id)->>'state')='expired' then return;end if;
 if parent_status<>'in_progress' or removal is not null then raise exception 'Selection is closed or removed' using errcode='23514'; end if;
 select * into entry from public.workout_sets where id=p_id and owner_id=uid;
 if entry.id is not null and entry.workout_exercise_id<>p_item then raise exception 'Set unavailable' using errcode='42501'; end if;
 if entry.id is not null and (entry.last_mutation_id=p_mutation or p_operation='add') then
   raise exception 'Set receipt unavailable; refresh saved state before retrying' using errcode='40001';
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
 insert into public.workout_set_receipts(mutation_id,workout_session_id,workout_exercise_id,set_id,payload) values(p_mutation,session_id,p_item,p_id,command);
 return query select * from public.workout_sets where workout_exercise_id=p_item and owner_id=uid order by position;
end $$;
commit;
