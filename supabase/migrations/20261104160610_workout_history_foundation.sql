-- Phase 6.1: owner-scoped read models and immutable measurement context.
begin;
alter table public.workout_exercises add column logging_kind text not null default 'legacy'
 check(logging_kind in('legacy','loaded','bodyweight','assisted','duration'));
-- No client INSERT/UPDATE grant: only the insert trigger assigns context.
create function public.exercise_logging_kind(p_exercise uuid) returns text language sql stable security invoker set search_path='' as $$
 select case when p_exercise in('fd19b662-ee66-593f-af14-b846eeac53a9'::uuid,'45c0443c-f5fd-5997-9e9f-db4d252da13c'::uuid,'c9ce9667-b34f-5c6f-a64b-d164d1450a54'::uuid,'561a6aab-d7b5-5daa-a8b3-41e304bf5ad9'::uuid,'920ef529-02ea-5603-a9bd-e960acdd2f40'::uuid,'10514085-6c54-5483-88b6-87f8433f97ea'::uuid,'603a99db-b243-5af5-8001-d47f662bac43'::uuid,'9f94cf49-f770-5aab-9cae-e42566942371'::uuid,'d5a6464a-be97-58d0-9236-fd52e8d3941f'::uuid) then 'duration'
 when p_exercise in('0bca06a9-efe1-58e7-876b-32b6284a2094'::uuid,'1dd29d2f-889b-5502-ad06-01b54a51c06c'::uuid) then 'assisted'
 when exists(select 1 from public.exercise_equipment q where q.exercise_id=p_exercise)
   and not exists(select 1 from public.exercise_equipment q join public.equipment_types t on t.id=q.equipment_type_id where q.exercise_id=p_exercise and t.slug not in('none','pull_up_bar','neutral_grip_handles','parallel_bars','step','suspension_trainer')) then 'bodyweight' else 'loaded' end;
$$;
create function body_private.snapshot_logging_kind() returns trigger language plpgsql security invoker set search_path='' as $$
begin new.logging_kind:=public.exercise_logging_kind(new.exercise_id); return new; end $$;
create trigger a_snapshot_logging_kind before insert on public.workout_exercises for each row execute function body_private.snapshot_logging_kind();
create function body_private.guard_supported_measurement() returns trigger language plpgsql security invoker set search_path='' as $$
declare kind text;
begin
 if current_user='authenticated' and new.status='completed' then
   select case when e.logging_kind='legacy' then public.exercise_logging_kind(e.exercise_id) else e.logging_kind end into kind from public.workout_exercises e where e.id=new.workout_exercise_id and e.owner_id=auth.uid();
   if kind in('duration','assisted') then raise exception 'This measurement requires a dedicated logging contract' using errcode='22023'; end if;
 end if;
 return new;
end $$;
create trigger supported_measurement_guard before insert or update on public.workout_sets for each row execute function body_private.guard_supported_measurement();
create index workout_history_owner_order on public.workout_sessions(owner_id,started_at desc,id desc);
create index exercise_history_owner_identity on public.workout_exercises(owner_id,exercise_id,workout_session_id) where removed_at is null;
create function public.workout_history(p_filter text default 'all',p_before timestamptz default null,p_before_id uuid default null,p_limit integer default 21)
returns table(id uuid,name text,status text,completion_status text,started_at timestamptz,finished_at timestamptz,exercise_count bigint,working_sets bigint,warm_up_sets bigint,incomplete_sets bigint)
language plpgsql stable security invoker set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'Sign in required' using errcode='42501'; end if;
 if p_filter is null or p_filter not in('all','completed','incomplete','abandoned') or p_limit is null or p_limit<1 or p_limit>51 or (p_before is null)<>(p_before_id is null) then raise exception 'Invalid history page' using errcode='22023'; end if;
 return query with page as materialized (
 select w.* from public.workout_sessions w where w.owner_id=auth.uid()
 and (p_before is null or (w.started_at,w.id)<(p_before,p_before_id))
 and (p_filter='all' or p_filter='completed' and w.status='completed' or p_filter='abandoned' and w.status='abandoned' or p_filter='incomplete' and (w.status='in_progress' or w.status='completed' and w.completion_status<>'full'))
 order by w.started_at desc,w.id desc limit p_limit
 ) select w.id,w.name,w.status,w.completion_status,w.started_at,w.finished_at,
 (select count(*) from public.workout_exercises e where e.workout_session_id=w.id and e.owner_id=auth.uid() and e.removed_at is null),
 count(s.id) filter(where s.status='completed' and s.set_type<>'warm_up' and coalesce(nullif(e.logging_kind,'legacy'),public.exercise_logging_kind(e.exercise_id)) not in('assisted','duration')),
 count(s.id) filter(where s.status='completed' and s.set_type='warm_up' and coalesce(nullif(e.logging_kind,'legacy'),public.exercise_logging_kind(e.exercise_id)) not in('assisted','duration')),
 count(s.id) filter(where s.status<>'completed')
 from page w left join public.workout_exercises e on e.workout_session_id=w.id and e.owner_id=auth.uid() and e.removed_at is null
 left join public.workout_sets s on s.workout_exercise_id=e.id and s.owner_id=auth.uid() and s.deleted_at is null
 group by w.id,w.name,w.status,w.completion_status,w.started_at,w.finished_at order by w.started_at desc,w.id desc;
