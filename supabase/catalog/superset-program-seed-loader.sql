-- Privileged migration-only installer; no credentials or end-user auth accounts.
insert into public.program_tags(slug,name,category) values
 ('superset','Supersets','style'),('full_body','Full Body','split'),('upper_lower','Upper / Lower','split'),('ppl','PPL','split'),('body_part','Body-Part Split','split'),
 ('high_intensity','High Intensity','style'),('low_volume','Low Volume','style'),('powerbuilding','Powerbuilding','style'),('compound_focused','Compound Focused','style'),
 ('full_gym','Full Gym','equipment_context'),('dumbbells','Dumbbells','equipment_context'),('home_gym','Home Gym','equipment_context'),('minimal_equipment','Minimal Equipment','equipment_context') on conflict do nothing;
create or replace function body_private.install_body_superset_program(recipe jsonb) returns void language plpgsql security invoker set search_path='' as $$
declare principal constant uuid:='6ab9fb82-8aae-5e49-9f9d-535b4a25d302'::uuid; root uuid:=(recipe->>'id')::uuid; vid uuid:=(recipe->>'versionId')::uuid;
 previous_claims text:=current_setting('request.jwt.claims',true); day jsonb; slot jsonb; group_members jsonb; group_no int; idx integer:=0; pos integer; day_id uuid;slot_id uuid;rule_id uuid;fingerprint text;definition jsonb;ex public.exercises;pattern uuid;muscle uuid;alt uuid;
