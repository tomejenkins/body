-- Explicit exercise selection uses the same ad-hoc session/movement/logger authority.
begin;
create function public.exercise_setup_slot(p_exercise uuid) returns jsonb
language plpgsql stable security invoker set search_path='' as $$
declare e public.exercises; intent jsonb; pattern uuid; muscle uuid;
begin
 if auth.uid() is null then raise exception 'Sign in required' using errcode='42501';end if;
 select * into e from public.exercises where id=p_exercise and archived_at is null;
 if e.id is null or public.exercise_logging_kind(e.id) not in('loaded','bodyweight') then raise exception 'Supported exercise required' using errcode='22023';end if;
 select ep.movement_pattern_id into pattern from public.exercise_movement_patterns ep join public.movement_patterns p on p.id=ep.movement_pattern_id and p.archived_at is null where ep.exercise_id=e.id and ep.is_primary;
 select em.muscle_group_id into muscle from public.exercise_muscles em join public.muscle_groups m on m.id=em.muscle_group_id and m.archived_at is null where em.exercise_id=e.id and em.muscle_role='primary' order by em.muscle_group_id limit 1;
 if pattern is null or muscle is null then raise exception 'Supported exercise taxonomy required' using errcode='22023';end if;
 if e.owner_id is null then
  select i into intent from unnest(array['flat_press','close_grip_press','floor_press','dip','incline_push_up','incline_press','chest_fly','upper_chest_fly','lower_chest_fly','vertical_pull','lat_row','row','upper_row','pullover','shrug','squat','hinge','single_leg','leg_extension','leg_curl','hip_thrust','overhead_press','lateral_raise','rear_delt','front_raise','calf_straight','calf_bent','standard_curl','neutral_curl','lengthened_curl','supported_curl','pushdown','overhead_extension','lying_extension','kickback','crunch','reverse_crunch','bicycle','wood_chop','reverse_curl','rear_delt_pull']::text[]) with ordinality k(key,n) cross join lateral public.movement_intent(k.key) i
  where (i->>'patternId')::uuid=pattern and i->>'exerciseType'=e.exercise_type and exists(select 1 from public.exercise_muscles em where em.exercise_id=e.id and em.muscle_role='primary' and em.muscle_group_id=(i->>'muscleId')::uuid)
  and (jsonb_array_length(i->'exercises')=0 or i->'exercises' ? e.slug)
  order by case when i->'exercises' ? e.slug then 0 else 1 end,k.n limit 1;
 end if;
 return jsonb_build_object('exerciseId',e.id,'intent',intent->>'key','pattern',pattern,'muscle',coalesce((intent->>'muscleId')::uuid,muscle),'exerciseType',e.exercise_type,'title',e.name);
end $$;
create or replace function body_private.ad_hoc_session_input() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if tg_op='UPDATE' then
  if row(new.ad_hoc_focus,new.ad_hoc_start_nonce) is distinct from row(old.ad_hoc_focus,old.ad_hoc_start_nonce) then raise exception 'Workout focus is immutable' using errcode='23514';end if;return new;
 end if;
 if (new.ad_hoc_focus is null)<>(new.ad_hoc_start_nonce is null) then raise exception 'Focus and retry identity are paired' using errcode='22023';end if;
 if new.ad_hoc_focus is not null then
  if new.source_program_version_id is not null or new.ad_hoc_start_nonce is null or jsonb_typeof(new.ad_hoc_focus)<>'array' or jsonb_array_length(new.ad_hoc_focus) not between 1 and 6 then raise exception 'Invalid suggested workout' using errcode='22023';end if;
  if exists(select 1 from jsonb_array_elements(new.ad_hoc_focus) x where x ? 'exerciseId') then
   if new.favorite_workout_id is not null or new.program_assignment_id is not null or new.source_program_id is not null or new.source_program_day_id is not null or new.source_rotation is not null then raise exception 'Independent workout required' using errcode='23514';end if;
   if exists(select 1 from jsonb_array_elements(new.ad_hoc_focus)x where not(x ? 'exerciseId') or x is distinct from public.exercise_setup_slot((x->>'exerciseId')::uuid)) or exists(select 1 from jsonb_array_elements(new.ad_hoc_focus)x group by x->>'exerciseId' having count(*)>1) then raise exception 'Invalid explicit exercise selection' using errcode='22023';end if;
   return new;
  end if;
  if exists(select 1 from jsonb_array_elements(new.ad_hoc_focus) x
    group by coalesce(x->>'intent',(x->>'pattern')||':'||(x->>'muscle')||':'||(x->>'exerciseType')) having count(*)>1)
    or exists(select 1 from jsonb_array_elements(new.ad_hoc_focus) x group by x->>'pattern',x->>'muscle' having count(*)>1 and bool_or(x->>'intent' is null))
    then raise exception 'Choose distinct movement intents' using errcode='22023';end if;
 end if;
 return new;
