-- Phase 6.2: reproducible owner-only record derivation, no mutable PR truth table.
begin;
create function public.record_performances(p_exercise uuid default null,p_ids uuid[] default null)
returns table(exercise_id uuid,session_id uuid,set_id uuid,category text,reps integer,weight_kg numeric,entered_weight numeric,entered_unit text,set_type text,performed_at timestamptz,exercise_type text)
language sql stable security invoker set search_path='' as $$
 with source as (
 select e.exercise_id,w.id as session_id,s.id as set_id,s.actual_reps,s.actual_weight_kg,s.entered_weight,s.entered_unit,s.set_type,s.completed_at,c.exercise_type,s.load_mode,
 case when e.logging_kind='legacy' then public.exercise_logging_kind(e.exercise_id) else e.logging_kind end as kind,e.logging_kind,c.owner_id as catalog_owner
 from public.workout_sessions w join public.workout_exercises e on e.workout_session_id=w.id and e.owner_id=w.owner_id
 join public.workout_sets s on s.workout_exercise_id=e.id and s.owner_id=e.owner_id join public.exercises c on c.id=e.exercise_id
 where w.owner_id=auth.uid() and w.status='completed' and e.removed_at is null and s.deleted_at is null and s.status='completed' and s.inputs_confirmed
 and s.actual_reps between 1 and 1000 and s.completed_at is not null and s.set_type<>'warm_up'
 and (p_exercise is null or e.exercise_id=p_exercise) and (p_ids is null or e.exercise_id=any(p_ids))
 ) select exercise_id,session_id,set_id,
 case when kind='bodyweight' and load_mode='bodyweight' then 'bodyweight' when kind='bodyweight' then 'added' else 'loaded' end,
 actual_reps,actual_weight_kg,entered_weight,entered_unit,set_type,completed_at,exercise_type
 from source where kind in('loaded','bodyweight')
 and (logging_kind<>'legacy' or catalog_owner is null and exercise_type in('compound','isolation') and (kind='loaded' or load_mode='bodyweight'))
 and ((kind='bodyweight' and load_mode='bodyweight' and actual_weight_kg is null) or (load_mode='external' and actual_weight_kg>0 and actual_weight_kg<>'NaN'::numeric and actual_weight_kg<=100000));
