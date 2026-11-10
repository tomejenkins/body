-- One qualifying actual-performance contract, with a session gate ready for 7.6C.
begin;
create function public.training_sessions(p_session uuid default null,p_assignment uuid default null,p_closed boolean default true,p_from timestamptz default null,p_until timestamptz default null,p_sessions uuid[] default null)
returns setof public.workout_sessions language sql stable security invoker set search_path='' as $$
 select w.* from public.workout_sessions w where w.owner_id=auth.uid()
 and (w.status='completed' or p_closed=false and w.status='in_progress')
 and (p_session is null or w.id=p_session) and (p_assignment is null or w.program_assignment_id=p_assignment)
 and (p_from is null or w.started_at>=p_from) and (p_until is null or w.started_at<p_until)
 and (p_sessions is null or w.id=any(p_sessions));
$$;
create function public.qualifying_workout_sets(p_session uuid default null,p_assignment uuid default null,p_closed boolean default true,p_exercise uuid default null,p_ids uuid[] default null,p_from timestamptz default null,p_until timestamptz default null,p_sessions uuid[] default null)
returns table(exercise_id uuid,session_id uuid,set_id uuid,category text,reps integer,weight_kg numeric,entered_weight numeric,entered_unit text,set_type text,performed_at timestamptz,exercise_type text,selection_id uuid,movement_id uuid,prescribed_reps_min integer)
language sql stable security invoker set search_path='' as $$
 with source as (
 select e.exercise_id,w.id as session_id,s.id as set_id,s.actual_reps,s.actual_weight_kg,s.entered_weight,s.entered_unit,s.set_type,s.completed_at,c.exercise_type,s.load_mode,e.id as selection_id,e.program_movement_id,s.prescribed_reps_min,
 case when e.logging_kind='legacy' then public.exercise_logging_kind(e.exercise_id) else e.logging_kind end as kind,e.logging_kind,c.owner_id as catalog_owner
 from public.training_sessions(p_session,p_assignment,p_closed,p_from,p_until,p_sessions) w
 join public.workout_exercises e on e.workout_session_id=w.id and e.owner_id=w.owner_id
 join public.workout_sets s on s.workout_exercise_id=e.id and s.owner_id=e.owner_id join public.exercises c on c.id=e.exercise_id
 where e.removed_at is null and s.deleted_at is null and s.status='completed' and s.inputs_confirmed
 and s.actual_reps between 1 and 1000 and s.completed_at is not null and s.set_type<>'warm_up'
 and (p_exercise is null or e.exercise_id=p_exercise) and (p_ids is null or e.exercise_id=any(p_ids))
 ) select exercise_id,session_id,set_id,
 case when kind='bodyweight' and load_mode='bodyweight' then 'bodyweight' when kind='bodyweight' then 'added' else 'loaded' end,
 actual_reps,actual_weight_kg,entered_weight,entered_unit,set_type,completed_at,exercise_type,selection_id,program_movement_id,prescribed_reps_min
 from source where kind in('loaded','bodyweight')
 and (logging_kind<>'legacy' or catalog_owner is null and exercise_type in('compound','isolation') and (kind='loaded' or load_mode='bodyweight'))
 and ((kind='bodyweight' and load_mode='bodyweight' and actual_weight_kg is null) or (load_mode='external' and actual_weight_kg>0 and actual_weight_kg<>'NaN'::numeric and actual_weight_kg<=100000));
$$;
create or replace function public.performance_source(p_exercise uuid,p_ids uuid[],p_from timestamptz,p_until timestamptz)
returns table(exercise_id uuid,session_id uuid,set_id uuid,category text,reps integer,weight_kg numeric,entered_weight numeric,entered_unit text,set_type text,performed_at timestamptz,exercise_type text)
language sql stable security invoker set search_path='' as $$
 select q.exercise_id,q.session_id,q.set_id,q.category,q.reps,q.weight_kg,q.entered_weight,q.entered_unit,q.set_type,q.performed_at,q.exercise_type
 from public.qualifying_workout_sets(null,null,true,p_exercise,p_ids,p_from,p_until)q;
$$;
create function public.program_training_progress(p_session uuid default null,p_assignment uuid default null,p_closed boolean default true,p_sessions uuid[] default null)
returns table(session_id uuid,movement_id uuid,required bigint,completed bigint,reps_achieved bigint)
language sql stable security invoker set search_path='' as $$
 with evidence as materialized(select * from public.qualifying_workout_sets(p_session,p_assignment,p_closed,null,null,null,null,p_sessions))
 select w.id,m.id,
 greatest(1,case when jsonb_array_length(coalesce(m.slot_snapshot->'sets','[]'::jsonb))>0 then (select count(*) from jsonb_array_elements(m.slot_snapshot->'sets') t where t->>'set_type'<>'warm_up') else coalesce((m.slot_snapshot->>'target_sets')::int,1) end),
 count(q.set_id),count(q.set_id) filter(where q.prescribed_reps_min is not null and q.reps>=q.prescribed_reps_min)
 from public.training_sessions(p_session,p_assignment,p_closed,null,null,p_sessions)w
 join public.workout_movements m on m.workout_session_id=w.id and m.owner_id=w.owner_id and m.removed_at is null
 left join evidence q on q.session_id=w.id and q.movement_id=m.id
 where w.source_program_version_id is not null and (p_session is not null or p_assignment is not null or p_sessions is not null)
 group by w.id,m.id;
