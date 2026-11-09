-- Explicit scheduling intent and independent, immutable workout structures.
begin;
create table public.program_schedule_decisions(
 id uuid primary key default gen_random_uuid(),owner_id uuid not null references public.profiles(id) on delete cascade,
 assignment_id uuid not null references public.program_assignments(id),version_id uuid not null references public.program_versions(id),
 day_id uuid not null,rotation integer not null check(rotation>=0),work_index bigint not null check(work_index>=0),
 kind text not null check(kind in('skip','accept_partial','defer','cancel_defer')),
 session_id uuid references public.workout_sessions(id),target_date date,original_due_on date not null,
 expected_revision bigint not null check(expected_revision>=0),request_id uuid not null,
 created_at timestamptz not null default clock_timestamp(),actor_id uuid not null references public.profiles(id),
 unique(owner_id,request_id),check((kind='accept_partial')=(session_id is not null)),check((kind='defer')=(target_date is not null)));
alter table public.program_schedule_decisions enable row level security;
revoke all on public.program_schedule_decisions from public,anon,authenticated,service_role;
grant select on public.program_schedule_decisions to authenticated;
grant insert(owner_id,assignment_id,version_id,day_id,rotation,work_index,kind,session_id,target_date,expected_revision,request_id) on public.program_schedule_decisions to authenticated;
create policy owner_read on public.program_schedule_decisions for select to authenticated using(owner_id=(select auth.uid()));
create policy owner_insert on public.program_schedule_decisions for insert to authenticated with check(owner_id=(select auth.uid()));
create unique index schedule_explicit_resolution on public.program_schedule_decisions(assignment_id,work_index) where kind in('skip','accept_partial');
create index schedule_decision_occurrence on public.program_schedule_decisions(owner_id,assignment_id,work_index,created_at desc,id);
create function public.program_schedule_revision(p_assignment uuid) returns bigint language sql stable security invoker set search_path='' as $$
 select count(*) from public.program_schedule_decisions where assignment_id=p_assignment and owner_id=auth.uid();
$$;
create function public.program_schedule_resolutions(p_assignment uuid)
returns table(work_index bigint,day_position integer,rotation integer,resolved_on date,resolved_at timestamptz,resolution text,session_id uuid)
language sql stable security invoker set search_path='' as $$
 with a as(select * from public.program_assignments where id=p_assignment and owner_id=auth.uid()),
 actual as(select f.work_index,f.day_position,f.rotation,f.closed_on,w.finished_at,'completed'::text,f.session_id from public.program_schedule_facts(p_assignment)f join public.workout_sessions w on w.id=f.session_id and w.owner_id=auth.uid() where f.full_workout),
 explicit as(select d.work_index,(vday->>'cycle_position')::int,d.rotation,
 case when d.kind='accept_partial' then f.closed_on else (d.created_at at time zone a.schedule_timezone)::date end,d.created_at,d.kind,d.session_id
 from a join public.program_schedule_decisions d on d.assignment_id=a.id and d.owner_id=a.owner_id join public.program_versions v on v.id=a.source_version_id and v.owner_id=a.owner_id cross join lateral jsonb_array_elements(v.definition->'days')vday
 left join public.program_schedule_facts(p_assignment)f on f.session_id=d.session_id
 where (vday->>'id')::uuid=d.day_id and (d.kind='skip' or d.kind='accept_partial' and f.session_id is not null))
 select * from actual union all select * from explicit;
