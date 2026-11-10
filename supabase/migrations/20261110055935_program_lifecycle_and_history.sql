-- Enrollment identity remains program_assignments.id. Receipts record commands, not training totals.
begin;
alter table public.program_assignments
 add column enrollment_provenance text not null default 'legacy' check(enrollment_provenance in('legacy','server')),
 add column enrollment_timezone text,
 add column enrollment_source_version_id uuid references public.program_versions(id),
 add column lifecycle_revision bigint not null default 0 check(lifecycle_revision>=0),
 add column terminal_reason text check(terminal_reason in('ended_now','ended_after_next','switched','completed')),
 add column pending_end_request_id uuid,
 add column pending_end_requested_at timestamptz,
 add column terminal_request_id uuid,
 add column terminal_session_id uuid references public.workout_sessions(id),
 add column lifecycle_command jsonb,
 add constraint lifecycle_pending_pair check((pending_end_request_id is null)=(pending_end_requested_at is null) and (pending_end_request_id is null or state='active'));
create table public.program_lifecycle_receipts(
 id uuid primary key default gen_random_uuid(),owner_id uuid not null references public.profiles(id) on delete cascade,
 request_id uuid not null,kind text not null check(kind in('start','switch','end_now','end_after_next','cancel_end')),
 assignment_id uuid references public.program_assignments(id) deferrable initially deferred,
 expected_revision bigint not null check(expected_revision>=0),source_version_id uuid references public.program_versions(id),
 start_date date,timezone text,execution_version_id uuid references public.program_versions(id),
 target_assignment_id uuid not null references public.program_assignments(id) deferrable initially deferred,
 applied_at timestamptz not null default clock_timestamp(),unique(owner_id,request_id));
alter table public.program_lifecycle_receipts enable row level security;
revoke all on public.program_lifecycle_receipts from public,anon,authenticated,service_role;
grant select on public.program_lifecycle_receipts to authenticated;
grant insert(owner_id,request_id,kind,assignment_id,expected_revision,source_version_id,start_date,timezone) on public.program_lifecycle_receipts to authenticated;
create policy owner_read on public.program_lifecycle_receipts for select to authenticated using(owner_id=(select auth.uid()));
create policy owner_insert on public.program_lifecycle_receipts for insert to authenticated with check(owner_id=(select auth.uid()));
alter table public.program_assignments
 add foreign key(pending_end_request_id) references public.program_lifecycle_receipts(id) deferrable initially deferred,
 add foreign key(terminal_request_id) references public.program_lifecycle_receipts(id) deferrable initially deferred;
revoke insert(state,completed_rotations,started_at,ended_at),update(state,next_cycle_position,completed_rotations,ended_at) on public.program_assignments from authenticated;
grant insert(lifecycle_command),update(lifecycle_command) on public.program_assignments to authenticated;
create index enrollment_history_order on public.program_assignments(owner_id,started_at desc,id desc);

-- Rotation evidence is enrollment-based even for legacy calendar-unconfigured assignments.
create function public.program_training_rotations(p_assignment uuid) returns table(rotation integer)
language sql stable security invoker set search_path='' as $$
 with a as(select x.*,v.definition from public.program_assignments x join public.program_versions v on v.id=x.source_version_id and v.owner_id=x.owner_id where x.id=p_assignment and x.owner_id=auth.uid()),
 progress as materialized(select p.session_id,bool_and(p.completed>=p.required) as full_workout,sum(p.completed) as completed from public.program_saved_progress(null,p_assignment)p group by p.session_id),
 done as(select w.source_rotation,w.source_cycle_position from a join public.training_sessions(null,p_assignment,true)w on w.source_program_version_id=a.source_version_id join progress p on p.session_id=w.id and p.full_workout and p.completed>0
 where w.favorite_workout_id is null and (a.enrollment_provenance='legacy' or w.finished_at>=a.started_at and (a.ended_at is null or w.finished_at<=a.ended_at))
 and exists(select 1 from jsonb_array_elements(a.definition->'days')d where not(d->>'is_rest_day')::boolean and (d->>'cycle_position')::int=w.source_cycle_position))
 select d.source_rotation from done d cross join a group by d.source_rotation,a.definition having count(distinct d.source_cycle_position)=(select count(*) from jsonb_array_elements(a.definition->'days')x where not(x->>'is_rest_day')::boolean);
