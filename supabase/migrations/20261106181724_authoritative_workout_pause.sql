-- Manual pauses refine existing continuity; historical session times stay intact.
begin;
alter table public.workout_sessions
 add column manual_paused_at timestamptz,
 add column manual_pause_intervals jsonb not null default '[]'::jsonb check(jsonb_typeof(manual_pause_intervals)='array'),
 add column timer_revision integer not null default 0 check(timer_revision>=0),
 add column timer_command jsonb;
grant update(timer_command) on public.workout_sessions to authenticated;

create function public.workout_active_seconds(p_session uuid) returns numeric
language sql stable security invoker set search_path='' as $$
 with target as (
 select w.*,case when w.status='in_progress' then statement_timestamp() when w.duration_kind='legacy' then w.finished_at else w.effective_finished_at end as endpoint
 from public.workout_sessions w where w.id=p_session and w.owner_id=auth.uid()
 ), intervals as (
 select w.*,w.manual_pause_intervals || case when w.manual_paused_at is not null then jsonb_build_array(jsonb_build_object('from',w.manual_paused_at,'to',w.endpoint)) else '[]'::jsonb end as pauses from target w
 ) select case when endpoint is null then null else greatest(0,extract(epoch from(endpoint-started_at))-
 coalesce((select sum(greatest(0,extract(epoch from(least((x->>'to')::timestamptz,w.endpoint)-greatest((x->>'from')::timestamptz,w.started_at))))) from jsonb_array_elements(w.pauses)x),0)) end from intervals w;
$$;
revoke all on function public.workout_active_seconds(uuid) from public,anon,service_role;
grant execute on function public.workout_active_seconds(uuid) to authenticated;

create function body_private.workout_timer_input() returns trigger
language plpgsql security invoker set search_path='' as $$
declare instant timestamptz:=clock_timestamp();desired boolean;
begin
 if current_user<>'authenticated' then return new;end if;
 if row(new.manual_paused_at,new.manual_pause_intervals,new.timer_revision) is distinct from row(old.manual_paused_at,old.manual_pause_intervals,old.timer_revision) then raise exception 'Server-owned timer fields' using errcode='23514';end if;
 if old.status<>'in_progress' then raise exception 'Workout closed' using errcode='23514';end if;
 if new.timer_command is distinct from old.timer_command then
  if old.last_activity_at is null then raise exception 'Resume this legacy workout before using its timer' using errcode='23514';end if;
  if new.timer_command is null or jsonb_typeof(new.timer_command)<>'object' or (select count(*) from jsonb_object_keys(new.timer_command))<>3
   or jsonb_typeof(new.timer_command->'paused') is distinct from 'boolean' or jsonb_typeof(new.timer_command->'revision') is distinct from 'number'
   or coalesce(new.timer_command->>'revision','')!~'^[0-9]+$' or new.timer_command->>'request' is null then raise exception 'Invalid timer command' using errcode='22023';end if;
  perform (new.timer_command->>'request')::uuid;
  if (new.timer_command->>'revision')::integer<>old.timer_revision then raise exception 'Timer changed elsewhere' using errcode='40001';end if;
  desired:=(new.timer_command->>'paused')::boolean;
  if desired and old.manual_paused_at is null then new.manual_paused_at:=instant;new.timer_revision:=old.timer_revision+1;
  elsif not desired and old.manual_paused_at is not null then
   new.manual_pause_intervals:=old.manual_pause_intervals||jsonb_build_array(jsonb_build_object('from',old.manual_paused_at,'to',greatest(instant,old.manual_paused_at)));
   new.manual_paused_at:=null;new.timer_revision:=old.timer_revision+1;
  end if;
 elsif old.manual_paused_at is not null and (new.status<>'in_progress' or new.continuation_nonce is distinct from old.continuation_nonce or pg_trigger_depth()>1 or new.name is distinct from old.name or new.notes is distinct from old.notes) then
  -- Existing verified activity resumes; passive reads and no-op updates do not.
  new.manual_pause_intervals:=old.manual_pause_intervals||jsonb_build_array(jsonb_build_object('from',old.manual_paused_at,'to',greatest(instant,old.manual_paused_at)));
  new.manual_paused_at:=null;new.timer_revision:=old.timer_revision+1;
 end if;
 return new;