$$;
revoke all on function public.program_schedule_revision(uuid),public.program_schedule_resolutions(uuid) from public,anon,service_role;
grant execute on function public.program_schedule_revision(uuid),public.program_schedule_resolutions(uuid) to authenticated;

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
 with done as(select distinct rotation,day_position from public.program_schedule_facts(a.id) where full_workout),
 rotations as(select rotation from done group by rotation having count(*)=n)
 select count(*) into full_rotations from rotations;
 return jsonb_build_object('decisionRevision',public.program_schedule_revision(a.id),'naturalReadyOn',natural_ready,'deferredUntil',defer_date,'position',pos,'rotation',rot,'workIndex',next_index,'originIndex',origin_index,'dueOn',due,'readyOn',ready,'name',days->(next_index%n)::int->>'name','dayId',days->(next_index%n)::int->>'id','number',next_index%n+1,'trainingDays',n,'completedRotations',full_rotations,'complete',coalesce(full_rotations>=(v.definition->'program'->>'duration_rotations')::int,false),'lastCompleted',(select jsonb_build_object('sessionId',f.session_id,'position',f.day_position,'rotation',f.rotation,'date',f.closed_on) from public.program_schedule_facts(a.id)f join public.workout_sessions w on w.id=f.session_id and w.owner_id=auth.uid() where f.full_workout order by w.finished_at desc,w.id desc limit 1),'lastSession',last_session,'lastTrainingOn',last_date,'startDate',a.schedule_start_date,'timezone',a.schedule_timezone);
end $$;
revoke all on function public.program_schedule_cursor(uuid) from public,anon,service_role;
grant execute on function public.program_schedule_cursor(uuid) to authenticated;

create function body_private.schedule_decision_input() returns trigger language plpgsql security invoker set search_path='' as $$
declare a public.program_assignments;c jsonb;latest_kind text;
begin
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
create trigger schedule_decision_input before insert or update or delete on public.program_schedule_decisions for each row execute function body_private.schedule_decision_input();
create function public.decide_program_schedule(p_assignment uuid,p_version uuid,p_day uuid,p_rotation integer,p_expected bigint,p_revision bigint,p_kind text,p_request uuid,p_session uuid default null,p_date date default null) returns uuid
language plpgsql security invoker set search_path='' as $$
declare d public.program_schedule_decisions;result uuid;
begin
 if auth.uid() is null then raise exception 'Sign in required' using errcode='42501';end if;
 if p_request is null then raise exception 'Request required' using errcode='22023';end if;
 perform 1 from public.profiles where id=auth.uid() for update;
 select * into d from public.program_schedule_decisions where owner_id=auth.uid() and request_id=p_request;
 if d.id is not null then
  if row(d.assignment_id,d.version_id,d.day_id,d.rotation,d.work_index,d.expected_revision,d.kind,d.session_id,d.target_date) is distinct from row(p_assignment,p_version,p_day,p_rotation,p_expected,p_revision,p_kind,p_session,p_date) then raise exception 'Decision request reused' using errcode='23514';end if;return d.id;
 end if;
 if public.workout_continuity()->>'state'='expired' then return null;end if;
 insert into public.program_schedule_decisions(owner_id,assignment_id,version_id,day_id,rotation,work_index,expected_revision,kind,request_id,session_id,target_date)
 values(auth.uid(),p_assignment,p_version,p_day,p_rotation,p_expected,p_revision,p_kind,p_request,p_session,p_date) returning id into result;return result;
end $$;
revoke all on function public.decide_program_schedule(uuid,uuid,uuid,integer,bigint,bigint,text,uuid,uuid,date) from public,anon,service_role;
grant execute on function public.decide_program_schedule(uuid,uuid,uuid,integer,bigint,bigint,text,uuid,uuid,date) to authenticated;

