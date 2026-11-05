-- Phase 7.3: movement intent is separate from exercise-bound actuals.
begin;
alter table public.workout_sessions add column program_start_nonce uuid,add constraint program_start_retry unique(owner_id,program_start_nonce);
grant insert(source_program_version_id,program_start_nonce) on public.workout_sessions to authenticated;
create table public.workout_movements(
 id uuid primary key default gen_random_uuid(),owner_id uuid not null,workout_session_id uuid not null,
 position integer not null check(position between 1 and 100),slot_identity uuid not null,slot_snapshot jsonb not null check(jsonb_typeof(slot_snapshot)='object'),
 foreign key(workout_session_id,owner_id) references public.workout_sessions(id,owner_id) on delete cascade,
 unique(workout_session_id,position),unique(id,workout_session_id,owner_id),created_at timestamptz not null default now());
alter table public.workout_movements enable row level security;
revoke all on public.workout_movements from public,anon,authenticated,service_role;
grant select on public.workout_movements to authenticated;
grant insert(owner_id,workout_session_id,position) on public.workout_movements to authenticated;
create policy owner_read on public.workout_movements for select to authenticated using(owner_id=(select auth.uid()));
create policy owner_insert on public.workout_movements for insert to authenticated with check(owner_id=(select auth.uid()));
create index workout_movement_history on public.workout_movements(owner_id,slot_identity,workout_session_id);
alter table public.workout_exercises add column program_movement_id uuid,add column selection_nonce uuid,add column program_remaining_sets jsonb not null default '[]'::jsonb check(jsonb_typeof(program_remaining_sets)='array'),
 add constraint workout_movement_parent foreign key(program_movement_id,workout_session_id,owner_id) references public.workout_movements(id,workout_session_id,owner_id),
 add constraint workout_selection_retry unique(owner_id,selection_nonce);
grant insert(program_movement_id,selection_nonce) on public.workout_exercises to authenticated;
alter table public.workout_sets add column program_set_number integer check(program_set_number between 1 and 100);
create index workout_movement_selections on public.workout_exercises(program_movement_id,owner_id,position desc) where removed_at is null;
create function body_private.program_session_snapshot() returns trigger language plpgsql security invoker set search_path='' as $$
declare v public.program_versions;day jsonb;
begin
 if new.source_program_version_id is null then
  if new.program_start_nonce is not null then raise exception 'Program version required' using errcode='23514';end if;return new;
 end if;
 select * into v from public.program_versions where id=new.source_program_version_id and owner_id=auth.uid();
 if v.id is null or v.program_id is null then raise exception 'Owned program version required' using errcode='42501';end if;
 select value into day from jsonb_array_elements(v.definition->'days') where (value->>'id')::uuid=new.source_program_day_id;
 if day is null or (day->>'is_rest_day')::boolean or jsonb_array_length(day->'slots') not between 1 and 100 then raise exception 'Choose a training workout' using errcode='22023';end if;
 new.owner_id:=auth.uid();new.source_program_id:=v.program_id;new.program_version_snapshot:=v.version;
 new.source_cycle_position:=(day->>'cycle_position')::smallint;new.program_name_snapshot:=v.definition->'program'->>'name';new.day_name_snapshot:=day->>'name';
 new.name:=left(new.program_name_snapshot||' · '||new.day_name_snapshot,200);return new;
end $$;
create trigger b_program_session_snapshot before insert on public.workout_sessions for each row execute function body_private.program_session_snapshot();
create function body_private.program_movement_snapshot() returns trigger language plpgsql security invoker set search_path='' as $$
declare w public.workout_sessions;v public.program_versions;day jsonb;slot jsonb;
begin
 select * into w from public.workout_sessions where id=new.workout_session_id and owner_id=auth.uid() for update nowait;
 if w.id is null then raise exception 'Workout unavailable' using errcode='42501';end if;
 if w.status<>'in_progress' or w.last_activity_at is not null and clock_timestamp()-w.last_activity_at>=make_interval(hours=>(public.workout_policy()->>'expire_hours')::int) then raise exception 'Workout closed or expired' using errcode='23514';end if;
 select * into v from public.program_versions where id=w.source_program_version_id and owner_id=auth.uid();
 select value into day from jsonb_array_elements(v.definition->'days') where (value->>'id')::uuid=w.source_program_day_id;
 if new.position is null or new.position not between 1 and 100 then raise exception 'Invalid movement order' using errcode='22023';end if;
 select value into slot from jsonb_array_elements(day->'slots') order by (value->>'position')::int offset new.position-1 limit 1;
 if slot is null then raise exception 'Program movement unavailable' using errcode='23514';end if;
 new.owner_id:=auth.uid();new.slot_identity:=(slot->>'id')::uuid;new.slot_snapshot:=slot;return new;
