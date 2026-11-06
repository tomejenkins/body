-- Ad-hoc movement intent reuses the existing owner-scoped execution model.
begin;
alter table public.workout_sessions add column ad_hoc_focus jsonb,add column ad_hoc_start_nonce uuid,add constraint ad_hoc_start_retry unique(owner_id,ad_hoc_start_nonce);
grant insert(ad_hoc_focus,ad_hoc_start_nonce) on public.workout_sessions to authenticated;
alter table public.workout_movements add column suggested_pattern_id uuid references public.movement_patterns(id),add column suggested_muscle_id uuid references public.muscle_groups(id),add column suggested_type text check(suggested_type in('compound','isolation')),add column suggested_title text check(length(suggested_title) between 1 and 80),add column movement_nonce uuid,add column removed_at timestamptz,
 add constraint ad_hoc_movement_retry unique(owner_id,movement_nonce);
grant insert(suggested_pattern_id,suggested_muscle_id,suggested_type,suggested_title,movement_nonce) on public.workout_movements to authenticated;
grant update(removed_at) on public.workout_movements to authenticated;
create policy owner_remove on public.workout_movements for update to authenticated using(owner_id=(select auth.uid())) with check(owner_id=(select auth.uid()));
create function body_private.ad_hoc_session_input() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if tg_op='UPDATE' then
  if row(new.ad_hoc_focus,new.ad_hoc_start_nonce) is distinct from row(old.ad_hoc_focus,old.ad_hoc_start_nonce) then raise exception 'Workout focus is immutable' using errcode='23514';end if;return new;
 end if;
 if (new.ad_hoc_focus is null)<>(new.ad_hoc_start_nonce is null) then raise exception 'Focus and retry identity are paired' using errcode='22023';end if;
 if new.ad_hoc_focus is not null then
  if new.source_program_version_id is not null or new.ad_hoc_start_nonce is null or jsonb_typeof(new.ad_hoc_focus)<>'array' or jsonb_array_length(new.ad_hoc_focus) not between 1 and 4 then raise exception 'Invalid suggested workout' using errcode='22023';end if;
  if exists(select 1 from jsonb_array_elements(new.ad_hoc_focus) x group by x->>'pattern',x->>'muscle' having count(*)>1) or (select count(distinct x->>'muscle') from jsonb_array_elements(new.ad_hoc_focus) x)>2 or exists(select 1 from jsonb_array_elements(new.ad_hoc_focus) x group by x->>'muscle' having count(*)>2) then raise exception 'Choose complementary movements for different muscles' using errcode='22023';end if;
 end if;
 return new;