$$;
create function public.program_assignment_complete(p_assignment uuid) returns boolean language sql stable security invoker set search_path='' as $$
 select coalesce((select (v.definition->'program'->>'duration_rotations')::int<=(select count(*) from public.program_training_rotations(a.id)) from public.program_assignments a join public.program_versions v on v.id=a.source_version_id and v.owner_id=a.owner_id where a.id=p_assignment and a.owner_id=auth.uid()),false);
$$;
revoke all on function public.program_training_rotations(uuid),public.program_assignment_complete(uuid) from public,anon,service_role;
grant execute on function public.program_training_rotations(uuid),public.program_assignment_complete(uuid) to authenticated;

create or replace function public.program_schedule_cursor(p_assignment uuid) returns jsonb
language plpgsql stable security invoker set search_path='' as $$
declare a public.program_assignments;v public.program_versions;days jsonb;n int;origin_rank int;origin_index bigint;next_index bigint;pos int;rot int;due date;ready date;last_date date;last_pos int;gap int;span int;origin_offset int;full_rotations int;last_session uuid;natural_ready date;defer_date date;
begin
 select * into a from public.program_assignments where id=p_assignment and owner_id=auth.uid();
 if a.id is null or a.schedule_start_date is null then return null;end if;
 select * into v from public.program_versions where id=a.source_version_id and owner_id=auth.uid();
 days:=public.program_schedule_days(a.id);
 n:=jsonb_array_length(days);span:=(days->0->>'calendar_span')::int;
 select (d->>'calendar_offset')::int into origin_offset from jsonb_array_elements(days)d where (d->>'cycle_position')::int=a.schedule_origin_position;
 select count(*) into origin_rank from jsonb_array_elements(days)d where (d->>'cycle_position')::int<a.schedule_origin_position;
 origin_index:=a.schedule_origin_rotation::bigint*n+origin_rank;
 with done as(select distinct work_index from public.program_schedule_resolutions(a.id) where work_index>=origin_index),
 numbered as(select work_index,origin_index+row_number() over(order by work_index)-1 as expected from done)
 select coalesce(min(expected) filter(where work_index<>expected),origin_index+count(*)) into next_index from numbered;
 rot:=(next_index/n)::int;pos:=(days->(next_index%n)::int->>'cycle_position')::int;
 -- First full resolution per occurrence is stable under repetitions. Recovery
 -- follows the most recent first resolution, skipping already-resolved gaps.
 due:=a.schedule_start_date+(rot-a.schedule_origin_rotation)*span+(days->(next_index%n)::int->>'calendar_offset')::int-origin_offset;
 with first_resolutions as(
  select distinct on(r.work_index) r.* from public.program_schedule_resolutions(a.id)r where r.work_index<next_index order by r.work_index,r.resolved_at,r.session_id nulls last
 )
 select coalesce((select r.resolved_on+case when r.resolution='skip' then 0 else (select (d->>'recovery_days')::int from jsonb_array_elements(days)d where (d->>'cycle_position')::int=r.day_position) end from first_resolutions r order by r.resolved_at desc,r.work_index desc limit 1),due) into due;
 select f.closed_on,f.day_position,f.session_id into last_date,last_pos,last_session from public.program_schedule_facts(a.id)f join public.workout_sessions w on w.id=f.session_id and w.owner_id=auth.uid() order by w.finished_at desc,w.id desc limit 1;
 if last_date is not null then
  select (d->>'recovery_days')::int into gap from jsonb_array_elements(days)d where (d->>'cycle_position')::int=last_pos;
  ready:=greatest(due,last_date+greatest(1,gap));
 else ready:=due;end if;
 select coalesce(min(w.schedule_due_on),due) into due from public.workout_sessions w where w.owner_id=auth.uid() and w.program_assignment_id=a.id and w.source_rotation=rot and w.source_cycle_position=pos;
 select coalesce((select d.original_due_on from public.program_schedule_decisions d where d.owner_id=auth.uid() and d.assignment_id=a.id and d.work_index=next_index order by d.created_at,d.id limit 1),due) into due;
 natural_ready:=ready;
 select case when d.kind='defer' then d.target_date end into defer_date from public.program_schedule_decisions d where d.owner_id=auth.uid() and d.assignment_id=a.id and d.work_index=next_index and d.kind in('defer','cancel_defer') order by d.created_at desc,d.id desc limit 1;
 ready:=greatest(ready,defer_date);
 select count(*) into full_rotations from public.program_training_rotations(a.id);
 return jsonb_build_object('decisionRevision',public.program_schedule_revision(a.id),'naturalReadyOn',natural_ready,'deferredUntil',defer_date,'position',pos,'rotation',rot,'workIndex',next_index,'originIndex',origin_index,'dueOn',due,'readyOn',ready,'name',days->(next_index%n)::int->>'name','dayId',days->(next_index%n)::int->>'id','number',next_index%n+1,'trainingDays',n,'completedRotations',full_rotations,'complete',coalesce(full_rotations>=(v.definition->'program'->>'duration_rotations')::int,false),'lastCompleted',(select jsonb_build_object('sessionId',f.session_id,'position',f.day_position,'rotation',f.rotation,'date',f.closed_on) from public.program_schedule_facts(a.id)f join public.workout_sessions w on w.id=f.session_id and w.owner_id=auth.uid() where f.full_workout order by w.finished_at desc,w.id desc limit 1),'lastSession',last_session,'lastTrainingOn',last_date,'startDate',a.schedule_start_date,'timezone',a.schedule_timezone);