create function public.start_assigned_workout(p_assignment uuid,p_version uuid,p_day uuid,p_expected bigint,p_revision bigint,p_request uuid) returns uuid
language plpgsql security invoker set search_path='' as $$
declare a public.program_assignments;v public.program_versions;w public.workout_sessions;c jsonb;pos int;
begin
 if auth.uid() is null then raise exception 'Sign in required' using errcode='42501';end if;
 if p_request is null then raise exception 'Request required' using errcode='22023';end if;
 perform 1 from public.profiles where id=auth.uid() for update;
 select * into w from public.workout_sessions where owner_id=auth.uid() and program_start_nonce=p_request;
 if w.id is not null then
  if row(w.program_assignment_id,w.source_program_version_id,w.source_program_day_id) is distinct from row(p_assignment,p_version,p_day) then raise exception 'Start request reused' using errcode='23514';end if;return w.id;
 end if;
 select * into a from public.program_assignments where id=p_assignment and owner_id=auth.uid() for update;
 if a.id is null then raise exception 'Assignment unavailable' using errcode='42501';end if;
 if a.state<>'active' or a.schedule_start_date is null or a.source_version_id is distinct from p_version then raise exception 'Active configured assignment required' using errcode='23514';end if;
 c:=public.program_schedule_cursor(a.id);
 if p_expected is distinct from (c->>'workIndex')::bigint or p_revision is distinct from (c->>'decisionRevision')::bigint then raise exception 'Schedule changed; refresh' using errcode='40001';end if;
 select * into v from public.program_versions where id=a.source_version_id and owner_id=auth.uid();
 select (d->>'cycle_position')::int into pos from jsonb_array_elements(v.definition->'days')d where (d->>'id')::uuid=p_day and not(d->>'is_rest_day')::boolean;
 if pos is null then raise exception 'Training day required' using errcode='22023';end if;
 return public.start_program_workout(v.id,pos,p_request);
end $$;
revoke all on function public.start_assigned_workout(uuid,uuid,uuid,bigint,bigint,uuid) from public,anon,service_role;
grant execute on function public.start_assigned_workout(uuid,uuid,uuid,bigint,bigint,uuid) to authenticated;

create or replace function public.program_schedule(p_assignment uuid default null,p_from date default null,p_days integer default 7) returns jsonb
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
 select coalesce(array_agg(distinct work_index),array[]::bigint[]) into done_indices from public.program_schedule_resolutions(a.id);
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
     events:=events||jsonb_build_array(jsonb_build_object('date',projected,'kind','workout','status',case when projected=today then 'due' when (cursor_state->>'deferredUntil')::date>=today and idx=(cursor_state->>'workIndex')::bigint then 'deferred' else 'scheduled' end,'name',days->(idx%n)::int->>'name','dayId',days->(idx%n)::int->>'id','position',pos,'rotation',rot,'recommended',idx=(cursor_state->>'workIndex')::bigint,'originalDueOn',case when idx=(cursor_state->>'workIndex')::bigint then due else projected end,'carried',idx=(cursor_state->>'workIndex')::bigint and due<projected));
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
 -- Decisions are factual intent, separate from actual completed training.
 select coalesce(jsonb_agg(jsonb_build_object('date',(d.created_at at time zone a.schedule_timezone)::date,'kind','workout','status',case d.kind when 'skip' then 'skipped' when 'accept_partial' then 'accepted_partial' when 'cancel_defer' then 'defer_cancelled' else 'deferred' end,'name',vday->>'name','dayId',d.day_id,'position',(vday->>'cycle_position')::int,'rotation',d.rotation,'sessionId',d.session_id,'targetDate',d.target_date,'originalDueOn',d.original_due_on,'recommended',false) order by d.created_at,d.id),'[]'::jsonb) into history
 from public.program_schedule_decisions d cross join lateral jsonb_array_elements(v.definition->'days')vday where d.assignment_id=a.id and d.owner_id=auth.uid() and (vday->>'id')::uuid=d.day_id and (d.created_at at time zone a.schedule_timezone)::date>=first_date and (d.created_at at time zone a.schedule_timezone)::date<until_date;
 events:=events||history;
 -- Extended minimum-rest guidance is recovery, not a fabricated program rest position.
 select coalesce(jsonb_agg(case when e->>'kind'='rest' and (e->>'recoveryOnly'='true' or not exists(select 1 from jsonb_array_elements(v.definition->'days')d where (d->>'cycle_position')::int=(e->>'position')::int and (d->>'is_rest_day')::boolean)) then (e-'position'-'rotation'-'dayId'-'recoveryOnly')||jsonb_build_object('status','recovery','name','Recovery') else e-'recoveryOnly' end),'[]'::jsonb) into events from jsonb_array_elements(events)e;
 -- Workout evidence wins over derived rest; each event includes assignment identity.
 select coalesce(jsonb_agg(e||jsonb_build_object('assignmentId',a.id) order by e->>'date',e->>'status',e->>'position'),'[]') into events
 from(select distinct e from jsonb_array_elements(events)e where (cutoff is null or (e->>'date')::date<=cutoff) and not(e->>'kind'='rest' and exists(select 1 from jsonb_array_elements(events)x where x->>'date'=e->>'date' and x->>'kind'='workout')))q;
 return jsonb_build_object('assignmentId',a.id,'configured',true,'state',a.state,'name',v.definition->'program'->>'name','version',a.source_version_id,'timezone',a.schedule_timezone,'startDate',a.schedule_start_date,'today',today,'programComplete',(cursor_state->>'complete')::boolean,'progress',cursor_state,'from',first_date,'until',until_date,'next',case when a.state='active' and not(cursor_state->>'complete')::boolean then cursor_state||jsonb_build_object('recommendedOn',greatest(today,(cursor_state->>'readyOn')::date)) else null end,'events',events);