end $$;
create or replace function body_private.initialize_ad_hoc_movements() returns trigger language plpgsql security invoker set search_path='' as $$
declare slot jsonb;n integer:=0;movement uuid;
begin
 if new.ad_hoc_focus is null then return null;end if;
 for slot in select value from jsonb_array_elements(new.ad_hoc_focus) loop
  n:=n+1;
  insert into public.workout_movements(owner_id,workout_session_id,position,suggested_pattern_id,suggested_muscle_id,suggested_type,suggested_title,movement_nonce,suggested_intent)
  values(auth.uid(),new.id,n,(slot->>'pattern')::uuid,(slot->>'muscle')::uuid,slot->>'exerciseType',slot->>'title',md5(new.id::text||':'||n)::uuid,slot->>'intent') returning id into movement;
  if slot ? 'exerciseId' then perform public.select_program_exercise(movement,(slot->>'exerciseId')::uuid,null,md5(new.id::text||':explicit:'||n)::uuid,false);end if;
 end loop;return null;
end $$;
create function public.start_exercise_workout(p_exercises uuid[],p_request uuid) returns uuid
language plpgsql security invoker set search_path='' as $$
declare w public.workout_sessions; slots jsonb; result uuid;
begin
 if auth.uid() is null then raise exception 'Sign in required' using errcode='42501';end if;
 if p_request is null or p_exercises is null or cardinality(p_exercises) not between 1 and 6 or array_ndims(p_exercises)<>1 or array_position(p_exercises,null) is not null or cardinality(p_exercises)<>(select count(distinct id) from unnest(p_exercises)id) then raise exception 'Choose one to six different exercises' using errcode='22023';end if;
 perform 1 from public.profiles where id=auth.uid() for update;
 select * into w from public.workout_sessions where owner_id=auth.uid() and ad_hoc_start_nonce=p_request;
 -- Compare immutable input identities before revalidating a potentially retired catalog source.
 if w.id is not null then
  if (select array_agg((x->>'exerciseId')::uuid order by n) from jsonb_array_elements(w.ad_hoc_focus) with ordinality q(x,n)) is distinct from p_exercises then raise exception 'Start request reused' using errcode='23514';end if;
  return w.id;
 end if;
 -- Existing start owns expiry, active-session checks, nonce and transactional initialization.
 select jsonb_agg(public.exercise_setup_slot(id) order by n) into slots from unnest(p_exercises) with ordinality q(id,n);
 result:=public.start_suggested_workout(slots,p_request);return result;
end $$;
create function public.workout_setup_recents() returns table(exercise_id uuid)
language sql stable security invoker set search_path='' as $$
 select p.exercise_id from public.performance_source(null,null,null,null)p join public.exercises e on e.id=p.exercise_id and e.archived_at is null
 group by p.exercise_id order by max(p.performed_at) desc,p.exercise_id limit 6;
$$;
revoke all on function public.exercise_setup_slot(uuid),public.start_exercise_workout(uuid[],uuid),public.workout_setup_recents() from public,anon,service_role;
grant execute on function public.exercise_setup_slot(uuid),public.start_exercise_workout(uuid[],uuid),public.workout_setup_recents() to authenticated;
revoke all on all functions in schema body_private from public,anon,service_role;
commit;
