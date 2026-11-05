-- Phase 7.2: controlled official catalog, never public community publishing.
begin;
-- A platform principal has no auth account/login. Person IDs retain an enforced
-- auth.users FK through a generated column; existing IDs/cascades are preserved.
alter table public.profiles drop constraint profiles_id_fkey;
alter table public.profiles add column principal_kind text not null default 'person' check(principal_kind in('person','platform')),
 add column auth_user_id uuid generated always as(case when principal_kind='person' then id end) stored references auth.users(id) on delete cascade,
 add constraint body_platform_principal check(principal_kind<>'platform' or id='6ab9fb82-8aae-5e49-9f9d-535b4a25d302' and display_name='Body');
create unique index profiles_auth_user on public.profiles(auth_user_id) where auth_user_id is not null;
insert into public.profiles(id,display_name,principal_kind) values('6ab9fb82-8aae-5e49-9f9d-535b4a25d302','Body','platform');
create table public.program_media(
 id uuid primary key,asset_path text not null unique check(asset_path ~ '^/media/programs/[a-z0-9-]+[.]svg$'),
 alt_text text not null check(length(alt_text) between 1 and 300),rights text not null check(rights='body_original'),
 approved boolean not null default false,created_at timestamptz not null default now());
create table public.program_tags(
 slug text primary key check(slug~'^[a-z][a-z0-9_]*$'),name text not null,
 category text not null check(category in('split','style','equipment_context')));
create table public.program_tag_links(
 program_id uuid not null,owner_id uuid not null,tag_slug text not null references public.program_tags(slug),
 primary key(program_id,tag_slug),foreign key(program_id,owner_id) references public.programs(id,owner_id) on delete cascade);
create table public.program_gallery(
 program_id uuid not null,owner_id uuid not null,position integer not null check(position between 1 and 20),media_id uuid not null references public.program_media(id),
 primary key(program_id,position),unique(program_id,media_id),foreign key(program_id,owner_id) references public.programs(id,owner_id) on delete cascade);
alter table public.programs drop constraint programs_objective_check,drop constraint programs_experience_level_check;
alter table public.programs add constraint programs_objective_check check(objective in('strength','hypertrophy','general_fitness','endurance','custom','strength_size')),
 add constraint programs_experience_level_check check(experience_level in('beginner','intermediate','advanced','all_levels','beginner_intermediate','intermediate_advanced')),
 add column slug text unique check(slug~'^[a-z][a-z0-9-]*$' and length(slug)<=100),
 add column summary text check(length(summary)<=300),add column description_markdown text check(length(description_markdown)<=20000),
 add column cover_media_id uuid references public.program_media(id),
 add column sessions_min smallint check(sessions_min between 1 and 14),add column sessions_max smallint check(sessions_max between 1 and 14),
 add constraint program_frequency_range check((sessions_min is null)=(sessions_max is null) and sessions_max>=sessions_min),
 add column session_minutes_min smallint check(session_minutes_min between 10 and 240),add column session_minutes_max smallint check(session_minutes_max between 10 and 240),
 add constraint program_minutes_range check((session_minutes_min is null)=(session_minutes_max is null) and session_minutes_max>=session_minutes_min),
 add column flexible_rotation boolean not null default false,
 add column first_published_at timestamptz,add column featured boolean not null default false,
 add column published_version_id uuid references public.program_versions(id);
-- No publication, badge, principal or moderation grants are added.
grant insert(slug,summary,description_markdown,cover_media_id,sessions_min,sessions_max,session_minutes_min,session_minutes_max,flexible_rotation),
 update(slug,summary,description_markdown,cover_media_id,sessions_min,sessions_max,session_minutes_min,session_minutes_max,flexible_rotation) on public.programs to authenticated;
