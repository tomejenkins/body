-- Phase 7.4: owner-scoped evidence and version-bound use of existing assignments.
begin;
alter table public.program_assignments add column source_version_id uuid references public.program_versions(id);
grant insert(source_version_id) on public.program_assignments to authenticated;
create function body_private.assignment_version_guard() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if current_user<>'authenticated' then return new;end if;
 if tg_op='UPDATE' and new.source_version_id is distinct from old.source_version_id then raise exception 'Assignment version is immutable' using errcode='23514';end if;
 if new.source_version_id is not null and not exists(select 1 from public.program_versions v where v.id=new.source_version_id and v.owner_id=auth.uid() and v.program_id=new.program_id and (v.definition->'program'->>'cycle_length')::int=new.cycle_length) then raise exception 'Owned matching version required' using errcode='42501';end if;
 return new;
end $$;
create trigger assignment_version_guard before insert or update on public.program_assignments for each row execute function body_private.assignment_version_guard();
create function body_private.bind_program_assignment() returns trigger language plpgsql security invoker set search_path='' as $$
declare a public.program_assignments;v public.program_versions;last_w public.workout_sessions;
begin
 if current_user<>'authenticated' or new.source_program_version_id is null then return new;end if;
 perform 1 from public.profiles where id=auth.uid() for update nowait;
 select * into v from public.program_versions where id=new.source_program_version_id and owner_id=auth.uid();
 select * into a from public.program_assignments where owner_id=auth.uid() and state='active' for update;
 if a.id is not null and (a.program_id<>new.source_program_id or a.source_version_id is distinct from v.id) then
  update public.program_assignments set state='archived',ended_at=clock_timestamp() where id=a.id and owner_id=auth.uid();a.id:=null;
 end if;
 if a.id is null then
  insert into public.program_assignments(owner_id,program_id,cycle_length,next_cycle_position,source_version_id)
  values(auth.uid(),new.source_program_id,(v.definition->'program'->>'cycle_length')::int,new.source_cycle_position,v.id) returning * into a;
 end if;
 select * into last_w from public.workout_sessions where owner_id=auth.uid() and program_assignment_id=a.id and exists(select 1 from public.program_saved_progress(public.workout_sessions.id) p where p.completed>0) order by started_at desc,id desc limit 1;
 new.program_assignment_id:=a.id;
 new.source_rotation:=coalesce(last_w.source_rotation,0)+case when last_w.id is not null and (new.source_cycle_position<last_w.source_cycle_position or new.source_cycle_position=last_w.source_cycle_position and not exists(select 1 from public.program_saved_progress(last_w.id) p where p.completed<p.required)) then 1 else 0 end;
 return new;
end $$;
create trigger c_bind_program_assignment before insert on public.workout_sessions for each row execute function body_private.bind_program_assignment();
create function body_private.assignment_session_guard() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if current_user='authenticated' and row(new.program_assignment_id,new.source_rotation) is distinct from row(old.program_assignment_id,old.source_rotation) then raise exception 'Execution assignment is immutable' using errcode='23514';end if;return new;
end $$;
create trigger assignment_session_guard before update on public.workout_sessions for each row execute function body_private.assignment_session_guard();
create index progression_session_history on public.workout_sessions(owner_id,program_assignment_id,started_at desc) where status='completed';
create function public.program_saved_progress(p_session uuid default null,p_assignment uuid default null)
returns table(session_id uuid,movement_id uuid,required bigint,completed bigint,reps_achieved bigint)
language sql stable security invoker set search_path='' as $$
 select w.id,m.id,
 greatest(1,case when jsonb_array_length(coalesce(m.slot_snapshot->'sets','[]'::jsonb))>0 then (select count(*) from jsonb_array_elements(m.slot_snapshot->'sets') t where t->>'set_type'<>'warm_up') else coalesce((m.slot_snapshot->>'target_sets')::int,1) end),
 count(s.id),count(s.id) filter(where s.prescribed_reps_min is not null and s.actual_reps>=s.prescribed_reps_min)
 from public.workout_sessions w join public.workout_movements m on m.workout_session_id=w.id and m.owner_id=w.owner_id and m.removed_at is null
 left join public.workout_exercises e on e.program_movement_id=m.id and e.owner_id=m.owner_id and e.removed_at is null and e.logging_kind not in('duration','assisted')
 left join public.workout_sets s on s.workout_exercise_id=e.id and s.owner_id=e.owner_id and s.deleted_at is null and s.status='completed' and s.inputs_confirmed and s.actual_reps>0 and s.set_type<>'warm_up' and (s.load_mode='bodyweight' or s.actual_weight_kg is not null)
 where w.owner_id=auth.uid() and w.status='completed' and (p_session is not null or p_assignment is not null) and (p_session is null or w.id=p_session) and (p_assignment is null or w.program_assignment_id=p_assignment)
 group by w.id,m.id;