end $$;
create trigger aa_ad_hoc_session_input before insert or update on public.workout_sessions for each row execute function body_private.ad_hoc_session_input();
create or replace function body_private.program_movement_snapshot() returns trigger language plpgsql security invoker set search_path='' as $$
declare w public.workout_sessions;v public.program_versions;day jsonb;slot jsonb;pattern_name text;
begin
 select * into w from public.workout_sessions where id=new.workout_session_id and owner_id=auth.uid() for update nowait;
 if w.id is null then raise exception 'Workout unavailable' using errcode='42501';end if;
 if w.status<>'in_progress' or w.last_activity_at is not null and clock_timestamp()-w.last_activity_at>=make_interval(hours=>(public.workout_policy()->>'expire_hours')::int) then raise exception 'Workout closed or expired' using errcode='23514';end if;
 if w.source_program_version_id is null then
  if new.position not between 1 and 100 or new.movement_nonce is null or new.suggested_pattern_id is null or new.suggested_muscle_id is null or new.suggested_type is null then raise exception 'Choose a supported movement' using errcode='22023';end if;
  if not exists(select 1 from public.exercises e join public.exercise_movement_patterns ep on ep.exercise_id=e.id and ep.is_primary join public.exercise_muscles em on em.exercise_id=e.id and em.muscle_role='primary' where e.archived_at is null and e.exercise_type=new.suggested_type and ep.movement_pattern_id=new.suggested_pattern_id and em.muscle_group_id=new.suggested_muscle_id and public.exercise_logging_kind(e.id) in('loaded','bodyweight')) then raise exception 'No supported exercises for this movement' using errcode='22023';end if;
  select name into pattern_name from public.movement_patterns where id=new.suggested_pattern_id;
  new.owner_id:=auth.uid();new.slot_identity:=new.id;
  new.slot_snapshot:=jsonb_build_object('origin','ad_hoc','id',new.id,'title',coalesce(new.suggested_title,pattern_name),'movement_pattern_id',new.suggested_pattern_id,'primary_muscle_id',new.suggested_muscle_id,'required_exercise_type',new.suggested_type,'target_sets',3,'target_reps_min',case when new.suggested_type='compound' then 8 else 10 end,'target_reps_max',case when new.suggested_type='compound' then 12 else 15 end,'equipment','[]'::jsonb,'sets','[]'::jsonb);
  return new;
 end if;
 if new.suggested_pattern_id is not null or new.suggested_muscle_id is not null or new.suggested_type is not null or new.movement_nonce is not null then raise exception 'Program intent is immutable' using errcode='23514';end if;
 select * into v from public.program_versions where id=w.source_program_version_id and owner_id=auth.uid();
 select value into day from jsonb_array_elements(v.definition->'days') where (value->>'id')::uuid=w.source_program_day_id;
 if new.position is null or new.position not between 1 and 100 then raise exception 'Invalid movement order' using errcode='22023';end if;
 select value into slot from jsonb_array_elements(day->'slots') order by (value->>'position')::int offset new.position-1 limit 1;
 if slot is null then raise exception 'Program movement unavailable' using errcode='23514';end if;
 new.owner_id:=auth.uid();new.slot_identity:=(slot->>'id')::uuid;new.slot_snapshot:=slot;return new;
end $$;
create function body_private.ad_hoc_movement_removal() returns trigger language plpgsql security invoker set search_path='' as $$
declare w public.workout_sessions;
begin
 if (to_jsonb(new)-'removed_at') is distinct from (to_jsonb(old)-'removed_at') or old.suggested_pattern_id is null or old.removed_at is not null or new.removed_at is null then raise exception 'Movement intent is immutable' using errcode='23514';end if;
 select * into w from public.workout_sessions where id=old.workout_session_id and owner_id=auth.uid() for update nowait;
 if w.id is null or w.status<>'in_progress' or clock_timestamp()-w.last_activity_at>=make_interval(hours=>(public.workout_policy()->>'expire_hours')::int) then raise exception 'Workout closed' using errcode='23514';end if;
 if exists(select 1 from public.workout_exercises e join public.workout_sets z on z.workout_exercise_id=e.id and z.owner_id=e.owner_id where e.program_movement_id=old.id and e.owner_id=auth.uid() and e.removed_at is null and z.deleted_at is null and (not z.is_automatic or z.inputs_confirmed or z.status='completed')) then raise exception 'Recorded movements must be preserved' using errcode='23514';end if;
 update public.workout_exercises set removed_at=clock_timestamp() where program_movement_id=old.id and owner_id=auth.uid() and removed_at is null;
 new.removed_at:=clock_timestamp();return new;
end $$;
create trigger a_ad_hoc_movement_removal before update on public.workout_movements for each row execute function body_private.ad_hoc_movement_removal();
create function body_private.initialize_ad_hoc_movements() returns trigger language plpgsql security invoker set search_path='' as $$
declare slot jsonb;n integer:=0;
begin
 if new.ad_hoc_focus is null then return null;end if;
 for slot in select value from jsonb_array_elements(new.ad_hoc_focus) loop
  n:=n+1;
  insert into public.workout_movements(owner_id,workout_session_id,position,suggested_pattern_id,suggested_muscle_id,suggested_type,suggested_title,movement_nonce)
  values(auth.uid(),new.id,n,(slot->>'pattern')::uuid,(slot->>'muscle')::uuid,slot->>'exerciseType',slot->>'title',md5(new.id::text||':'||n)::uuid);
 end loop;return null;
