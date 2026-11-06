-- Scheduling is a projection of immutable program intent and actual saved work.
begin;
alter table public.account_preferences add column scheduling_timezone text;
grant update(scheduling_timezone) on public.account_preferences to authenticated;
create function public.valid_scheduling_timezone(p_zone text) returns boolean
language sql stable security invoker set search_path='' as $$
 select p_zone is not null and length(p_zone)<=100 and (p_zone='UTC' or p_zone like '%/%')
 and exists(select 1 from pg_catalog.pg_timezone_names where name=p_zone and name not like 'posix/%' and name not like 'right/%');
$$;
revoke all on function public.valid_scheduling_timezone(text) from public,anon,service_role;
grant execute on function public.valid_scheduling_timezone(text) to authenticated;
create function body_private.scheduling_preference_input() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if new.scheduling_timezone is not null and not public.valid_scheduling_timezone(new.scheduling_timezone) then raise exception 'Choose an IANA timezone' using errcode='22023';end if;
 return new;
end $$;
create trigger scheduling_preference_input before insert or update on public.account_preferences for each row execute function body_private.scheduling_preference_input();

alter table public.program_assignments
 add column schedule_start_date date,
 add column schedule_timezone text,
 add column schedule_origin_position smallint,
 add column schedule_origin_rotation integer,
 add column schedule_initialized_at timestamptz,
 add column schedule_first_session_id uuid references public.workout_sessions(id),
 add column schedule_command jsonb,
 add constraint schedule_configuration_complete check(
  (schedule_start_date is null and schedule_timezone is null and schedule_origin_position is null and schedule_origin_rotation is null and schedule_initialized_at is null)
  or (schedule_start_date is not null and schedule_timezone is not null and source_version_id is not null and schedule_origin_position is not null and schedule_origin_rotation is not null and schedule_origin_position between 1 and cycle_length and schedule_origin_rotation>=0 and schedule_initialized_at is not null));
grant update(schedule_command) on public.program_assignments to authenticated;
alter table public.workout_sessions add column schedule_due_on date;
create index schedule_session_history on public.workout_sessions(owner_id,program_assignment_id,finished_at,id) where program_assignment_id is not null;

-- Normalize immutable training positions into calendar-day recovery guidance.
create function public.program_schedule_days(p_assignment uuid) returns jsonb
language sql stable security invoker set search_path='' as $$
 with raw as(select a.cycle_length,d,(d->>'cycle_position')::int as pos from public.program_assignments a join public.program_versions v on v.id=a.source_version_id and v.owner_id=a.owner_id cross join lateral jsonb_array_elements(v.definition->'days')d where a.id=p_assignment and a.owner_id=auth.uid() and not(d->>'is_rest_day')::boolean),
 ordered as(select *,lead(pos) over(order by pos) as next_pos,min(pos) over() as first_pos from raw),
 gaps as(select *,greatest(coalesce(next_pos-pos,cycle_length-pos+first_pos),ceil(coalesce((d->>'minimum_rest_hours')::numeric,0)/24)::int,1) as recovery from ordered),
 offsets as(select *,coalesce(sum(recovery) over(order by pos rows between unbounded preceding and 1 preceding),0)::int as calendar_offset,sum(recovery) over()::int as calendar_span from gaps)
 select coalesce(jsonb_agg(d||jsonb_build_object('recovery_days',recovery,'calendar_offset',calendar_offset,'calendar_span',calendar_span) order by pos),'[]'::jsonb) from offsets;
$$;
revoke all on function public.program_schedule_days(uuid) from public,anon,service_role;
grant execute on function public.program_schedule_days(uuid) to authenticated;

