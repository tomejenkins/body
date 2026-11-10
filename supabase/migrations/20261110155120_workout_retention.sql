begin;
alter table public.workout_sessions add column archived_at timestamptz,add column retention_revision bigint not null default 0 check(retention_revision>=0),add column retention_command uuid;
create index workout_retention_history on public.workout_sessions(owner_id,started_at desc,id desc) where archived_at is not null;
create table public.workout_retention_receipts(
 id uuid primary key default gen_random_uuid(),owner_id uuid not null references public.profiles(id) on delete cascade,
 request_id uuid not null,session_id uuid not null,kind text not null check(kind in('archive','restore','delete')),
 expected_revision bigint not null check(expected_revision>=0),result_revision bigint not null,created_at timestamptz not null default clock_timestamp(),start_requests jsonb not null default '{}'::jsonb,
 unique(owner_id,request_id));
create unique index workout_deleted_once on public.workout_retention_receipts(owner_id,session_id) where kind='delete';
alter table public.workout_retention_receipts enable row level security;
revoke all on public.workout_retention_receipts from public,anon,authenticated,service_role;
grant select on public.workout_retention_receipts to authenticated;
grant insert(owner_id,request_id,session_id,kind,expected_revision) on public.workout_retention_receipts to authenticated;
create policy owner_read on public.workout_retention_receipts for select to authenticated using(owner_id=(select auth.uid()));
create policy owner_insert on public.workout_retention_receipts for insert to authenticated with check(owner_id=(select auth.uid()));
grant update(retention_command),delete on public.workout_sessions to authenticated;
create policy retention_delete on public.workout_sessions for delete to authenticated using(owner_id=(select auth.uid()));
create function public.workout_delete_authorized(p_session uuid) returns boolean language sql stable security invoker set search_path='' as $$
 select pg_catalog.pg_trigger_depth()>1 and exists(select 1 from public.workout_retention_receipts r where r.owner_id=auth.uid() and r.session_id=p_session and r.kind='delete');
$$;
create function body_private.retention_receipt_input() returns trigger language plpgsql security invoker set search_path='' as $$
declare w public.workout_sessions;
begin
 if current_user<>'authenticated' then return new;end if;
 if auth.uid() is null or new.owner_id is distinct from auth.uid() then raise exception 'Owned retention request required' using errcode='42501';end if;
 perform 1 from public.profiles where id=auth.uid() for update;
 select * into w from public.workout_sessions where id=new.session_id and owner_id=auth.uid() for update;
 if w.id is null then raise exception 'Workout unavailable' using errcode='42501';end if;
 if w.status='in_progress' then raise exception 'Finish or abandon this workout first' using errcode='23514';end if;
 if w.retention_revision is distinct from new.expected_revision then raise exception 'Workout changed; refresh' using errcode='40001';end if;
 if new.kind='archive' and w.archived_at is not null or new.kind='restore' and w.archived_at is null then raise exception 'Retention state changed; refresh' using errcode='23514';end if;
 new.created_at:=clock_timestamp();new.result_revision:=w.retention_revision+1;new.start_requests:='{}'::jsonb;
 if new.kind='delete' then new.start_requests:=jsonb_strip_nulls(jsonb_build_object('program_start_nonce',w.program_start_nonce,'ad_hoc_start_nonce',w.ad_hoc_start_nonce,'favorite_start_nonce',w.favorite_start_nonce));end if;
 return new;
end $$;
create trigger retention_receipt_input before insert on public.workout_retention_receipts for each row execute function body_private.retention_receipt_input();
create function body_private.workout_retention_input() returns trigger language plpgsql security invoker set search_path='' as $$
declare r public.workout_retention_receipts;
begin
 if current_user<>'authenticated' then if tg_op='DELETE' then return old;else return new;end if;end if;
 if tg_op='DELETE' then
  if old.owner_id is distinct from auth.uid() or old.status='in_progress' or not public.workout_delete_authorized(old.id) then raise exception 'Validated closed-workout deletion required' using errcode='23514';end if;return old;
 elsif tg_op='INSERT' then
  if new.archived_at is not null or new.retention_revision<>0 or new.retention_command is not null then raise exception 'Server-owned retention fields' using errcode='23514';end if;
  if exists(select 1 from public.workout_retention_receipts retired where retired.owner_id=auth.uid() and retired.kind='delete' and (retired.session_id=new.id or new.program_start_nonce is not null and retired.start_requests->>'program_start_nonce'=new.program_start_nonce::text or new.ad_hoc_start_nonce is not null and retired.start_requests->>'ad_hoc_start_nonce'=new.ad_hoc_start_nonce::text or new.favorite_start_nonce is not null and retired.start_requests->>'favorite_start_nonce'=new.favorite_start_nonce::text)) then raise exception 'Deleted workout request cannot be restarted' using errcode='23514';end if;
 else
  if row(new.archived_at,new.retention_revision) is distinct from row(old.archived_at,old.retention_revision) then raise exception 'Server-owned retention fields' using errcode='23514';end if;
  if new.retention_command is not distinct from old.retention_command then return new;end if;
  select * into r from public.workout_retention_receipts where id=new.retention_command and owner_id=auth.uid();
  if r.id is null or r.session_id<>old.id or r.expected_revision<>old.retention_revision or r.kind not in('archive','restore') or old.status='in_progress' then raise exception 'Validated retention command required' using errcode='23514';end if;
  if (to_jsonb(new)-array['retention_command','updated_at']) is distinct from (to_jsonb(old)-array['retention_command','updated_at']) then raise exception 'Only retention may change' using errcode='23514';end if;
  new.archived_at:=case when r.kind='archive' then r.created_at end;new.retention_revision:=r.result_revision;
 end if;return new;
end $$;
create trigger a0_workout_retention before insert or update or delete on public.workout_sessions for each row execute function body_private.workout_retention_input();
create function body_private.apply_workout_retention() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if current_user<>'authenticated' then return new;end if;
 if new.kind='delete' then
  -- Remove sets while their closed parent still exists; guards accept only this nested validated command.
  delete from public.workout_sets s using public.workout_exercises e where s.workout_exercise_id=e.id and s.owner_id=auth.uid() and e.workout_session_id=new.session_id and e.owner_id=auth.uid();
  delete from public.workout_sessions where id=new.session_id and owner_id=auth.uid();
 else update public.workout_sessions set retention_command=new.id where id=new.session_id and owner_id=auth.uid();end if;
 return new;
end $$;
create trigger apply_workout_retention after insert on public.workout_retention_receipts for each row execute function body_private.apply_workout_retention();
create function public.retain_workout(p_session uuid,p_kind text,p_request uuid,p_expected bigint) returns jsonb language plpgsql security invoker set search_path='' as $$
declare r public.workout_retention_receipts;
begin
 if auth.uid() is null then raise exception 'Sign in required' using errcode='42501';end if;
 if p_session is null or p_request is null or p_expected is null or p_expected<0 or p_kind is null or p_kind not in('archive','restore','delete') then raise exception 'Invalid retention request' using errcode='22023';end if;
 perform 1 from public.profiles where id=auth.uid() for update;
 select * into r from public.workout_retention_receipts where owner_id=auth.uid() and request_id=p_request;
 if r.id is not null then
  if row(r.session_id,r.kind,r.expected_revision) is distinct from row(p_session,p_kind,p_expected) then raise exception 'Request reused with different intent' using errcode='23514';end if;
 else
  insert into public.workout_retention_receipts(owner_id,request_id,session_id,kind,expected_revision) values(auth.uid(),p_request,p_session,p_kind,p_expected) returning * into r;
 end if;
 return jsonb_build_object('sessionId',r.session_id,'kind',r.kind,'revision',r.result_revision,'requestId',r.request_id);