end $$;
create trigger a_program_movement_snapshot before insert on public.workout_movements for each row execute function body_private.program_movement_snapshot();
create function body_private.initialize_program_movements() returns trigger language plpgsql security invoker set search_path='' as $$
declare v public.program_versions;day jsonb;
begin
 if new.source_program_version_id is null or current_user<>'authenticated' then return null;end if;
 select * into v from public.program_versions where id=new.source_program_version_id and owner_id=auth.uid();
 select value into day from jsonb_array_elements(v.definition->'days') where (value->>'id')::uuid=new.source_program_day_id;
 insert into public.workout_movements(owner_id,workout_session_id,position) select auth.uid(),new.id,(row_number() over(order by (value->>'position')::int))::integer from jsonb_array_elements(day->'slots') order by (value->>'position')::int;
 return null;
end $$;
create trigger initialize_program_movements after insert on public.workout_sessions for each row execute function body_private.initialize_program_movements();
create function public.start_program_workout(p_version uuid,p_workout integer,p_request uuid) returns uuid language plpgsql security invoker set search_path='' as $$
declare source public.program_versions;own_version public.program_versions;copy_id uuid;day jsonb;result_id uuid;active_id uuid;was_expired boolean;
begin
 if auth.uid() is null then raise exception 'Sign in required' using errcode='42501';end if;
 if p_request is null or p_workout is null or p_workout not between 1 and 366 then raise exception 'Invalid workout start' using errcode='22023';end if;
 perform 1 from public.profiles where id=auth.uid() for update;
 select id into result_id from public.workout_sessions where owner_id=auth.uid() and program_start_nonce=p_request;
 if result_id is not null then
  if not exists(select 1 from public.workout_sessions w join public.programs p on p.id=w.source_program_id and p.owner_id=w.owner_id where w.id=result_id and w.owner_id=auth.uid() and w.source_cycle_position=p_workout and (p.source_version_id=p_version or w.source_program_version_id=p_version)) then raise exception 'Start request reused for a different workout' using errcode='23514';end if;return result_id;end if;
 was_expired:=coalesce(public.workout_continuity()->>'state','')='expired';
 select id into active_id from public.workout_sessions where owner_id=auth.uid() and status='in_progress';
 if active_id is not null then raise exception 'Finish or resume your active workout first' using errcode='23514';end if;
 begin
 select * into source from public.program_versions where id=p_version;
 if source.id is null then raise exception 'Program unavailable' using errcode='42501';end if;
 if source.owner_id=auth.uid() then own_version:=source;
 else
  copy_id:=public.clone_program(source.id,source.definition->'program'->>'name',md5(auth.uid()::text||source.id::text||':execution')::uuid);
  perform 1 from public.programs where id=copy_id and owner_id=auth.uid() for update;
  select * into own_version from public.program_versions where program_id=copy_id and owner_id=auth.uid() order by version desc limit 1;
  if own_version.id is null then own_version.id:=public.snapshot_program(copy_id);select * into own_version from public.program_versions where id=own_version.id and owner_id=auth.uid();end if;
 end if;
 select value into day from jsonb_array_elements(own_version.definition->'days') where (value->>'cycle_position')::int=p_workout;
 if day is null or (day->>'is_rest_day')::boolean then raise exception 'Choose a training workout' using errcode='22023';end if;
 insert into public.workout_sessions(owner_id,name,source_program_id,source_program_day_id,source_program_version_id,program_start_nonce)
 values(auth.uid(),'Workout',own_version.program_id,(day->>'id')::uuid,own_version.id,p_request) returning id into result_id;
 return result_id;
 exception when others then if was_expired then return null;else raise;end if;
 end;