alter table public.program_versions add column catalog_metadata jsonb;
alter table public.program_media enable row level security;
alter table public.program_tags enable row level security;
alter table public.program_tag_links enable row level security;
alter table public.program_gallery enable row level security;
revoke all on public.program_media,public.program_tags,public.program_tag_links,public.program_gallery from public,anon,authenticated,service_role;
grant select on public.program_media,public.program_tags,public.program_tag_links,public.program_gallery to authenticated;
create policy approved_media on public.program_media for select to authenticated using((select auth.uid()) is not null and approved);
create policy controlled_tags on public.program_tags for select to authenticated using((select auth.uid()) is not null);
create policy owner_read on public.program_tag_links for select to authenticated using(owner_id=(select auth.uid()));
create policy owner_read on public.program_gallery for select to authenticated using(owner_id=(select auth.uid()));
grant insert(program_id,owner_id,tag_slug),delete on public.program_tag_links to authenticated;
grant insert(program_id,owner_id,position,media_id),delete on public.program_gallery to authenticated;
create policy owner_insert on public.program_tag_links for insert to authenticated with check(owner_id=(select auth.uid()));
create policy owner_delete on public.program_tag_links for delete to authenticated using(owner_id=(select auth.uid()));
create policy owner_insert on public.program_gallery for insert to authenticated with check(owner_id=(select auth.uid()));
create policy owner_delete on public.program_gallery for delete to authenticated using(owner_id=(select auth.uid()));
create function body_private.lock_catalog_metadata() returns trigger language plpgsql security invoker set search_path='' as $$
declare row_data jsonb;
begin
 row_data:=case when tg_op='DELETE' then to_jsonb(old) else to_jsonb(new) end;
 perform 1 from public.programs where id=(row_data->>'program_id')::uuid and owner_id=(row_data->>'owner_id')::uuid for update nowait;
 if not found and current_user='authenticated' then raise exception 'Program unavailable' using errcode='42501';end if;
 if tg_op='DELETE' then return old;end if;return new;
end $$;
create trigger a_program_tree_lock before insert or delete on public.program_tag_links for each row execute function body_private.lock_catalog_metadata();
create trigger a_program_tree_lock before insert or delete on public.program_gallery for each row execute function body_private.lock_catalog_metadata();
create function body_private.program_publication_guard() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if old.first_published_at is not null and new.first_published_at is distinct from old.first_published_at then raise exception 'Initial publication time is immutable' using errcode='23514';end if;
 if old.first_published_at is null and new.publication_status<>'published' and new.first_published_at is not null then raise exception 'Private creation is not publication' using errcode='23514';end if;
 if new.publication_status='published' then
  if new.origin<>'body_authored' or new.owner_id<>'6ab9fb82-8aae-5e49-9f9d-535b4a25d302' or new.publisher_id<>new.owner_id or new.visibility<>'public' or new.publication_eligibility<>'eligible' or new.moderation_status<>'approved' or not new.recommendation_eligible or new.archived_at is not null or not exists(select 1 from public.program_versions v where v.id=new.published_version_id and v.program_id=new.id and v.owner_id=new.owner_id and v.catalog_metadata is not null and v.catalog_metadata->>'slug' is not null and length(v.catalog_metadata->>'summary') between 1 and 300 and length(v.definition->'program'->>'description_markdown') between 1 and 20000 and v.definition->'program'->>'origin'='body_authored' and v.definition->'program'->>'owner_id'=new.owner_id::text) then raise exception 'Official publication requires approved immutable version' using errcode='23514';end if;
  if old.first_published_at is null then new.first_published_at:=clock_timestamp();end if;
 end if;return new;
end $$;
create trigger z_program_publication before update on public.programs for each row execute function body_private.program_publication_guard();
create or replace function public.program_definition(p_program uuid) returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare recipe jsonb;
begin
 if auth.uid() is null then raise exception 'Sign in required' using errcode='42501';end if;
 select jsonb_build_object('schema_version',1,'program',to_jsonb(p)-array['source_attribution','clone_request_id'],
 'equipment',coalesce((select jsonb_agg(e.equipment_type_id order by e.equipment_type_id) from public.program_equipment e where e.program_id=p.id and e.owner_id=auth.uid()),'[]'::jsonb),
 'tags',coalesce((select jsonb_agg(to_jsonb(t) order by t.slug) from public.program_tag_links l join public.program_tags t on t.slug=l.tag_slug where l.program_id=p.id),'[]'::jsonb),
 'media',jsonb_build_object('cover',(select to_jsonb(m) from public.program_media m where m.id=p.cover_media_id),'gallery',coalesce((select jsonb_agg(to_jsonb(m)||jsonb_build_object('position',g.position) order by g.position) from public.program_gallery g join public.program_media m on m.id=g.media_id where g.program_id=p.id),'[]'::jsonb)),
 'rules',coalesce((select jsonb_agg(to_jsonb(r) order by r.id) from public.program_progression_rules r where r.program_id=p.id and r.owner_id=auth.uid()),'[]'::jsonb),
 'days',coalesce((select jsonb_agg(to_jsonb(d)||jsonb_build_object('slots',coalesce((select jsonb_agg(to_jsonb(s)||jsonb_build_object(
 'equipment',coalesce((select jsonb_agg(e.equipment_type_id order by e.equipment_type_id) from public.program_slot_equipment e where e.slot_id=s.id and e.owner_id=auth.uid()),'[]'::jsonb),
 'alternatives',coalesce((select jsonb_agg(to_jsonb(a) order by a.position) from public.program_slot_alternatives a where a.slot_id=s.id and a.owner_id=auth.uid()),'[]'::jsonb),
 'sets',coalesce((select jsonb_agg(to_jsonb(x) order by x.position) from public.program_set_prescriptions x where x.slot_id=s.id and x.owner_id=auth.uid()),'[]'::jsonb)) order by s.position) from public.program_slots s where s.program_day_id=d.id and s.owner_id=auth.uid()),'[]'::jsonb)) order by d.cycle_position) from public.program_days d where d.program_id=p.id and d.owner_id=auth.uid()),'[]'::jsonb)) into recipe from public.programs p where p.id=p_program and p.owner_id=auth.uid();
 return recipe;
