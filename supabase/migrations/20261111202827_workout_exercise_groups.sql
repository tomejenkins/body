-- Structural groups reference existing movements/selections, never actual sets.
begin;
create table public.program_day_groups (
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null default auth.uid(),
 program_day_id uuid not null,
 group_type text not null default 'superset' check(group_type='superset'),
 members uuid[] not null check(cardinality(members) between 2 and 3 and array_position(members,null) is null and array_ndims(members)=1),
 foreign key(program_day_id,owner_id) references public.program_days(id,owner_id) on delete cascade
);
create index program_day_groups_parent on public.program_day_groups(owner_id,program_day_id);
alter table public.program_day_groups enable row level security;
revoke all on public.program_day_groups from public,anon,authenticated,service_role;
grant select,delete on public.program_day_groups to authenticated;
grant insert(program_day_id,members),update(members) on public.program_day_groups to authenticated;
create policy owner_read on public.program_day_groups for select to authenticated using(owner_id=(select auth.uid()));
create policy owner_insert on public.program_day_groups for insert to authenticated with check(owner_id=(select auth.uid()));
create policy owner_update on public.program_day_groups for update to authenticated using(owner_id=(select auth.uid())) with check(owner_id=(select auth.uid()));
create policy owner_delete on public.program_day_groups for delete to authenticated using(owner_id=(select auth.uid()));
create function body_private.program_group_input() returns trigger language plpgsql security invoker set search_path='' as $$
declare root uuid;begin
 if current_user='authenticated' and new.owner_id is distinct from auth.uid() then raise exception 'Owned group required' using errcode='42501';end if;
 select d.program_id into root from public.program_days d where d.id=new.program_day_id and d.owner_id=new.owner_id and not d.is_rest_day;
 perform 1 from public.programs p where p.id=root and p.owner_id=new.owner_id for update;
 if root is null or cardinality(new.members) not between 2 and 3 or (select count(distinct x) from unnest(new.members)x)<>cardinality(new.members)
 or (select count(*) from public.program_slots s where s.id=any(new.members) and s.program_day_id=new.program_day_id and s.owner_id=new.owner_id)<>cardinality(new.members)
 then raise exception 'Choose two or three distinct slots from this day' using errcode='22023';end if;
 if exists(select 1 from public.program_day_groups g where g.owner_id=new.owner_id and g.program_day_id=new.program_day_id and g.id<>new.id and g.members&&new.members) then raise exception 'Slot already grouped' using errcode='23514';end if;
 return new;end $$;
create trigger program_group_input before insert or update on public.program_day_groups for each row execute function body_private.program_group_input();

create function body_private.grouped_template_slot_removal() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if current_user='authenticated' and pg_trigger_depth()=1 and exists(select 1 from public.program_day_groups g where g.owner_id=auth.uid() and old.id=any(g.members)) then raise exception 'Ungroup this slot before deleting it' using errcode='23514';end if;
 return old;end $$;
create trigger grouped_template_slot_removal before delete on public.program_slots for each row execute function body_private.grouped_template_slot_removal();
revoke all on function body_private.grouped_template_slot_removal() from public,anon,authenticated,service_role;