end $$;
create trigger initialize_ad_hoc_movements after insert on public.workout_sessions for each row execute function body_private.initialize_ad_hoc_movements();
create function public.start_suggested_workout(p_slots jsonb,p_request uuid) returns uuid language plpgsql security invoker set search_path='' as $$
declare w public.workout_sessions;result_id uuid;expired boolean;
begin
 if auth.uid() is null then raise exception 'Sign in required' using errcode='42501';end if;
 if p_request is null or p_slots is null then raise exception 'Invalid workout start' using errcode='22023';end if;
 perform 1 from public.profiles where id=auth.uid() for update;
 select * into w from public.workout_sessions where owner_id=auth.uid() and ad_hoc_start_nonce=p_request;
 if w.id is not null then if w.ad_hoc_focus is distinct from p_slots then raise exception 'Start request reused' using errcode='23514';end if;return w.id;end if;
 expired:=coalesce(public.workout_continuity()->>'state','')='expired';
 if exists(select 1 from public.workout_sessions where owner_id=auth.uid() and status='in_progress') then raise exception 'Resume your active workout first' using errcode='23514';end if;
 begin
 insert into public.workout_sessions(owner_id,name,ad_hoc_focus,ad_hoc_start_nonce) values(auth.uid(),'Workout',p_slots,p_request) returning id into result_id;return result_id;
 exception when others then if expired then return null;else raise;end if;end;
end $$;
create function public.edit_suggested_movement(p_session uuid,p_request uuid,p_slot jsonb default null,p_remove uuid default null,p_keep boolean default false) returns uuid language plpgsql security invoker set search_path='' as $$
declare w public.workout_sessions;m public.workout_movements;retry public.workout_movements;recorded boolean;result_id uuid;n integer;
begin
 if auth.uid() is null then raise exception 'Sign in required' using errcode='42501';end if;
 select * into w from public.workout_sessions where id=p_session and owner_id=auth.uid() for update;
 if w.id is null then raise exception 'Workout unavailable' using errcode='42501';end if;
 if (public.workout_continuity(w.id)->>'state')='expired' then return null;end if;
 if w.status<>'in_progress' or w.source_program_version_id is not null or p_request is null then raise exception 'Ad-hoc active workout required' using errcode='23514';end if;
 if p_slot is not null then
  select * into retry from public.workout_movements where owner_id=auth.uid() and movement_nonce=p_request;
  if retry.id is not null then
   if retry.workout_session_id<>w.id or retry.suggested_pattern_id is distinct from (p_slot->>'pattern')::uuid or retry.suggested_muscle_id is distinct from (p_slot->>'muscle')::uuid or retry.suggested_type is distinct from p_slot->>'exerciseType' or retry.suggested_title is distinct from p_slot->>'title' then raise exception 'Movement request reused' using errcode='23514';end if;return retry.id;
  end if;
 end if;
 if p_remove is not null then
  select * into m from public.workout_movements where id=p_remove and owner_id=auth.uid() and workout_session_id=w.id and suggested_pattern_id is not null;
  if m.id is null then raise exception 'Movement unavailable' using errcode='42501';end if;
  select exists(select 1 from public.workout_exercises e join public.workout_sets z on z.workout_exercise_id=e.id and z.owner_id=e.owner_id where e.program_movement_id=m.id and e.owner_id=auth.uid() and e.removed_at is null and z.deleted_at is null and (not z.is_automatic or z.inputs_confirmed or z.status='completed')) into recorded;
  if recorded and (p_slot is null or not p_keep) then raise exception 'Keep recorded movement and add a replacement' using errcode='P0001';end if;
  if not recorded and m.removed_at is null then update public.workout_movements set removed_at=clock_timestamp() where id=m.id and owner_id=auth.uid();end if;
 end if;
 if p_slot is null then if p_remove is null then raise exception 'Choose a movement' using errcode='22023';end if;return m.id;end if;
 select coalesce(max(position),0)+1 into n from public.workout_movements where workout_session_id=w.id and owner_id=auth.uid();
 insert into public.workout_movements(owner_id,workout_session_id,position,suggested_pattern_id,suggested_muscle_id,suggested_type,suggested_title,movement_nonce)
 values(auth.uid(),w.id,n,(p_slot->>'pattern')::uuid,(p_slot->>'muscle')::uuid,p_slot->>'exerciseType',p_slot->>'title',p_request) returning id into result_id;return result_id;