end $$;
revoke all on function public.program_schedule_cursor(uuid) from public,anon,service_role;
grant execute on function public.program_schedule_cursor(uuid) to authenticated;

create function public.program_execution_version(p_version uuid) returns uuid language plpgsql security invoker set search_path='' as $$
declare source public.program_versions;own_version public.program_versions;copy_id uuid;
begin
 if auth.uid() is null then raise exception 'Sign in required' using errcode='42501';end if;
 select * into source from public.program_versions where id=p_version;
 if source.id is null or not exists(select 1 from public.programs where id=source.program_id and archived_at is null) then raise exception 'Program unavailable' using errcode='42501';end if;
 if source.owner_id=auth.uid() then return source.id;end if;
 copy_id:=public.clone_program(source.id,source.definition->'program'->>'name',md5(auth.uid()::text||source.id::text||':execution')::uuid);
 perform 1 from public.programs where id=copy_id and owner_id=auth.uid() and archived_at is null for update;
 if not found then raise exception 'Program unavailable' using errcode='42501';end if;
 select * into own_version from public.program_versions where program_id=copy_id and owner_id=auth.uid() order by version asc limit 1;
 if own_version.id is null then return public.snapshot_program(copy_id);end if;
 return own_version.id;
end $$;
revoke all on function public.program_execution_version(uuid) from public,anon,service_role;
grant execute on function public.program_execution_version(uuid) to authenticated;