-- Immutable command receipts are also the sole grouping facts. Latest revision
-- is the current structure; no mutable membership/completion mirror exists.
create table public.workout_group_commands (
 owner_id uuid not null default auth.uid(),request_id uuid not null,
 workout_session_id uuid not null,group_id uuid not null,
 operation text not null check(operation in('create','edit','ungroup')),
 expected_revision bigint not null check(expected_revision>=0),
 revision bigint not null,group_type text not null default 'superset' check(group_type='superset'),
 members jsonb not null check(jsonb_typeof(members)='array' and pg_column_size(members)<4096),
 source_group_id uuid,created_at timestamptz not null default clock_timestamp(),
 primary key(owner_id,request_id),unique(owner_id,group_id,revision),
 foreign key(workout_session_id,owner_id) references public.workout_sessions(id,owner_id) on delete cascade,
 check((operation='ungroup' and jsonb_array_length(members)=0) or (operation<>'ungroup' and jsonb_array_length(members) between 2 and 3))
);
create index workout_group_latest on public.workout_group_commands(owner_id,workout_session_id,group_id,revision desc);
alter table public.workout_group_commands enable row level security;
revoke all on public.workout_group_commands from public,anon,authenticated,service_role;
grant select on public.workout_group_commands to authenticated;
grant insert(request_id,workout_session_id,group_id,operation,expected_revision,members) on public.workout_group_commands to authenticated;
create policy owner_read on public.workout_group_commands for select to authenticated using(owner_id=(select auth.uid()));
create policy owner_insert on public.workout_group_commands for insert to authenticated with check(owner_id=(select auth.uid()));
create function public.workout_groups(p_session uuid) returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare result jsonb;begin
 if auth.uid() is null or not exists(select 1 from public.workout_sessions where id=p_session and owner_id=auth.uid()) then raise exception 'Workout unavailable' using errcode='42501';end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',g.group_id,'type',g.group_type,'revision',g.revision,'members',g.members,'sourceGroupId',g.source_group_id) order by g.created_at,g.group_id),'[]'::jsonb) into result
 from(select distinct on(group_id) * from public.workout_group_commands where owner_id=auth.uid() and workout_session_id=p_session order by group_id,revision desc)g where operation<>'ungroup';
 return result;end $$;
create function public.workout_group_layout(p_session uuid) returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare groups jsonb;result jsonb;begin
 groups:=public.workout_groups(p_session);
 with entities as (
  select 'movement'::text as type,m.id,m.position as position,coalesce(m.slot_snapshot->>'title',p.name,'Movement') as label from public.workout_movements m left join public.movement_patterns p on p.id=(m.slot_snapshot->>'movement_pattern_id')::uuid where m.owner_id=auth.uid() and m.workout_session_id=p_session and m.removed_at is null
  union all select 'selection',e.id,100+e.position,e.exercise_name_snapshot from public.workout_exercises e where e.owner_id=auth.uid() and e.workout_session_id=p_session and e.removed_at is null and e.program_movement_id is null
 )select jsonb_build_object('groups',groups,'favoriteEdited',exists(select 1 from public.workout_group_commands c where c.owner_id=auth.uid() and c.workout_session_id=p_session and (c.operation<>'create' or c.source_group_id is null)),'hasHistory',exists(select 1 from public.workout_group_commands where owner_id=auth.uid() and workout_session_id=p_session),'order',coalesce(jsonb_agg(jsonb_build_object('type',type,'id',id) order by position,id),'[]'::jsonb),'labels',coalesce(jsonb_object_agg(type||':'||id,label),'{}'::jsonb)) into result from entities;
 return result;end $$;