$$;
revoke all on function public.program_saved_progress(uuid,uuid) from public,anon,service_role;
grant execute on function public.program_saved_progress(uuid,uuid) to authenticated;

-- Batched only for exercises actually selected in this owner-verified session.
-- Reuse the existing eligible-performance source; no new performance truth.
create function public.program_progression_evidence(p_session uuid) returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare w public.workout_sessions;result jsonb;
begin
 select * into w from public.workout_sessions where id=p_session and owner_id=auth.uid();
 if w.id is null then raise exception 'Workout unavailable' using errcode='42501';end if;
 with selected as materialized(select e.id,e.exercise_id,e.program_movement_id from public.workout_exercises e where e.workout_session_id=w.id and e.owner_id=auth.uid() and e.removed_at is null and e.program_movement_id is not null),
 evidence as materialized(
 select p.*,m.slot_identity,s.effort_scale,s.effort_value,s.performed_to_failure,s.program_set_number,e.program_movement_id
 from public.performance_source(null,array(select distinct exercise_id from selected),w.started_at-interval '180 days',case when w.status='completed' then w.started_at+interval '1 microsecond' else w.started_at end) p
 join public.workout_sets s on s.id=p.set_id and s.owner_id=auth.uid()
 join public.workout_exercises e on e.id=s.workout_exercise_id and e.owner_id=auth.uid()
 left join public.workout_movements m on m.id=e.program_movement_id and m.owner_id=auth.uid()
 where p.category='loaded' and p.set_type='working'
 ), sessions as materialized(select exercise_id,session_id,max(performed_at) as last_at,row_number() over(partition by exercise_id order by max(performed_at) desc,session_id) as n from evidence group by exercise_id,session_id)
 select coalesce(jsonb_agg(jsonb_build_object('itemId',x.id,'exerciseId',x.exercise_id,'slotId',m.slot_identity,'slot',m.slot_snapshot,'rules',v.definition->'rules','history',coalesce((select jsonb_agg(jsonb_build_object('exerciseId',p.exercise_id,'sessionId',p.session_id,'slotId',p.slot_identity,'date',p.performed_at,'kg',p.weight_kg,'reps',p.reps,'scale',p.effort_scale,'effort',p.effort_value,'failure',p.performed_to_failure,'setNumber',p.program_set_number) order by p.performed_at desc,p.set_id) from evidence p join sessions r on r.exercise_id=p.exercise_id and r.session_id=p.session_id where p.exercise_id=x.exercise_id and r.n<=24),'[]'::jsonb)) order by x.id),'[]'::jsonb) into result
 from selected x join public.workout_movements m on m.id=x.program_movement_id and m.owner_id=auth.uid() left join public.program_versions v on v.id=w.source_program_version_id and v.owner_id=auth.uid();
 return result;
