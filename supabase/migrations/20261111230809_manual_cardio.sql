-- Manual duration evidence is independent from strength sets and program work.
begin;
create table public.workout_cardio_commands (
 owner_id uuid not null default auth.uid(),request_id uuid not null,
 workout_session_id uuid not null,item_id uuid not null,
 operation text not null check(operation in('add','save','remove')),
 expected_revision bigint not null check(expected_revision>=0),revision bigint not null,
 activity text not null check(activity in('treadmill','outdoor_run','elliptical','bike','stationary_bike')),
 duration_seconds integer check(duration_seconds between 1 and 86400),
 created_at timestamptz not null default clock_timestamp(),
 primary key(owner_id,request_id),unique(owner_id,item_id,revision),
 foreign key(workout_session_id,owner_id) references public.workout_sessions(id,owner_id) on delete cascade,
 check((operation='save' and duration_seconds is not null) or (operation<>'save' and duration_seconds is null))
);
create index workout_cardio_latest on public.workout_cardio_commands(owner_id,workout_session_id,item_id,revision desc);
alter table public.workout_cardio_commands enable row level security;
revoke all on public.workout_cardio_commands from public,anon,authenticated,service_role;
grant select on public.workout_cardio_commands to authenticated;
grant insert(request_id,workout_session_id,item_id,operation,expected_revision,activity,duration_seconds) on public.workout_cardio_commands to authenticated;
create policy owner_read on public.workout_cardio_commands for select to authenticated using(owner_id=(select auth.uid()));
create policy owner_insert on public.workout_cardio_commands for insert to authenticated with check(owner_id=(select auth.uid()));
create function public.workout_cardio_items(p_session uuid) returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare result jsonb;begin
 if auth.uid() is null or not exists(select 1 from public.workout_sessions where id=p_session and owner_id=auth.uid()) then raise exception 'Workout unavailable' using errcode='42501';end if;
 with latest as(select distinct on(item_id) * from public.workout_cardio_commands where owner_id=auth.uid() and workout_session_id=p_session order by item_id,revision desc), original as(select item_id,min(created_at) as added_at from public.workout_cardio_commands where owner_id=auth.uid() and workout_session_id=p_session group by item_id)
 select coalesce(jsonb_agg(jsonb_build_object('id',c.item_id,'revision',c.revision,'activity',c.activity,'durationSeconds',c.duration_seconds,'completedAt',case when c.operation='save' then c.created_at end) order by o.added_at,c.item_id),'[]'::jsonb) into result from latest c join original o using(item_id) where c.operation<>'remove';
 return result;end $$;
create function body_private.workout_cardio_input() returns trigger language plpgsql security invoker set search_path='' as $$
declare w public.workout_sessions;prior public.workout_cardio_commands;begin
 if auth.uid() is null or new.owner_id is distinct from auth.uid() then raise exception 'Owned cardio required' using errcode='42501';end if;
 select * into w from public.workout_sessions where id=new.workout_session_id and owner_id=auth.uid() for update;
 if w.id is null then raise exception 'Workout unavailable' using errcode='42501';end if;
 if w.status<>'in_progress' or w.archived_at is not null or (public.workout_continuity(w.id)->>'state') in('expired','check_in') then raise exception 'Active workout required; refresh' using errcode='23514';end if;
 select * into prior from public.workout_cardio_commands where owner_id=auth.uid() and item_id=new.item_id order by revision desc limit 1;
 if new.operation='add' then
  if prior.item_id is not null or new.expected_revision<>0 then raise exception 'Cardio changed; refresh' using errcode='40001';end if;
  if jsonb_array_length(public.workout_cardio_items(w.id))>=20 then raise exception 'Maximum 20 cardio items' using errcode='23514';end if;
 else
  if prior.item_id is null or prior.workout_session_id<>w.id or prior.operation='remove' then raise exception 'Cardio unavailable' using errcode='42501';end if;
  if prior.revision<>new.expected_revision then raise exception 'Cardio changed; refresh' using errcode='40001';end if;
  if prior.activity<>new.activity then raise exception 'Cardio activity is immutable' using errcode='23514';end if;
 end if;
 if (select count(*) from public.workout_cardio_commands where owner_id=auth.uid() and workout_session_id=w.id)>=1000 then raise exception 'Cardio edit limit reached' using errcode='23514';end if;
 new.revision:=new.expected_revision+1;new.created_at:=clock_timestamp();return new;end $$;
