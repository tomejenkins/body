-- Phase 6.3: one eligibility/metric source, bounded owner-only analytics.
begin;
create function public.performance_source(p_exercise uuid,p_ids uuid[],p_from timestamptz,p_until timestamptz)
returns table(exercise_id uuid,session_id uuid,set_id uuid,category text,reps integer,weight_kg numeric,entered_weight numeric,entered_unit text,set_type text,performed_at timestamptz,exercise_type text)
language sql stable security invoker set search_path='' as $$
 with source as (
 select e.exercise_id,w.id as session_id,s.id as set_id,s.actual_reps,s.actual_weight_kg,s.entered_weight,s.entered_unit,s.set_type,s.completed_at,c.exercise_type,s.load_mode,
 case when e.logging_kind='legacy' then public.exercise_logging_kind(e.exercise_id) else e.logging_kind end as kind,e.logging_kind,c.owner_id as catalog_owner
 from public.workout_sessions w join public.workout_exercises e on e.workout_session_id=w.id and e.owner_id=w.owner_id
 join public.workout_sets s on s.workout_exercise_id=e.id and s.owner_id=e.owner_id join public.exercises c on c.id=e.exercise_id
 where (p_from is null or w.started_at>=p_from) and (p_until is null or w.started_at<p_until) and w.owner_id=auth.uid() and w.status='completed' and e.removed_at is null and s.deleted_at is null and s.status='completed' and s.inputs_confirmed
 and s.actual_reps between 1 and 1000 and s.completed_at is not null and s.set_type<>'warm_up'
 and (p_exercise is null or e.exercise_id=p_exercise) and (p_ids is null or e.exercise_id=any(p_ids))
 ) select exercise_id,session_id,set_id,
 case when kind='bodyweight' and load_mode='bodyweight' then 'bodyweight' when kind='bodyweight' then 'added' else 'loaded' end,
 actual_reps,actual_weight_kg,entered_weight,entered_unit,set_type,completed_at,exercise_type
 from source where kind in('loaded','bodyweight')
 and (logging_kind<>'legacy' or catalog_owner is null and exercise_type in('compound','isolation') and (kind='loaded' or load_mode='bodyweight'))
 and ((kind='bodyweight' and load_mode='bodyweight' and actual_weight_kg is null) or (load_mode='external' and actual_weight_kg>0 and actual_weight_kg<>'NaN'::numeric and actual_weight_kg<=100000));
$$;
create function public.performance_metrics(p_exercise uuid,p_ids uuid[],p_from timestamptz,p_until timestamptz)
returns table(exercise_id uuid,session_id uuid,category text,metric text,load_key numeric,value numeric,set_id uuid,performed_at timestamptz,weight_kg numeric,reps integer,entered_weight numeric,entered_unit text)
language sql stable security invoker set search_path='' as $$
 with eligible as materialized(select * from public.performance_source(p_exercise,p_ids,p_from,p_until)), raw as (
 select p.*,m.metric,m.load_key,m.value from eligible p cross join lateral(values
 ('heaviest'::text,0::numeric,case when p.category='loaded' then p.weight_kg end),
 ('added_load',0::numeric,case when p.category='added' then p.weight_kg end),
 -- Actual RM key is EXACT repetitions. No extrapolation or heavier-set substitution.
 ('actual_rm',p.reps::numeric,case when p.category in('loaded','added') then p.weight_kg end),
 ('estimated_1rm',0::numeric,case when p.category='loaded' and p.set_type='working' and p.exercise_type in('compound','isolation') and p.reps between 1 and 10 then case when p.reps=1 then p.weight_kg else round(p.weight_kg*(30+p.reps)/30,3) end end),
 ('reps_at_load',p.weight_kg,case when p.category in('loaded','added') then p.reps::numeric end),
 ('bodyweight_reps',0::numeric,case when p.category='bodyweight' then p.reps::numeric end)
 )m(metric,load_key,value) where m.value is not null
 ), ranked as (
 select raw.*,row_number() over(partition by exercise_id,session_id,category,metric,load_key order by value desc,performed_at,set_id) as rank from raw
 ) select exercise_id,session_id,category,metric,load_key,value,set_id,performed_at,weight_kg,reps,entered_weight,entered_unit from ranked where rank=1
 union all
 select exercise_id,session_id,category,'volume',0::numeric,sum(weight_kg*reps),null::uuid,max(performed_at),null::numeric,null::integer,null::numeric,null::text from eligible where category in('loaded','added') group by exercise_id,session_id,category;