end $$;
create trigger a0_workout_timer before update on public.workout_sessions for each row execute function body_private.workout_timer_input();

create or replace function public.workout_continuity(p_session uuid default null,p_resume_nonce uuid default null) returns jsonb language plpgsql security invoker set search_path='' as $$
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
 return jsonb_build_object('id',entry.id,'status',entry.status,'state',state,'server_now',instant,'started_at',entry.started_at,'last_activity_at',entry.last_activity_at,'activity_evidence_at',entry.activity_evidence_at,'finished_at',entry.finished_at,'effective_finished_at',entry.effective_finished_at,'duration_kind',entry.duration_kind,'closure_reason',entry.closure_reason,'idle_intervals',entry.idle_intervals,'completed',completed,'total',total,'continuation_count',entry.continuation_count,'manual_paused_at',entry.manual_paused_at,'manual_pause_intervals',entry.manual_pause_intervals,'timer_revision',entry.timer_revision,'effective_elapsed_seconds',public.workout_active_seconds(entry.id));
end $$;

create function public.set_workout_pause(p_session uuid,p_paused boolean,p_revision integer,p_request uuid) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare w public.workout_sessions;state jsonb;command jsonb;
begin
 if auth.uid() is null then raise exception 'Sign in required' using errcode='42501';end if;
 if p_paused is null or p_revision is null or p_revision<0 or p_request is null then raise exception 'Invalid timer command' using errcode='22023';end if;
 select * into w from public.workout_sessions where id=p_session and owner_id=auth.uid() for update;
 if w.id is null then raise exception 'Workout unavailable' using errcode='42501';end if;
 state:=public.workout_continuity(p_session);
 if state->>'state'='expired' then return state;end if;
 if state->>'status'<>'in_progress' then raise exception 'Workout closed' using errcode='23514';end if;
 command:=jsonb_build_object('paused',p_paused,'revision',p_revision,'request',p_request);
 if w.timer_command->>'request'=p_request::text then
  if w.timer_command is distinct from command then raise exception 'Timer request reused' using errcode='23514';end if;
  return public.workout_continuity(p_session);
 end if;
 if w.timer_revision<>p_revision then raise exception 'Timer changed elsewhere' using errcode='40001';end if;
 update public.workout_sessions set timer_command=command where id=w.id and owner_id=auth.uid();
 return public.workout_continuity(p_session);
end $$;
revoke all on function public.set_workout_pause(uuid,boolean,integer,uuid) from public,anon,service_role;
grant execute on function public.set_workout_pause(uuid,boolean,integer,uuid) to authenticated;