begin
 if current_user in('authenticated','anon','service_role') then raise exception 'Migration-only operation' using errcode='42501';end if;
 fingerprint:=md5(recipe::text);
 if exists(select 1 from public.program_versions where id=vid) then
  if not exists(select 1 from public.program_versions where id=vid and program_id=root and program_versions.definition->>'seedFingerprint'=fingerprint) then raise exception 'Immutable seed content mismatch; add a new forward version';end if;return;
 end if;
 if exists(select 1 from public.programs where id=root) then raise exception 'Existing program requires explicit reviewed version upgrade';end if;
 perform set_config('request.jwt.claims',json_build_object('sub',principal,'role','authenticated')::text,true);
 insert into public.program_media(id,asset_path,alt_text,rights,approved) values((recipe->>'mediaId')::uuid,'/media/programs/'||(recipe->>'slug')||'.svg','Original Body graphic: '||(recipe->>'name'),'body_original',true) on conflict do nothing;
 insert into public.programs(id,owner_id,publisher_id,name,description,is_template,cycle_length,objective,experience_level,estimated_sessions_per_week,origin,visibility,lifecycle_status,publication_eligibility,moderation_status,recommendation_eligible,slug,summary,description_markdown,cover_media_id,sessions_min,sessions_max,session_minutes_min,session_minutes_max,flexible_rotation)
 values(root,principal,principal,recipe->>'name',recipe->>'summary',true,jsonb_array_length(recipe->'days'),recipe->>'objective',recipe->>'experience',((recipe->>'sessionsMin')::numeric+(recipe->>'sessionsMax')::numeric)/2,'body_authored','public','ready','eligible','approved',true,recipe->>'slug',recipe->>'summary',recipe->>'description',(recipe->>'mediaId')::uuid,(recipe->>'sessionsMin')::smallint,(recipe->>'sessionsMax')::smallint,(recipe->>'minutesMin')::smallint,(recipe->>'minutesMax')::smallint,(recipe->>'flexible')::boolean);
 insert into public.program_tag_links(program_id,owner_id,tag_slug) select root,principal,value from jsonb_array_elements_text(recipe->'tags');
 for day in select value from jsonb_array_elements(recipe->'days') loop
  idx:=idx+1;
  day_id:=md5(root::text||':day:'||idx)::uuid;
  insert into public.program_days(id,owner_id,program_id,cycle_length,cycle_position,name,is_rest_day,focus,notes,minimum_rest_hours,maximum_rest_hours)
  values(day_id,principal,root,jsonb_array_length(recipe->'days'),idx,day->>'name',(day->>'rest')::boolean,case when (day->>'rest')::boolean then 'Recovery' else day->>'name' end,case when (day->>'rest')::boolean then 'Rest; extend recovery if needed. This position is not a weekday.' else 'Use controlled technique. Warm up separately; prescribed effort is not actual effort.' end,24,96) returning id into day_id;
  pos:=0;
  for slot in select value from jsonb_array_elements(day->'slots') loop
   pos:=pos+1;select * into ex from public.exercises where id=(slot->>'exerciseId')::uuid and owner_id is null and archived_at is null;
   pattern:=(slot->>'movementPatternId')::uuid;muscle:=(slot->>'primaryMuscleId')::uuid;
   if ex.id is null or ex.exercise_type<>slot->>'exerciseType' or not exists(select 1 from public.exercise_movement_patterns where exercise_id=ex.id and movement_pattern_id=pattern) or not exists(select 1 from public.exercise_muscles where exercise_id=ex.id and muscle_group_id=muscle and muscle_role='primary') then raise exception 'Invalid seed exercise/taxonomy';end if;
   slot_id:=md5(day_id::text||':slot:'||pos)::uuid;rule_id:=md5(slot_id::text||':rule')::uuid;
   insert into public.program_progression_rules(id,program_id,owner_id,name,strategy,load_step_kg,rep_step,reps_min,reps_max)
   values(rule_id,root,principal,ex.name||' progression',slot->>'progression',1.25,case when slot->>'progression'='double_progression' then 1 end,case when slot->>'progression'='double_progression' then (slot->>'repsMin')::int end,case when slot->>'progression'='double_progression' then (slot->>'repsMax')::int end) returning id into rule_id;
   insert into public.program_slots(id,owner_id,program_day_id,position,movement_pattern_id,exercise_id,primary_muscle_id,required_exercise_type,target_sets,target_reps_min,target_reps_max,rest_seconds,rest_seconds_max,progression_rule_id,notes)
   values(slot_id,principal,day_id,pos,pattern,ex.id,muscle,ex.exercise_type,(slot->>'sets')::int,(slot->>'repsMin')::int,(slot->>'repsMax')::int,(slot->>'restSeconds')::int,(slot->>'restSeconds')::int+60,rule_id,'Listed sets are working sets. Warm up separately; take extra recovery when needed.') returning id into slot_id;
   insert into public.program_slot_equipment(slot_id,owner_id,equipment_type_id) select slot_id,principal,value::uuid from jsonb_array_elements_text(slot->'equipmentIds');
   for alt in select value::uuid from jsonb_array_elements_text(slot->'alternatives') loop
    if not public.program_slot_eligible(slot_id,alt) then raise exception 'Incompatible seed alternative';end if;
    insert into public.program_slot_alternatives(slot_id,owner_id,exercise_id,position) values(slot_id,principal,alt,1);
   end loop;
   if not public.program_slot_eligible(slot_id,ex.id) then raise exception 'Incompatible seed default';end if;
   for k in 1..(slot->>'sets')::int loop
    insert into public.program_set_prescriptions(id,slot_id,owner_id,position,set_type,reps_min,reps_max,effort_scale,effort_value,intended_to_failure,rest_seconds)
    values(md5(slot_id::text||':set:'||k)::uuid,slot_id,principal,k,'working',(slot->>'repsMin')::int,(slot->>'repsMax')::int,case when (slot->>'failure')::boolean and k=(slot->>'sets')::int then null else slot->>'effortScale' end,case when (slot->>'failure')::boolean and k=(slot->>'sets')::int then null else (slot->>'effortValue')::numeric end,(slot->>'failure')::boolean and k=(slot->>'sets')::int,(slot->>'restSeconds')::int);
   end loop;
  end loop;
 end loop;
 insert into public.program_equipment(program_id,owner_id,equipment_type_id) select distinct root,principal,e.equipment_type_id from public.program_slot_equipment e join public.program_slots s on s.id=e.slot_id join public.program_days d on d.id=s.program_day_id where d.program_id=root;
 idx:=0;
 for day in select value from jsonb_array_elements(recipe->'days') loop
  idx:=idx+1;day_id:=md5(root::text||':day:'||idx)::uuid;group_no:=0;
  for group_members in select value from jsonb_array_elements(coalesce(day->'groups','[]'::jsonb)) loop
   group_no:=group_no+1;
   insert into public.program_day_groups(id,owner_id,program_day_id,members)
    select md5(day_id::text||':group:'||group_no)::uuid,principal,day_id,array_agg(md5(day_id::text||':slot:'||member)::uuid order by i) from jsonb_array_elements_text(group_members) with ordinality x(member,i);
  end loop;
 end loop;
 definition:=public.program_definition(root)||jsonb_build_object('seedFingerprint',fingerprint,'publisher',jsonb_build_object('name','Body','rights','Original Body programming'));
 insert into public.program_versions(id,program_id,owner_id,version,definition) values(vid,root,principal,(recipe->>'version')::int,definition);
 update public.programs set published_version_id=vid,publication_status='published' where id=root;
 perform set_config('request.jwt.claims',coalesce(previous_claims,''),true);
end $$;
revoke all on function body_private.install_body_superset_program(jsonb) from public,anon,authenticated,service_role;