end $$;
-- Null only historical pointers; never cascade an enrollment or a reusable template.
do $$declare r record;begin
 for r in select conrelid::regclass as tab,conname from pg_constraint where contype='f' and confrelid='public.workout_sessions'::regclass and conrelid in('public.program_assignments'::regclass,'public.program_schedule_decisions'::regclass) loop
 execute format('alter table %s drop constraint %I',r.tab,r.conname);
 end loop;
end $$;
alter table public.program_assignments add foreign key(terminal_session_id) references public.workout_sessions(id) on delete set null,add foreign key(schedule_first_session_id) references public.workout_sessions(id) on delete set null;
do $$declare r record;begin
 for r in select conname from pg_constraint where conrelid='public.program_schedule_decisions'::regclass and contype='c' and pg_get_constraintdef(oid) like '%accept_partial%session_id%' loop execute format('alter table public.program_schedule_decisions drop constraint %I',r.conname);end loop;
end $$;
alter table public.program_schedule_decisions add foreign key(session_id) references public.workout_sessions(id) on delete set null,add check(session_id is null or kind='accept_partial');
-- Withdrawn accepted-partial evidence may be replaced deliberately; never synthesize a skip.
drop index if exists public.schedule_explicit_resolution;
create unique index schedule_explicit_skip on public.program_schedule_decisions(assignment_id,work_index) where kind='skip';

create or replace function public.workout_evidence_sessions(p_session uuid default null,p_assignment uuid default null,p_closed boolean default true,p_from timestamptz default null,p_until timestamptz default null,p_sessions uuid[] default null,p_retained boolean default false)
returns setof public.workout_sessions language sql stable security invoker set search_path='' as $$
 select w.* from public.workout_sessions w where w.owner_id=auth.uid() and (p_retained or w.archived_at is null)
 and (w.status='completed' or p_closed=false and w.status='in_progress')
 and (p_session is null or w.id=p_session) and (p_assignment is null or w.program_assignment_id=p_assignment)
 and (p_from is null or w.started_at>=p_from) and (p_until is null or w.started_at<p_until)
 and (p_sessions is null or w.id=any(p_sessions));
$$;