-- The shared evidence contract. No cached completion flags or lifetime sets leave SQL.
create function public.program_schedule_facts(p_assignment uuid)
returns table(session_id uuid,day_position integer,rotation integer,work_index bigint,closed_on date,scheduled_on date,full_workout boolean)
language sql stable security invoker set search_path='' as $$
 with a as(select * from public.program_assignments where id=p_assignment and owner_id=auth.uid() and schedule_start_date is not null),
 days as(select (d->>'cycle_position')::int as day_position,row_number() over(order by (d->>'cycle_position')::int)-1 as idx,count(*) over() as n
 from a join public.program_versions v on v.id=a.source_version_id and v.owner_id=a.owner_id cross join lateral jsonb_array_elements(v.definition->'days')d where not(d->>'is_rest_day')::boolean),
 progress as materialized(select p.session_id,bool_and(p.completed>=p.required) as full_workout,sum(p.completed) as completed from public.program_saved_progress(null,p_assignment)p group by p.session_id)
 select w.id,w.source_cycle_position::int,w.source_rotation,w.source_rotation::bigint*d.n+d.idx,(w.finished_at at time zone a.schedule_timezone)::date,w.schedule_due_on,p.full_workout
 from a join public.workout_sessions w on w.program_assignment_id=a.id and w.owner_id=a.owner_id
 join progress p on p.session_id=w.id and p.completed>0 join days d on d.day_position=w.source_cycle_position
 where w.status='completed' and w.finished_at is not null and (w.finished_at at time zone a.schedule_timezone)::date>=a.schedule_start_date and (w.schedule_due_on is not null or w.id=a.schedule_first_session_id);
$$;
revoke all on function public.program_schedule_facts(uuid) from public,anon,service_role;
grant execute on function public.program_schedule_facts(uuid) to authenticated;

-- One cursor governs future binding, adherence and calendar projections.
create function public.program_schedule_cursor(p_assignment uuid) returns jsonb
language plpgsql stable security invoker set search_path='' as $$
declare a public.program_assignments;v public.program_versions;days jsonb;n int;origin_rank int;origin_index bigint;next_index bigint;pos int;rot int;due date;ready date;last_date date;last_pos int;gap int;span int;origin_offset int;full_rotations int;last_session uuid;
begin
 select * into a from public.program_assignments where id=p_assignment and owner_id=auth.uid();
 if a.id is null or a.schedule_start_date is null then return null;end if;
 select * into v from public.program_versions where id=a.source_version_id and owner_id=auth.uid();
 days:=public.program_schedule_days(a.id);
 n:=jsonb_array_length(days);span:=(days->0->>'calendar_span')::int;
 select (d->>'calendar_offset')::int into origin_offset from jsonb_array_elements(days)d where (d->>'cycle_position')::int=a.schedule_origin_position;
 select count(*) into origin_rank from jsonb_array_elements(days)d where (d->>'cycle_position')::int<a.schedule_origin_position;
 origin_index:=a.schedule_origin_rotation::bigint*n+origin_rank;
 with done as(select distinct work_index from public.program_schedule_facts(a.id) where full_workout and work_index>=origin_index),
 numbered as(select work_index,origin_index+row_number() over(order by work_index)-1 as expected from done)
 select coalesce(min(expected) filter(where work_index<>expected),origin_index+count(*)) into next_index from numbered;
 rot:=(next_index/n)::int;pos:=(days->(next_index%n)::int->>'cycle_position')::int;
 -- First full resolution per occurrence is stable under repetitions. Recovery
 -- follows the most recent first resolution, skipping already-resolved gaps.
 due:=a.schedule_start_date+(rot-a.schedule_origin_rotation)*span+(days->(next_index%n)::int->>'calendar_offset')::int-origin_offset;
 with first_resolutions as(
  select distinct on(f.work_index) f.closed_on,f.day_position,w.finished_at,w.id
  from public.program_schedule_facts(a.id)f join public.workout_sessions w on w.id=f.session_id and w.owner_id=auth.uid()
  where f.full_workout and f.work_index<next_index
  order by f.work_index,w.finished_at,w.id
 )
 select coalesce((select r.closed_on+(select (d->>'recovery_days')::int from jsonb_array_elements(days)d where (d->>'cycle_position')::int=r.day_position) from first_resolutions r order by r.finished_at desc,r.id desc limit 1),due) into due;
 select f.closed_on,f.day_position,f.session_id into last_date,last_pos,last_session from public.program_schedule_facts(a.id)f join public.workout_sessions w on w.id=f.session_id and w.owner_id=auth.uid() order by w.finished_at desc,w.id desc limit 1;
 if last_date is not null then
  select (d->>'recovery_days')::int into gap from jsonb_array_elements(days)d where (d->>'cycle_position')::int=last_pos;
  ready:=greatest(due,last_date+greatest(1,gap));
 else ready:=due;end if;
 select coalesce(min(w.schedule_due_on),due) into due from public.workout_sessions w where w.owner_id=auth.uid() and w.program_assignment_id=a.id and w.source_rotation=rot and w.source_cycle_position=pos;
 with done as(select distinct rotation,day_position from public.program_schedule_facts(a.id) where full_workout),
 rotations as(select rotation from done group by rotation having count(*)=n)
 select count(*) into full_rotations from rotations;
 return jsonb_build_object('position',pos,'rotation',rot,'workIndex',next_index,'originIndex',origin_index,'dueOn',due,'readyOn',ready,'name',days->(next_index%n)::int->>'name','dayId',days->(next_index%n)::int->>'id','number',next_index%n+1,'trainingDays',n,'completedRotations',full_rotations,'complete',coalesce(full_rotations>=(v.definition->'program'->>'duration_rotations')::int,false),'lastCompleted',(select jsonb_build_object('sessionId',f.session_id,'position',f.day_position,'rotation',f.rotation,'date',f.closed_on) from public.program_schedule_facts(a.id)f join public.workout_sessions w on w.id=f.session_id and w.owner_id=auth.uid() where f.full_workout order by w.finished_at desc,w.id desc limit 1),'lastSession',last_session,'lastTrainingOn',last_date,'startDate',a.schedule_start_date,'timezone',a.schedule_timezone);