create function body_private.workout_group_input() returns trigger language plpgsql security invoker set search_path='' as $$
declare w public.workout_sessions;prior public.workout_group_commands;m jsonb;day jsonb;g jsonb;slots jsonb;active_groups jsonb;
begin
 if auth.uid() is null or new.owner_id is distinct from auth.uid() then raise exception 'Owned group required' using errcode='42501';end if;
 select * into w from public.workout_sessions where id=new.workout_session_id and owner_id=auth.uid() for update;
 if w.id is null then raise exception 'Workout unavailable' using errcode='42501';end if;
 if w.status<>'in_progress' or w.archived_at is not null or (public.workout_continuity(w.id)->>'state') in('expired','check_in') then raise exception 'Active workout required; refresh' using errcode='23514';end if;
 select * into prior from public.workout_group_commands where owner_id=auth.uid() and group_id=new.group_id order by revision desc limit 1;
 if new.operation='create' then
  if prior.group_id is not null or new.expected_revision<>0 then raise exception 'Group changed; refresh' using errcode='40001';end if;
 else
  if prior.group_id is null or prior.workout_session_id<>w.id or prior.operation='ungroup' then raise exception 'Group unavailable' using errcode='42501';end if;
  if prior.revision<>new.expected_revision then raise exception 'Group changed; refresh' using errcode='40001';end if;
 end if;
 if (select count(*) from public.workout_group_commands where owner_id=auth.uid() and workout_session_id=w.id)>=1000 then raise exception 'Group edit limit reached' using errcode='23514';end if;
 if jsonb_typeof(new.members)<>'array' or (new.operation='ungroup' and new.members<>'[]'::jsonb) or (new.operation<>'ungroup' and jsonb_array_length(new.members) not between 2 and 3)
 or (select count(distinct x) from jsonb_array_elements(new.members)x)<>jsonb_array_length(new.members) then raise exception 'Choose two or three distinct members' using errcode='22023';end if;
 active_groups:=public.workout_groups(w.id);
 for m in select value from jsonb_array_elements(new.members) loop
  if jsonb_typeof(m)<>'object' or m-array['type','id']<>'{}'::jsonb or not(m ?& array['type','id']) or jsonb_typeof(m->'id')<>'string' then raise exception 'Invalid member' using errcode='22023';end if;
  if m->>'type'='movement' then
   if not exists(select 1 from public.workout_movements where id=(m->>'id')::uuid and owner_id=auth.uid() and workout_session_id=w.id and removed_at is null) then raise exception 'Movement unavailable' using errcode='42501';end if;
  elsif m->>'type'='selection' then
   if not exists(select 1 from public.workout_exercises where id=(m->>'id')::uuid and owner_id=auth.uid() and workout_session_id=w.id and removed_at is null and program_movement_id is null) then raise exception 'Selection unavailable' using errcode='42501';end if;
  else raise exception 'Unsupported member type' using errcode='22023';end if;
  if exists(select 1 from jsonb_array_elements(active_groups) x cross join lateral jsonb_array_elements(x->'members')v where (x->>'id')::uuid<>new.group_id and v=m) then raise exception 'Movement already grouped' using errcode='23514';end if;
 end loop;
 new.revision:=new.expected_revision+1;new.created_at:=clock_timestamp();new.source_group_id:=prior.source_group_id;
 if new.operation='create' and w.source_program_version_id is not null then
  select d into day from public.program_versions v cross join lateral jsonb_array_elements(v.definition->'days')d where v.id=w.source_program_version_id and (d->>'id')::uuid=w.source_program_day_id;
  select jsonb_agg(to_jsonb(z.slot_identity) order by x.i) into slots from jsonb_array_elements(new.members) with ordinality x(m,i) join public.workout_movements z on z.id=(x.m->>'id')::uuid and x.m->>'type'='movement' and z.owner_id=auth.uid();
  select x into g from jsonb_array_elements(coalesce(day->'groups','[]'::jsonb))x where x->'members'=slots;
  new.source_group_id:=(g->>'id')::uuid;
 elsif new.operation='create' and w.favorite_workout_id is not null then
  select jsonb_agg(to_jsonb(z.position) order by x.i) into slots from jsonb_array_elements(new.members) with ordinality x(m,i) join public.workout_movements z on z.id=(x.m->>'id')::uuid and x.m->>'type'='movement' and z.owner_id=auth.uid();
  select x.key::uuid into new.source_group_id from (
   select s->'group'->>'key' key,jsonb_agg(to_jsonb(i::int) order by (s->'group'->>'position')::int) positions from jsonb_array_elements(w.favorite_definition) with ordinality x(s,i) where s ? 'group' group by s->'group'->>'key'
  )x where x.positions=slots;
 end if;
 return new;end $$;
create trigger workout_group_input before insert on public.workout_group_commands for each row execute function body_private.workout_group_input();
create function public.change_workout_group(p_session uuid,p_group uuid,p_operation text,p_expected bigint,p_members jsonb,p_request uuid) returns jsonb language plpgsql security invoker set search_path='' as $$
declare r public.workout_group_commands;begin
 if auth.uid() is null then raise exception 'Sign in required' using errcode='42501';end if;
 if p_session is null or p_group is null or p_request is null or p_expected is null or p_expected<0 or p_operation is null or p_operation not in('create','edit','ungroup') or p_members is null then raise exception 'Invalid grouping command' using errcode='22023';end if;
 -- Same lock as selection, set logging and closure; no new training transaction.
 perform 1 from public.workout_sessions where id=p_session and owner_id=auth.uid() for update;
 select * into r from public.workout_group_commands where owner_id=auth.uid() and request_id=p_request;
 if r.request_id is not null then
  if row(r.workout_session_id,r.group_id,r.operation,r.expected_revision,r.members) is distinct from row(p_session,p_group,p_operation,p_expected,p_members) then raise exception 'Grouping request reused' using errcode='23514';end if;
 else
  if (public.workout_continuity(p_session)->>'state')='expired' then return null;end if;
  insert into public.workout_group_commands(request_id,workout_session_id,group_id,operation,expected_revision,members) values(p_request,p_session,p_group,p_operation,p_expected,p_members) returning * into r;
 end if;
 return jsonb_build_object('groupId',r.group_id,'revision',r.revision,'groups',public.workout_groups(p_session));end $$;