create trigger workout_cardio_input before insert on public.workout_cardio_commands for each row execute function body_private.workout_cardio_input();
-- The same trigger transport used by selections/sets: authoritative saved activity
-- resumes a manual pause; reads and identical receipt retries never touch timing.
create function body_private.cardio_activity() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 update public.workout_sessions set name=name where id=new.workout_session_id and owner_id=auth.uid() and status='in_progress';return null;
end $$;
create trigger cardio_activity after insert on public.workout_cardio_commands for each row execute function body_private.cardio_activity();
create function public.record_workout_cardio(p_session uuid,p_item uuid,p_operation text,p_expected bigint,p_activity text,p_seconds integer,p_request uuid) returns jsonb language plpgsql security invoker set search_path='' as $$
declare r public.workout_cardio_commands;begin
 if auth.uid() is null then raise exception 'Sign in required' using errcode='42501';end if;
 if p_session is null or p_item is null or p_request is null or p_expected is null or p_expected<0 or p_operation is null or p_operation not in('add','save','remove') or p_activity is null or p_activity not in('treadmill','outdoor_run','elliptical','bike','stationary_bike') or (p_operation='save' and (p_seconds is null or p_seconds not between 1 and 86400)) or (p_operation<>'save' and p_seconds is not null) then raise exception 'Invalid cardio command' using errcode='22023';end if;
 perform 1 from public.workout_sessions where id=p_session and owner_id=auth.uid() for update;
 select * into r from public.workout_cardio_commands where owner_id=auth.uid() and request_id=p_request;
 if r.request_id is not null then
  if row(r.workout_session_id,r.item_id,r.operation,r.expected_revision,r.activity,r.duration_seconds) is distinct from row(p_session,p_item,p_operation,p_expected,p_activity,p_seconds) then raise exception 'Cardio request reused' using errcode='23514';end if;
 else
  if (public.workout_continuity(p_session)->>'state')='expired' then return null;end if;
  insert into public.workout_cardio_commands(request_id,workout_session_id,item_id,operation,expected_revision,activity,duration_seconds) values(p_request,p_session,p_item,p_operation,p_expected,p_activity,p_seconds) returning * into r;
 end if;
 return jsonb_build_object('itemId',r.item_id,'items',public.workout_cardio_items(p_session));end $$;
create function public.workout_cardio_summary(p_sessions uuid[]) returns table(session_id uuid,cardio_items bigint,cardio_seconds bigint,pending_cardio bigint) language plpgsql stable security invoker set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'Sign in required' using errcode='42501';end if;
 if p_sessions is null or cardinality(p_sessions)>51 then raise exception 'Bounded sessions required' using errcode='22023';end if;
 return query with latest as (select distinct on(c.item_id) c.* from public.workout_cardio_commands c where c.owner_id=auth.uid() and c.workout_session_id=any(p_sessions) order by c.item_id,c.revision desc)
 select w.id,count(c.item_id) filter(where c.operation='save'),coalesce(sum(c.duration_seconds) filter(where c.operation='save'),0),count(c.item_id) filter(where c.operation='add') from public.workout_sessions w left join latest c on c.workout_session_id=w.id where w.owner_id=auth.uid() and w.id=any(p_sessions) group by w.id;