$$;
create or replace function public.program_saved_progress(p_session uuid default null,p_assignment uuid default null)
returns table(session_id uuid,movement_id uuid,required bigint,completed bigint,reps_achieved bigint)
language sql stable security invoker set search_path='' as $$
 select * from public.program_training_progress(p_session,p_assignment,true);
$$;
create function public.workout_program_classifications(p_sessions uuid[])
returns table(session_id uuid,completion_status text)
language plpgsql stable security invoker set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'Sign in required' using errcode='42501';end if;
 if p_sessions is null or cardinality(p_sessions)>51 or coalesce(array_ndims(p_sessions),1)>1 or array_position(p_sessions,null) is not null then raise exception 'Invalid session window' using errcode='22023';end if;
 return query with progress as materialized(
 select p.session_id,sum(p.completed) as completed,bool_and(p.completed>=p.required) as full_workout from public.program_training_progress(null,null,true,p_sessions)p group by p.session_id)
 select w.id,case when coalesce(p.completed,0)=0 then 'none' when p.full_workout then 'full' else 'partial' end
 from public.training_sessions(null,null,true,null,null,p_sessions)w left join progress p on p.session_id=w.id where w.source_program_version_id is not null;
end $$;
create or replace function body_private.program_completion() returns trigger language plpgsql security invoker set search_path='' as $$
declare completed bigint;full_workout boolean;
begin
 if new.status<>'completed' or new.source_program_version_id is null then return new;end if;
 select sum(p.completed),bool_and(p.completed>=p.required) into completed,full_workout from public.program_training_progress(new.id,null,false)p;
 new.completion_status:=case when coalesce(completed,0)=0 then 'none' when full_workout then 'full' else 'partial' end;
 return new;
end $$;
revoke all on function public.training_sessions(uuid,uuid,boolean,timestamptz,timestamptz,uuid[]),public.qualifying_workout_sets(uuid,uuid,boolean,uuid,uuid[],timestamptz,timestamptz,uuid[]),public.program_training_progress(uuid,uuid,boolean,uuid[]),public.workout_program_classifications(uuid[]) from public,anon,service_role;
grant execute on function public.training_sessions(uuid,uuid,boolean,timestamptz,timestamptz,uuid[]),public.qualifying_workout_sets(uuid,uuid,boolean,uuid,uuid[],timestamptz,timestamptz,uuid[]),public.program_training_progress(uuid,uuid,boolean,uuid[]),public.workout_program_classifications(uuid[]) to authenticated;
create or replace function public.workout_history(p_filter text default 'all',p_before timestamptz default null,p_before_id uuid default null,p_limit integer default 21)
returns table(id uuid,name text,status text,completion_status text,started_at timestamptz,finished_at timestamptz,exercise_count bigint,working_sets bigint,warm_up_sets bigint,incomplete_sets bigint,effective_finished_at timestamptz,duration_kind text,closure_reason text,idle_intervals jsonb,recognition_enabled boolean)
language plpgsql stable security invoker set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'Sign in required' using errcode='42501'; end if;
 if p_filter is null or p_filter not in('all','completed','incomplete','abandoned') or p_limit is null or p_limit<1 or p_limit>51 or (p_before is null)<>(p_before_id is null) then raise exception 'Invalid history page' using errcode='22023'; end if;
 return query with page as materialized (
 select w.* from public.workout_sessions w where w.owner_id=auth.uid()
 and (p_before is null or (w.started_at,w.id)<(p_before,p_before_id))
 and (p_filter='all' or p_filter='completed' and w.status='completed' or p_filter='abandoned' and w.status='abandoned' or p_filter='incomplete' and (w.status='in_progress' or w.status='completed' and coalesce((select c.completion_status from public.workout_program_classifications(array[w.id])c),w.completion_status)<>'full'))
 order by w.started_at desc,w.id desc limit p_limit
 ), classifications as materialized(select * from public.workout_program_classifications((select coalesce(array_agg(page.id),array[]::uuid[]) from page))), training as materialized(select * from public.workout_training_summary((select coalesce(array_agg(page.id),array[]::uuid[]) from page)))
 select w.id,w.name,w.status,coalesce(c.completion_status,w.completion_status),w.started_at,w.finished_at,
 (select count(*) from public.workout_exercises e where e.workout_session_id=w.id and e.owner_id=auth.uid() and e.removed_at is null),
 case when w.status='completed' then coalesce(max(t.working_sets),0) else count(s.id) filter(where s.status='completed' and s.set_type<>'warm_up' and coalesce(nullif(e.logging_kind,'legacy'),public.exercise_logging_kind(e.exercise_id)) not in('assisted','duration')) end,
 count(s.id) filter(where s.status='completed' and s.set_type='warm_up' and coalesce(nullif(e.logging_kind,'legacy'),public.exercise_logging_kind(e.exercise_id)) not in('assisted','duration')),
 count(s.id) filter(where s.status<>'completed'),w.effective_finished_at,w.duration_kind,w.closure_reason,w.idle_intervals,w.recognition_enabled
 from page w left join classifications c on c.session_id=w.id left join training t on t.session_id=w.id left join public.workout_exercises e on e.workout_session_id=w.id and e.owner_id=auth.uid() and e.removed_at is null
 left join public.workout_sets s on s.workout_exercise_id=e.id and s.owner_id=auth.uid() and s.deleted_at is null
 group by w.id,w.name,w.status,w.completion_status,c.completion_status,w.started_at,w.finished_at,w.effective_finished_at,w.duration_kind,w.closure_reason,w.idle_intervals,w.recognition_enabled order by w.started_at desc,w.id desc;
end $$;
-- Historical classifications are projected, not backfilled into immutable actual history.
commit;