-- Removing an identity used by a group requires deliberate ungrouping first.
-- Selection changes inside a movement remain supported under existing guards.
create function body_private.group_member_removal() returns trigger language plpgsql security invoker set search_path='' as $$
declare sid uuid;member jsonb;begin
 if current_user<>'authenticated' then return new;end if;
 if old.removed_at is null and new.removed_at is not null then
  sid:=old.workout_session_id;member:=jsonb_build_object('type',case when tg_table_name='workout_movements' then 'movement' else 'selection' end,'id',old.id);
  perform 1 from public.workout_sessions where id=sid and owner_id=auth.uid() for update;
  if exists(select 1 from jsonb_array_elements(public.workout_groups(sid))g where g->'members' @> jsonb_build_array(member)) then raise exception 'Ungroup this movement before removing it' using errcode='23514';end if;
 end if;return new;end $$;
create trigger group_member_removal before update of removed_at on public.workout_movements for each row execute function body_private.group_member_removal();
create trigger group_member_removal before update of removed_at on public.workout_exercises for each row execute function body_private.group_member_removal();
create or replace function public.program_definition(p_program uuid) returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare recipe jsonb;
begin
 if auth.uid() is null then raise exception 'Sign in required' using errcode='42501';end if;
 select jsonb_build_object('schema_version',1,'program',to_jsonb(p)-array['source_attribution','clone_request_id'],
 'equipment',coalesce((select jsonb_agg(e.equipment_type_id order by e.equipment_type_id) from public.program_equipment e where e.program_id=p.id and e.owner_id=auth.uid()),'[]'::jsonb),
 'tags',coalesce((select jsonb_agg(to_jsonb(t) order by t.slug) from public.program_tag_links l join public.program_tags t on t.slug=l.tag_slug where l.program_id=p.id),'[]'::jsonb),
 'media',jsonb_build_object('cover',(select to_jsonb(m) from public.program_media m where m.id=p.cover_media_id),'gallery',coalesce((select jsonb_agg(to_jsonb(m)||jsonb_build_object('position',g.position) order by g.position) from public.program_gallery g join public.program_media m on m.id=g.media_id where g.program_id=p.id),'[]'::jsonb)),
 'rules',coalesce((select jsonb_agg(to_jsonb(r) order by r.id) from public.program_progression_rules r where r.program_id=p.id and r.owner_id=auth.uid()),'[]'::jsonb),
 'days',coalesce((select jsonb_agg(to_jsonb(d)||jsonb_build_object('groups',coalesce((select jsonb_agg(jsonb_build_object('id',g.id,'type',g.group_type,'members',to_jsonb(g.members)) order by g.id) from public.program_day_groups g where g.program_day_id=d.id and g.owner_id=auth.uid()),'[]'::jsonb),'slots',coalesce((select jsonb_agg(to_jsonb(s)||jsonb_build_object(
 'equipment',coalesce((select jsonb_agg(e.equipment_type_id order by e.equipment_type_id) from public.program_slot_equipment e where e.slot_id=s.id and e.owner_id=auth.uid()),'[]'::jsonb),
 'alternatives',coalesce((select jsonb_agg(to_jsonb(a) order by a.position) from public.program_slot_alternatives a where a.slot_id=s.id and a.owner_id=auth.uid()),'[]'::jsonb),
 'sets',coalesce((select jsonb_agg(to_jsonb(x) order by x.position) from public.program_set_prescriptions x where x.slot_id=s.id and x.owner_id=auth.uid()),'[]'::jsonb)) order by s.position) from public.program_slots s where s.program_day_id=d.id and s.owner_id=auth.uid()),'[]'::jsonb)) order by d.cycle_position) from public.program_days d where d.program_id=p.id and d.owner_id=auth.uid()),'[]'::jsonb)) into recipe from public.programs p where p.id=p_program and p.owner_id=auth.uid();
 return recipe;