end $$;
revoke all on function public.program_schedule_cursor(uuid) from public,anon,service_role;
grant execute on function public.program_schedule_cursor(uuid) to authenticated;

create function body_private.assignment_schedule_input() returns trigger language plpgsql security invoker set search_path='' as $$
declare zone text;cmd jsonb;day date;last_w public.workout_sessions;v public.program_versions;first_pos int;next_pos int;origin_rot int:=0;
begin
 if current_user<>'authenticated' then return new;end if;
 perform 1 from public.profiles where id=auth.uid() for update nowait;
 if tg_op='UPDATE' and old.schedule_start_date is not null then
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
create trigger assignment_schedule_input before insert or update on public.program_assignments for each row execute function body_private.assignment_schedule_input();

create function public.configure_program_schedule(p_assignment uuid,p_start date,p_timezone text,p_request uuid) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare a public.program_assignments;cmd jsonb;
begin
 if auth.uid() is null then raise exception 'Sign in required' using errcode='42501';end if;
 if p_request is null then raise exception 'Request required' using errcode='22023';end if;
 perform 1 from public.profiles where id=auth.uid() for update;
 select * into a from public.program_assignments where id=p_assignment and owner_id=auth.uid() for update;
 if a.id is null then raise exception 'Assignment unavailable' using errcode='42501';end if;
 cmd:=jsonb_build_object('start',p_start,'timezone',p_timezone,'request',p_request);
 if a.schedule_command->>'request'=p_request::text then
  if a.schedule_command is distinct from cmd then raise exception 'Schedule request reused' using errcode='23514';end if;
  return public.program_schedule_cursor(a.id);
 end if;
 update public.program_assignments set schedule_command=cmd where id=a.id and owner_id=auth.uid();
 update public.account_preferences set scheduling_timezone=p_timezone where owner_id=auth.uid();
 if not found then raise exception 'Preferences unavailable; finish account setup' using errcode='23514';end if;
 return public.program_schedule_cursor(a.id);
end $$;
revoke all on function public.configure_program_schedule(uuid,date,text,uuid) from public,anon,service_role;
grant execute on function public.configure_program_schedule(uuid,date,text,uuid) to authenticated;