end $$;
create function public.exercise_history(p_exercise uuid,p_before timestamptz default null,p_before_id uuid default null,p_limit integer default 11)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare result jsonb;
begin
 if auth.uid() is null then raise exception 'Sign in required' using errcode='42501'; end if;
 if p_exercise is null or p_limit is null or p_limit<1 or p_limit>21 or (p_before is null)<>(p_before_id is null) then raise exception 'Invalid exercise history page' using errcode='22023'; end if;
 with relevant as materialized (
 select w.id,w.name,w.started_at,w.finished_at from public.workout_sessions w
 where w.owner_id=auth.uid() and w.status='completed' and exists(
 select 1 from public.workout_exercises e join public.workout_sets s on s.workout_exercise_id=e.id and s.owner_id=e.owner_id
 where e.workout_session_id=w.id and e.owner_id=auth.uid() and e.exercise_id=p_exercise and e.removed_at is null and s.status='completed' and s.deleted_at is null
 and coalesce(nullif(e.logging_kind,'legacy'),public.exercise_logging_kind(e.exercise_id)) not in('assisted','duration'))
 ), page as materialized (
 select * from relevant where p_before is null or (finished_at,id)<(p_before,p_before_id) order by finished_at desc,id desc limit p_limit
 ), entries as (
 select p.*, representative.id as item_id,representative.exercise_name_snapshot,representative.logging_kind,
 (select jsonb_agg(to_jsonb(s)||jsonb_build_object('logging_kind',e.logging_kind) order by e.position,s.position,s.id)
 from public.workout_exercises e join public.workout_sets s on s.workout_exercise_id=e.id and s.owner_id=e.owner_id
 where e.workout_session_id=p.id and e.owner_id=auth.uid() and e.exercise_id=p_exercise and e.removed_at is null and s.status='completed' and s.deleted_at is null
 and coalesce(nullif(e.logging_kind,'legacy'),public.exercise_logging_kind(e.exercise_id)) not in('assisted','duration')) as sets
 from page p cross join lateral (
 select e.id,e.exercise_name_snapshot,e.logging_kind from public.workout_exercises e where e.workout_session_id=p.id and e.owner_id=auth.uid() and e.exercise_id=p_exercise and e.removed_at is null
 and exists(select 1 from public.workout_sets s where s.workout_exercise_id=e.id and s.status='completed' and s.deleted_at is null and s.owner_id=auth.uid()) order by e.position,e.id limit 1
 ) representative
 ) select jsonb_build_object('total_sessions',(select count(*) from relevant),'last_performed',(select max(s.completed_at) from public.workout_exercises e join public.workout_sets s on s.workout_exercise_id=e.id and s.owner_id=e.owner_id join relevant r on r.id=e.workout_session_id where e.owner_id=auth.uid() and e.exercise_id=p_exercise and e.removed_at is null and s.status='completed' and s.deleted_at is null and coalesce(nullif(e.logging_kind,'legacy'),public.exercise_logging_kind(e.exercise_id)) not in('assisted','duration')),'entries',coalesce((select jsonb_agg(to_jsonb(entries) order by finished_at desc,id desc) from entries),'[]'::jsonb)) into result;
 return result;
end $$;
revoke all on function public.exercise_logging_kind(uuid),public.workout_history(text,timestamptz,uuid,integer),public.exercise_history(uuid,timestamptz,uuid,integer) from public,anon,service_role;
grant execute on function public.exercise_logging_kind(uuid),public.workout_history(text,timestamptz,uuid,integer),public.exercise_history(uuid,timestamptz,uuid,integer) to authenticated;
revoke all on all functions in schema body_private from public,anon,authenticated,service_role;
create or replace function public.start_ad_hoc_workout() returns uuid language plpgsql security invoker set search_path='' as $$
declare uid uuid:=auth.uid(); result_id uuid;
begin
 if uid is null then raise exception 'Sign in required' using errcode='42501'; end if;
 for attempt in 1..3 loop
   insert into public.workout_sessions(owner_id,name) values(uid,'Workout')
     on conflict(owner_id) where status='in_progress' do nothing returning id into result_id;
   if result_id is not null then return result_id; end if;
   select id into result_id from public.workout_sessions where owner_id=uid and status='in_progress';
   if result_id is not null then return result_id; end if;
 end loop;
 raise exception 'Workout changed concurrently. Retry.' using errcode='40001';
end $$;

commit;