create function body_private.lifecycle_receipt_input() returns trigger language plpgsql security invoker set search_path='' as $$
declare a public.program_assignments;execution uuid;today date;
begin
 if current_user<>'authenticated' then return new;end if;
 if auth.uid() is null or new.owner_id is distinct from auth.uid() then raise exception 'Owned lifecycle command required' using errcode='42501';end if;
 perform 1 from public.profiles where id=auth.uid() for update;
 if new.request_id is null or new.expected_revision is null or new.expected_revision<0 then raise exception 'Invalid lifecycle request' using errcode='22023';end if;
 select * into a from public.program_assignments where owner_id=auth.uid() and state='active' for update;
 if new.assignment_id is not null then
  if not exists(select 1 from public.program_assignments where id=new.assignment_id and owner_id=auth.uid()) then raise exception 'Assignment unavailable' using errcode='42501';end if;
  if a.id is distinct from new.assignment_id or a.lifecycle_revision<>new.expected_revision then raise exception 'Program changed; refresh' using errcode='40001';end if;
 elsif new.kind<>'start' or new.expected_revision<>0 then raise exception 'Expected active assignment required' using errcode='40001';
 end if;
 if new.kind in('start','switch') then
  if new.source_version_id is null or not public.valid_scheduling_timezone(new.timezone) or new.start_date is null then raise exception 'Confirm start date and IANA timezone' using errcode='22023';end if;
  today:=(clock_timestamp() at time zone new.timezone)::date;
  if new.start_date<today or new.start_date>today+366 then raise exception 'Choose today or a future start date within one year' using errcode='22023';end if;
  if exists(select 1 from public.workout_sessions where owner_id=auth.uid() and status='in_progress') then raise exception 'Finish or abandon your active workout first' using errcode='23514';end if;
  execution:=public.program_execution_version(new.source_version_id);
  new.execution_version_id:=execution;
  if new.kind='start' and a.id is not null then
   if a.source_version_id is distinct from execution then raise exception 'Switch program explicitly' using errcode='23514';end if;
   new.target_assignment_id:=a.id;
  elsif new.kind='switch' then
   if a.id is null then raise exception 'Active assignment required' using errcode='40001';end if;
   if a.source_version_id=execution then raise exception 'Continue the current program; end and start separately to restart' using errcode='23514';end if;
   new.target_assignment_id:=gen_random_uuid();
  else new.target_assignment_id:=gen_random_uuid();end if;
 else
  if new.source_version_id is not null or new.start_date is not null or new.timezone is not null then raise exception 'Unexpected lifecycle configuration' using errcode='22023';end if;
  if a.id is null then raise exception 'Active assignment required' using errcode='40001';end if;
  new.target_assignment_id:=a.id;new.execution_version_id:=a.source_version_id;
  if new.kind='end_now' and exists(select 1 from public.workout_sessions where owner_id=auth.uid() and status='in_progress') then raise exception 'Finish or abandon your active workout first' using errcode='23514';end if;
  if new.kind='end_after_next' and (a.pending_end_request_id is not null or a.source_version_id is null or public.program_assignment_complete(a.id)) then raise exception 'Pending end already set or program complete/unconfigured' using errcode='23514';end if;
  if new.kind='cancel_end' and a.pending_end_request_id is null then raise exception 'No scheduled end to cancel' using errcode='23514';end if;
 end if;
 new.applied_at:=clock_timestamp();return new;
end $$;
create trigger lifecycle_receipt_input before insert on public.program_lifecycle_receipts for each row execute function body_private.lifecycle_receipt_input();

create function body_private.assignment_lifecycle_input() returns trigger language plpgsql security invoker set search_path='' as $$
declare r public.program_lifecycle_receipts;v public.program_versions;w public.workout_sessions;c jsonb;full_workout boolean;
begin
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
create trigger a_lifecycle_input before insert or update on public.program_assignments for each row execute function body_private.assignment_lifecycle_input();

create function body_private.apply_lifecycle_receipt() returns trigger language plpgsql security invoker set search_path='' as $$
declare v public.program_versions;first_position int;
begin
 if current_user<>'authenticated' then return new;end if;
 if new.kind in('switch','end_now','end_after_next','cancel_end') then
  update public.program_assignments set lifecycle_command=jsonb_build_object('receipt',new.id) where id=new.assignment_id and owner_id=auth.uid();
  if not found then raise exception 'Assignment unavailable' using errcode='42501';end if;
 end if;
 if new.kind in('start','switch') and not exists(select 1 from public.program_assignments where id=new.target_assignment_id and owner_id=auth.uid()) then
  select * into v from public.program_versions where id=new.execution_version_id and owner_id=auth.uid();
  select min((d->>'cycle_position')::int) into first_position from jsonb_array_elements(v.definition->'days')d where not(d->>'is_rest_day')::boolean;
  update public.account_preferences set scheduling_timezone=new.timezone where owner_id=auth.uid();
  insert into public.program_assignments(id,owner_id,program_id,cycle_length,next_cycle_position,source_version_id,lifecycle_command)
  values(new.target_assignment_id,auth.uid(),v.program_id,(v.definition->'program'->>'cycle_length')::int,first_position,v.id,jsonb_build_object('receipt',new.id));
 end if;
 return new;