$$;
create or replace function public.record_performances(p_exercise uuid default null,p_ids uuid[] default null)
returns table(exercise_id uuid,session_id uuid,set_id uuid,category text,reps integer,weight_kg numeric,entered_weight numeric,entered_unit text,set_type text,performed_at timestamptz,exercise_type text)
language sql stable security invoker set search_path='' as $$ select * from public.performance_source(p_exercise,p_ids,null,null); $$;
create or replace function public.record_metrics(p_exercise uuid default null,p_ids uuid[] default null)
returns table(exercise_id uuid,session_id uuid,category text,metric text,load_key numeric,value numeric,set_id uuid,performed_at timestamptz,weight_kg numeric,reps integer,entered_weight numeric,entered_unit text)
language sql stable security invoker set search_path='' as $$ select * from public.performance_metrics(p_exercise,p_ids,null,null); $$;
-- Local civil-date bounds are converted independently, including DST boundaries.
create function public.progress_window(p_range text,p_zone text) returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare today date; first_day date; until_day date;
begin
 if auth.uid() is null then raise exception 'Sign in required' using errcode='42501';end if;
 if p_range is null or p_range not in('30','90','6m','1y','all') or p_zone is null or not exists(select 1 from pg_catalog.pg_timezone_names where name=p_zone) then raise exception 'Invalid progress window' using errcode='22023';end if;
 today:=(statement_timestamp() at time zone p_zone)::date;until_day:=today+1;
 first_day:=case p_range when '30' then until_day-30 when '90' then until_day-90 when '6m' then (until_day-interval '6 months')::date when '1y' then (until_day-interval '1 year')::date else null end;
 return jsonb_build_object('range',p_range,'zone',p_zone,'today',today,'from_day',first_day,'until_day',until_day,'from',first_day::timestamp at time zone p_zone,'until',until_day::timestamp at time zone p_zone);
end $$;
create function public.exercise_progress(p_exercise uuid,p_range text default '90',p_zone text default 'UTC',p_load numeric default null,p_category text default null,p_reps integer default null) returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare bounds jsonb:=public.progress_window(p_range,p_zone); result jsonb; chosen_load numeric; chosen_category text; chosen_reps integer; loads jsonb; observed jsonb;
begin
 if p_exercise is null or (p_load is null)<>(p_category is null) or p_load is not null and (p_load<=0 or p_load>100000 or p_load<>round(p_load,3) or p_category is null) or p_category is not null and p_category not in('loaded','added') or p_reps is not null and (p_reps<1 or p_reps>1000) then raise exception 'Invalid progress selection' using errcode='22023';end if;
 with grouped as (select category,weight_kg,count(*) as uses,max(performed_at) as latest from public.performance_source(p_exercise,null,(bounds->>'from')::timestamptz,(bounds->>'until')::timestamptz) where category in('loaded','added') group by category,weight_kg order by uses desc,latest desc,category,weight_kg desc limit 20)
 select coalesce(jsonb_agg(jsonb_build_object('category',category,'kg',weight_kg) order by uses desc,latest desc,category,weight_kg desc),'[]'::jsonb) into loads from grouped;
 chosen_load:=coalesce(p_load,(loads->0->>'kg')::numeric);chosen_category:=coalesce(p_category,loads->0->>'category');
 with groups as(select reps,count(*) as uses from public.performance_source(p_exercise,null,(bounds->>'from')::timestamptz,(bounds->>'until')::timestamptz) where category in('loaded','added') group by reps order by case when reps in(1,3,5) then 0 else 1 end,uses desc,reps limit 12)
 select coalesce(jsonb_agg(reps order by case when reps in(1,3,5) then 0 else 1 end,uses desc,reps),'[]'::jsonb) into observed from groups;
 chosen_reps:=coalesce(p_reps,case when observed @> '[3]'::jsonb then 3 else (observed->>0)::int end);
 with metrics as materialized(select * from public.performance_metrics(p_exercise,null,(bounds->>'from')::timestamptz,(bounds->>'until')::timestamptz)), selected as (
 select m.* from metrics m where (m.metric<>'reps_at_load' or m.category=chosen_category and m.load_key=chosen_load) and (m.metric<>'actual_rm' or m.load_key=chosen_reps)
 ), numbered as (
 select s.*,row_number() over(partition by category,metric,load_key order by performed_at,session_id) as ordinal,count(*) over(partition by category,metric,load_key) as total from selected s
 ), bucketed as (
 select n.*,floor((ordinal-1)*178.0/total) as bucket from numbered n
 ), picked as (
 select b.*,row_number() over(partition by category,metric,load_key,bucket order by value desc,performed_at,session_id) as rank from bucketed b
 ), series as (
 select category,metric,load_key,max(total) as total_points,jsonb_agg(to_jsonb(p)-array['ordinal','total','bucket','rank'] order by performed_at,session_id) as points from picked p where total<=180 or rank=1 or ordinal in(1,total) group by category,metric,load_key
 ) select jsonb_build_object('window',bounds,'loads',loads,'selected_load',chosen_load,'selected_category',chosen_category,'observed_reps',observed,'selected_reps',chosen_reps,'series',coalesce(jsonb_agg(to_jsonb(series) order by category,metric,load_key),'[]'::jsonb)) into result from series;
 return result;