end $$;
revoke all on function public.program_schedule(uuid,date,integer) from public,anon,service_role;
grant execute on function public.program_schedule(uuid,date,integer) to authenticated;

create table public.favorite_workouts(
 id uuid primary key default gen_random_uuid(),owner_id uuid not null references public.profiles(id) on delete cascade,name text not null check(length(btrim(name)) between 1 and 100),
 source_type text not null check(source_type in('program_day','completed_ad_hoc')),source_version_id uuid references public.program_versions(id) on delete set null,source_day_id uuid,source_session_id uuid references public.workout_sessions(id) on delete set null,
 source_key text not null,definition jsonb not null,attribution jsonb not null,save_request uuid not null,
 archived boolean not null default false,created_at timestamptz not null default clock_timestamp(),unique(owner_id,source_type,source_key),unique(owner_id,save_request),unique(id,owner_id),
 check(jsonb_typeof(definition)='array' and jsonb_array_length(definition) between 1 and 100 and pg_column_size(definition)<1048576));
alter table public.favorite_workouts enable row level security;
revoke all on public.favorite_workouts from public,anon,authenticated,service_role;
grant select on public.favorite_workouts to authenticated;
grant insert(owner_id,name,source_type,source_version_id,source_day_id,source_session_id,save_request),update(name,archived) on public.favorite_workouts to authenticated;
create policy owner_read on public.favorite_workouts for select to authenticated using(owner_id=(select auth.uid()));
create policy owner_insert on public.favorite_workouts for insert to authenticated with check(owner_id=(select auth.uid()));
create policy owner_update on public.favorite_workouts for update to authenticated using(owner_id=(select auth.uid())) with check(owner_id=(select auth.uid()));
create index favorite_workout_list on public.favorite_workouts(owner_id,archived,created_at desc,id);