end $$;
create trigger apply_lifecycle_receipt after insert on public.program_lifecycle_receipts for each row execute function body_private.apply_lifecycle_receipt();

create function public.program_lifecycle(p_kind text,p_request uuid,p_assignment uuid default null,p_expected bigint default 0,p_version uuid default null,p_start date default null,p_timezone text default null)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare r public.program_lifecycle_receipts;
begin
 if auth.uid() is null then raise exception 'Sign in required' using errcode='42501';end if;
 if p_request is null or p_kind is null or p_kind not in('start','switch','end_now','end_after_next','cancel_end') then raise exception 'Invalid lifecycle command' using errcode='22023';end if;
 perform 1 from public.profiles where id=auth.uid() for update;
 select * into r from public.program_lifecycle_receipts where owner_id=auth.uid() and request_id=p_request;
 if r.id is not null then
  if row(r.kind,r.assignment_id,r.expected_revision,r.source_version_id,r.start_date,r.timezone) is distinct from row(p_kind,p_assignment,p_expected,p_version,p_start,p_timezone) then raise exception 'Lifecycle request reused with different intent' using errcode='23514';end if;
 else
  insert into public.program_lifecycle_receipts(owner_id,request_id,kind,assignment_id,expected_revision,source_version_id,start_date,timezone)
  values(auth.uid(),p_request,p_kind,p_assignment,p_expected,p_version,p_start,p_timezone) returning * into r;
 end if;
 return jsonb_build_object('assignmentId',r.target_assignment_id,'previousAssignmentId',r.assignment_id,'requestId',r.request_id,'kind',r.kind,'appliedAt',r.applied_at);
end $$;
revoke all on function public.program_lifecycle(text,uuid,uuid,bigint,uuid,date,text) from public,anon,service_role;
grant execute on function public.program_lifecycle(text,uuid,uuid,bigint,uuid,date,text) to authenticated;

create or replace function body_private.assignment_schedule_input() returns trigger language plpgsql security invoker set search_path='' as $$
declare zone text;cmd jsonb;day date;last_w public.workout_sessions;v public.program_versions;first_pos int;next_pos int;origin_rot int:=0;
begin
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
create or replace function body_private.bind_program_assignment() returns trigger language plpgsql security invoker set search_path='' as $$
declare a public.program_assignments;v public.program_versions;last_w public.workout_sessions;cursor_state jsonb;days jsonb;span int;origin_offset int;
begin
 if current_user<>'authenticated' or new.source_program_version_id is null then return new;end if;
 perform 1 from public.profiles where id=auth.uid() for update nowait;
 select * into v from public.program_versions where id=new.source_program_version_id and owner_id=auth.uid();
 select * into a from public.program_assignments where owner_id=auth.uid() and state='active' for update;
 if a.id is not null and (a.program_id<>new.source_program_id or a.source_version_id is distinct from v.id) then raise exception 'Switch program explicitly before starting another program workout' using errcode='23514';end if;
 if a.id is null then
  if exists(select 1 from public.program_assignments where owner_id=auth.uid() and program_id=v.program_id) then raise exception 'Start a new enrollment explicitly' using errcode='23514';end if;
  declare zone text;begin
   select scheduling_timezone into zone from public.account_preferences where owner_id=auth.uid();
   perform public.program_lifecycle('start',md5(new.program_start_nonce::text||':enrollment')::uuid,null,0,v.id,(clock_timestamp() at time zone zone)::date,zone);
  end;
  select * into a from public.program_assignments where owner_id=auth.uid() and state='active' for update;
 end if;
 if public.program_assignment_complete(a.id) then raise exception 'Program complete; end and start a new enrollment explicitly' using errcode='23514';end if;
 select * into last_w from public.workout_sessions where owner_id=auth.uid() and program_assignment_id=a.id and exists(select 1 from public.program_saved_progress(public.workout_sessions.id) p where p.completed>0) order by started_at desc,id desc limit 1;
 new.program_assignment_id:=a.id;
 cursor_state:=public.program_schedule_cursor(a.id);
 new.source_rotation:=coalesce(last_w.source_rotation,0)+case when last_w.id is not null and (new.source_cycle_position<last_w.source_cycle_position or new.source_cycle_position=last_w.source_cycle_position and not exists(select 1 from public.program_saved_progress(last_w.id) p where p.completed<p.required)) then 1 else 0 end;
 if cursor_state is not null then
  days:=public.program_schedule_days(a.id);span:=(days->0->>'calendar_span')::int;
  select (d->>'calendar_offset')::int into origin_offset from jsonb_array_elements(days)d where (d->>'cycle_position')::int=a.schedule_origin_position;
  new.source_rotation:=(cursor_state->>'rotation')::int;
  new.schedule_due_on:=coalesce((select min(w.schedule_due_on) from public.workout_sessions w where w.owner_id=auth.uid() and w.program_assignment_id=a.id and w.source_rotation=new.source_rotation and w.source_cycle_position=new.source_cycle_position),
   case when new.source_cycle_position=(cursor_state->>'position')::int then (cursor_state->>'dueOn')::date
   when new.source_cycle_position>(cursor_state->>'position')::int then greatest((statement_timestamp() at time zone a.schedule_timezone)::date,(cursor_state->>'readyOn')::date)+
    coalesce((select sum((d->>'recovery_days')::int)::int from jsonb_array_elements(days) with ordinality x(d,i) where (d->>'cycle_position')::int>=(cursor_state->>'position')::int and (d->>'cycle_position')::int<new.source_cycle_position and not exists(select 1 from public.program_schedule_facts(a.id)f where f.full_workout and f.work_index=new.source_rotation::bigint*jsonb_array_length(days)+i-1)),0)
   else a.schedule_start_date+(new.source_rotation-a.schedule_origin_rotation)*span+(select (d->>'calendar_offset')::int from jsonb_array_elements(days)d where (d->>'cycle_position')::int=new.source_cycle_position)-origin_offset end);

 end if;
 return new;