end $$;
create function body_private.program_exercise_snapshot() returns trigger language plpgsql security invoker set search_path='' as $$
declare m public.workout_movements;recommended public.exercises;actual public.exercises;plans jsonb;
begin
 if new.program_movement_id is null then return new;end if;
 select * into m from public.workout_movements where id=new.program_movement_id and owner_id=auth.uid() and workout_session_id=new.workout_session_id;
 if m.id is null then raise exception 'Movement unavailable' using errcode='42501';end if;
 perform 1 from public.workout_sessions where id=m.workout_session_id and owner_id=auth.uid() and status='in_progress' for update nowait;
 if not found then raise exception 'Workout closed' using errcode='23514';end if;
 select * into actual from public.exercises where id=new.exercise_id and archived_at is null;
 if actual.id is null or public.exercise_logging_kind(actual.id) not in('loaded','bodyweight') then raise exception 'Supported exercise required' using errcode='22023';end if;
 select * into recommended from public.exercises where id=(m.slot_snapshot->>'exercise_id')::uuid;
 plans:=coalesce(m.slot_snapshot->'sets','[]'::jsonb);
 if jsonb_array_length(plans)=0 then
  select jsonb_agg(jsonb_build_object('set_type','working','reps_min',m.slot_snapshot->'target_reps_min','reps_max',m.slot_snapshot->'target_reps_max','rest_seconds',m.slot_snapshot->'rest_seconds') order by i) into plans from generate_series(1,coalesce((m.slot_snapshot->>'target_sets')::int,1)) i;
 end if;
 select coalesce(jsonb_agg(x.plan||jsonb_build_object('plan_number',x.n) order by x.n),'[]'::jsonb) into new.program_remaining_sets
 from jsonb_array_elements(plans) with ordinality x(plan,n)
 where not exists(select 1 from public.workout_exercises e join public.workout_sets z on z.workout_exercise_id=e.id and z.owner_id=e.owner_id where e.program_movement_id=m.id and e.owner_id=auth.uid() and e.removed_at is null and z.deleted_at is null and z.status='completed' and z.program_set_number=x.n and case when x.plan->>'set_type'='warm_up' then z.set_type='warm_up' else z.set_type<>'warm_up' end);
 new.source_program_slot_id:=(select id from public.program_slots where id=m.slot_identity and owner_id=auth.uid());new.prescribed_exercise_id:=recommended.id;new.prescribed_exercise_name_snapshot:=recommended.name;
 new.exercise_name_snapshot:=actual.name;new.exercise_instructions_snapshot:=actual.instructions;
 new.prescribed_sets:=greatest(1,jsonb_array_length(new.program_remaining_sets));new.prescribed_rest_seconds:=(m.slot_snapshot->>'rest_seconds')::int;
 return new;
end $$;
create trigger b_program_exercise_snapshot before insert on public.workout_exercises for each row execute function body_private.program_exercise_snapshot();
create function public.select_program_exercise(p_movement uuid,p_exercise uuid,p_expected uuid,p_request uuid,p_continue boolean default false) returns uuid language plpgsql security invoker set search_path='' as $$
declare m public.workout_movements;current_item public.workout_exercises;retry public.workout_exercises;parent_status text;result_id uuid;source public.exercises;has_actual boolean;next_position integer;
begin
 if auth.uid() is null then raise exception 'Sign in required' using errcode='42501';end if;
 if p_request is null or p_continue is null then raise exception 'Selection ID required' using errcode='22023';end if;
 select * into m from public.workout_movements where id=p_movement and owner_id=auth.uid();
 if m.id is null then raise exception 'Movement unavailable' using errcode='42501';end if;
 select status into parent_status from public.workout_sessions where id=m.workout_session_id and owner_id=auth.uid() for update;
 if (public.workout_continuity(m.workout_session_id)->>'state')='expired' then return null;end if;
 if parent_status<>'in_progress' then raise exception 'Workout closed' using errcode='23514';end if;
 select * into retry from public.workout_exercises where owner_id=auth.uid() and selection_nonce=p_request;
 if retry.id is not null then
  if retry.program_movement_id<>m.id or retry.exercise_id<>p_exercise then raise exception 'Selection request reused' using errcode='23514';end if;return retry.id;
 end if;
 select * into current_item from public.workout_exercises where program_movement_id=m.id and owner_id=auth.uid() and removed_at is null order by position desc limit 1;
 if current_item.exercise_id=p_exercise then return current_item.id;end if;
 if current_item.id is distinct from p_expected then raise exception 'Selection changed elsewhere; refresh before choosing' using errcode='40001';end if;
 select * into source from public.exercises where id=p_exercise and archived_at is null;
 if source.id is null or public.exercise_logging_kind(p_exercise) not in('loaded','bodyweight') then raise exception 'Supported exercise required' using errcode='22023';end if;
 if current_item.id is not null then
  select exists(select 1 from public.workout_sets where workout_exercise_id=current_item.id and owner_id=auth.uid() and deleted_at is null and (not is_automatic or inputs_confirmed or status='completed')) into has_actual;
  if has_actual and not p_continue then raise exception 'Explicit continuation required; recorded sets keep their exercise' using errcode='P0001';end if;
  if has_actual then update public.workout_sets set deleted_at=clock_timestamp() where workout_exercise_id=current_item.id and owner_id=auth.uid() and status='pending' and is_automatic and not inputs_confirmed and deleted_at is null;
  else update public.workout_exercises set removed_at=clock_timestamp() where id=current_item.id and owner_id=auth.uid();end if;
 end if;
 if (select count(*) from public.workout_exercises where workout_session_id=m.workout_session_id and owner_id=auth.uid() and removed_at is null)>=100 then raise exception 'Exercise limit reached' using errcode='22023';end if;
 select coalesce(max(position),0)+1 into next_position from public.workout_exercises where workout_session_id=m.workout_session_id and owner_id=auth.uid();
 insert into public.workout_exercises(owner_id,workout_session_id,position,exercise_id,exercise_name_snapshot,program_movement_id,selection_nonce)
 values(auth.uid(),m.workout_session_id,next_position,source.id,source.name,m.id,p_request) returning id into result_id;
 return result_id;