-- A whitelist, never the actual performance JSON. Even author-prescribed loads
-- are omitted: normal exact-exercise suggestions remain separate/unconfirmed.
create function public.favorite_slot_structure(p_slot jsonb,p_position integer,p_default uuid default null) returns jsonb
language sql immutable security invoker set search_path='' as $$
 select jsonb_build_object('origin','favorite','position',p_position,'title',p_slot->>'title','intent',p_slot->>'intent','exercise_id',coalesce(p_default,(p_slot->>'exercise_id')::uuid),'movement_pattern_id',p_slot->'movement_pattern_id','primary_muscle_id',p_slot->'primary_muscle_id','required_exercise_type',p_slot->'required_exercise_type','target_sets',coalesce((p_slot->>'target_sets')::int,3),'target_reps_min',coalesce((p_slot->>'target_reps_min')::int,8),'target_reps_max',coalesce((p_slot->>'target_reps_max')::int,12),'rest_seconds',p_slot->'rest_seconds','equipment',coalesce(p_slot->'equipment','[]'::jsonb),'sets',coalesce((select jsonb_agg(jsonb_build_object('position',i,'set_type',z->>'set_type','reps_min',z->'reps_min','reps_max',z->'reps_max','rest_seconds',z->'rest_seconds','effort_scale',z->'effort_scale','effort_value',z->'effort_value','intended_to_failure',z->'intended_to_failure') order by i) from jsonb_array_elements(coalesce(p_slot->'sets','[]'::jsonb)) with ordinality q(z,i)),'[]'::jsonb));