end $$;
create or replace function public.clone_program(p_version uuid,p_name text,p_request uuid) returns uuid language plpgsql security invoker set search_path='' as $$
declare source public.program_versions; recipe jsonb; root jsonb; day jsonb; slot jsonb; rule jsonb; entry jsonb; equip jsonb; target uuid; new_day uuid; new_slot uuid; new_rule uuid; rule_map jsonb:='{}'::jsonb;slot_map jsonb:='{}'::jsonb;
begin
 if auth.uid() is null then raise exception 'Sign in required' using errcode='42501';end if;
 if p_request is null or p_name is null or length(btrim(p_name)) not between 1 and 200 then raise exception 'Invalid copy request' using errcode='22023';end if;
 -- Root profile lock serializes same-user copy retries, without creating assignments.
 perform 1 from public.profiles where id=auth.uid() for update;
 select * into source from public.program_versions where id=p_version;
 if source.id is null then raise exception 'Source version unavailable' using errcode='42501';end if;
 select id into target from public.programs where owner_id=auth.uid() and clone_request_id=p_request;
 if target is not null then
  if not exists(select 1 from public.programs where id=target and source_version_id=p_version) then raise exception 'Copy request already used' using errcode='23514';end if;return target;
 end if;
 recipe:=source.definition;root:=recipe->'program';
 insert into public.programs(owner_id,name,description,cycle_length,is_template,objective,experience_level,estimated_sessions_per_week,duration_rotations,source_version_id,clone_request_id,summary,description_markdown,cover_media_id,sessions_min,sessions_max,session_minutes_min,session_minutes_max,flexible_rotation)
 values(auth.uid(),btrim(p_name),root->>'description',(root->>'cycle_length')::smallint,false,root->>'objective',root->>'experience_level',(root->>'estimated_sessions_per_week')::numeric,(root->>'duration_rotations')::int,source.id,p_request,root->>'summary',root->>'description_markdown',(root->>'cover_media_id')::uuid,(root->>'sessions_min')::smallint,(root->>'sessions_max')::smallint,(root->>'session_minutes_min')::smallint,(root->>'session_minutes_max')::smallint,coalesce((root->>'flexible_rotation')::boolean,false)) returning id into target;
 insert into public.program_tag_links(program_id,owner_id,tag_slug) select target,auth.uid(),value->>'slug' from jsonb_array_elements(coalesce(recipe->'tags','[]'::jsonb));
 insert into public.program_gallery(program_id,owner_id,position,media_id) select target,auth.uid(),(value->>'position')::int,(value->>'id')::uuid from jsonb_array_elements(coalesce(recipe->'media'->'gallery','[]'::jsonb));
 for equip in select * from jsonb_array_elements(recipe->'equipment') loop insert into public.program_equipment(program_id,owner_id,equipment_type_id) values(target,auth.uid(),(equip#>>'{}')::uuid);end loop;
 for rule in select * from jsonb_array_elements(recipe->'rules') loop
  insert into public.program_progression_rules(program_id,owner_id,name,strategy,config_version,load_step_kg,rep_step,reps_min,reps_max,effort_scale,effort_value) values(target,auth.uid(),rule->>'name',rule->>'strategy',(rule->>'config_version')::smallint,(rule->>'load_step_kg')::numeric,(rule->>'rep_step')::int,(rule->>'reps_min')::int,(rule->>'reps_max')::int,rule->>'effort_scale',(rule->>'effort_value')::numeric) returning id into new_rule;
  rule_map:=rule_map||jsonb_build_object(rule->>'id',new_rule);
 end loop;
 for day in select * from jsonb_array_elements(recipe->'days') loop
  insert into public.program_days(owner_id,program_id,cycle_length,cycle_position,name,is_rest_day,notes,focus,phase_number,minimum_rest_hours,maximum_rest_hours)
  values(auth.uid(),target,(root->>'cycle_length')::smallint,(day->>'cycle_position')::smallint,day->>'name',(day->>'is_rest_day')::boolean,day->>'notes',day->>'focus',(day->>'phase_number')::smallint,(day->>'minimum_rest_hours')::numeric,(day->>'maximum_rest_hours')::numeric) returning id into new_day;
  for slot in select * from jsonb_array_elements(day->'slots') loop
   insert into public.program_slots(owner_id,program_day_id,position,movement_pattern_id,exercise_id,target_sets,target_reps_min,target_reps_max,target_weight_kg,rest_seconds,notes,primary_muscle_id,required_exercise_type,exercise_locked,is_optional,rest_seconds_max,progression_rule_id)
   values(auth.uid(),new_day,(slot->>'position')::int,(slot->>'movement_pattern_id')::uuid,(slot->>'exercise_id')::uuid,(slot->>'target_sets')::smallint,(slot->>'target_reps_min')::int,(slot->>'target_reps_max')::int,(slot->>'target_weight_kg')::numeric,(slot->>'rest_seconds')::int,slot->>'notes',(slot->>'primary_muscle_id')::uuid,slot->>'required_exercise_type',(slot->>'exercise_locked')::boolean,(slot->>'is_optional')::boolean,(slot->>'rest_seconds_max')::int,(rule_map->>(slot->>'progression_rule_id'))::uuid) returning id into new_slot;slot_map:=slot_map||jsonb_build_object(slot->>'id',new_slot);
   insert into public.program_slot_equipment(slot_id,owner_id,equipment_type_id) select new_slot,auth.uid(),value::uuid from jsonb_array_elements_text(slot->'equipment');
   for entry in select * from jsonb_array_elements(slot->'alternatives') loop insert into public.program_slot_alternatives(slot_id,owner_id,exercise_id,position) values(new_slot,auth.uid(),(entry->>'exercise_id')::uuid,(entry->>'position')::int);end loop;
   for entry in select * from jsonb_array_elements(slot->'sets') loop insert into public.program_set_prescriptions(slot_id,owner_id,position,set_type,reps_min,reps_max,target_weight_kg,load_mode,load_guidance,effort_scale,effort_value,intended_to_failure,rest_seconds,notes) values(new_slot,auth.uid(),(entry->>'position')::int,entry->>'set_type',(entry->>'reps_min')::int,(entry->>'reps_max')::int,(entry->>'target_weight_kg')::numeric,entry->>'load_mode',entry->>'load_guidance',entry->>'effort_scale',(entry->>'effort_value')::numeric,(entry->>'intended_to_failure')::boolean,(entry->>'rest_seconds')::int,entry->>'notes');end loop;
  end loop;
  for entry in select value from jsonb_array_elements(coalesce(day->'groups','[]'::jsonb)) loop
   insert into public.program_day_groups(program_day_id,members) select new_day,array_agg((slot_map->>value)::uuid order by i) from jsonb_array_elements_text(entry->'members') with ordinality x(value,i);
  end loop;
 end loop;
 return target;
end $$;

-- Metadata is generated from authoritative source slots, not caller JSON.
alter table public.favorite_workouts drop constraint favorite_workouts_source_type_check;
alter table public.favorite_workouts add constraint favorite_workouts_source_type_check check(source_type in('program_day','completed_ad_hoc','completed_workout'));
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
  elsif new.source_type in('completed_ad_hoc','completed_workout') then
   if new.source_version_id is not null or new.source_day_id is not null or new.source_session_id is null then raise exception 'Completed ad-hoc source required' using errcode='22023';end if;
   select * into w from public.workout_sessions where id=new.source_session_id and owner_id=auth.uid() and status='completed' and archived_at is null and (new.source_type='completed_workout' or source_program_version_id is null);
   if w.id is null then raise exception 'Owned completed ad-hoc workout required' using errcode='42501';end if;
   with eligible as materialized(
    select e.* from public.workout_exercises e where e.workout_session_id=w.id and e.owner_id=auth.uid() and e.removed_at is null and e.logging_kind not in('assisted','duration') and exists(select 1 from public.qualifying_workout_sets(w.id)q where q.selection_id=e.id)
   ), selected as(
    select distinct on(coalesce(e.program_movement_id,e.id)) e.*,m.slot_snapshot,m.position as movement_position from eligible e left join public.workout_movements m on m.id=e.program_movement_id and m.owner_id=e.owner_id and m.removed_at is null order by coalesce(e.program_movement_id,e.id),e.position desc,e.id
   ), structures as(
    select coalesce(x.slot_snapshot,jsonb_build_object('title',x.exercise_name_snapshot,'exercise_id',x.exercise_id,'movement_pattern_id',(select ep.movement_pattern_id from public.exercise_movement_patterns ep where ep.exercise_id=x.exercise_id and ep.is_primary limit 1),'primary_muscle_id',(select em.muscle_group_id from public.exercise_muscles em where em.exercise_id=x.exercise_id and em.muscle_role='primary' order by em.muscle_group_id limit 1),'required_exercise_type',(select exercise_type from public.exercises where id=x.exercise_id),'target_sets',coalesce(x.prescribed_sets,3),'target_reps_min',8,'target_reps_max',12)) as slot,x.exercise_id,row_number() over(order by coalesce(x.movement_position,100+x.position),x.id)::int as i from selected x
   )select jsonb_agg(public.favorite_slot_structure(slot,i,exercise_id) order by i) into slots from structures;
   if slots is null then raise exception 'Confirmed supported training required to save structure' using errcode='23514';end if;
   new.source_key:=w.id::text;new.attribution:=jsonb_strip_nulls(jsonb_build_object('type',new.source_type,'workout',w.name,'program',coalesce(w.program_name_snapshot,w.favorite_attribution->>'program'),'day',coalesce(w.day_name_snapshot,w.favorite_attribution->>'day'),'fromFavorite',w.favorite_attribution->>'favorite'));
  else raise exception 'Unsupported favorite source' using errcode='22023';end if;
  new.definition:=slots;new.created_at:=clock_timestamp();new.archived:=false;
 end if;
 new.name:=btrim(new.name);return new;
end $$;
create or replace function public.save_favorite_workout(p_type text,p_source uuid,p_day uuid,p_name text,p_request uuid) returns uuid
language plpgsql security invoker set search_path='' as $$
declare f public.favorite_workouts;k text;result uuid;
begin
 if auth.uid() is null then raise exception 'Sign in required' using errcode='42501';end if;
 if p_source is null or p_request is null or p_name is null or length(btrim(p_name)) not between 1 and 100 or p_type not in('program_day','completed_ad_hoc','completed_workout') or (p_type='program_day') is distinct from (p_day is not null) then raise exception 'Invalid favorite source/name' using errcode='22023';end if;
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
 values(auth.uid(),p_name,p_type,case when p_type='program_day' then p_source end,p_day,case when p_type in('completed_ad_hoc','completed_workout') then p_source end,p_request) returning id into result;return result;
end $$;

create function body_private.favorite_groups_snapshot() returns trigger language plpgsql security invoker set search_path='' as $$
declare original jsonb;g jsonb;m jsonb;slots jsonb;ord int;positions int[];n int;
begin
 if current_user<>'authenticated' then return new;end if;
 if new.source_type='program_day' then
  select d into original from public.program_versions v cross join lateral jsonb_array_elements(v.definition->'days')d where v.id=new.source_version_id and (d->>'id')::uuid=new.source_day_id;
  original:=coalesce(original->'groups','[]'::jsonb);
 else original:=public.workout_groups(new.source_session_id);end if;
 slots:=new.definition;
 for g in select value from jsonb_array_elements(original) loop
  positions:='{}'::int[];
  if new.source_type='program_day' then
   for m in select value from jsonb_array_elements(g->'members') loop
    select i::int into ord from public.program_versions v cross join lateral jsonb_array_elements(v.definition->'days')d cross join lateral jsonb_array_elements(d->'slots') with ordinality x(s,i) where v.id=new.source_version_id and (d->>'id')::uuid=new.source_day_id and s->>'id'=m#>>'{}';
    if ord is not null then positions:=array_append(positions,ord);end if;
   end loop;
  else
   for m in select value from jsonb_array_elements(g->'members') loop
    with eligible as (
     select e.* from public.workout_exercises e where e.workout_session_id=new.source_session_id and e.owner_id=auth.uid() and e.removed_at is null and e.logging_kind not in('assisted','duration') and exists(select 1 from public.qualifying_workout_sets(new.source_session_id)q where q.selection_id=e.id)
    ), chosen as(
     select distinct on(coalesce(e.program_movement_id,e.id)) e.*,z.position as movement_position from eligible e left join public.workout_movements z on z.id=e.program_movement_id and z.owner_id=e.owner_id and z.removed_at is null order by coalesce(e.program_movement_id,e.id),e.position desc,e.id
    ), ordered as(select *,row_number() over(order by coalesce(movement_position,100+position),id)::int i from chosen)
    select i into ord from ordered where (m->>'type'='movement' and program_movement_id=(m->>'id')::uuid) or (m->>'type'='selection' and id=(m->>'id')::uuid);
    if ord is not null then positions:=array_append(positions,ord);end if;
   end loop;
  end if;
  if cardinality(positions)>=2 then
   for n in 1..cardinality(positions) loop
    slots:=jsonb_set(slots,array[(positions[n]-1)::text,'group'],jsonb_build_object('key',g->>'id','type','superset','position',n));
   end loop;
  end if;
 end loop;
 new.definition:=slots;return new;end $$;
create trigger z_favorite_groups_snapshot before insert on public.favorite_workouts for each row execute function body_private.favorite_groups_snapshot();

create function body_private.initialize_exercise_groups() returns trigger language plpgsql security invoker set search_path='' as $$
declare recipe jsonb;g jsonb;members jsonb;key text;begin
 if current_user<>'authenticated' then return null;end if;
 if new.source_program_version_id is not null then
  select d into recipe from public.program_versions v cross join lateral jsonb_array_elements(v.definition->'days')d where v.id=new.source_program_version_id and (d->>'id')::uuid=new.source_program_day_id;
  for g in select value from jsonb_array_elements(coalesce(recipe->'groups','[]'::jsonb)) loop
   select jsonb_agg(jsonb_build_object('type','movement','id',z.id) order by x.i) into members from jsonb_array_elements_text(g->'members') with ordinality x(slot,i) join public.workout_movements z on z.slot_identity=x.slot::uuid and z.workout_session_id=new.id and z.owner_id=auth.uid();
   perform public.change_workout_group(new.id,gen_random_uuid(),'create',0,members,gen_random_uuid());
  end loop;
 elsif new.favorite_workout_id is not null then
  for key in select distinct s->'group'->>'key' from jsonb_array_elements(new.favorite_definition)s where s ? 'group' loop
   select jsonb_agg(jsonb_build_object('type','movement','id',z.id) order by (s->'group'->>'position')::int) into members from jsonb_array_elements(new.favorite_definition) with ordinality x(s,i) join public.workout_movements z on z.workout_session_id=new.id and z.owner_id=auth.uid() and z.position=i where s->'group'->>'key'=key;
   perform public.change_workout_group(new.id,gen_random_uuid(),'create',0,members,gen_random_uuid());
  end loop;
 end if;return null;end $$;
create trigger zz_initialize_exercise_groups after insert on public.workout_sessions for each row execute function body_private.initialize_exercise_groups();
revoke all on function public.workout_group_layout(uuid),public.workout_groups(uuid),public.change_workout_group(uuid,uuid,text,bigint,jsonb,uuid) from public,anon,service_role;
grant execute on function public.workout_group_layout(uuid),public.workout_groups(uuid),public.change_workout_group(uuid,uuid,text,bigint,jsonb,uuid) to authenticated;
revoke all on function body_private.program_group_input(),body_private.workout_group_input(),body_private.group_member_removal(),body_private.favorite_groups_snapshot(),body_private.initialize_exercise_groups() from public,anon,authenticated,service_role;
commit;