end $$;
revoke all on function public.workout_cardio_items(uuid),public.record_workout_cardio(uuid,uuid,text,bigint,text,integer,uuid),public.workout_cardio_summary(uuid[]) from public,anon,service_role;
grant execute on function public.workout_cardio_items(uuid),public.record_workout_cardio(uuid,uuid,text,bigint,text,integer,uuid),public.workout_cardio_summary(uuid[]) to authenticated;
revoke all on function body_private.workout_cardio_input(),body_private.cardio_activity() from public,anon,authenticated,service_role;
-- A finished cardio-only session is not an incomplete strength workout.
-- Existing program and strength classifications remain authoritative.
create or replace function public.workout_history(p_filter text default 'all',p_before timestamptz default null,p_before_id uuid default null,p_limit integer default 21)
returns table(id uuid,name text,status text,completion_status text,started_at timestamptz,finished_at timestamptz,exercise_count bigint,working_sets bigint,warm_up_sets bigint,incomplete_sets bigint,effective_finished_at timestamptz,duration_kind text,closure_reason text,idle_intervals jsonb,recognition_enabled boolean)
language plpgsql stable security invoker set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'Sign in required' using errcode='42501'; end if;
 if p_filter is null or p_filter not in('all','completed','incomplete','abandoned','archived') or p_limit is null or p_limit<1 or p_limit>51 or (p_before is null)<>(p_before_id is null) then raise exception 'Invalid history page' using errcode='22023'; end if;
 return query with page as materialized (
 select w.* from public.workout_sessions w where w.owner_id=auth.uid() and (case when p_filter='archived' then w.archived_at is not null else w.archived_at is null end)
 and (p_before is null or (w.started_at,w.id)<(p_before,p_before_id))
 and (p_filter in('all','archived') or p_filter='completed' and w.status='completed' or p_filter='abandoned' and w.status='abandoned' or p_filter='incomplete' and (w.status='in_progress' or w.status='completed' and coalesce((select c.completion_status from public.workout_program_classifications(array[w.id])c),w.completion_status)<>'full') and not (w.status='completed' and w.source_program_version_id is null and not exists(select 1 from public.workout_exercises ce where ce.owner_id=auth.uid() and ce.workout_session_id=w.id and ce.removed_at is null) and exists(select 1 from public.workout_cardio_summary(array[w.id])cc where cc.cardio_items>0 and cc.pending_cardio=0)))
 order by w.started_at desc,w.id desc limit p_limit
 ), classifications as materialized(select * from public.workout_evidence_classifications((select coalesce(array_agg(page.id),array[]::uuid[]) from page),true)), training as materialized(select * from public.workout_evidence_summary((select coalesce(array_agg(page.id),array[]::uuid[]) from page),true))
 select w.id,w.name,w.status,coalesce(c.completion_status,w.completion_status),w.started_at,w.finished_at,
 (select count(*) from public.workout_exercises e where e.workout_session_id=w.id and e.owner_id=auth.uid() and e.removed_at is null),
 case when w.status='completed' then coalesce(max(t.working_sets),0) else count(s.id) filter(where s.status='completed' and s.set_type<>'warm_up' and coalesce(nullif(e.logging_kind,'legacy'),public.exercise_logging_kind(e.exercise_id)) not in('assisted','duration')) end,
 count(s.id) filter(where s.status='completed' and s.set_type='warm_up' and coalesce(nullif(e.logging_kind,'legacy'),public.exercise_logging_kind(e.exercise_id)) not in('assisted','duration')),
 count(s.id) filter(where s.status<>'completed'),w.effective_finished_at,w.duration_kind,w.closure_reason,w.idle_intervals,(w.recognition_enabled and w.archived_at is null)
 from page w left join classifications c on c.session_id=w.id left join training t on t.session_id=w.id left join public.workout_exercises e on e.workout_session_id=w.id and e.owner_id=auth.uid() and e.removed_at is null
 left join public.workout_sets s on s.workout_exercise_id=e.id and s.owner_id=auth.uid() and s.deleted_at is null
 group by w.id,w.name,w.status,w.completion_status,c.completion_status,w.started_at,w.finished_at,w.effective_finished_at,w.duration_kind,w.closure_reason,w.idle_intervals,w.recognition_enabled,w.archived_at order by w.started_at desc,w.id desc;
end $$;
commit;