$$;
revoke all on function public.favorite_slot_structure(jsonb,integer,uuid) from public,anon,service_role;
grant execute on function public.favorite_slot_structure(jsonb,integer,uuid) to authenticated;
create function body_private.favorite_workout_input() returns trigger language plpgsql security invoker set search_path='' as $$
declare v public.program_versions;w public.workout_sessions;day jsonb;slots jsonb;candidate record;
begin
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
   select * into w from public.workout_sessions where id=new.source_session_id and owner_id=auth.uid() and status='completed' and source_program_version_id is null;
   if w.id is null then raise exception 'Owned completed ad-hoc workout required' using errcode='42501';end if;
   with eligible as materialized(
    select e.* from public.workout_exercises e where e.workout_session_id=w.id and e.owner_id=auth.uid() and e.removed_at is null and e.logging_kind not in('assisted','duration') and exists(select 1 from public.workout_sets z where z.workout_exercise_id=e.id and z.owner_id=e.owner_id and z.status='completed' and z.inputs_confirmed and z.deleted_at is null and z.actual_reps>0 and z.set_type<>'warm_up' and (z.load_mode='bodyweight' or z.actual_weight_kg is not null))
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
create trigger favorite_workout_input before insert or update on public.favorite_workouts for each row execute function body_private.favorite_workout_input();
create function public.save_favorite_workout(p_type text,p_source uuid,p_day uuid,p_name text,p_request uuid) returns uuid
language plpgsql security invoker set search_path='' as $$
declare f public.favorite_workouts;k text;result uuid;
begin
 if auth.uid() is null then raise exception 'Sign in required' using errcode='42501';end if;
 if p_source is null or p_request is null or p_name is null or length(btrim(p_name)) not between 1 and 100 or p_type not in('program_day','completed_ad_hoc') or (p_type='program_day') is distinct from (p_day is not null) then raise exception 'Invalid favorite source/name' using errcode='22023';end if;
 perform 1 from public.profiles where id=auth.uid() for update;
 k:=p_source::text||case when p_type='program_day' then ':'||p_day::text else '' end;
 select * into f from public.favorite_workouts where owner_id=auth.uid() and save_request=p_request;
 if f.id is not null then if f.source_type<>p_type or f.source_key<>k then raise exception 'Favorite request reused' using errcode='23514';end if;return f.id;end if;
 select * into f from public.favorite_workouts where owner_id=auth.uid() and source_type=p_type and source_key=k for update;
 if f.id is not null then
  if f.archived and (select count(*) from public.favorite_workouts where owner_id=auth.uid() and not archived)>=100 then raise exception 'Favorite limit is 100' using errcode='23514';end if;
  update public.favorite_workouts set archived=false where id=f.id and owner_id=auth.uid();return f.id;
 end if;
 insert into public.favorite_workouts(owner_id,name,source_type,source_version_id,source_day_id,source_session_id,save_request)
 values(auth.uid(),p_name,p_type,case when p_type='program_day' then p_source end,p_day,case when p_type='completed_ad_hoc' then p_source end,p_request) returning id into result;return result;
end $$;
revoke all on function public.save_favorite_workout(text,uuid,uuid,text,uuid) from public,anon,service_role;
grant execute on function public.save_favorite_workout(text,uuid,uuid,text,uuid) to authenticated;
alter table public.workout_sessions add column favorite_workout_id uuid,add column favorite_start_nonce uuid,add column favorite_definition jsonb,add column favorite_attribution jsonb,
 add constraint favorite_session_owner foreign key(favorite_workout_id,owner_id) references public.favorite_workouts(id,owner_id),add constraint favorite_session_retry unique(owner_id,favorite_start_nonce);
grant insert(favorite_workout_id,favorite_start_nonce) on public.workout_sessions to authenticated;
create function body_private.favorite_session_input() returns trigger language plpgsql security invoker set search_path='' as $$
declare f public.favorite_workouts;
begin
 if current_user<>'authenticated' then return new;end if;
 if tg_op='UPDATE' then
  if row(new.favorite_workout_id,new.favorite_start_nonce,new.favorite_definition,new.favorite_attribution) is distinct from row(old.favorite_workout_id,old.favorite_start_nonce,old.favorite_definition,old.favorite_attribution) then raise exception 'Favorite execution source is immutable' using errcode='23514';end if;return new;
 end if;
 if new.favorite_workout_id is null then
  if new.favorite_start_nonce is not null then raise exception 'Favorite required' using errcode='22023';end if;return new;
 end if;
 perform 1 from public.profiles where id=auth.uid() for update nowait;
 if new.favorite_start_nonce is null or new.source_program_id is not null or new.source_program_day_id is not null or new.source_program_version_id is not null or new.program_assignment_id is not null or new.source_rotation is not null or new.source_cycle_position is not null or new.program_name_snapshot is not null or new.day_name_snapshot is not null or new.program_start_nonce is not null or new.ad_hoc_focus is not null then raise exception 'Independent favorite source required' using errcode='23514';end if;
 select * into f from public.favorite_workouts where id=new.favorite_workout_id and owner_id=auth.uid() and not archived;
 if f.id is null then raise exception 'Favorite unavailable' using errcode='42501';end if;
 new.owner_id:=auth.uid();new.name:=f.name;new.favorite_definition:=f.definition;new.favorite_attribution:=f.attribution||jsonb_build_object('favorite',f.name);return new;
end $$;
create trigger b0_favorite_session_input before insert or update on public.workout_sessions for each row execute function body_private.favorite_session_input();
create function body_private.initialize_favorite_movements() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if current_user<>'authenticated' or new.favorite_workout_id is null then return null;end if;
 insert into public.workout_movements(owner_id,workout_session_id,position) select auth.uid(),new.id,i::int from jsonb_array_elements(new.favorite_definition) with ordinality x(slot,i);return null;
end $$;
create trigger initialize_favorite_movements after insert on public.workout_sessions for each row execute function body_private.initialize_favorite_movements();
create function public.start_favorite_workout(p_favorite uuid,p_request uuid) returns uuid language plpgsql security invoker set search_path='' as $$
declare w public.workout_sessions;result uuid;
begin
 if auth.uid() is null then raise exception 'Sign in required' using errcode='42501';end if;
 if p_request is null then raise exception 'Request required' using errcode='22023';end if;
 perform 1 from public.profiles where id=auth.uid() for update;
 select * into w from public.workout_sessions where owner_id=auth.uid() and favorite_start_nonce=p_request;
 if w.id is not null then if w.favorite_workout_id is distinct from p_favorite then raise exception 'Favorite start request reused' using errcode='23514';end if;return w.id;end if;
 if public.workout_continuity()->>'state'='expired' then return null;end if;
 if exists(select 1 from public.workout_sessions where owner_id=auth.uid() and status='in_progress') then raise exception 'Finish or resume your active workout first' using errcode='23514';end if;
 insert into public.workout_sessions(owner_id,name,favorite_workout_id,favorite_start_nonce) values(auth.uid(),'Favorite workout',p_favorite,p_request) returning id into result;return result;
end $$;
revoke all on function public.start_favorite_workout(uuid,uuid) from public,anon,service_role;
grant execute on function public.start_favorite_workout(uuid,uuid) to authenticated;

create or replace function body_private.program_movement_snapshot() returns trigger language plpgsql security invoker set search_path='' as $$
declare w public.workout_sessions;v public.program_versions;day jsonb;slot jsonb;pattern_name text;intent jsonb;
begin
 select * into w from public.workout_sessions where id=new.workout_session_id and owner_id=auth.uid() for update nowait;
 if w.id is null then raise exception 'Workout unavailable' using errcode='42501';end if;
 if w.status<>'in_progress' or w.last_activity_at is not null and clock_timestamp()-w.last_activity_at>=make_interval(hours=>(public.workout_policy()->>'expire_hours')::int) then raise exception 'Workout closed or expired' using errcode='23514';end if;
 if w.favorite_workout_id is not null and new.suggested_pattern_id is null then
  if new.position is null or new.position not between 1 and jsonb_array_length(w.favorite_definition) then raise exception 'Saved movement unavailable' using errcode='22023';end if;
  slot:=w.favorite_definition->(new.position-1);
  new.owner_id:=auth.uid();new.slot_identity:=md5(w.favorite_workout_id::text||':'||new.position::text)::uuid;new.slot_snapshot:=slot||jsonb_build_object('id',new.slot_identity);return new;
 end if;
 if w.source_program_version_id is null then
  if new.position not between 1 and 100 or new.movement_nonce is null or new.suggested_pattern_id is null or new.suggested_muscle_id is null or new.suggested_type is null then raise exception 'Choose a supported movement' using errcode='22023';end if;
  if not exists(select 1 from public.exercises e join public.exercise_movement_patterns ep on ep.exercise_id=e.id and ep.is_primary join public.exercise_muscles em on em.exercise_id=e.id and em.muscle_role='primary' where e.archived_at is null and e.exercise_type=new.suggested_type and ep.movement_pattern_id=new.suggested_pattern_id and em.muscle_group_id=new.suggested_muscle_id and public.exercise_logging_kind(e.id) in('loaded','bodyweight')) then raise exception 'No supported exercises for this movement' using errcode='22023';end if;
  if new.suggested_intent is not null then
   intent:=public.movement_intent(new.suggested_intent);
   if intent is null or (intent->>'patternId')::uuid<>new.suggested_pattern_id or (intent->>'muscleId')::uuid<>new.suggested_muscle_id or intent->>'exerciseType'<>new.suggested_type then raise exception 'Unsupported movement intent' using errcode='22023';end if;
   if jsonb_array_length(intent->'exercises')>0 and not exists(select 1 from public.exercises e where e.owner_id is null and e.archived_at is null and e.slug in(select jsonb_array_elements_text(intent->'exercises')) and public.exercise_logging_kind(e.id) in('loaded','bodyweight')) then raise exception 'No supported exercises for intent' using errcode='22023';end if;
  end if;
  select name into pattern_name from public.movement_patterns where id=new.suggested_pattern_id;
  new.owner_id:=auth.uid();new.slot_identity:=new.id;
  new.slot_snapshot:=jsonb_build_object('intent',new.suggested_intent,'origin','ad_hoc','id',new.id,'title',coalesce(new.suggested_title,pattern_name),'movement_pattern_id',new.suggested_pattern_id,'primary_muscle_id',new.suggested_muscle_id,'required_exercise_type',new.suggested_type,'target_sets',3,'target_reps_min',case when new.suggested_type='compound' then 8 else 10 end,'target_reps_max',case when new.suggested_type='compound' then 12 else 15 end,'equipment','[]'::jsonb,'sets','[]'::jsonb);
  return new;
 end if;
 if new.suggested_intent is not null or new.suggested_pattern_id is not null or new.suggested_muscle_id is not null or new.suggested_type is not null or new.movement_nonce is not null then raise exception 'Program intent is immutable' using errcode='23514';end if;
 select * into v from public.program_versions where id=w.source_program_version_id and owner_id=auth.uid();
 select value into day from jsonb_array_elements(v.definition->'days') where (value->>'id')::uuid=w.source_program_day_id;
 if new.position is null or new.position not between 1 and 100 then raise exception 'Invalid movement order' using errcode='22023';end if;
 select value into slot from jsonb_array_elements(day->'slots') order by (value->>'position')::int offset new.position-1 limit 1;
 if slot is null then raise exception 'Program movement unavailable' using errcode='23514';end if;
 new.owner_id:=auth.uid();new.slot_identity:=(slot->>'id')::uuid;new.slot_snapshot:=slot;return new;
end $$;
-- One bounded read for the start page; source UUIDs, never names, drive actions.
create function public.workout_start_options() returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare a public.program_assignments;v public.program_versions;c jsonb;days jsonb;favorites jsonb;active_id uuid;
begin
 if auth.uid() is null then raise exception 'Sign in required' using errcode='42501';end if;
 select id into active_id from public.workout_sessions where owner_id=auth.uid() and status='in_progress';
 select * into a from public.program_assignments where owner_id=auth.uid() and state='active';
 if a.id is not null and a.source_version_id is not null and a.schedule_start_date is not null then
  select * into v from public.program_versions where id=a.source_version_id and owner_id=auth.uid();c:=public.program_schedule_cursor(a.id);
  with facts as materialized(select * from public.program_schedule_facts(a.id)),resolutions as materialized(select * from public.program_schedule_resolutions(a.id))
  select jsonb_agg(jsonb_build_object('id',d->>'id','position',(d->>'cycle_position')::int,'number',i,'name',d->>'name','recommended',not(c->>'complete')::boolean and (d->>'id')::uuid=(c->>'dayId')::uuid,'completed',exists(select 1 from facts f where f.rotation=(c->>'rotation')::int and f.day_position=(d->>'cycle_position')::int and f.full_workout),'resolution',(select r.resolution from resolutions r where r.rotation=(c->>'rotation')::int and r.day_position=(d->>'cycle_position')::int order by r.resolved_at desc limit 1),'resolved',exists(select 1 from resolutions r where r.rotation=(c->>'rotation')::int and r.day_position=(d->>'cycle_position')::int),'partialSession',(select f.session_id from facts f join public.workout_sessions w on w.id=f.session_id and w.owner_id=auth.uid() where f.rotation=(c->>'rotation')::int and f.day_position=(d->>'cycle_position')::int and not f.full_workout order by w.finished_at desc,w.id desc limit 1)) order by (d->>'cycle_position')::int) into days
  from jsonb_array_elements(public.program_schedule_days(a.id)) with ordinality x(d,i);
 end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',f.id,'name',f.name,'sourceType',f.source_type,'attribution',f.attribution,'movements',jsonb_array_length(f.definition)) order by f.created_at desc,f.id),'[]'::jsonb) into favorites from (select * from public.favorite_workouts where owner_id=auth.uid() and not archived order by created_at desc,id limit 100)f;
 return jsonb_build_object('activeSession',active_id,'assignment',case when c is not null then jsonb_build_object('id',a.id,'version',v.id,'name',v.definition->'program'->>'name','timezone',a.schedule_timezone,'today',(statement_timestamp() at time zone a.schedule_timezone)::date,'cursor',c,'days',days) else null end,'favorites',favorites);
end $$;
revoke all on function public.workout_start_options() from public,anon,service_role;
grant execute on function public.workout_start_options() to authenticated;
revoke all on all functions in schema body_private from public,anon,authenticated,service_role;
commit;
