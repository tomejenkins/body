-- Private completion statistics reuse the established qualifying performance source.
begin;
create function public.workout_training_summary(p_sessions uuid[])
returns table(session_id uuid,working_sets bigint,exercises_performed bigint)
language plpgsql stable security invoker set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'Sign in required' using errcode='42501';end if;
 if p_sessions is null or cardinality(p_sessions)>51 or array_position(p_sessions,null) is not null or array_ndims(p_sessions)>1 then raise exception 'Invalid session window' using errcode='22023';end if;
 if not exists(select 1 from public.workout_sessions w where w.owner_id=auth.uid() and w.id=any(p_sessions) and w.status='completed') then return;end if;
 return query with owned as materialized(
  select w.id,w.started_at from public.workout_sessions w where w.owner_id=auth.uid() and w.id=any(p_sessions) and w.status='completed'
 ), eligible as materialized(
  select p.session_id,p.set_id from public.performance_source(null,null,(select min(w.started_at) from owned w),(select max(w.started_at)+interval '1 microsecond' from owned w))p join owned w on w.id=p.session_id
 ) select w.id,count(p.set_id),count(distinct z.workout_exercise_id)
 from owned w left join eligible p on p.session_id=w.id left join public.workout_sets z on z.id=p.set_id and z.owner_id=auth.uid() group by w.id;
end $$;
revoke all on function public.workout_training_summary(uuid[]) from public,anon,service_role;
grant execute on function public.workout_training_summary(uuid[]) to authenticated;
create or replace function public.workout_history(p_filter text default 'all',p_before timestamptz default null,p_before_id uuid default null,p_limit integer default 21)
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
 ), training as materialized(select * from public.workout_training_summary((select coalesce(array_agg(page.id),array[]::uuid[]) from page)))
 select w.id,w.name,w.status,w.completion_status,w.started_at,w.finished_at,
 (select count(*) from public.workout_exercises e where e.workout_session_id=w.id and e.owner_id=auth.uid() and e.removed_at is null),
 case when w.status='completed' then coalesce(max(t.working_sets),0) else count(s.id) filter(where s.status='completed' and s.set_type<>'warm_up' and coalesce(nullif(e.logging_kind,'legacy'),public.exercise_logging_kind(e.exercise_id)) not in('assisted','duration')) end,
 count(s.id) filter(where s.status='completed' and s.set_type='warm_up' and coalesce(nullif(e.logging_kind,'legacy'),public.exercise_logging_kind(e.exercise_id)) not in('assisted','duration')),
 count(s.id) filter(where s.status<>'completed'),w.effective_finished_at,w.duration_kind,w.closure_reason,w.idle_intervals,w.recognition_enabled
 from page w left join training t on t.session_id=w.id left join public.workout_exercises e on e.workout_session_id=w.id and e.owner_id=auth.uid() and e.removed_at is null
 left join public.workout_sets s on s.workout_exercise_id=e.id and s.owner_id=auth.uid() and s.deleted_at is null
 group by w.id,w.name,w.status,w.completion_status,w.started_at,w.finished_at,w.effective_finished_at,w.duration_kind,w.closure_reason,w.idle_intervals,w.recognition_enabled order by w.started_at desc,w.id desc;
end $$;
commit;