end $$;

create function body_private.end_program_on_workout_close() returns trigger language plpgsql security invoker set search_path='' as $$
declare a public.program_assignments;full_workout boolean;c jsonb;
begin
 if current_user<>'authenticated' or old.status<>'in_progress' or new.status<>'completed' or new.program_assignment_id is null or new.favorite_workout_id is not null then return new;end if;
 perform 1 from public.profiles where id=auth.uid() for update nowait;
 select * into a from public.program_assignments where id=new.program_assignment_id and owner_id=auth.uid() for update;
 if a.id is null or a.state<>'active' or a.source_version_id is distinct from new.source_program_version_id then return new;end if;
 select x.completion_status='full' into full_workout from public.workout_program_classifications(array[new.id])x;
 if not coalesce(full_workout,false) then return new;end if;
 c:=jsonb_build_object('complete',public.program_assignment_complete(a.id));
 if coalesce((c->>'complete')::boolean,false) or a.pending_end_request_id is not null and new.finished_at>a.pending_end_requested_at then
  update public.program_assignments set lifecycle_command=jsonb_build_object('closingSession',new.id) where id=a.id and owner_id=auth.uid();
 end if;
 return new;
end $$;
create trigger program_lifecycle_after_close after update of status on public.workout_sessions for each row execute function body_private.end_program_on_workout_close();
revoke all on all functions in schema body_private from public,anon,authenticated,service_role;
create function public.program_enrollment_statistics(p_assignments uuid[]) returns jsonb
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
  'completionEvidenceChanged',a.terminal_reason='completed' and coalesce((a.definition->'program'->>'duration_rotations')::int,2147483647)>(select count(*) from rotations r where r.program_assignment_id=a.id),
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

create function public.program_enrollment_history(p_assignment uuid default null,p_before timestamptz default null,p_before_id uuid default null,p_limit integer default 11)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare ids uuid[];
begin
 if auth.uid() is null then raise exception 'Sign in required' using errcode='42501';end if;
 if p_limit is null or p_limit not between 1 and 21 or (p_before is null)<>(p_before_id is null) then raise exception 'Invalid enrollment page' using errcode='22023';end if;
 select coalesce(array_agg(x.id),array[]::uuid[]) into ids from(
  select a.id from public.program_assignments a where a.owner_id=auth.uid() and (p_assignment is null or a.id=p_assignment)
   and (p_before is null or (a.started_at,a.id)<(p_before,p_before_id)) order by a.started_at desc,a.id desc limit p_limit
 )x;
 return public.program_enrollment_statistics(ids);