create or replace function public.training_sessions(p_session uuid default null,p_assignment uuid default null,p_closed boolean default true,p_from timestamptz default null,p_until timestamptz default null,p_sessions uuid[] default null) returns setof public.workout_sessions language sql stable security invoker set search_path='' as $$ select * from public.workout_evidence_sessions(p_session,p_assignment,p_closed,p_from,p_until,p_sessions,false); $$;
create or replace function public.workout_evidence_sets(p_session uuid default null,p_assignment uuid default null,p_closed boolean default true,p_exercise uuid default null,p_ids uuid[] default null,p_from timestamptz default null,p_until timestamptz default null,p_sessions uuid[] default null,p_retained boolean default false)
returns table(exercise_id uuid,session_id uuid,set_id uuid,category text,reps integer,weight_kg numeric,entered_weight numeric,entered_unit text,set_type text,performed_at timestamptz,exercise_type text,selection_id uuid,movement_id uuid,prescribed_reps_min integer)
language sql stable security invoker set search_path='' as $$
 with source as (
 select e.exercise_id,w.id as session_id,s.id as set_id,s.actual_reps,s.actual_weight_kg,s.entered_weight,s.entered_unit,s.set_type,s.completed_at,c.exercise_type,s.load_mode,e.id as selection_id,e.program_movement_id,s.prescribed_reps_min,
 case when e.logging_kind='legacy' then public.exercise_logging_kind(e.exercise_id) else e.logging_kind end as kind,e.logging_kind,c.owner_id as catalog_owner
 from public.workout_evidence_sessions(p_session,p_assignment,p_closed,p_from,p_until,p_sessions,p_retained) w
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

create or replace function public.qualifying_workout_sets(p_session uuid default null,p_assignment uuid default null,p_closed boolean default true,p_exercise uuid default null,p_ids uuid[] default null,p_from timestamptz default null,p_until timestamptz default null,p_sessions uuid[] default null)
returns table(exercise_id uuid,session_id uuid,set_id uuid,category text,reps integer,weight_kg numeric,entered_weight numeric,entered_unit text,set_type text,performed_at timestamptz,exercise_type text,selection_id uuid,movement_id uuid,prescribed_reps_min integer)
language sql stable security invoker set search_path='' as $$ select * from public.workout_evidence_sets(p_session,p_assignment,p_closed,p_exercise,p_ids,p_from,p_until,p_sessions,false); $$;
create or replace function public.workout_evidence_progress(p_session uuid default null,p_assignment uuid default null,p_closed boolean default true,p_sessions uuid[] default null,p_retained boolean default false)
returns table(session_id uuid,movement_id uuid,required bigint,completed bigint,reps_achieved bigint)
language sql stable security invoker set search_path='' as $$
 with evidence as materialized(select * from public.workout_evidence_sets(p_session,p_assignment,p_closed,null,null,null,null,p_sessions,p_retained))
 select w.id,m.id,
 greatest(1,case when jsonb_array_length(coalesce(m.slot_snapshot->'sets','[]'::jsonb))>0 then (select count(*) from jsonb_array_elements(m.slot_snapshot->'sets') t where t->>'set_type'<>'warm_up') else coalesce((m.slot_snapshot->>'target_sets')::int,1) end),
 count(q.set_id),count(q.set_id) filter(where q.prescribed_reps_min is not null and q.reps>=q.prescribed_reps_min)
 from public.workout_evidence_sessions(p_session,p_assignment,p_closed,null,null,p_sessions,p_retained)w
 join public.workout_movements m on m.workout_session_id=w.id and m.owner_id=w.owner_id and m.removed_at is null
 left join evidence q on q.session_id=w.id and q.movement_id=m.id
 where w.source_program_version_id is not null and (p_session is not null or p_assignment is not null or p_sessions is not null)
 group by w.id,m.id;
$$;

create or replace function public.program_training_progress(p_session uuid default null,p_assignment uuid default null,p_closed boolean default true,p_sessions uuid[] default null)
returns table(session_id uuid,movement_id uuid,required bigint,completed bigint,reps_achieved bigint)
language sql stable security invoker set search_path='' as $$ select * from public.workout_evidence_progress(p_session,p_assignment,p_closed,p_sessions,false); $$;
create or replace function public.workout_evidence_classifications(p_sessions uuid[],p_retained boolean default false)
returns table(session_id uuid,completion_status text)
language plpgsql stable security invoker set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'Sign in required' using errcode='42501';end if;
 if p_sessions is null or cardinality(p_sessions)>51 or coalesce(array_ndims(p_sessions),1)>1 or array_position(p_sessions,null) is not null then raise exception 'Invalid session window' using errcode='22023';end if;
 return query with progress as materialized(
 select p.session_id,sum(p.completed) as completed,bool_and(p.completed>=p.required) as full_workout from public.workout_evidence_progress(null,null,true,p_sessions,p_retained)p group by p.session_id)
 select w.id,case when coalesce(p.completed,0)=0 then 'none' when p.full_workout then 'full' else 'partial' end
 from public.workout_evidence_sessions(null,null,true,null,null,p_sessions,p_retained)w left join progress p on p.session_id=w.id where w.source_program_version_id is not null;
end $$;

create or replace function public.workout_program_classifications(p_sessions uuid[]) returns table(session_id uuid,completion_status text) language sql stable security invoker set search_path='' as $$ select * from public.workout_evidence_classifications(p_sessions,false); $$;
create function public.workout_evidence_summary(p_sessions uuid[],p_retained boolean default false) returns table(session_id uuid,working_sets bigint,exercises_performed bigint) language plpgsql stable security invoker set search_path='' as $$ begin if auth.uid() is null then raise exception 'Sign in required' using errcode='42501';end if;if p_sessions is null or cardinality(p_sessions)>51 or array_position(p_sessions,null) is not null or coalesce(array_ndims(p_sessions),1)>1 then raise exception 'Invalid session window' using errcode='22023';end if;return query with evidence as materialized(select * from public.workout_evidence_sets(null,null,true,null,null,null,null,p_sessions,p_retained)) select w.id,count(e.set_id),count(distinct e.selection_id) from public.workout_evidence_sessions(null,null,true,null,null,p_sessions,p_retained)w left join evidence e on e.session_id=w.id group by w.id;end $$;
create or replace function public.workout_training_summary(p_sessions uuid[]) returns table(session_id uuid,working_sets bigint,exercises_performed bigint) language sql stable security invoker set search_path='' as $$ select * from public.workout_evidence_summary(p_sessions,false); $$;
create or replace function public.program_schedule_resolutions(p_assignment uuid)
returns table(work_index bigint,day_position integer,rotation integer,resolved_on date,resolved_at timestamptz,resolution text,session_id uuid)
language sql stable security invoker set search_path='' as $$
 with a as(select * from public.program_assignments where id=p_assignment and owner_id=auth.uid()),
 decisions as materialized(select distinct on(work_index) d.* from public.program_schedule_decisions d where d.assignment_id=p_assignment and d.owner_id=auth.uid() and d.kind in('skip','accept_partial') order by work_index,created_at desc,id desc),
 actual as(select f.work_index,f.day_position,f.rotation,f.closed_on,w.finished_at,'completed'::text,f.session_id from public.program_schedule_facts(p_assignment)f join public.workout_sessions w on w.id=f.session_id and w.owner_id=auth.uid() where f.full_workout),
 explicit as(select d.work_index,(vday->>'cycle_position')::int,d.rotation,
 case when d.kind='accept_partial' then f.closed_on else (d.created_at at time zone a.schedule_timezone)::date end,d.created_at,d.kind,d.session_id
 from a join decisions d on d.assignment_id=a.id and d.owner_id=a.owner_id join public.program_versions v on v.id=a.source_version_id and v.owner_id=a.owner_id cross join lateral jsonb_array_elements(v.definition->'days')vday
 left join public.program_schedule_facts(p_assignment)f on f.session_id=d.session_id
 where (vday->>'id')::uuid=d.day_id and (d.kind='skip' or d.kind='accept_partial' and f.session_id is not null))
 select * from actual union all select * from explicit;
$$;

create or replace function public.workout_history(p_filter text default 'all',p_before timestamptz default null,p_before_id uuid default null,p_limit integer default 21)
returns table(id uuid,name text,status text,completion_status text,started_at timestamptz,finished_at timestamptz,exercise_count bigint,working_sets bigint,warm_up_sets bigint,incomplete_sets bigint,effective_finished_at timestamptz,duration_kind text,closure_reason text,idle_intervals jsonb,recognition_enabled boolean)
language plpgsql stable security invoker set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'Sign in required' using errcode='42501'; end if;
 if p_filter is null or p_filter not in('all','completed','incomplete','abandoned','archived') or p_limit is null or p_limit<1 or p_limit>51 or (p_before is null)<>(p_before_id is null) then raise exception 'Invalid history page' using errcode='22023'; end if;
 return query with page as materialized (
 select w.* from public.workout_sessions w where w.owner_id=auth.uid() and (case when p_filter='archived' then w.archived_at is not null else w.archived_at is null end)
 and (p_before is null or (w.started_at,w.id)<(p_before,p_before_id))
 and (p_filter in('all','archived') or p_filter='completed' and w.status='completed' or p_filter='abandoned' and w.status='abandoned' or p_filter='incomplete' and (w.status='in_progress' or w.status='completed' and coalesce((select c.completion_status from public.workout_program_classifications(array[w.id])c),w.completion_status)<>'full'))
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

create or replace function public.previous_exercise_sets(p_exercise uuid)
returns table(source_id uuid,set_type text,reps integer,weight_kg numeric,load_mode text,performed_at timestamptz,entered_weight numeric,entered_unit text)
language sql stable security invoker set search_path='' as $$
 with source as (
   select e.id,w.finished_at from public.workout_exercises e
   join public.workout_sessions w on w.id=e.workout_session_id and w.owner_id=e.owner_id
   where e.owner_id=auth.uid() and e.exercise_id=p_exercise and e.removed_at is null and w.status='completed' and w.archived_at is null
     and exists(select 1 from public.workout_sets s where s.workout_exercise_id=e.id and s.owner_id=auth.uid() and s.status='completed' and s.deleted_at is null)
   order by w.finished_at desc,w.id,e.position,e.id limit 1
 )
 select s.id,s.set_type,s.actual_reps,s.actual_weight_kg,s.load_mode,source.finished_at,s.entered_weight,s.entered_unit
 from source join public.workout_sets s on s.workout_exercise_id=source.id
 where s.owner_id=auth.uid() and s.status='completed' and s.deleted_at is null order by s.position,s.id limit 100;
$$;

create or replace function public.exercise_history(p_exercise uuid,p_before timestamptz default null,p_before_id uuid default null,p_limit integer default 11)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare result jsonb;
begin
 if auth.uid() is null then raise exception 'Sign in required' using errcode='42501'; end if;
 if p_exercise is null or p_limit is null or p_limit<1 or p_limit>21 or (p_before is null)<>(p_before_id is null) then raise exception 'Invalid exercise history page' using errcode='22023'; end if;
 with relevant as materialized (
 select w.id,w.name,w.started_at,w.finished_at from public.workout_sessions w
 where w.owner_id=auth.uid() and w.status='completed' and w.archived_at is null and exists(
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

create or replace function body_private.manage_workout_continuity() returns trigger language plpgsql security invoker set search_path='' as $$
declare instant timestamptz:=clock_timestamp(); idle interval; total integer; done integer; missing boolean; expired boolean;
begin
 if current_user<>'authenticated' then return new; end if;
 if tg_op='INSERT' then
   new.status:='in_progress'; new.completion_status:='none'; new.started_at:=instant;new.finished_at:=null;
   new.last_activity_at:=instant;new.activity_evidence_at:=null;new.effective_finished_at:=null;new.duration_kind:='unknown';new.closure_reason:=null;
   new.continuation_nonce:=null;new.continuation_count:=0;new.idle_intervals:='[]';new.recognition_enabled:=false;return new;
 end if;
 if new.retention_command is distinct from old.retention_command and old.status<>'in_progress' and (to_jsonb(new)-array['archived_at','retention_revision','retention_command','updated_at'])=(to_jsonb(old)-array['archived_at','retention_revision','retention_command','updated_at']) and exists(select 1 from public.workout_retention_receipts r where r.id=new.retention_command and r.owner_id=auth.uid() and r.session_id=old.id and r.expected_revision=old.retention_revision and r.kind in('archive','restore')) then return new;end if;
 if old.status<>'in_progress' then
   raise exception 'Workout is closed' using errcode='23514';
 end if;
 idle:=case when old.last_activity_at is null then null else instant-old.last_activity_at end;
 expired:=idle>=make_interval(hours=>(public.workout_policy()->>'expire_hours')::int);
 if expired and new.status='in_progress' then raise exception 'Workout expired; reload to review saved work' using errcode='23514'; end if;
 if new.status<>'in_progress' then
   if expired then new.status:='abandoned';new.closure_reason:='inactivity';
   else new.closure_reason:=case when new.status='completed' then 'finished' else 'abandoned' end;end if;
   new.finished_at:=instant;
   if expired or idle>=make_interval(mins=>(public.workout_policy()->>'check_in_minutes')::int) or old.last_activity_at is null and instant-old.started_at>=make_interval(mins=>(public.workout_policy()->>'check_in_minutes')::int) then
     new.effective_finished_at:=case when old.activity_evidence_at is not null then old.last_activity_at else null end;
     new.duration_kind:=case when new.effective_finished_at is null then 'unknown' else 'estimated' end;
   else new.effective_finished_at:=instant;new.duration_kind:='elapsed';end if;
   select count(*)::int,count(*) filter(where s.status='completed')::int into total,done from public.workout_exercises e join public.workout_sets s on s.workout_exercise_id=e.id and s.owner_id=e.owner_id where e.workout_session_id=old.id and e.owner_id=auth.uid() and e.removed_at is null and s.deleted_at is null;
   select not exists(select 1 from public.workout_exercises e where e.workout_session_id=old.id and e.owner_id=auth.uid() and e.removed_at is null)
     or exists(select 1 from public.workout_exercises e where e.workout_session_id=old.id and e.owner_id=auth.uid() and e.removed_at is null and (select count(*) from public.workout_sets s where s.workout_exercise_id=e.id and s.owner_id=auth.uid() and s.deleted_at is null)<greatest(coalesce(e.prescribed_sets,1),1)) into missing;
   new.completion_status:=case when done=0 then 'none' when new.status='completed' and done=total and not missing then 'full' else 'partial' end;
   new.recognition_enabled:=new.status='completed';return new;
 end if;
 if new.continuation_nonce is distinct from old.continuation_nonce then
   if new.continuation_nonce is null then raise exception 'Continuation ID required' using errcode='22023';end if;
   if idle>=make_interval(mins=>(public.workout_policy()->>'check_in_minutes')::int) or old.last_activity_at is null then
     new.idle_intervals:=old.idle_intervals||jsonb_build_array(jsonb_build_object('from',old.last_activity_at,'to',instant,'legacy_unknown',old.last_activity_at is null));
   end if;
   new.continuation_count:=old.continuation_count+1;new.last_activity_at:=instant;
 elsif pg_trigger_depth()>1 or new.name is distinct from old.name or new.notes is distinct from old.notes then
   if idle>=make_interval(mins=>(public.workout_policy()->>'check_in_minutes')::int) then new.idle_intervals:=old.idle_intervals||jsonb_build_array(jsonb_build_object('from',old.last_activity_at,'to',instant,'continued_by_activity',true));end if;
   new.last_activity_at:=instant;new.activity_evidence_at:=instant;
 end if;
 return new;
end $$;

create or replace function body_private.workout_timer_input() returns trigger
language plpgsql security invoker set search_path='' as $$
declare instant timestamptz:=clock_timestamp();desired boolean;
begin
 if current_user<>'authenticated' then return new;end if;
 if old.status<>'in_progress' and new.retention_command is distinct from old.retention_command and (to_jsonb(new)-array['archived_at','retention_revision','retention_command','updated_at'])=(to_jsonb(old)-array['archived_at','retention_revision','retention_command','updated_at']) and exists(select 1 from public.workout_retention_receipts r where r.id=new.retention_command and r.owner_id=auth.uid() and r.session_id=old.id and r.expected_revision=old.retention_revision and r.kind in('archive','restore')) then return new;end if;
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

create or replace function body_private.assignment_lifecycle_input() returns trigger language plpgsql security invoker set search_path='' as $$
declare r public.program_lifecycle_receipts;v public.program_versions;w public.workout_sessions;c jsonb;full_workout boolean;
begin
 if tg_op='UPDATE' and current_user='authenticated' and (to_jsonb(new)-array['terminal_session_id','schedule_first_session_id','updated_at'])=(to_jsonb(old)-array['terminal_session_id','schedule_first_session_id','updated_at']) and (new.terminal_session_id is not distinct from old.terminal_session_id or new.terminal_session_id is null and public.workout_delete_authorized(old.terminal_session_id)) and (new.schedule_first_session_id is not distinct from old.schedule_first_session_id or new.schedule_first_session_id is null and public.workout_delete_authorized(old.schedule_first_session_id)) and row(new.terminal_session_id,new.schedule_first_session_id) is distinct from row(old.terminal_session_id,old.schedule_first_session_id) then return new;end if;
 if current_user<>'authenticated' then return new;end if;
 if auth.uid() is null or new.owner_id is distinct from auth.uid() then raise exception 'Owned assignment required' using errcode='42501';end if;
 perform 1 from public.profiles where id=auth.uid() for update nowait;
 if tg_op='UPDATE' then
  if (to_jsonb(new)-(array['lifecycle_command','schedule_command','updated_at']||case when old.source_version_id is null then array['cycle_length'] else array[]::text[] end)) is distinct from (to_jsonb(old)-(array['lifecycle_command','schedule_command','updated_at']||case when old.source_version_id is null then array['cycle_length'] else array[]::text[] end)) then raise exception 'Server-owned lifecycle fields' using errcode='23514';end if;
  if new.lifecycle_command is not distinct from old.lifecycle_command then return new;end if;
  if old.state<>'active' then raise exception 'Enrollment is ended' using errcode='23514';end if;
 end if;
 if coalesce(jsonb_typeof(new.lifecycle_command),'')<>'object' or (select count(*) from jsonb_object_keys(new.lifecycle_command))<>1 then raise exception 'Validated lifecycle command required' using errcode='23514';end if;
 if new.lifecycle_command ? 'receipt' then
  select * into r from public.program_lifecycle_receipts where id=(new.lifecycle_command->>'receipt')::uuid and owner_id=auth.uid();
  if r.id is null then raise exception 'Lifecycle receipt unavailable' using errcode='42501';end if;
  if tg_op='INSERT' then
   if r.kind not in('start','switch') or new.id<>r.target_assignment_id or r.target_assignment_id is not distinct from r.assignment_id then raise exception 'Enrollment command mismatch' using errcode='23514';end if;
   select * into v from public.program_versions where id=r.execution_version_id and owner_id=auth.uid();
   if v.id is null or new.source_version_id is distinct from v.id or new.program_id<>v.program_id or new.cycle_length<>(v.definition->'program'->>'cycle_length')::int then raise exception 'Enrollment source mismatch' using errcode='23514';end if;
   new.started_at:=r.applied_at;new.ended_at:=null;new.state:='active';new.lifecycle_revision:=0;
   new.enrollment_provenance:='server';new.enrollment_timezone:=r.timezone;new.enrollment_source_version_id:=r.source_version_id;
   new.pending_end_request_id:=null;new.pending_end_requested_at:=null;new.terminal_reason:=null;new.terminal_request_id:=null;new.terminal_session_id:=null;
   new.completed_rotations:=0;
   select min((d->>'cycle_position')::int) into new.next_cycle_position from jsonb_array_elements(v.definition->'days')d where not(d->>'is_rest_day')::boolean;
  else
   if r.assignment_id is distinct from old.id or r.expected_revision<>old.lifecycle_revision or r.kind not in('switch','end_now','end_after_next','cancel_end') then raise exception 'Program changed; refresh' using errcode='40001';end if;
   if r.kind in('switch','end_now') then
    if exists(select 1 from public.workout_sessions where owner_id=auth.uid() and status='in_progress') then raise exception 'Finish or abandon your active workout first' using errcode='23514';end if;
    c:=jsonb_build_object('complete',public.program_assignment_complete(old.id));
    new.terminal_reason:=case when r.kind='end_now' and coalesce((c->>'complete')::boolean,false) then 'completed' when r.kind='switch' then 'switched' else 'ended_now' end;
    new.state:=case when new.terminal_reason='completed' then 'completed' else 'archived' end;new.ended_at:=r.applied_at;new.terminal_request_id:=r.id;
    new.pending_end_request_id:=null;new.pending_end_requested_at:=null;
   elsif r.kind='end_after_next' then
    if old.pending_end_request_id is not null then raise exception 'End already scheduled' using errcode='23514';end if;
    new.pending_end_request_id:=r.id;new.pending_end_requested_at:=r.applied_at;
   else
    if old.pending_end_request_id is null then raise exception 'No pending end' using errcode='23514';end if;
    new.pending_end_request_id:=null;new.pending_end_requested_at:=null;
   end if;
   new.lifecycle_revision:=old.lifecycle_revision+1;
  end if;
 elsif tg_op='UPDATE' and new.lifecycle_command ? 'closingSession' then
  if pg_catalog.pg_trigger_depth()<2 then raise exception 'Workout closure hook required' using errcode='23514';end if;
  select * into w from public.workout_sessions where id=(new.lifecycle_command->>'closingSession')::uuid and owner_id=auth.uid();
  if w.id is null or w.status<>'completed' or w.program_assignment_id is distinct from old.id or w.source_program_version_id is distinct from old.source_version_id or w.favorite_workout_id is not null then raise exception 'Assigned completed training required' using errcode='23514';end if;
  select x.completion_status='full' into full_workout from public.workout_program_classifications(array[w.id])x;
  c:=jsonb_build_object('complete',public.program_assignment_complete(old.id));
  if not coalesce(full_workout,false) or not(coalesce((c->>'complete')::boolean,false) or old.pending_end_request_id is not null and w.finished_at>old.pending_end_requested_at) then raise exception 'Qualifying full completion required' using errcode='23514';end if;
  if exists(select 1 from public.workout_sessions where owner_id=auth.uid() and status='in_progress') then raise exception 'Active workout must close first' using errcode='23514';end if;
  new.terminal_reason:=case when coalesce((c->>'complete')::boolean,false) then 'completed' else 'ended_after_next' end;
  new.state:=case when new.terminal_reason='completed' then 'completed' else 'archived' end;
  new.ended_at:=w.finished_at;new.terminal_session_id:=w.id;new.terminal_request_id:=old.pending_end_request_id;
  new.pending_end_request_id:=null;new.pending_end_requested_at:=null;new.lifecycle_revision:=old.lifecycle_revision+1;
 else raise exception 'Unsupported lifecycle command' using errcode='23514';end if;
 return new;
end $$;

create or replace function body_private.assignment_schedule_input() returns trigger language plpgsql security invoker set search_path='' as $$
declare zone text;cmd jsonb;day date;last_w public.workout_sessions;v public.program_versions;first_pos int;next_pos int;origin_rot int:=0;
begin
 if tg_op='UPDATE' and current_user='authenticated' and (to_jsonb(new)-array['terminal_session_id','schedule_first_session_id','updated_at'])=(to_jsonb(old)-array['terminal_session_id','schedule_first_session_id','updated_at']) and (new.terminal_session_id is not distinct from old.terminal_session_id or new.terminal_session_id is null and public.workout_delete_authorized(old.terminal_session_id)) and (new.schedule_first_session_id is not distinct from old.schedule_first_session_id or new.schedule_first_session_id is null and public.workout_delete_authorized(old.schedule_first_session_id)) and row(new.terminal_session_id,new.schedule_first_session_id) is distinct from row(old.terminal_session_id,old.schedule_first_session_id) then return new;end if;
 if current_user<>'authenticated' then return new;end if;
 perform 1 from public.profiles where id=auth.uid() for update nowait;
 if tg_op='UPDATE' and old.schedule_start_date is not null and new.lifecycle_command is not distinct from old.lifecycle_command then
  if old.state in('archived','completed') and row(new.state,new.ended_at) is distinct from row(old.state,old.ended_at) then raise exception 'Archived schedule is immutable' using errcode='23514';end if;
  if new.state in('archived','completed') and new.state is distinct from old.state then new.ended_at:=clock_timestamp();
  elsif new.ended_at is distinct from old.ended_at then raise exception 'Schedule closure is server-owned' using errcode='23514';end if;
 end if;
 if tg_op='UPDATE' then
  if row(new.schedule_start_date,new.schedule_timezone,new.schedule_origin_position,new.schedule_origin_rotation,new.schedule_initialized_at,new.schedule_first_session_id)
   is distinct from row(old.schedule_start_date,old.schedule_timezone,old.schedule_origin_position,old.schedule_origin_rotation,old.schedule_initialized_at,old.schedule_first_session_id) then raise exception 'Server-owned schedule configuration' using errcode='23514';end if;
  if new.schedule_command is not distinct from old.schedule_command then return new;end if;
  if old.schedule_start_date is not null or old.state<>'active' then raise exception 'Schedule already configured or archived' using errcode='23514';end if;
  cmd:=new.schedule_command;
  if cmd is null or jsonb_typeof(cmd)<>'object' or (select count(*) from jsonb_object_keys(cmd))<>3 or cmd->>'request' is null then raise exception 'Invalid schedule command' using errcode='22023';end if;
  perform (cmd->>'request')::uuid;zone:=cmd->>'timezone';day:=(cmd->>'start')::date;
  if not public.valid_scheduling_timezone(zone) or day is null or day<(clock_timestamp() at time zone zone)::date or day>(clock_timestamp() at time zone zone)::date+366 then raise exception 'Choose today or a future local start date and IANA timezone' using errcode='22023';end if;
 else
  select scheduling_timezone into zone from public.account_preferences where owner_id=auth.uid();
  if zone is null or new.source_version_id is null then return new;end if;
  day:=(clock_timestamp() at time zone zone)::date;
  if new.lifecycle_command ? 'receipt' then select r.timezone,r.start_date into zone,day from public.program_lifecycle_receipts r where r.id=(new.lifecycle_command->>'receipt')::uuid and r.owner_id=auth.uid();end if;
 end if;
 select * into v from public.program_versions where id=new.source_version_id and owner_id=auth.uid();
 if v.id is null then raise exception 'Version-bound assignment required' using errcode='23514';end if;
 select min((d->>'cycle_position')::int) into first_pos from jsonb_array_elements(v.definition->'days')d where not(d->>'is_rest_day')::boolean;
 if tg_op='UPDATE' then
  select * into last_w from public.workout_sessions where program_assignment_id=new.id and owner_id=auth.uid() and status='in_progress' order by started_at desc,id limit 1;
  if last_w.id is not null then next_pos:=last_w.source_cycle_position;origin_rot:=last_w.source_rotation;new.schedule_first_session_id:=last_w.id;
  else
   select w.* into last_w from public.workout_sessions w where w.program_assignment_id=new.id and w.owner_id=auth.uid() and exists(select 1 from public.program_saved_progress(w.id)p where p.completed>0) order by started_at desc,id desc limit 1;
   if last_w.id is not null then
    origin_rot:=last_w.source_rotation;
    if exists(select 1 from public.program_saved_progress(last_w.id)p where p.completed<p.required) then next_pos:=last_w.source_cycle_position;
    else select min((d->>'cycle_position')::int) into next_pos from jsonb_array_elements(v.definition->'days')d where not(d->>'is_rest_day')::boolean and (d->>'cycle_position')::int>last_w.source_cycle_position;
     if next_pos is null then next_pos:=first_pos;origin_rot:=origin_rot+1;end if;
    end if;
   end if;
  end if;
 else next_pos:=new.next_cycle_position;end if;
 new.schedule_start_date:=day;new.schedule_timezone:=zone;new.schedule_origin_position:=coalesce(next_pos,first_pos);new.schedule_origin_rotation:=origin_rot;new.schedule_initialized_at:=clock_timestamp();
 return new;
end $$;

create or replace function body_private.schedule_decision_input() returns trigger language plpgsql security invoker set search_path='' as $$
declare a public.program_assignments;c jsonb;latest_kind text;
begin
 if tg_op='UPDATE' and new.session_id is null and old.owner_id=auth.uid() and public.workout_delete_authorized(old.session_id) and (to_jsonb(new)-'session_id')=(to_jsonb(old)-'session_id') then return new;end if;
 if current_user<>'authenticated' then return new;end if;
 if tg_op<>'INSERT' then raise exception 'Scheduling decisions are immutable' using errcode='23514';end if;
 if auth.uid() is null or new.owner_id is distinct from auth.uid() then raise exception 'Owned decision required' using errcode='42501';end if;
 perform 1 from public.profiles where id=auth.uid() for update nowait;
 select * into a from public.program_assignments where id=new.assignment_id and owner_id=auth.uid() for update;
 if a.id is null then raise exception 'Assignment unavailable' using errcode='42501';end if;
 if a.state<>'active' or a.schedule_start_date is null or a.source_version_id is distinct from new.version_id then raise exception 'Active configured assignment required' using errcode='23514';end if;
 if exists(select 1 from public.workout_sessions where owner_id=auth.uid() and status='in_progress') then raise exception 'Finish or resume your active workout first' using errcode='23514';end if;
 c:=public.program_schedule_cursor(a.id);
 if (c->>'complete')::boolean then raise exception 'Program already complete' using errcode='23514';end if;
 if new.work_index is distinct from (c->>'workIndex')::bigint or new.expected_revision is distinct from (c->>'decisionRevision')::bigint then raise exception 'Schedule changed; refresh' using errcode='40001';end if;
 if new.day_id is distinct from (c->>'dayId')::uuid or new.rotation is distinct from (c->>'rotation')::int then raise exception 'Occurrence changed; refresh' using errcode='40001';end if;
 if new.kind='accept_partial' and not exists(select 1 from public.program_schedule_facts(a.id)f where f.session_id=new.session_id and f.work_index=new.work_index and not f.full_workout) then raise exception 'Recorded partial session required' using errcode='23514';end if;
 if new.kind='defer' and (new.target_date is null or new.target_date<greatest((statement_timestamp() at time zone a.schedule_timezone)::date+1,(c->>'naturalReadyOn')::date) or new.target_date>(statement_timestamp() at time zone a.schedule_timezone)::date+366) then raise exception 'Choose a future local date respecting recovery, within one year' using errcode='22023';end if;
 if new.kind='defer' and (select d.target_date from public.program_schedule_decisions d where d.owner_id=auth.uid() and d.assignment_id=a.id and d.work_index=new.work_index and d.kind in('defer','cancel_defer') order by d.created_at desc,d.id desc limit 1) is not distinct from new.target_date then raise exception 'This date is already deferred' using errcode='23514';end if;
 if new.kind='cancel_defer' then
  select kind into latest_kind from public.program_schedule_decisions where owner_id=auth.uid() and assignment_id=a.id and work_index=new.work_index and kind in('defer','cancel_defer') order by created_at desc,id desc limit 1;
  if latest_kind is distinct from 'defer' then raise exception 'No current deferral' using errcode='23514';end if;
 end if;
 new.original_due_on:=(c->>'dueOn')::date;new.actor_id:=auth.uid();new.created_at:=clock_timestamp();return new;
end $$;

create or replace function body_private.favorite_workout_input() returns trigger language plpgsql security invoker set search_path='' as $$
declare v public.program_versions;w public.workout_sessions;day jsonb;slots jsonb;candidate record;
begin
 if tg_op='UPDATE' and new.source_session_id is null and old.owner_id=auth.uid() and public.workout_delete_authorized(old.source_session_id) and (to_jsonb(new)-array['source_session_id','updated_at'])=(to_jsonb(old)-array['source_session_id','updated_at']) then return new;end if;
 if current_user<>'authenticated' then return new;end if;
 if auth.uid() is null or new.owner_id is distinct from auth.uid() then raise exception 'Owned favorite required' using errcode='42501';end if;
 perform 1 from public.profiles where id=auth.uid() for update nowait;
 if tg_op='UPDATE' then
  if old.archived and not new.archived and (select count(*) from public.favorite_workouts where owner_id=auth.uid() and not archived)>=100 then raise exception 'Favorite limit is 100' using errcode='23514';end if;
  if row(new.id,new.owner_id,new.source_type,new.source_version_id,new.source_day_id,new.source_session_id,new.source_key,new.definition,new.attribution,new.save_request,new.created_at) is distinct from row(old.id,old.owner_id,old.source_type,old.source_version_id,old.source_day_id,old.source_session_id,old.source_key,old.definition,old.attribution,old.save_request,old.created_at) then raise exception 'Favorite source is immutable' using errcode='23514';end if;
 else
  if (select count(*) from public.favorite_workouts where owner_id=auth.uid() and not archived)>=100 then raise exception 'Favorite limit is 100; remove one before saving another' using errcode='23514';end if;
  if new.source_type='program_day' then
   if new.source_session_id is not null or new.source_version_id is null or new.source_day_id is null then raise exception 'Program day source required' using errcode='22023';end if;
   select * into v from public.program_versions where id=new.source_version_id;
   if v.id is null then raise exception 'Program unavailable' using errcode='42501';end if;
   select d into day from jsonb_array_elements(v.definition->'days')d where (d->>'id')::uuid=new.source_day_id and not(d->>'is_rest_day')::boolean;
   if day is null then raise exception 'Training day required' using errcode='22023';end if;
   select jsonb_agg(public.favorite_slot_structure(z,i::int) order by i) into slots from (select z,row_number() over(order by (z->>'position')::int) as i from jsonb_array_elements(day->'slots')z)x;
   new.source_key:=v.id::text||':'||new.source_day_id::text;new.attribution:=jsonb_build_object('type','program_day','program',v.definition->'program'->>'name','day',day->>'name','version',v.version);
  elsif new.source_type='completed_ad_hoc' then
   if new.source_version_id is not null or new.source_day_id is not null or new.source_session_id is null then raise exception 'Completed ad-hoc source required' using errcode='22023';end if;
   select * into w from public.workout_sessions where id=new.source_session_id and owner_id=auth.uid() and status='completed' and archived_at is null and source_program_version_id is null;
   if w.id is null then raise exception 'Owned completed ad-hoc workout required' using errcode='42501';end if;
   with eligible as materialized(
    select e.* from public.workout_exercises e where e.workout_session_id=w.id and e.owner_id=auth.uid() and e.removed_at is null and e.logging_kind not in('assisted','duration') and exists(select 1 from public.qualifying_workout_sets(w.id)q where q.selection_id=e.id)
   ), selected as(
    select distinct on(coalesce(e.program_movement_id,e.id)) e.*,m.slot_snapshot,m.position as movement_position from eligible e left join public.workout_movements m on m.id=e.program_movement_id and m.owner_id=e.owner_id and m.removed_at is null order by coalesce(e.program_movement_id,e.id),e.position desc,e.id
   ), structures as(
    select coalesce(x.slot_snapshot,jsonb_build_object('title',x.exercise_name_snapshot,'exercise_id',x.exercise_id,'movement_pattern_id',(select ep.movement_pattern_id from public.exercise_movement_patterns ep where ep.exercise_id=x.exercise_id and ep.is_primary limit 1),'primary_muscle_id',(select em.muscle_group_id from public.exercise_muscles em where em.exercise_id=x.exercise_id and em.muscle_role='primary' order by em.muscle_group_id limit 1),'required_exercise_type',(select exercise_type from public.exercises where id=x.exercise_id),'target_sets',coalesce(x.prescribed_sets,3),'target_reps_min',8,'target_reps_max',12)) as slot,x.exercise_id,row_number() over(order by coalesce(x.movement_position,100+x.position),x.id)::int as i from selected x
   )select jsonb_agg(public.favorite_slot_structure(slot,i,exercise_id) order by i) into slots from structures;
   if slots is null then raise exception 'Confirmed supported training required to save structure' using errcode='23514';end if;
   new.source_key:=w.id::text;new.attribution:=jsonb_build_object('type','completed_ad_hoc','workout',w.name);
  else raise exception 'Unsupported favorite source' using errcode='22023';end if;
  new.definition:=slots;new.created_at:=clock_timestamp();new.archived:=false;
 end if;
 new.name:=btrim(new.name);return new;
end $$;

create or replace function body_private.guard_set_logging() returns trigger language plpgsql security invoker set search_path='' as $$
declare item_id uuid; session_id uuid; parent_status text; removal timestamptz; allowed_bodyweight boolean;
begin
 if tg_op='DELETE' and old.owner_id=auth.uid() and public.workout_delete_authorized((select workout_session_id from public.workout_exercises where id=old.workout_exercise_id and owner_id=auth.uid())) then return old;end if;
 if tg_op='DELETE' then item_id:=old.workout_exercise_id; else item_id:=new.workout_exercise_id; end if;
 if current_user='authenticated' then
   select workout_session_id into session_id from public.workout_exercises where id=item_id and owner_id=auth.uid();
   if session_id is null then raise exception 'Selection unavailable' using errcode='23503'; end if;
   select status into parent_status from public.workout_sessions where id=session_id and owner_id=auth.uid() for update nowait;
   select removed_at into removal from public.workout_exercises where id=item_id and owner_id=auth.uid();
   if exists(select 1 from public.workout_sessions w where w.id=session_id and w.owner_id=auth.uid() and w.last_activity_at is not null and clock_timestamp()-w.last_activity_at>=make_interval(hours=>(public.workout_policy()->>'expire_hours')::int)) then raise exception 'Workout expired' using errcode='23514';end if;
   if parent_status is distinct from 'in_progress' or removal is not null then raise exception 'Set editing requires an active, visible workout selection' using errcode='23514'; end if;
   if tg_op<>'INSERT' and old.deleted_at is not null then raise exception 'Deleted sets are immutable' using errcode='23514'; end if;
   if tg_op<>'DELETE' and new.load_mode='bodyweight' then
     select exists(select 1 from public.exercise_equipment q where q.exercise_id=e.exercise_id)
       and not exists(select 1 from public.exercise_equipment q join public.equipment_types t on t.id=q.equipment_type_id where q.exercise_id=e.exercise_id and t.slug not in('none','pull_up_bar','neutral_grip_handles','parallel_bars','step','suspension_trainer'))
       into allowed_bodyweight from public.workout_exercises e where e.id=item_id and e.owner_id=auth.uid();
     if allowed_bodyweight is distinct from true then raise exception 'This exercise requires external load recording' using errcode='22023'; end if;
   end if;
 end if;
 if tg_op='DELETE' then return old; end if;
 if tg_op='UPDATE' then
   new.revision:=old.revision+1;
   if new.actual_reps is distinct from old.actual_reps or new.actual_weight_kg is distinct from old.actual_weight_kg or new.status is distinct from old.status
     or new.set_type is distinct from old.set_type or new.load_mode is distinct from old.load_mode then new.inputs_confirmed:=true; end if;
   -- Direct legacy writes cannot retain stale entered-unit metadata.
   if new.actual_weight_kg is distinct from old.actual_weight_kg and new.entered_weight is not distinct from old.entered_weight and new.entered_unit is not distinct from old.entered_unit and round(new.entered_weight*case when new.entered_unit='lb' then 0.45359237 else 1 end,3) is distinct from new.actual_weight_kg then
     new.entered_weight:=null; new.entered_unit:=null;
   end if;
 end if;
 -- Existing invoker grants support logging, but submitted completion times are
 -- never authoritative. Completed corrections retain the original event time.
 if current_user='authenticated' then
   if new.status='completed' then
     if tg_op='UPDATE' and old.status='completed' then new.completed_at:=coalesce(old.completed_at,clock_timestamp());
     else new.completed_at:=clock_timestamp();end if;
   else new.completed_at:=null;end if;
 end if;
 if new.entered_weight is not null and round(new.entered_weight*case when new.entered_unit='lb' then 0.45359237 else 1 end,3) is distinct from (case when new.inputs_confirmed then new.actual_weight_kg else new.prescribed_weight_kg end) then
   raise exception 'Entered load must match canonical load' using errcode='22023';
 end if;
 return new;
end $$;

create or replace function public.program_history_workouts(p_assignment uuid,p_before timestamptz default null,p_before_id uuid default null,p_limit integer default 21)
returns table(id uuid,name text,status text,completion_status text,started_at timestamptz,finished_at timestamptz,working_sets bigint)
language plpgsql stable security invoker set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'Sign in required' using errcode='42501';end if;
 if p_assignment is null or p_limit is null or p_limit not between 1 and 51 or (p_before is null)<>(p_before_id is null) then raise exception 'Invalid assigned-workout page' using errcode='22023';end if;
 return query with page as materialized(
  select w.* from public.workout_sessions w join public.program_assignments a on a.id=w.program_assignment_id and a.owner_id=w.owner_id
  where w.archived_at is null and a.id=p_assignment and a.owner_id=auth.uid() and (p_before is null or (w.started_at,w.id)<(p_before,p_before_id)) order by w.started_at desc,w.id desc limit p_limit
 ), training as materialized(select * from public.workout_training_summary(array(select p.id from page p))),
 classification as materialized(select * from public.workout_program_classifications(array(select p.id from page p)))
 select p.id,p.name,p.status,coalesce(c.completion_status,p.completion_status),p.started_at,p.finished_at,coalesce(t.working_sets,0)
 from page p left join training t on t.session_id=p.id left join classification c on c.session_id=p.id order by p.started_at desc,p.id desc;
end $$;

create or replace function public.program_enrollment_statistics(p_assignments uuid[]) returns jsonb
language plpgsql stable security invoker set search_path='' as $$
declare result jsonb;
begin
 if auth.uid() is null then raise exception 'Sign in required' using errcode='42501';end if;
 if p_assignments is null or cardinality(p_assignments)>21 or coalesce(array_ndims(p_assignments),1)>1 or array_position(p_assignments,null) is not null then raise exception 'Invalid enrollment window' using errcode='22023';end if;
 with assignments as materialized(
  select a.*,v.definition,v.version,p.source_version_id as original_version_id,p.name as legacy_name
  from public.program_assignments a left join public.program_versions v on v.id=a.source_version_id and v.owner_id=a.owner_id left join public.programs p on p.id=a.program_id and p.owner_id=a.owner_id
  where a.owner_id=auth.uid() and a.id=any(p_assignments)
 ), candidates as materialized(
  select w.id from public.workout_sessions w join assignments a on a.id=w.program_assignment_id and a.owner_id=w.owner_id
  where w.owner_id=auth.uid() and w.status='completed' and w.source_program_version_id is not distinct from a.source_version_id
   and (a.enrollment_provenance='legacy' or w.finished_at>=a.started_at and (a.ended_at is null or w.finished_at<=a.ended_at))
 ), sessions as materialized(
  select * from public.training_sessions(null,null,true,null,null,array(select id from candidates))
 ), evidence as materialized(
  select * from public.qualifying_workout_sets(null,null,true,null,null,null,null,array(select id from sessions))
 ), progress as materialized(
  select p.session_id,sum(p.completed) as completed,bool_and(p.completed>=p.required) as full_workout
  from public.program_training_progress(null,null,true,array(select id from sessions))p group by p.session_id
 ), counts as(
  select w.program_assignment_id,count(*) filter(where exists(select 1 from evidence e where e.session_id=w.id)) as workouts,
   count(*) filter(where p.full_workout and p.completed>0) as full_workouts
  from sessions w left join progress p on p.session_id=w.id group by w.program_assignment_id
 ), rotations as(
  select a.id as program_assignment_id,r.rotation as source_rotation from assignments a cross join lateral public.program_training_rotations(a.id)r
 ), bounds as(select min(started_at) as first_at,max(started_at)+interval '1 microsecond' as until_at from sessions),
 metric_evidence as materialized(
  select w.program_assignment_id,w.finished_at,m.*,e.exercise_name_snapshot as exercise_name
  from bounds b cross join lateral public.performance_metrics(null,array(select distinct exercise_id from evidence),b.first_at,b.until_at)m
  join sessions w on w.id=m.session_id join public.workout_sets z on z.id=m.set_id and z.owner_id=auth.uid() join public.workout_exercises e on e.id=z.workout_exercise_id and e.owner_id=auth.uid()
  where m.metric in('actual_rm','estimated_1rm','bodyweight_reps')
 ), baselines as materialized(
  select distinct on(program_assignment_id,exercise_id,category,metric,load_key) * from metric_evidence
  order by program_assignment_id,exercise_id,category,metric,load_key,finished_at,session_id,performed_at,set_id
 ), comparisons as(
  select b.program_assignment_id,b.exercise_id,b.exercise_name,b.metric,b.category,b.load_key,
   jsonb_build_object('exerciseId',b.exercise_id,'name',b.exercise_name,'category',b.category,'metric',b.metric,'reps',case when b.metric='actual_rm' then b.load_key end,'baseline',to_jsonb(b),'later',case when later.session_id is not null then to_jsonb(later) end,'delta',later.value-b.value) as comparison,
   row_number() over(partition by b.program_assignment_id order by b.exercise_id,b.category,b.metric,b.load_key) as n
  from baselines b left join lateral(
   select m.* from metric_evidence m where m.program_assignment_id=b.program_assignment_id and m.exercise_id=b.exercise_id and m.category=b.category and m.metric=b.metric and m.load_key=b.load_key
   and (m.finished_at,m.session_id)>(b.finished_at,b.session_id) order by m.value desc,m.finished_at,m.session_id,m.performed_at,m.set_id limit 1
  )later on true
 ), cursor_data as materialized(
  select a.id,case when a.state='active' and a.schedule_start_date is not null then public.program_schedule_cursor(a.id) end as cursor from assignments a
 )
 select coalesce(jsonb_agg(jsonb_build_object(
  'id',a.id,'name',coalesce(a.definition->'program'->>'name',(select w.program_name_snapshot from public.workout_sessions w where w.program_assignment_id=a.id and w.owner_id=auth.uid() and w.program_name_snapshot is not null order by w.started_at,w.id limit 1),a.legacy_name,'Legacy program'),
  'versionId',a.source_version_id,'enrollmentVersionId',a.enrollment_source_version_id,'versionNumber',a.version,'originalVersionId',a.original_version_id,'state',a.state,'terminalReason',a.terminal_reason,
  'status',case when a.state='paused' then 'Inactive' when a.terminal_reason='switched' then 'Switched' when a.state='active' and public.program_assignment_complete(a.id) then 'Completed' when a.state='active' then 'Active'
   when a.terminal_reason='completed' and coalesce((a.definition->'program'->>'duration_rotations')::int,2147483647)<=(select count(*) from rotations r where r.program_assignment_id=a.id) then 'Completed' else 'Ended' end,
  'completionEvidenceChanged',(a.terminal_reason='ended_after_next' and not exists(select 1 from public.program_saved_progress(a.terminal_session_id,a.id)p where p.session_id=a.terminal_session_id group by p.session_id having bool_and(p.completed>=p.required) and sum(p.completed)>0)) or a.terminal_reason='completed' and coalesce((a.definition->'program'->>'duration_rotations')::int,2147483647)>(select count(*) from rotations r where r.program_assignment_id=a.id),
  'startedAt',a.started_at,'endedAt',a.ended_at,'asOf',statement_timestamp(),'timezone',coalesce(a.enrollment_timezone,a.schedule_timezone,'UTC'),'provenance',a.enrollment_provenance,
  'scheduleStart',a.schedule_start_date,'lifecycleRevision',a.lifecycle_revision,'pendingEnd',a.pending_end_request_id is not null,'pendingEndAt',a.pending_end_requested_at,'triggerSessionId',a.terminal_session_id,
  'workouts',coalesce(c.workouts,0),'fullWorkouts',coalesce(c.full_workouts,0),'partialWorkouts',coalesce(c.workouts,0)-coalesce(c.full_workouts,0),
  'completedRotations',(select count(*) from rotations r where r.program_assignment_id=a.id),'durationRotations',a.definition->'program'->'duration_rotations','currentRotation',coalesce((cursor_data.cursor->>'rotation')::int+1,1),
  'comparisons',coalesce((select jsonb_agg(x.comparison order by x.exercise_id,x.category,x.metric,x.load_key) from comparisons x where x.program_assignment_id=a.id and x.n<=100),'[]'::jsonb),
  'comparisonCount',(select count(*) from comparisons x where x.program_assignment_id=a.id)
 ) order by a.started_at desc,a.id desc),'[]'::jsonb) into result
 from assignments a left join counts c on c.program_assignment_id=a.id left join cursor_data on cursor_data.id=a.id;
 return result;
end $$;

revoke all on function public.workout_delete_authorized(uuid) from public,anon,service_role;
grant execute on function public.workout_delete_authorized(uuid) to authenticated;
revoke all on function public.retain_workout(uuid,text,uuid,bigint) from public,anon,service_role;
grant execute on function public.retain_workout(uuid,text,uuid,bigint) to authenticated;
revoke all on function public.workout_evidence_sessions(uuid,uuid,boolean,timestamptz,timestamptz,uuid[],boolean) from public,anon,service_role;
grant execute on function public.workout_evidence_sessions(uuid,uuid,boolean,timestamptz,timestamptz,uuid[],boolean) to authenticated;
revoke all on function public.workout_evidence_sets(uuid,uuid,boolean,uuid,uuid[],timestamptz,timestamptz,uuid[],boolean) from public,anon,service_role;
grant execute on function public.workout_evidence_sets(uuid,uuid,boolean,uuid,uuid[],timestamptz,timestamptz,uuid[],boolean) to authenticated;
revoke all on function public.workout_evidence_progress(uuid,uuid,boolean,uuid[],boolean) from public,anon,service_role;
grant execute on function public.workout_evidence_progress(uuid,uuid,boolean,uuid[],boolean) to authenticated;
revoke all on function public.workout_evidence_classifications(uuid[],boolean) from public,anon,service_role;
grant execute on function public.workout_evidence_classifications(uuid[],boolean) to authenticated;
revoke all on function public.workout_evidence_summary(uuid[],boolean) from public,anon,service_role;
grant execute on function public.workout_evidence_summary(uuid[],boolean) to authenticated;
revoke all on all functions in schema body_private from public,anon,authenticated,service_role;
commit;