end $$;
create or replace function body_private.program_completion() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if new.status<>'completed' or not exists(select 1 from public.workout_movements where workout_session_id=new.id and owner_id=new.owner_id and removed_at is null) then return new;end if;
 if new.completion_status='none' then return new;end if;
 if exists(select 1 from public.workout_movements m where m.workout_session_id=new.id and m.owner_id=new.owner_id and m.removed_at is null and
 (select count(*) from public.workout_exercises e join public.workout_sets s on s.workout_exercise_id=e.id and s.owner_id=e.owner_id where e.program_movement_id=m.id and e.removed_at is null and s.deleted_at is null and s.status='completed' and s.set_type<>'warm_up')<case when jsonb_array_length(coalesce(m.slot_snapshot->'sets','[]'::jsonb))>0 then (select count(*) from jsonb_array_elements(m.slot_snapshot->'sets') x where x->>'set_type'<>'warm_up') else coalesce((m.slot_snapshot->>'target_sets')::int,1) end)
 or exists(select 1 from public.workout_exercises e left join public.workout_sets s on s.workout_exercise_id=e.id and s.owner_id=e.owner_id and s.deleted_at is null where e.workout_session_id=new.id and e.owner_id=new.owner_id and e.removed_at is null and (s.id is null or s.status<>'completed')) then new.completion_status:='partial';else new.completion_status:='full';end if;
 return new;
end $$;
create or replace function body_private.program_exercise_snapshot() returns trigger language plpgsql security invoker set search_path='' as $$
declare m public.workout_movements;recommended public.exercises;actual public.exercises;plans jsonb;
begin
 if new.program_movement_id is null then return new;end if;
 select * into m from public.workout_movements where id=new.program_movement_id and owner_id=auth.uid() and workout_session_id=new.workout_session_id and removed_at is null;
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
create or replace function public.select_program_exercise(p_movement uuid,p_exercise uuid,p_expected uuid,p_request uuid,p_continue boolean default false) returns uuid language plpgsql security invoker set search_path='' as $$
declare m public.workout_movements;current_item public.workout_exercises;retry public.workout_exercises;parent_status text;result_id uuid;source public.exercises;has_actual boolean;next_position integer;
begin
 if auth.uid() is null then raise exception 'Sign in required' using errcode='42501';end if;
 if p_request is null or p_continue is null then raise exception 'Selection ID required' using errcode='22023';end if;
 select * into m from public.workout_movements where id=p_movement and owner_id=auth.uid() and removed_at is null;
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
create function body_private.ad_hoc_movement_activity() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if current_user='authenticated' then update public.workout_sessions set name=name where id=new.workout_session_id and owner_id=auth.uid() and status='in_progress';end if;return null;
end $$;
create trigger ad_hoc_movement_activity after insert or update on public.workout_movements for each row when(new.suggested_pattern_id is not null) execute function body_private.ad_hoc_movement_activity();
revoke all on function public.start_suggested_workout(jsonb,uuid),public.edit_suggested_movement(uuid,uuid,jsonb,uuid,boolean) from public,anon,service_role;
grant execute on function public.start_suggested_workout(jsonb,uuid),public.edit_suggested_movement(uuid,uuid,jsonb,uuid,boolean) to authenticated;
revoke all on all functions in schema body_private from public,anon,authenticated,service_role;
commit;