end $$;
-- Planned effort remains server-derived and separate from actual reports.
create function body_private.program_set_targets() returns trigger language plpgsql security invoker set search_path='' as $$
declare target jsonb;
begin
 if not new.is_automatic then return new;end if;
 select e.program_remaining_sets->(new.position-1) into target from public.workout_exercises e where e.id=new.workout_exercise_id and e.owner_id=auth.uid() and e.program_movement_id is not null;
 if target is null then return new;end if;
 new.program_set_number:=(target->>'plan_number')::int;
 new.prescribed_effort_scale:=target->>'effort_scale';new.prescribed_effort_value:=(target->>'effort_value')::numeric;new.prescribed_to_failure:=(target->>'intended_to_failure')::boolean;
 return new;
end $$;
create trigger z_program_set_targets before insert on public.workout_sets for each row execute function body_private.program_set_targets();
create or replace function public.initialize_workout_sets(p_item uuid,p_default_count integer default 3)
returns setof public.workout_sets language plpgsql security invoker set search_path='' as $$
declare uid uuid:=auth.uid(); parent_id uuid; state text; removal timestamptz; exercise uuid; bw boolean; prior record; n integer:=0; movement public.workout_movements;remaining jsonb;plan jsonb;type_offsets jsonb:='{}'::jsonb;prior_index integer;prior_kind text;
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
 select m.* into movement from public.workout_exercises e join public.workout_movements m on m.id=e.program_movement_id and m.owner_id=e.owner_id where e.id=p_item and e.owner_id=uid;
 if movement.id is not null then
  select program_remaining_sets into remaining from public.workout_exercises where id=p_item and owner_id=uid;
  for idx in 1..greatest(1,jsonb_array_length(remaining)) loop
   plan:=remaining->(idx-1);
   prior_kind:=coalesce(plan->>'set_type','working');prior_index:=coalesce((type_offsets->>prior_kind)::int,0);
   select * into prior from public.previous_exercise_sets(exercise) where set_type=prior_kind offset prior_index limit 1;
   type_offsets:=jsonb_set(type_offsets,array[prior_kind],to_jsonb(prior_index+1),true);
   insert into public.workout_sets(owner_id,workout_exercise_id,position,set_type,load_mode,prescribed_reps_min,prescribed_reps_max,prescribed_weight_kg,is_automatic,inputs_confirmed,suggested_from_date,entered_weight,entered_unit)
   values(uid,p_item,idx,coalesce(plan->>'set_type','working'),coalesce(prior.load_mode,case when bw then 'bodyweight' else 'external' end),(plan->>'reps_min')::int,(plan->>'reps_max')::int,prior.weight_kg,true,false,prior.performed_at,prior.entered_weight,prior.entered_unit);
  end loop;
  return query select * from public.workout_sets where workout_exercise_id=p_item and owner_id=uid order by position;return;
 end if;
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
create function body_private.program_completion() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if new.status<>'completed' or new.source_program_version_id is null then return new;end if;
 if new.completion_status='none' then return new;end if;
 if exists(select 1 from public.workout_movements m where m.workout_session_id=new.id and m.owner_id=new.owner_id and
 (select count(*) from public.workout_exercises e join public.workout_sets s on s.workout_exercise_id=e.id and s.owner_id=e.owner_id where e.program_movement_id=m.id and e.removed_at is null and s.deleted_at is null and s.status='completed' and s.set_type<>'warm_up')<case when jsonb_array_length(coalesce(m.slot_snapshot->'sets','[]'::jsonb))>0 then (select count(*) from jsonb_array_elements(m.slot_snapshot->'sets') x where x->>'set_type'<>'warm_up') else coalesce((m.slot_snapshot->>'target_sets')::int,1) end)
 or exists(select 1 from public.workout_exercises e left join public.workout_sets s on s.workout_exercise_id=e.id and s.owner_id=e.owner_id and s.deleted_at is null where e.workout_session_id=new.id and e.owner_id=new.owner_id and e.removed_at is null and (s.id is null or s.status<>'completed')) then new.completion_status:='partial';else new.completion_status:='full';end if;
 return new;