end $$;
create function public.training_progress(p_range text default '90',p_zone text default 'UTC',p_month date default null,p_exercise uuid default null) returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare bounds jsonb:=public.progress_window(p_range,p_zone); first_instant timestamptz:=(bounds->>'from')::timestamptz; until_instant timestamptz:=(bounds->>'until')::timestamptz; today date:=(bounds->>'today')::date; month_start date; first_day date; span integer; result jsonb; prior_from timestamptz; summary jsonb; previous_count bigint; calendar jsonb; exercises jsonb;
begin
 month_start:=coalesce(p_month,date_trunc('month',today)::date);
 if month_start<>date_trunc('month',month_start)::date or month_start<'1900-01-01' or month_start>(today+interval '1 year')::date then raise exception 'Invalid calendar month' using errcode='22023';end if;
 first_day:=coalesce((bounds->>'from_day')::date,(select min((w.started_at at time zone p_zone)::date) from public.workout_sessions w where w.owner_id=auth.uid() and w.status='completed'),today);
 span:=greatest(1,ceil(greatest(1,(today-date_trunc('week',first_day)::date+1))/728.0)::int); -- <=104 weekly/multi-week aggregate buckets.
 prior_from:=case when first_instant is not null then (first_day-((bounds->>'until_day')::date-first_day))::timestamp at time zone p_zone end;
 select count(*) into previous_count from public.workout_sessions w where w.owner_id=auth.uid() and w.status='completed' and prior_from is not null and w.started_at>=prior_from and w.started_at<first_instant;
 with selected as (select w.*,w.duration_kind='elapsed' and w.effective_finished_at is not null and w.activity_evidence_at is not null and w.idle_intervals='[]'::jsonb and w.effective_finished_at>=w.started_at as reliable from public.workout_sessions w where w.owner_id=auth.uid() and w.status='completed' and (first_instant is null or w.started_at>=first_instant) and w.started_at<until_instant)
 select jsonb_build_object('completed_workouts',count(*),'training_days',count(distinct (started_at at time zone p_zone)::date),'reliable_durations',count(*) filter(where reliable),'estimated_durations',count(*) filter(where duration_kind='estimated'),'unreliable_durations',count(*) filter(where not reliable and duration_kind<>'estimated'),'average_seconds',avg(extract(epoch from(effective_finished_at-started_at))) filter(where reliable),'previous_workouts',case when first_instant is not null then previous_count end,'comparison_available',first_instant is not null and count(*)>=3 and previous_count>=3,'recent_weekly_frequency',(select count(*)::numeric/4 from public.workout_sessions recent where recent.owner_id=auth.uid() and recent.status='completed' and recent.started_at>=(today-27)::timestamp at time zone p_zone and recent.started_at<until_instant)) into summary from selected;
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
revoke all on function public.performance_source(uuid,uuid[],timestamptz,timestamptz),public.performance_metrics(uuid,uuid[],timestamptz,timestamptz),public.progress_window(text,text),public.exercise_progress(uuid,text,text,numeric,text,integer),public.training_progress(text,text,date,uuid) from public,anon,service_role;
grant execute on function public.performance_source(uuid,uuid[],timestamptz,timestamptz),public.performance_metrics(uuid,uuid[],timestamptz,timestamptz),public.progress_window(text,text),public.exercise_progress(uuid,text,text,numeric,text,integer),public.training_progress(text,text,date,uuid) to authenticated;
create index workout_sessions_progress on public.workout_sessions(owner_id,started_at,id) where status='completed';
commit;