create or replace function body_private.bind_program_assignment() returns trigger language plpgsql security invoker set search_path='' as $$
declare a public.program_assignments;v public.program_versions;last_w public.workout_sessions;cursor_state jsonb;days jsonb;span int;origin_offset int;
begin
 if current_user<>'authenticated' or new.source_program_version_id is null then return new;end if;
 perform 1 from public.profiles where id=auth.uid() for update nowait;
 select * into v from public.program_versions where id=new.source_program_version_id and owner_id=auth.uid();
 select * into a from public.program_assignments where owner_id=auth.uid() and state='active' for update;
 if a.id is not null and (a.program_id<>new.source_program_id or a.source_version_id is distinct from v.id) then
  update public.program_assignments set state='archived',ended_at=clock_timestamp() where id=a.id and owner_id=auth.uid();a.id:=null;
 end if;
 if a.id is null then
  insert into public.program_assignments(owner_id,program_id,cycle_length,next_cycle_position,source_version_id)
  values(auth.uid(),new.source_program_id,(v.definition->'program'->>'cycle_length')::int,new.source_cycle_position,v.id) returning * into a;
 end if;
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

create or replace function public.program_adherence(p_session uuid default null) returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare a public.program_assignments;v public.program_versions;last_w public.workout_sessions;first_day jsonb;next_day jsonb;result jsonb;cursor_state jsonb;
begin
 if auth.uid() is null then raise exception 'Sign in required' using errcode='42501';end if;
 if p_session is null then select * into a from public.program_assignments where owner_id=auth.uid() and state='active';
 else select x.* into a from public.program_assignments x join public.workout_sessions w on w.program_assignment_id=x.id and w.owner_id=x.owner_id where w.id=p_session and w.owner_id=auth.uid();end if;
 if a.id is null or a.source_version_id is null then return null;end if;
 select * into v from public.program_versions where id=a.source_version_id and owner_id=auth.uid();
 select * into last_w from public.workout_sessions w where w.program_assignment_id=a.id and w.owner_id=auth.uid() and exists(select 1 from public.program_saved_progress(w.id) p where p.completed>0) order by started_at desc,id desc limit 1;
 select value into first_day from jsonb_array_elements(v.definition->'days') where not(value->>'is_rest_day')::boolean order by (value->>'cycle_position')::int limit 1;
 select value into next_day from jsonb_array_elements(v.definition->'days') where not(value->>'is_rest_day')::boolean and (value->>'cycle_position')::int>coalesce(last_w.source_cycle_position,0) order by (value->>'cycle_position')::int limit 1;
 next_day:=coalesce(next_day,first_day);
 with progress as materialized(select * from public.program_saved_progress(null,a.id)),
 sessions as (select w.id,w.source_rotation,w.source_cycle_position,w.started_at,bool_and(p.completed>=p.required) as full_workout from public.workout_sessions w join progress p on p.session_id=w.id where w.owner_id=auth.uid() group by w.id having sum(p.completed)>0),
 rotations as (select source_rotation from sessions where full_workout group by source_rotation having count(distinct source_cycle_position)=(select count(*) from jsonb_array_elements(v.definition->'days') d where not(d->>'is_rest_day')::boolean))
 select jsonb_build_object('assignmentId',a.id,'name',v.definition->'program'->>'name','version',v.id,'nextPosition',(next_day->>'cycle_position')::int,'nextName',next_day->>'name','nextNumber',(select count(*) from jsonb_array_elements(v.definition->'days') d where not(d->>'is_rest_day')::boolean and (d->>'cycle_position')::int<=(next_day->>'cycle_position')::int),'trainingDays',(select count(*) from jsonb_array_elements(v.definition->'days') d where not(d->>'is_rest_day')::boolean),'completedWorkouts',(select count(*) from sessions),'recentWorkouts',(select count(*) from sessions where started_at>=now()-interval '30 days'),'lastName',last_w.day_name_snapshot,'lastAt',last_w.started_at,'completedRotations',(select count(*) from rotations),'completedMovements',(select count(*) from progress where completed>=required),'partialMovements',(select count(*) from progress where completed>0 and completed<required)) into result;
 result:=result||jsonb_build_object('activeSession',(select z.id from public.workout_sessions z where z.owner_id=auth.uid() and z.program_assignment_id=a.id and z.status='in_progress'),'activeName',(select z.day_name_snapshot from public.workout_sessions z where z.owner_id=auth.uid() and z.program_assignment_id=a.id and z.status='in_progress'),'currentRotation',coalesce(last_w.source_rotation,0)+1,'durationRotations',v.definition->'program'->'duration_rotations','programComplete',case when (v.definition->'program'->>'duration_rotations')::int is null then false else (result->>'completedRotations')::int>=(v.definition->'program'->>'duration_rotations')::int end);
 cursor_state:=public.program_schedule_cursor(a.id);
 if cursor_state is not null then
  result:=result||jsonb_build_object('nextPosition',(cursor_state->>'position')::int,'nextName',cursor_state->>'name','nextNumber',(cursor_state->>'number')::int,'currentRotation',(cursor_state->>'rotation')::int+1,'completedRotations',(cursor_state->>'completedRotations')::int,'programComplete',case when (v.definition->'program'->>'duration_rotations')::int is null then false else (cursor_state->>'completedRotations')::int>=(v.definition->'program'->>'duration_rotations')::int end,'scheduled',true,'dueOn',cursor_state->>'dueOn','readyOn',cursor_state->>'readyOn');
 end if;
 return result;
