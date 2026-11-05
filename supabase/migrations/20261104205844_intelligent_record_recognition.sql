-- Phase 6.3: recognition is a read-only presentation layer; exact record truth is unchanged.
begin;
create function public.achievement_candidates(p_sessions uuid[]) returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare result jsonb;
begin
 if auth.uid() is null then raise exception 'Sign in required' using errcode='42501';end if;
 if p_sessions is null or cardinality(p_sessions)>51 then raise exception 'Invalid achievement page' using errcode='22023';end if;
 with chosen as materialized(select w.id from public.workout_sessions w where w.owner_id=auth.uid() and w.id=any(p_sessions) and w.status='completed' and w.recognition_enabled), ids as (
 select coalesce(array_agg(distinct e.exercise_id),'{}'::uuid[]) as ids from public.workout_exercises e join chosen w on w.id=e.workout_session_id where e.owner_id=auth.uid() and e.removed_at is null
 ), metrics as materialized(select * from public.record_metrics(null,(select ids from ids))), performances as materialized(select * from public.record_performances(null,(select ids from ids))), improvements as (
 select t.*,prior.value as previous_value from metrics t join chosen w on w.id=t.session_id cross join lateral(
 select max(p.value) as value from metrics p where p.exercise_id=t.exercise_id and p.category=t.category and p.metric=t.metric and p.load_key=t.load_key and p.session_id<>t.session_id and (p.performed_at,p.session_id)<(t.performed_at,t.session_id)
 )prior where prior.value is not null and t.value>prior.value
 ), meaningful as (
 select i.*,exists(select 1 from performances p where p.session_id=i.session_id and p.exercise_id=i.exercise_id and p.category=i.category and p.set_id<>i.set_id and coalesce(p.weight_kg,0)>=coalesce(i.weight_kg,0) and p.reps>=i.reps and (coalesce(p.weight_kg,0)>coalesce(i.weight_kg,0) or p.reps>i.reps)) as dominated_in_session
 from improvements i where i.metric='volume' or not exists(
 select 1 from performances p where p.session_id<>i.session_id and p.exercise_id=i.exercise_id and p.category=i.category and (p.performed_at,p.session_id)<(i.performed_at,i.session_id) and coalesce(p.weight_kg,0)>=coalesce(i.weight_kg,0) and p.reps>=i.reps and (coalesce(p.weight_kg,0)>coalesce(i.weight_kg,0) or p.reps>i.reps)
 )
 ) select coalesce(jsonb_agg(to_jsonb(m)||jsonb_build_object('exercise_name',c.name) order by m.session_id,m.exercise_id,m.category,m.metric,m.load_key),'[]'::jsonb) into result from meaningful m join public.exercises c on c.id=m.exercise_id;
 return result;
end $$;
create or replace function public.workout_achievements(p_session uuid) returns jsonb language sql stable security invoker set search_path='' as $$
 select public.achievement_candidates(array[p_session]);
$$;
create or replace function public.history_achievement_counts(p_sessions uuid[]) returns jsonb language sql stable security invoker set search_path='' as $$
 select coalesce(jsonb_object_agg(session_id,count),'{}'::jsonb) from (
 select a->>'session_id' as session_id,least(count(distinct a->>'exercise_id'),3) as count from jsonb_array_elements(public.achievement_candidates(p_sessions))a group by a->>'session_id'
 )counts;
$$;
revoke all on function public.achievement_candidates(uuid[]) from public,anon,service_role;
grant execute on function public.achievement_candidates(uuid[]) to authenticated;
commit;