create or replace function public.training_progress(p_range text default '90',p_zone text default 'UTC',p_month date default null,p_exercise uuid default null) returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare bounds jsonb:=public.progress_window(p_range,p_zone); first_instant timestamptz:=(bounds->>'from')::timestamptz; until_instant timestamptz:=(bounds->>'until')::timestamptz; today date:=(bounds->>'today')::date; month_start date; first_day date; span integer; result jsonb; prior_from timestamptz; summary jsonb; previous_count bigint; calendar jsonb; exercises jsonb;
begin
 month_start:=coalesce(p_month,date_trunc('month',today)::date);
 if month_start<>date_trunc('month',month_start)::date or month_start<'1900-01-01' or month_start>(today+interval '1 year')::date then raise exception 'Invalid calendar month' using errcode='22023';end if;
 first_day:=coalesce((bounds->>'from_day')::date,(select min((w.started_at at time zone p_zone)::date) from public.workout_sessions w where w.owner_id=auth.uid() and w.status='completed'),today);
 span:=greatest(1,ceil(greatest(1,(today-date_trunc('week',first_day)::date+1))/728.0)::int); -- <=104 weekly/multi-week aggregate buckets.
 prior_from:=case when first_instant is not null then (first_day-((bounds->>'until_day')::date-first_day))::timestamp at time zone p_zone end;
 select count(*) into previous_count from public.workout_sessions w where w.owner_id=auth.uid() and w.status='completed' and prior_from is not null and w.started_at>=prior_from and w.started_at<first_instant;
 with selected as (select w.*,w.duration_kind='elapsed' and w.effective_finished_at is not null and w.activity_evidence_at is not null and w.idle_intervals='[]'::jsonb and w.effective_finished_at>=w.started_at as reliable from public.workout_sessions w where w.owner_id=auth.uid() and w.status='completed' and (first_instant is null or w.started_at>=first_instant) and w.started_at<until_instant)
 select jsonb_build_object('completed_workouts',count(*),'training_days',count(distinct (started_at at time zone p_zone)::date),'reliable_durations',count(*) filter(where reliable),'estimated_durations',count(*) filter(where duration_kind='estimated'),'unreliable_durations',count(*) filter(where not reliable and duration_kind<>'estimated'),'average_seconds',avg(public.workout_active_seconds(id)) filter(where reliable),'previous_workouts',case when first_instant is not null then previous_count end,'comparison_available',first_instant is not null and count(*)>=3 and previous_count>=3,'recent_weekly_frequency',(select count(*)::numeric/4 from public.workout_sessions recent where recent.owner_id=auth.uid() and recent.status='completed' and recent.started_at>=(today-27)::timestamp at time zone p_zone and recent.started_at<until_instant)) into summary from selected;
 with days as(select (w.started_at at time zone p_zone)::date as day,count(*) as workouts,(array_agg(w.id order by w.started_at,w.id))[1] as first_session from public.workout_sessions w where w.owner_id=auth.uid() and w.status='completed' and w.started_at>=month_start::timestamp at time zone p_zone and w.started_at<(month_start+interval '1 month')::timestamp at time zone p_zone group by (w.started_at at time zone p_zone)::date)
 select coalesce(jsonb_agg(to_jsonb(days) order by day),'[]'::jsonb) into calendar from days;
 with options as(select e.exercise_id,c.name,count(*) as sets from public.performance_source(null,null,first_instant,until_instant)e join public.exercises c on c.id=e.exercise_id group by e.exercise_id,c.name order by sets desc,e.exercise_id limit 20)
 select coalesce(jsonb_agg(to_jsonb(options) order by sets desc,exercise_id),'[]'::jsonb) into exercises from options;
 with sets as materialized(select p.*,((w.started_at at time zone p_zone)::date) as day from public.performance_source(null,null,first_instant,until_instant)p join public.workout_sessions w on w.id=p.session_id and w.owner_id=auth.uid()), dated as (
 select s.*,date_trunc('week',first_day)::date+(floor((day-date_trunc('week',first_day)::date)/(7.0*span))::int*7*span) as week from sets s
 ), weekly as (select week,week+7*span as until_day,count(*) as working_sets,count(*) filter(where category='bodyweight') as bodyweight_sets,coalesce(sum(reps) filter(where category='bodyweight'),0) as bodyweight_reps from dated group by week),
 volumes as (select week,week+7*span as until_day,exercise_id,category,sum(weight_kg*reps) as value from dated where category in('loaded','added') and exercise_id=coalesce(p_exercise,(exercises->0->>'exercise_id')::uuid) group by week,exercise_id,category),
 muscle_rows as (
 select d.week,d.set_id,m.muscle_group_id,g.name,m.muscle_role from dated d join public.exercise_muscles m on m.exercise_id=d.exercise_id join public.muscle_groups g on g.id=m.muscle_group_id
 union all select d.week,d.set_id,null::uuid,'Unclassified','primary' from dated d where not exists(select 1 from public.exercise_muscles m where m.exercise_id=d.exercise_id and m.muscle_role='primary')
 ), muscles as(select week,week+7*span as until_day,muscle_group_id,name,count(distinct set_id) filter(where muscle_role='primary') as primary_sets,count(distinct set_id) filter(where muscle_role='secondary') as secondary_sets from muscle_rows group by week,muscle_group_id,name)
 select jsonb_build_object('window',bounds,'summary',summary,'calendar_month',month_start,'calendar',calendar,'bucket_weeks',span,'exercises',exercises,'selected_exercise',coalesce(p_exercise,(exercises->0->>'exercise_id')::uuid),'weekly',coalesce((select jsonb_agg(to_jsonb(weekly) order by week) from weekly),'[]'::jsonb),'volumes',coalesce((select jsonb_agg(to_jsonb(volumes) order by week,category) from volumes),'[]'::jsonb),'muscles',coalesce((select jsonb_agg(to_jsonb(muscles) order by week,name) from muscles),'[]'::jsonb),'working_sets',(select count(*) from sets)) into result;
 return result;
end $$;
revoke all on all functions in schema body_private from public,anon,authenticated,service_role;
commit;