end $$;
create trigger z_program_completion before update of status on public.workout_sessions for each row execute function body_private.program_completion();
create function public.program_last_choices(p_session uuid) returns table(movement_id uuid,exercise_id uuid) language sql stable security invoker set search_path='' as $$
 select current_m.id,last_choice.exercise_id from public.workout_movements current_m left join lateral(
 select e.exercise_id from public.workout_movements old_m join public.workout_exercises e on e.program_movement_id=old_m.id and e.owner_id=old_m.owner_id join public.workout_sessions w on w.id=e.workout_session_id and w.owner_id=e.owner_id
 join lateral public.performance_source(e.exercise_id,null,w.started_at,w.started_at+interval '1 microsecond') p on p.session_id=w.id
 join public.workout_sets s on s.id=p.set_id and s.workout_exercise_id=e.id
 where old_m.owner_id=auth.uid() and old_m.slot_identity=current_m.slot_identity and e.removed_at is null
 order by p.performed_at desc,w.id desc,e.position desc,e.id desc limit 1)last_choice on true
 where current_m.workout_session_id=p_session and current_m.owner_id=auth.uid();
$$;
revoke all on function public.start_program_workout(uuid,integer,uuid),public.select_program_exercise(uuid,uuid,uuid,uuid,boolean),public.program_last_choices(uuid) from public,anon,service_role;
grant execute on function public.start_program_workout(uuid,integer,uuid),public.select_program_exercise(uuid,uuid,uuid,uuid,boolean),public.program_last_choices(uuid) to authenticated;
create function body_private.program_identity_protection() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if current_user<>'authenticated' then return new;end if;
 if tg_table_name='workout_exercises' then
  if old.program_movement_id is not null and (to_jsonb(new)-array['status','removed_at','notes','updated_at']) is distinct from (to_jsonb(old)-array['status','removed_at','notes','updated_at']) then
   if pg_trigger_depth()>1 and old.source_program_slot_id is not null and new.source_program_slot_id is null and (to_jsonb(new)-array['status','removed_at','notes','updated_at','source_program_slot_id'])=(to_jsonb(old)-array['status','removed_at','notes','updated_at','source_program_slot_id']) then return new;end if;
   raise exception 'Program exercise identity and prescriptions are immutable; continue with a new exercise entry' using errcode='23514';end if;
 elsif old.source_program_version_id is not null and row(new.source_program_version_id,new.source_program_id,new.source_program_day_id,new.source_cycle_position,new.program_version_snapshot,new.program_start_nonce,new.program_name_snapshot,new.day_name_snapshot) is distinct from row(old.source_program_version_id,old.source_program_id,old.source_program_day_id,old.source_cycle_position,old.program_version_snapshot,old.program_start_nonce,old.program_name_snapshot,old.day_name_snapshot) then raise exception 'Program execution source is immutable' using errcode='23514';end if;
 return new;
end $$;
create trigger a_program_identity_protection before update on public.workout_exercises for each row execute function body_private.program_identity_protection();
create trigger b_program_identity_protection before update on public.workout_sessions for each row execute function body_private.program_identity_protection();
revoke all on all functions in schema body_private from public,anon,authenticated,service_role;
commit;