end $$;
create function body_private.program_catalog_metadata() returns trigger language plpgsql security invoker set search_path='' as $$
declare p jsonb;tags jsonb;
begin
 if tg_op='UPDATE' then return new;end if;
 p:=new.definition->'program';tags:=coalesce(new.definition->'tags','[]'::jsonb);
 new.catalog_metadata:=jsonb_build_object('name',p->'name','slug',p->'slug','summary',p->'summary','objective',p->'objective','experience',p->'experience_level','cycleLength',p->'cycle_length','sessionsMin',p->'sessions_min','sessionsMax',p->'sessions_max','minutesMin',p->'session_minutes_min','minutesMax',p->'session_minutes_max','flexible',p->'flexible_rotation','tags',tags,'equipmentIds',coalesce((select jsonb_agg(t.id order by t.id) from public.equipment_types t where t.slug<>'none' and t.id in(select value::uuid from jsonb_array_elements_text(coalesce(new.definition->'equipment','[]'::jsonb)))),'[]'::jsonb),'cover',new.definition->'media'->'cover');
 return new;
end $$;
create trigger z_program_catalog_metadata before insert on public.program_versions for each row execute function body_private.program_catalog_metadata();
-- Root policy is self-contained: no versions/children lookup and no recursive RLS.
create policy approved_body_read on public.programs for select to authenticated using(
 (select auth.uid()) is not null and owner_id='6ab9fb82-8aae-5e49-9f9d-535b4a25d302' and publisher_id=owner_id and origin='body_authored' and is_template
 and visibility='public' and publication_status='published' and publication_eligibility='eligible' and moderation_status='approved' and recommendation_eligible and archived_at is null and published_version_id is not null and first_published_at is not null);
create policy approved_body_version on public.program_versions for select to authenticated using(exists(select 1 from public.programs p where p.published_version_id=program_versions.id and p.owner_id='6ab9fb82-8aae-5e49-9f9d-535b4a25d302' and p.origin='body_authored' and p.publisher_id=p.owner_id and p.is_template and p.visibility='public' and p.publication_status='published' and p.publication_eligibility='eligible' and p.moderation_status='approved' and p.recommendation_eligible and p.archived_at is null and p.first_published_at is not null));
create index program_published_version on public.programs(published_version_id) where publication_status='published';
create index program_catalog_metadata_search on public.program_versions using gin(to_tsvector('simple',coalesce(catalog_metadata->>'name','')||' '||coalesce(catalog_metadata->>'summary','')));
create index program_catalog_metadata_tags on public.program_versions using gin((catalog_metadata->'tags'));
create function public.program_catalog(p_query text default '',p_goal text default '',p_split text default '',p_experience text default '',p_equipment text default '',p_frequency text default '',p_style text default '',p_page integer default 1) returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare result jsonb;
begin
 if auth.uid() is null then raise exception 'Sign in required' using errcode='42501';end if;
 if p_query is null or length(p_query)>100 or p_page is null or p_page not between 1 and 10000 or p_goal is null or p_split is null or p_experience is null or p_equipment is null or p_frequency is null or p_style is null or p_goal not in('','strength','hypertrophy','general_fitness','strength_size') or p_split not in('','full_body','upper_lower','ppl','body_part') or p_experience not in('','beginner','intermediate','advanced') or p_equipment not in('','full_gym','dumbbells','home_gym','minimal_equipment') or p_frequency not in('','2_3','4','5_6','flexible') or p_style not in('','high_intensity','low_volume','powerbuilding','compound_focused') then raise exception 'Invalid catalog filters' using errcode='22023';end if;
 with eligible as(
 select p.id,p.first_published_at,p.featured,v.id as version_id,v.version,v.catalog_metadata as m from public.programs p join public.program_versions v on v.id=p.published_version_id
 where p.owner_id='6ab9fb82-8aae-5e49-9f9d-535b4a25d302' and p.origin='body_authored' and p.publisher_id=p.owner_id and p.is_template and p.visibility='public' and p.publication_status='published' and p.publication_eligibility='eligible' and p.moderation_status='approved' and p.recommendation_eligible and p.archived_at is null and p.first_published_at is not null
 and (p_query='' or to_tsvector('simple',coalesce(v.catalog_metadata->>'name','')||' '||coalesce(v.catalog_metadata->>'summary','')) @@ plainto_tsquery('simple',p_query))
 and (p_goal='' or v.catalog_metadata->>'objective'=p_goal)
 and (p_experience='' or v.catalog_metadata->>'experience'='all_levels' or p_experience=any(string_to_array(v.catalog_metadata->>'experience','_')))
 and (p_split='' or v.catalog_metadata->'tags' @> jsonb_build_array(jsonb_build_object('slug',p_split,'category','split')))
 and (p_equipment='' or v.catalog_metadata->'tags' @> jsonb_build_array(jsonb_build_object('slug',p_equipment,'category','equipment_context')))
 and (p_style='' or v.catalog_metadata->'tags' @> jsonb_build_array(jsonb_build_object('slug',p_style,'category','style')))
 and (p_frequency='' or p_frequency='flexible' and (v.catalog_metadata->>'flexible')::boolean or p_frequency='2_3' and (v.catalog_metadata->>'sessionsMin')::int<=3 and (v.catalog_metadata->>'sessionsMax')::int>=2 or p_frequency='4' and (v.catalog_metadata->>'sessionsMin')::int<=4 and (v.catalog_metadata->>'sessionsMax')::int>=4 or p_frequency='5_6' and (v.catalog_metadata->>'sessionsMin')::int<=6 and (v.catalog_metadata->>'sessionsMax')::int>=5)
 ),page as(select * from eligible order by m->>'name',id limit 6 offset (p_page-1)*6)
 select jsonb_build_object('total',(select count(*) from eligible),'page',p_page,'items',coalesce((select jsonb_agg(m||jsonb_build_object('id',id,'versionId',version_id,'version',version,'publishedAt',first_published_at,'featured',featured) order by m->>'name',id) from page),'[]'::jsonb)) into result;
 return result;