$$;
create function public.record_metrics(p_exercise uuid default null,p_ids uuid[] default null)
returns table(exercise_id uuid,session_id uuid,category text,metric text,load_key numeric,value numeric,set_id uuid,performed_at timestamptz,weight_kg numeric,reps integer,entered_weight numeric,entered_unit text)
language sql stable security invoker set search_path='' as $$
 with eligible as materialized(select * from public.record_performances(p_exercise,p_ids)), raw as (
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
create function public.personal_records(p_ids uuid[] default null,p_search text default '',p_after uuid default null,p_limit integer default 21,p_prioritized uuid[] default '{}',p_exclude uuid[] default '{}',p_exact_reps integer[] default array[1,3,5])
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare result jsonb;
begin
 if auth.uid() is null then raise exception 'Sign in required' using errcode='42501';end if;
 if p_limit is null or p_limit<1 or p_limit>51 or length(coalesce(p_search,''))>120 or coalesce(cardinality(p_ids),0)>50 or cardinality(p_prioritized)>50 or cardinality(p_exclude)>50 or cardinality(p_exact_reps)>10 or exists(select 1 from unnest(p_exact_reps) n where n<1 or n>1000) then raise exception 'Invalid record query' using errcode='22023';end if;
 with candidates as (
 select distinct p.exercise_id,c.name,c.slug,c.owner_id,case when p.exercise_id=any(p_prioritized) then 0 else 1 end as priority
 from public.record_performances(null,p_ids) p join public.exercises c on c.id=p.exercise_id
 where not(p.exercise_id=any(p_exclude)) and (coalesce(p_search,'')='' or c.name ilike '%'||p_search||'%')
 ), page as materialized(
 select * from candidates where p_after is null or (priority,exercise_id)>(case when p_after=any(p_prioritized) then 0 else 1 end,p_after) order by priority,exercise_id limit p_limit
 ), winners as (
 select m.*,row_number() over(partition by m.exercise_id,m.category,m.metric,m.load_key order by m.value desc,m.performed_at,m.set_id nulls last,m.session_id) as rank
 from public.record_metrics(null,(select coalesce(array_agg(exercise_id),'{}') from page))m
 where m.metric<>'reps_at_load' and (m.metric<>'actual_rm' or m.load_key=any(p_exact_reps))
 ), entries as (
 select p.exercise_id,p.name,p.slug,p.owner_id,p.priority,coalesce((select jsonb_agg(to_jsonb(w)-'rank' order by w.category,w.metric,w.load_key) from winners w where w.exercise_id=p.exercise_id and w.rank=1),'[]'::jsonb) as metrics from page p
 )select coalesce(jsonb_agg(to_jsonb(entries)-'priority' order by priority,exercise_id),'[]'::jsonb) into result from entries;
 return result;
end $$;
create function public.record_load_bests(p_exercise uuid,p_before numeric default null,p_category text default null,p_limit integer default 11)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare result jsonb;
begin
 if auth.uid() is null then raise exception 'Sign in required' using errcode='42501';end if;
 if p_exercise is null or p_limit is null or p_limit<1 or p_limit>21 or (p_before is null)<>(p_category is null) or p_category is not null and p_category not in('added','loaded') then raise exception 'Invalid load record page' using errcode='22023';end if;
 with best as (
 select m.*,row_number() over(partition by category,load_key order by value desc,performed_at,set_id,session_id) as rank from public.record_metrics(p_exercise)m where metric='reps_at_load'
 ), page as (
 select * from best where rank=1 and (p_before is null or (category,-load_key)>(p_category,-p_before)) order by category,load_key desc limit p_limit
 )select coalesce(jsonb_agg(to_jsonb(page)-'rank' order by category,load_key desc),'[]'::jsonb) into result from page;return result;
end $$;
create function public.workout_achievements(p_session uuid) returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare result jsonb; eligible boolean;
begin
 if auth.uid() is null then raise exception 'Sign in required' using errcode='42501';end if;
 select status='completed' and recognition_enabled into eligible from public.workout_sessions where id=p_session and owner_id=auth.uid();
 if eligible is distinct from true then return '[]'::jsonb;end if;
 with metrics as materialized(select * from public.record_metrics()), target as (
 select * from metrics where session_id=p_session
 ), improvements as (
 select t.*,prior.value as previous_value from target t cross join lateral(
 select max(p.value) as value from metrics p where p.exercise_id=t.exercise_id and p.category=t.category and p.metric=t.metric and p.load_key=t.load_key and p.session_id<>p_session and (p.performed_at,p.session_id)<(t.performed_at,t.session_id)
 )prior where prior.value is not null and t.value>prior.value
 )select coalesce(jsonb_agg(to_jsonb(i)||jsonb_build_object('exercise_name',c.name) order by i.exercise_id,i.category,i.metric,i.load_key),'[]'::jsonb) into result from improvements i join public.exercises c on c.id=i.exercise_id;return result;
end $$;
revoke all on function public.record_performances(uuid,uuid[]),public.record_metrics(uuid,uuid[]),public.personal_records(uuid[],text,uuid,integer,uuid[],uuid[],integer[]),public.record_load_bests(uuid,numeric,text,integer),public.workout_achievements(uuid) from public,anon,service_role;
grant execute on function public.record_performances(uuid,uuid[]),public.record_metrics(uuid,uuid[]),public.personal_records(uuid[],text,uuid,integer,uuid[],uuid[],integer[]),public.record_load_bests(uuid,numeric,text,integer),public.workout_achievements(uuid) to authenticated;

-- Batch counts match the at-most-three distinct-exercise presentation rule.
create function public.history_achievement_counts(p_sessions uuid[]) returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare result jsonb;
begin
 if auth.uid() is null then raise exception 'Sign in required' using errcode='42501';end if;
 if p_sessions is null or cardinality(p_sessions)>51 then raise exception 'Invalid history page' using errcode='22023';end if;
 with metrics as materialized(select * from public.record_metrics()), improvements as (
 select t.session_id,t.exercise_id from metrics t join public.workout_sessions w on w.id=t.session_id and w.owner_id=auth.uid()
 where w.id=any(p_sessions) and w.status='completed' and w.recognition_enabled and t.value>(
 select max(p.value) from metrics p where p.exercise_id=t.exercise_id and p.category=t.category and p.metric=t.metric and p.load_key=t.load_key and p.session_id<>t.session_id and (p.performed_at,p.session_id)<(t.performed_at,t.session_id))
 ), counts as (select session_id,least(count(distinct exercise_id),3) as count from improvements group by session_id)
 select coalesce(jsonb_object_agg(session_id,count),'{}'::jsonb) into result from counts;return result;
end $$;
revoke all on function public.history_achievement_counts(uuid[]) from public,anon,service_role;
grant execute on function public.history_achievement_counts(uuid[]) to authenticated;
commit;