end $$;

create function public.program_history_workouts(p_assignment uuid,p_before timestamptz default null,p_before_id uuid default null,p_limit integer default 21)
returns table(id uuid,name text,status text,completion_status text,started_at timestamptz,finished_at timestamptz,working_sets bigint)
language plpgsql stable security invoker set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'Sign in required' using errcode='42501';end if;
 if p_assignment is null or p_limit is null or p_limit not between 1 and 51 or (p_before is null)<>(p_before_id is null) then raise exception 'Invalid assigned-workout page' using errcode='22023';end if;
 return query with page as materialized(
  select w.* from public.workout_sessions w join public.program_assignments a on a.id=w.program_assignment_id and a.owner_id=w.owner_id
  where a.id=p_assignment and a.owner_id=auth.uid() and (p_before is null or (w.started_at,w.id)<(p_before,p_before_id)) order by w.started_at desc,w.id desc limit p_limit
 ), training as materialized(select * from public.workout_training_summary(array(select p.id from page p))),
 classification as materialized(select * from public.workout_program_classifications(array(select p.id from page p)))
 select p.id,p.name,p.status,coalesce(c.completion_status,p.completion_status),p.started_at,p.finished_at,coalesce(t.working_sets,0)
 from page p left join training t on t.session_id=p.id left join classification c on c.session_id=p.id order by p.started_at desc,p.id desc;
end $$;
revoke all on function public.program_enrollment_statistics(uuid[]),public.program_enrollment_history(uuid,timestamptz,uuid,integer),public.program_history_workouts(uuid,timestamptz,uuid,integer) from public,anon,service_role;
grant execute on function public.program_enrollment_statistics(uuid[]),public.program_enrollment_history(uuid,timestamptz,uuid,integer),public.program_history_workouts(uuid,timestamptz,uuid,integer) to authenticated;

create or replace function public.start_program_workout(p_version uuid,p_workout integer,p_request uuid) returns uuid language plpgsql security invoker set search_path='' as $$
declare own_version public.program_versions;copy_id uuid;day jsonb;result_id uuid;active_id uuid;was_expired boolean;
begin
 if auth.uid() is null then raise exception 'Sign in required' using errcode='42501';end if;
 if p_request is null or p_workout is null or p_workout not between 1 and 366 then raise exception 'Invalid workout start' using errcode='22023';end if;
 perform 1 from public.profiles where id=auth.uid() for update;
 select id into result_id from public.workout_sessions where owner_id=auth.uid() and program_start_nonce=p_request;
 if result_id is not null then
  if not exists(select 1 from public.workout_sessions w join public.programs p on p.id=w.source_program_id and p.owner_id=w.owner_id where w.id=result_id and w.owner_id=auth.uid() and w.source_cycle_position=p_workout and (p.source_version_id=p_version or w.source_program_version_id=p_version)) then raise exception 'Start request reused for a different workout' using errcode='23514';end if;return result_id;end if;
 was_expired:=coalesce(public.workout_continuity()->>'state','')='expired';
 select id into active_id from public.workout_sessions where owner_id=auth.uid() and status='in_progress';
 if active_id is not null then raise exception 'Finish or resume your active workout first' using errcode='23514';end if;
 begin
 copy_id:=public.program_execution_version(p_version);
 select * into own_version from public.program_versions where id=copy_id and owner_id=auth.uid();
 select value into day from jsonb_array_elements(own_version.definition->'days') where (value->>'cycle_position')::int=p_workout;
 if day is null or (day->>'is_rest_day')::boolean then raise exception 'Choose a training workout' using errcode='22023';end if;
 insert into public.workout_sessions(owner_id,name,source_program_id,source_program_day_id,source_program_version_id,program_start_nonce)
 values(auth.uid(),'Workout',own_version.program_id,(day->>'id')::uuid,own_version.id,p_request) returning id into result_id;
 return result_id;
 exception when others then if was_expired then return null;else raise;end if;
 end;
end $$;
commit;