end $$;
revoke all on function public.program_catalog(text,text,text,text,text,text,text,integer) from public,anon,service_role;
grant execute on function public.program_catalog(text,text,text,text,text,text,text,integer) to authenticated;
create or replace function public.clone_program(p_version uuid,p_name text,p_request uuid) returns uuid language plpgsql security invoker set search_path='' as $$
declare source public.program_versions; recipe jsonb; root jsonb; day jsonb; slot jsonb; rule jsonb; entry jsonb; equip jsonb; target uuid; new_day uuid; new_slot uuid; new_rule uuid; rule_map jsonb:='{}'::jsonb;
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
   values(auth.uid(),new_day,(slot->>'position')::int,(slot->>'movement_pattern_id')::uuid,(slot->>'exercise_id')::uuid,(slot->>'target_sets')::smallint,(slot->>'target_reps_min')::int,(slot->>'target_reps_max')::int,(slot->>'target_weight_kg')::numeric,(slot->>'rest_seconds')::int,slot->>'notes',(slot->>'primary_muscle_id')::uuid,slot->>'required_exercise_type',(slot->>'exercise_locked')::boolean,(slot->>'is_optional')::boolean,(slot->>'rest_seconds_max')::int,(rule_map->>(slot->>'progression_rule_id'))::uuid) returning id into new_slot;
   insert into public.program_slot_equipment(slot_id,owner_id,equipment_type_id) select new_slot,auth.uid(),value::uuid from jsonb_array_elements_text(slot->'equipment');
   for entry in select * from jsonb_array_elements(slot->'alternatives') loop insert into public.program_slot_alternatives(slot_id,owner_id,exercise_id,position) values(new_slot,auth.uid(),(entry->>'exercise_id')::uuid,(entry->>'position')::int);end loop;
   for entry in select * from jsonb_array_elements(slot->'sets') loop insert into public.program_set_prescriptions(slot_id,owner_id,position,set_type,reps_min,reps_max,target_weight_kg,load_mode,load_guidance,effort_scale,effort_value,intended_to_failure,rest_seconds,notes) values(new_slot,auth.uid(),(entry->>'position')::int,entry->>'set_type',(entry->>'reps_min')::int,(entry->>'reps_max')::int,(entry->>'target_weight_kg')::numeric,entry->>'load_mode',entry->>'load_guidance',entry->>'effort_scale',(entry->>'effort_value')::numeric,(entry->>'intended_to_failure')::boolean,(entry->>'rest_seconds')::int,entry->>'notes');end loop;
  end loop;
 end loop;
 return target;
end $$;

revoke all on all functions in schema body_private from public,anon,authenticated,service_role;
commit;