end $$;
create function public.program_adherence(p_session uuid default null) returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare a public.program_assignments;v public.program_versions;last_w public.workout_sessions;first_day jsonb;next_day jsonb;result jsonb;
begin
 if auth.uid() is null then raise exception 'Sign in required' using errcode='42501';end if;
 if p_session is null then select * into a from public.program_assignments where owner_id=auth.uid() and state='active';
 else select x.* into a from public.program_assignments x join public.workout_sessions w on w.program_assignment_id=x.id and w.owner_id=x.owner_id where w.id=p_session and w.owner_id=auth.uid();end if;
 if a.id is null or a.source_version_id is null then return null;end if;
 select * into v from public.program_versions where id=a.source_version_id and owner_id=auth.uid();
 select * into last_w from public.workout_sessions w where w.program_assignment_id=a.id and w.owner_id=auth.uid() and exists(select 1 from public.program_saved_progress(w.id) p where p.completed>0) order by started_at desc,id desc limit 1;
 select value into first_day from jsonb_array_elements(v.definition->'days') where not(value->>'is_rest_day')::boolean order by (value->>'cycle_position')::int limit 1;
 select value into next_day from jsonb_array_elements(v.definition->'days') where not(value->>'is_rest_day')::boolean and (value->>'cycle_position')::int>coalesce(last_w.source_cycle_position,0) order by (value->>'cycle_position')::int limit 1;
 next_day:=coalesce(next_day,first_day);
 with progress as materialized(select * from public.program_saved_progress(null,a.id)),
 sessions as (select w.id,w.source_rotation,w.source_cycle_position,w.started_at,bool_and(p.completed>=p.required) as full_workout from public.workout_sessions w join progress p on p.session_id=w.id where w.owner_id=auth.uid() group by w.id having sum(p.completed)>0),
 rotations as (select source_rotation from sessions where full_workout group by source_rotation having count(distinct source_cycle_position)=(select count(*) from jsonb_array_elements(v.definition->'days') d where not(d->>'is_rest_day')::boolean))
 select jsonb_build_object('assignmentId',a.id,'name',v.definition->'program'->>'name','version',v.id,'nextPosition',(next_day->>'cycle_position')::int,'nextName',next_day->>'name','nextNumber',(select count(*) from jsonb_array_elements(v.definition->'days') d where not(d->>'is_rest_day')::boolean and (d->>'cycle_position')::int<=(next_day->>'cycle_position')::int),'trainingDays',(select count(*) from jsonb_array_elements(v.definition->'days') d where not(d->>'is_rest_day')::boolean),'completedWorkouts',(select count(*) from sessions),'recentWorkouts',(select count(*) from sessions where started_at>=now()-interval '30 days'),'lastName',last_w.day_name_snapshot,'lastAt',last_w.started_at,'completedRotations',(select count(*) from rotations),'completedMovements',(select count(*) from progress where completed>=required),'partialMovements',(select count(*) from progress where completed>0 and completed<required)) into result;
 result:=result||jsonb_build_object('activeSession',(select z.id from public.workout_sessions z where z.owner_id=auth.uid() and z.program_assignment_id=a.id and z.status='in_progress'),'activeName',(select z.day_name_snapshot from public.workout_sessions z where z.owner_id=auth.uid() and z.program_assignment_id=a.id and z.status='in_progress'),'currentRotation',coalesce(last_w.source_rotation,0)+1,'durationRotations',v.definition->'program'->'duration_rotations','programComplete',case when (v.definition->'program'->>'duration_rotations')::int is null then false else (result->>'completedRotations')::int>=(v.definition->'program'->>'duration_rotations')::int end);
 return result;
end $$;
create function public.program_workout_outcomes(p_session uuid) returns jsonb language sql stable security invoker set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('movement',m.position,'required',p.required,'completed',p.completed,'repsAchieved',p.reps_achieved) order by m.position),'[]'::jsonb)
 from public.program_saved_progress(p_session) p join public.workout_movements m on m.id=p.movement_id and m.owner_id=auth.uid();
$$;
revoke all on function public.program_workout_outcomes(uuid) from public,anon,service_role;
grant execute on function public.program_workout_outcomes(uuid) to authenticated;
revoke all on function public.program_progression_evidence(uuid),public.program_adherence(uuid) from public,anon,service_role;
grant execute on function public.program_progression_evidence(uuid),public.program_adherence(uuid) to authenticated;
revoke all on all functions in schema body_private from public,anon,authenticated,service_role;
commit;