end $$;

create function body_private.schedule_session_snapshot_guard() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if current_user='authenticated' and new.schedule_due_on is distinct from old.schedule_due_on then raise exception 'Schedule evidence is immutable' using errcode='23514';end if;return new;
end $$;
create trigger schedule_session_snapshot_guard before update on public.workout_sessions for each row execute function body_private.schedule_session_snapshot_guard();

-- Requested windows are at most 42 calendar dates. Only derived events leave SQL.
create function public.program_schedule(p_assignment uuid default null,p_from date default null,p_days integer default 7) returns jsonb
language plpgsql stable security invoker set search_path='' as $$
declare a public.program_assignments;v public.program_versions;cursor_state jsonb;today date;first_date date;until_date date;events jsonb:='[]'::jsonb;history jsonb;days jsonb;n int;idx bigint;pos int;rot int;projected date;prior_date date;prior_pos int;distance int;due date;iteration int:=0;cutoff date;jump_cycles int;done_indices bigint[];span int;origin_offset int;
begin
 if auth.uid() is null then raise exception 'Sign in required' using errcode='42501';end if;
 if p_days is null or p_days not between 1 and 42 or p_from is not null and (p_from<'1900-01-01' or p_from>'2200-01-01') then raise exception 'Invalid calendar window' using errcode='22023';end if;
 if p_assignment is null then select * into a from public.program_assignments where owner_id=auth.uid() and state='active';
 else select * into a from public.program_assignments where id=p_assignment and owner_id=auth.uid();end if;
 if a.id is null then return null;end if;
 if a.schedule_start_date is null then return jsonb_build_object('assignmentId',a.id,'configured',false,'state',a.state);end if;
 select * into v from public.program_versions where id=a.source_version_id and owner_id=auth.uid();
 today:=(statement_timestamp() at time zone a.schedule_timezone)::date;
 first_date:=coalesce(p_from,today-extract(isodow from today)::int+1);until_date:=first_date+p_days;
 cutoff:=case when a.state in('archived','completed') then (a.ended_at at time zone a.schedule_timezone)::date else null end;
 cursor_state:=public.program_schedule_cursor(a.id);
 select coalesce(array_agg(distinct work_index) filter(where full_workout),array[]::bigint[]) into done_indices from public.program_schedule_facts(a.id);
 days:=public.program_schedule_days(a.id);
 n:=jsonb_array_length(days);span:=(days->0->>'calendar_span')::int;
 select (d->>'calendar_offset')::int into origin_offset from jsonb_array_elements(days)d where (d->>'cycle_position')::int=a.schedule_origin_position;
 -- Actual records and original scheduled dates are separate entries, never backdated completions.
 with facts as materialized(select * from public.program_schedule_facts(a.id)),
 resolutions as(select distinct on(f.work_index) f.* from facts f join public.workout_sessions w on w.id=f.session_id and w.owner_id=auth.uid() where f.full_workout order by f.work_index,w.finished_at,w.id),
 actual as(select f.closed_on as date,f.day_position,f.rotation,f.session_id,case when f.full_workout then 'completed' else 'recorded_partial' end as status,f.scheduled_on as original_due from facts f where f.closed_on>=first_date and f.closed_on<until_date),
 overdue as(select coalesce(f.scheduled_on,a.schedule_start_date+(f.rotation-a.schedule_origin_rotation)*span+(select (d->>'calendar_offset')::int from jsonb_array_elements(days)d where (d->>'cycle_position')::int=f.day_position)-origin_offset) as date,f.day_position,f.rotation,min(f.session_id::text)::uuid as session_id,'overdue'::text as status,coalesce(f.scheduled_on,a.schedule_start_date+(f.rotation-a.schedule_origin_rotation)*span+(select (d->>'calendar_offset')::int from jsonb_array_elements(days)d where (d->>'cycle_position')::int=f.day_position)-origin_offset) as original_due from resolutions f
 where f.full_workout and f.closed_on>coalesce(f.scheduled_on,a.schedule_start_date+(f.rotation-a.schedule_origin_rotation)*span+(select (d->>'calendar_offset')::int from jsonb_array_elements(days)d where (d->>'cycle_position')::int=f.day_position)-origin_offset) group by 1,2,3,6),
 combined as(select * from actual union all select * from overdue where date>=first_date and date<until_date),
 names as(select (d->>'cycle_position')::int as day_position,d->>'name' as name,d->>'id' as day_id from jsonb_array_elements(days)d)
 select coalesce(jsonb_agg(jsonb_build_object('date',c.date,'position',c.day_position,'rotation',c.rotation,'sessionId',c.session_id,'status',c.status,'originalDueOn',c.original_due,'name',names.name,'dayId',names.day_id,'kind','workout','recommended',false) order by c.date,c.day_position,c.session_id),'[]') into history from combined c join names using(day_position);
 events:=events||history;
 -- Historical rest is bounded recovery after actual training, not an elapsed-date counter.
 with facts as materialized(select distinct closed_on,day_position,rotation from public.program_schedule_facts(a.id) where closed_on>=first_date-greatest(a.cycle_length,365) and closed_on<until_date),
 gaps as(select f.*,(select (d->>'recovery_days')::int from jsonb_array_elements(days)d where (d->>'cycle_position')::int=f.day_position) as gap from facts f),
 rests as(select distinct i>=coalesce((select min((d->>'cycle_position')::int)-g.day_position from jsonb_array_elements(days)d where (d->>'cycle_position')::int>g.day_position),a.cycle_length-g.day_position+(days->0->>'cycle_position')::int) as extra,g.closed_on+i as date,((g.day_position+i-1)%a.cycle_length)+1 as day_position,g.rotation+(g.day_position+i-1)/a.cycle_length as rotation from gaps g cross join lateral generate_series(1,g.gap-1)i where g.closed_on+i>=first_date and g.closed_on+i<until_date and g.closed_on+i<(cursor_state->>'readyOn')::date)
 select coalesce(jsonb_agg(jsonb_build_object('date',date,'recoveryOnly',extra,'position',day_position,'rotation',rotation,'dayId',(select d->>'id' from jsonb_array_elements(v.definition->'days')d where (d->>'cycle_position')::int=day_position),'kind','rest','status','planned_rest','name','Rest','recommended',false) order by date),'[]') into history from rests;
 events:=events||history;
  -- Keep the outstanding original date even if the user returns weeks later.
  due:=(cursor_state->>'dueOn')::date;
  if not(cursor_state->>'complete')::boolean and (cutoff is null or due<=cutoff) and due<today and due>=first_date and due<until_date then
   events:=events||jsonb_build_array(jsonb_build_object('date',due,'kind','workout','status','overdue','name',cursor_state->>'name','position',(cursor_state->>'position')::int,'rotation',(cursor_state->>'rotation')::int,'dayId',cursor_state->>'dayId','recommended',false,'originalDueOn',due));
  end if;
 if a.state='active' and not(cursor_state->>'complete')::boolean then
  due:=(cursor_state->>'dueOn')::date;projected:=greatest(today,(cursor_state->>'readyOn')::date);
  idx:=(cursor_state->>'workIndex')::bigint;
  -- Jump whole cycles for distant adjacent/month windows; loop at most one cycle + 42 days.
  if first_date>projected+span then
   jump_cycles:=(first_date-projected)/span-1;
   idx:=idx+jump_cycles::bigint*n;projected:=projected+jump_cycles*span;
  end if;
  while projected<until_date and iteration<p_days+367 loop
   pos:=(days->(idx%n)::int->>'cycle_position')::int;rot:=(idx/n)::int;
   -- An out-of-order full workout keeps its own identity; it does not consume the gap.
   if not (idx=any(done_indices)) then
    if projected>=first_date then
     events:=events||jsonb_build_array(jsonb_build_object('date',projected,'kind','workout','status',case when projected=today then 'due' else 'scheduled' end,'name',days->(idx%n)::int->>'name','dayId',days->(idx%n)::int->>'id','position',pos,'rotation',rot,'recommended',idx=(cursor_state->>'workIndex')::bigint,'originalDueOn',case when idx=(cursor_state->>'workIndex')::bigint then due else projected end,'carried',idx=(cursor_state->>'workIndex')::bigint and due<projected));
    end if;
   end if;
   prior_date:=projected;prior_pos:=pos;idx:=idx+1;
   select (d->>'recovery_days')::int into distance from jsonb_array_elements(days)d where (d->>'cycle_position')::int=prior_pos;
   while (idx=any(done_indices)) loop idx:=idx+1;end loop;
   projected:=prior_date+distance;
   select coalesce(jsonb_agg(jsonb_build_object('date',d::date,'recoveryOnly',(d::date-prior_date)>=coalesce((select min((j->>'cycle_position')::int)-prior_pos from jsonb_array_elements(days)j where (j->>'cycle_position')::int>prior_pos),a.cycle_length-prior_pos+(days->0->>'cycle_position')::int),'position',((prior_pos+(d::date-prior_date)-1)%a.cycle_length)+1,'rotation',rot+(prior_pos+(d::date-prior_date)-1)/a.cycle_length,'dayId',(select j->>'id' from jsonb_array_elements(v.definition->'days')j where (j->>'cycle_position')::int=((prior_pos+(d::date-prior_date)-1)%a.cycle_length)+1),'kind','rest','status','planned_rest','name','Rest','recommended',false)),'[]') into history from generate_series(greatest(prior_date+1,first_date)::timestamp,least(projected-1,until_date-1)::timestamp,interval '1 day')d;
   events:=events||history;iteration:=iteration+1;
  end loop;
 end if;
 -- Extended minimum-rest guidance is recovery, not a fabricated program rest position.
 select coalesce(jsonb_agg(case when e->>'kind'='rest' and (e->>'recoveryOnly'='true' or not exists(select 1 from jsonb_array_elements(v.definition->'days')d where (d->>'cycle_position')::int=(e->>'position')::int and (d->>'is_rest_day')::boolean)) then (e-'position'-'rotation'-'dayId'-'recoveryOnly')||jsonb_build_object('status','recovery','name','Recovery') else e-'recoveryOnly' end),'[]'::jsonb) into events from jsonb_array_elements(events)e;
 -- Workout evidence wins over derived rest; each event includes assignment identity.
 select coalesce(jsonb_agg(e||jsonb_build_object('assignmentId',a.id) order by e->>'date',e->>'status',e->>'position'),'[]') into events
 from(select distinct e from jsonb_array_elements(events)e where (cutoff is null or (e->>'date')::date<=cutoff) and not(e->>'kind'='rest' and exists(select 1 from jsonb_array_elements(events)x where x->>'date'=e->>'date' and x->>'kind'='workout')))q;
 return jsonb_build_object('assignmentId',a.id,'configured',true,'state',a.state,'name',v.definition->'program'->>'name','version',a.source_version_id,'timezone',a.schedule_timezone,'startDate',a.schedule_start_date,'today',today,'programComplete',(cursor_state->>'complete')::boolean,'progress',cursor_state,'from',first_date,'until',until_date,'next',case when a.state='active' and not(cursor_state->>'complete')::boolean then cursor_state||jsonb_build_object('recommendedOn',greatest(today,(cursor_state->>'readyOn')::date)) else null end,'events',events);
end $$;
revoke all on function public.program_schedule(uuid,date,integer) from public,anon,service_role;
grant execute on function public.program_schedule(uuid,date,integer) to authenticated;
revoke all on all functions in schema body_private from public,anon,authenticated,service_role;
commit;
