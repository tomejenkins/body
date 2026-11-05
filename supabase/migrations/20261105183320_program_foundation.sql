-- Phase 7.1: extend existing programs/rotations; no publishing or scheduling activation.
begin;
alter table public.programs
 add column objective text not null default 'general_fitness' check(objective in('strength','hypertrophy','general_fitness','endurance','custom')),
 add column experience_level text not null default 'all_levels' check(experience_level in('beginner','intermediate','advanced','all_levels')),
 add column estimated_sessions_per_week numeric check(estimated_sessions_per_week>0 and estimated_sessions_per_week<=14),
 add column duration_rotations integer check(duration_rotations between 1 and 10000),
 add column origin text not null default 'user_created' check(origin in('body_authored','user_created','user_copy','authorized_creator')),
 add column publisher_id uuid references public.profiles(id),
 add column visibility text not null default 'private' check(visibility in('private','public')),
 add column lifecycle_status text not null default 'draft' check(lifecycle_status in('draft','ready','archived')),
 add column publication_status text not null default 'unpublished' check(publication_status in('unpublished','published','withdrawn')),
 add column publication_eligibility text not null default 'blocked' check(publication_eligibility in('blocked','eligible')),
 add column moderation_status text not null default 'unreviewed' check(moderation_status in('unreviewed','approved','restricted','removed')),
 add column recommendation_eligible boolean not null default false,
 add column source_version_id uuid,
 add column source_attribution jsonb;
update public.programs set publisher_id=owner_id,lifecycle_status=case when archived_at is null then 'draft' else 'archived' end;
alter table public.programs alter column publisher_id set not null;
alter table public.program_days add column focus text check(length(focus)<=500),
 add column phase_number smallint not null default 1 check(phase_number between 1 and 100),
 add column minimum_rest_hours numeric check(minimum_rest_hours between 0 and 8760),
 add column maximum_rest_hours numeric check(maximum_rest_hours between 0 and 8760),
 add constraint program_day_rest_interval check(maximum_rest_hours is null or minimum_rest_hours is not null and maximum_rest_hours>=minimum_rest_hours);
create table public.program_equipment(
 program_id uuid not null,owner_id uuid not null,equipment_type_id uuid not null references public.equipment_types(id),
 primary key(program_id,equipment_type_id),foreign key(program_id,owner_id) references public.programs(id,owner_id) on delete cascade,
 created_at timestamptz not null default now());
create table public.program_progression_rules(
 id uuid primary key default gen_random_uuid(),program_id uuid not null,owner_id uuid not null,
 name text not null check(length(btrim(name)) between 1 and 200),strategy text not null check(strategy in('fixed','linear_load','double_progression','rep_progression','effort_guided','manual')),
 config_version smallint not null default 1 check(config_version=1),
 load_step_kg numeric check(load_step_kg>0 and load_step_kg<=1000),rep_step integer check(rep_step between 1 and 1000),
 reps_min integer check(reps_min between 1 and 1000),reps_max integer check(reps_max between 1 and 1000),
 effort_scale text,effort_value numeric,check(public.valid_effort(effort_scale,effort_value)),
 check((reps_min is null)=(reps_max is null) and reps_max>=reps_min),
 check(case strategy when 'fixed' then load_step_kg is null and rep_step is null and reps_min is null and effort_scale is null
 when 'manual' then load_step_kg is null and rep_step is null and reps_min is null and effort_scale is null
 when 'linear_load' then load_step_kg is not null and rep_step is null and reps_min is null and effort_scale is null
 when 'double_progression' then load_step_kg is not null and rep_step is not null and reps_min is not null and effort_scale is null
 when 'rep_progression' then load_step_kg is null and rep_step is not null and reps_min is not null and effort_scale is null
 when 'effort_guided' then load_step_kg is not null and effort_scale is not null and rep_step is null and reps_min is null else false end),
 foreign key(program_id,owner_id) references public.programs(id,owner_id) on delete cascade,
 unique(id,program_id,owner_id),unique(id,owner_id),created_at timestamptz not null default now(),updated_at timestamptz not null default now());
alter table public.program_slots
 add column primary_muscle_id uuid references public.muscle_groups(id),
 add column required_exercise_type text check(required_exercise_type in('compound','isolation','other')),
 add column exercise_locked boolean not null default false,
 add column is_optional boolean not null default false,
 add column rest_seconds_max integer check(rest_seconds_max between 0 and 86400),
 add column progression_rule_id uuid,
 add constraint program_slot_rule_owner foreign key(progression_rule_id,owner_id) references public.program_progression_rules(id,owner_id),
 add constraint program_slot_lock check(not exercise_locked or exercise_id is not null),
 add constraint program_slot_rest_range check(rest_seconds_max is null or rest_seconds is not null and rest_seconds_max>=rest_seconds);
do $$declare c record;begin for c in select conname from pg_constraint where conrelid='public.program_slots'::regclass and contype='c' and pg_get_constraintdef(oid) like '%movement_pattern_id IS NOT NULL%' loop execute format('alter table public.program_slots drop constraint %I',c.conname);end loop;end $$;
alter table public.program_slots add constraint program_slot_requirement check(movement_pattern_id is not null or primary_muscle_id is not null or exercise_id is not null);
create table public.program_slot_equipment(
 slot_id uuid not null,owner_id uuid not null,equipment_type_id uuid not null references public.equipment_types(id),
 primary key(slot_id,equipment_type_id),foreign key(slot_id,owner_id) references public.program_slots(id,owner_id) on delete cascade,
 created_at timestamptz not null default now());
create table public.program_slot_alternatives(
 slot_id uuid not null,owner_id uuid not null,exercise_id uuid not null references public.exercises(id),position integer not null check(position between 1 and 100),
 primary key(slot_id,exercise_id),unique(slot_id,position),foreign key(slot_id,owner_id) references public.program_slots(id,owner_id) on delete cascade,
 created_at timestamptz not null default now());
create table public.program_set_prescriptions(
 id uuid primary key default gen_random_uuid(),slot_id uuid not null,owner_id uuid not null,position integer not null check(position between 1 and 100),
 set_type text not null default 'working' check(set_type in('working','warm_up','drop','rest_pause')),
 reps_min integer check(reps_min between 1 and 1000),reps_max integer check(reps_max between 1 and 1000),
 target_weight_kg numeric(10,3) check(target_weight_kg between 0 and 100000),load_mode text check(load_mode in('external','bodyweight')),
 load_guidance text check(length(load_guidance)<=1000),effort_scale text,effort_value numeric,
 intended_to_failure boolean not null default false,rest_seconds integer check(rest_seconds between 0 and 86400),notes text check(length(notes)<=4000),
 check((reps_min is null)=(reps_max is null) and reps_max>=reps_min),check(public.valid_effort(effort_scale,effort_value)),
 check(not intended_to_failure or set_type<>'warm_up'),check(load_mode is distinct from 'bodyweight' or target_weight_kg is null),
 foreign key(slot_id,owner_id) references public.program_slots(id,owner_id) on delete cascade,
 unique(slot_id,position),created_at timestamptz not null default now(),updated_at timestamptz not null default now());
create table public.program_versions(
 id uuid primary key default gen_random_uuid(),program_id uuid,owner_id uuid not null references public.profiles(id) on delete cascade,
 version integer not null check(version>0),definition jsonb not null check(jsonb_typeof(definition)='object' and octet_length(definition::text)<=5242880),
 foreign key(program_id,owner_id) references public.programs(id,owner_id) on delete set null(program_id),
 unique(program_id,version),unique(id,owner_id),created_at timestamptz not null default now());
-- Future execution copies targets into protected historical snapshots; no
-- program activation or target-to-actual assignment is introduced here.
alter table public.workout_sets add column prescribed_effort_scale text,add column prescribed_effort_value numeric,add column prescribed_to_failure boolean,
 add constraint workout_prescribed_effort_valid check(public.valid_effort(prescribed_effort_scale,prescribed_effort_value));
alter table public.workout_sessions add column source_program_version_id uuid references public.program_versions(id) on delete set null,add column program_version_snapshot integer check(program_version_snapshot>0);
alter table public.programs add constraint program_source_version foreign key(source_version_id) references public.program_versions(id) on delete set null;
-- Platform-only preparation: no ordinary read/write policies, endpoints or badges.
create table public.program_brands(
 id uuid primary key default gen_random_uuid(),name text not null check(length(btrim(name)) between 1 and 200),created_at timestamptz not null default now());
create table public.creator_accounts(
 profile_id uuid primary key references public.profiles(id) on delete cascade,public_slug text unique check(public_slug~'^[a-z0-9][a-z0-9_-]{2,59}$'),display_name text,bio text,
 identity_status text not null default 'unverified' check(identity_status in('unverified','pending','verified','rejected','revoked')),
 publishing_privilege text not null default 'blocked' check(publishing_privilege in('blocked','allowed')),
 reviewed_by uuid references public.profiles(id) on delete set null,verified_at timestamptz,review_notes text,
 check(identity_status<>'verified' or reviewed_by is not null and verified_at is not null),
 created_at timestamptz not null default now(),updated_at timestamptz not null default now());
create table public.creator_affiliations(
 creator_id uuid not null references public.creator_accounts(profile_id) on delete cascade,brand_id uuid not null references public.program_brands(id),
 affiliation text not null,review_status text not null default 'pending' check(review_status in('pending','approved','rejected','revoked')),primary key(creator_id,brand_id),created_at timestamptz not null default now());
create table public.creator_brand_authorizations(
 id uuid primary key default gen_random_uuid(),creator_id uuid not null references public.creator_accounts(profile_id) on delete cascade,
 brand_id uuid not null references public.program_brands(id),program_id uuid not null references public.programs(id) on delete cascade,
 scope text not null check(scope in('program','assets','program_and_assets')),scope_description text not null,
 approved_by uuid not null references public.profiles(id),approved_at timestamptz not null default now(),expires_at timestamptz,revoked_at timestamptz,
 check(expires_at is null or expires_at>approved_at),check(revoked_at is null or revoked_at>=approved_at));
create table public.program_reports(
 id uuid primary key default gen_random_uuid(),program_id uuid references public.programs(id) on delete set null,program_identity uuid not null,
 reporter_id uuid references public.profiles(id) on delete set null,
 category text not null check(category in('copyright','trademark','impersonation','misleading_affiliation','inappropriate_content','other')),
 explanation text not null check(length(btrim(explanation)) between 1 and 5000),reference_url text check(reference_url is null or length(reference_url)<=2000 and reference_url~'^https://'),
 review_status text not null default 'open' check(review_status in('open','reviewing','resolved','dismissed')),
 moderator_action text not null default 'none' check(moderator_action in('none','restrict_publisher','remove_program','restore_program')),
 reviewed_by uuid references public.profiles(id) on delete set null,reviewed_at timestamptz,created_at timestamptz not null default now());
create table public.program_admin_events(
 id uuid primary key default gen_random_uuid(),entity_kind text not null check(entity_kind in('program','report','creator','authorization','publisher')),
 entity_identity uuid not null,actor_id uuid references public.profiles(id) on delete set null,
 action text not null check(action in('review','approve','reject','restrict','remove','restore','verify','revoke','authorize','expire')),
 explanation text not null,created_at timestamptz not null default now());
alter table public.program_equipment enable row level security;
revoke all on table public.program_equipment from public,anon,authenticated,service_role;
grant select on public.program_equipment to authenticated;
create policy owner_read on public.program_equipment for select to authenticated using(owner_id=(select auth.uid()));
grant insert(program_id,owner_id,equipment_type_id) on public.program_equipment to authenticated;
create policy owner_insert on public.program_equipment for insert to authenticated with check(owner_id=(select auth.uid()));
grant delete on public.program_equipment to authenticated;
create policy owner_delete on public.program_equipment for delete to authenticated using(owner_id=(select auth.uid()));
alter table public.program_progression_rules enable row level security;
revoke all on table public.program_progression_rules from public,anon,authenticated,service_role;
grant select on public.program_progression_rules to authenticated;
create policy owner_read on public.program_progression_rules for select to authenticated using(owner_id=(select auth.uid()));
grant insert(id,program_id,owner_id,name,strategy,config_version,load_step_kg,rep_step,reps_min,reps_max,effort_scale,effort_value) on public.program_progression_rules to authenticated;
create policy owner_insert on public.program_progression_rules for insert to authenticated with check(owner_id=(select auth.uid()));
grant delete on public.program_progression_rules to authenticated;
create policy owner_delete on public.program_progression_rules for delete to authenticated using(owner_id=(select auth.uid()));
grant update(name,strategy,config_version,load_step_kg,rep_step,reps_min,reps_max,effort_scale,effort_value) on public.program_progression_rules to authenticated;
create policy owner_update on public.program_progression_rules for update to authenticated using(owner_id=(select auth.uid())) with check(owner_id=(select auth.uid()));
alter table public.program_slot_equipment enable row level security;
revoke all on table public.program_slot_equipment from public,anon,authenticated,service_role;
grant select on public.program_slot_equipment to authenticated;
create policy owner_read on public.program_slot_equipment for select to authenticated using(owner_id=(select auth.uid()));
grant insert(slot_id,owner_id,equipment_type_id) on public.program_slot_equipment to authenticated;
create policy owner_insert on public.program_slot_equipment for insert to authenticated with check(owner_id=(select auth.uid()));
grant delete on public.program_slot_equipment to authenticated;
create policy owner_delete on public.program_slot_equipment for delete to authenticated using(owner_id=(select auth.uid()));
alter table public.program_slot_alternatives enable row level security;
revoke all on table public.program_slot_alternatives from public,anon,authenticated,service_role;
grant select on public.program_slot_alternatives to authenticated;
create policy owner_read on public.program_slot_alternatives for select to authenticated using(owner_id=(select auth.uid()));
grant insert(slot_id,owner_id,exercise_id,position) on public.program_slot_alternatives to authenticated;
create policy owner_insert on public.program_slot_alternatives for insert to authenticated with check(owner_id=(select auth.uid()));
grant delete on public.program_slot_alternatives to authenticated;
create policy owner_delete on public.program_slot_alternatives for delete to authenticated using(owner_id=(select auth.uid()));
grant update(position) on public.program_slot_alternatives to authenticated;
create policy owner_update on public.program_slot_alternatives for update to authenticated using(owner_id=(select auth.uid())) with check(owner_id=(select auth.uid()));
alter table public.program_set_prescriptions enable row level security;
revoke all on table public.program_set_prescriptions from public,anon,authenticated,service_role;
grant select on public.program_set_prescriptions to authenticated;
create policy owner_read on public.program_set_prescriptions for select to authenticated using(owner_id=(select auth.uid()));
grant insert(id,slot_id,owner_id,position,set_type,reps_min,reps_max,target_weight_kg,load_mode,load_guidance,effort_scale,effort_value,intended_to_failure,rest_seconds,notes) on public.program_set_prescriptions to authenticated;
create policy owner_insert on public.program_set_prescriptions for insert to authenticated with check(owner_id=(select auth.uid()));
grant delete on public.program_set_prescriptions to authenticated;
create policy owner_delete on public.program_set_prescriptions for delete to authenticated using(owner_id=(select auth.uid()));
grant update(position,set_type,reps_min,reps_max,target_weight_kg,load_mode,load_guidance,effort_scale,effort_value,intended_to_failure,rest_seconds,notes) on public.program_set_prescriptions to authenticated;
create policy owner_update on public.program_set_prescriptions for update to authenticated using(owner_id=(select auth.uid())) with check(owner_id=(select auth.uid()));
alter table public.program_versions enable row level security;
revoke all on table public.program_versions from public,anon,authenticated,service_role;
grant select on public.program_versions to authenticated;
create policy owner_read on public.program_versions for select to authenticated using(owner_id=(select auth.uid()));
grant insert(program_id,owner_id) on public.program_versions to authenticated;
create policy owner_insert on public.program_versions for insert to authenticated with check(owner_id=(select auth.uid()));
alter table public.program_brands enable row level security;
revoke all on table public.program_brands from public,anon,authenticated,service_role;
alter table public.creator_accounts enable row level security;
revoke all on table public.creator_accounts from public,anon,authenticated,service_role;
alter table public.creator_affiliations enable row level security;
revoke all on table public.creator_affiliations from public,anon,authenticated,service_role;
alter table public.creator_brand_authorizations enable row level security;
revoke all on table public.creator_brand_authorizations from public,anon,authenticated,service_role;
alter table public.program_reports enable row level security;
revoke all on table public.program_reports from public,anon,authenticated,service_role;
alter table public.program_admin_events enable row level security;
revoke all on table public.program_admin_events from public,anon,authenticated,service_role;
grant insert(objective,experience_level,estimated_sessions_per_week,duration_rotations,visibility,lifecycle_status,source_version_id),update(objective,experience_level,estimated_sessions_per_week,duration_rotations,visibility,lifecycle_status) on public.programs to authenticated;
grant insert(focus,phase_number,minimum_rest_hours,maximum_rest_hours),update(focus,phase_number,minimum_rest_hours,maximum_rest_hours) on public.program_days to authenticated;
grant insert(primary_muscle_id,required_exercise_type,exercise_locked,is_optional,rest_seconds_max,progression_rule_id),update(primary_muscle_id,required_exercise_type,exercise_locked,is_optional,rest_seconds_max,progression_rule_id) on public.program_slots to authenticated;
create function body_private.program_identity_guard() returns trigger language plpgsql security invoker set search_path='' as $$
declare source public.program_versions;
begin
 if tg_op='INSERT' then new.publisher_id:=coalesce(new.publisher_id,new.owner_id);end if;
 if current_user='authenticated' then
  if tg_op='INSERT' then
   new.publisher_id:=new.owner_id;new.origin:='user_created';new.publication_status:='unpublished';new.publication_eligibility:='blocked';new.moderation_status:='unreviewed';new.recommendation_eligible:=false;new.source_attribution:=null;
   if new.source_version_id is not null then
    select * into source from public.program_versions where id=new.source_version_id;
    if source.id is null then raise exception 'Source version unavailable' using errcode='42501';end if;
    new.origin:='user_copy';new.source_attribution:=jsonb_build_object('version_id',source.id,'source_program_id',source.program_id,'owner_id',source.owner_id,'publisher_id',source.definition->'program'->'publisher_id','name',source.definition->'program'->>'name','version',source.version);
   end if;
  elsif new.source_version_id is distinct from old.source_version_id and not(pg_trigger_depth()>1 and new.source_version_id is null) then raise exception 'Source attribution is immutable' using errcode='23514';end if;
 end if;
 if tg_op='UPDATE' then
  if old.archived_at is not null and new.archived_at is null and new.lifecycle_status=old.lifecycle_status then new.lifecycle_status:='draft';end if;
 end if;
 if new.lifecycle_status='archived' and new.archived_at is null then new.archived_at:=clock_timestamp();end if;
 if new.archived_at is not null then new.lifecycle_status:='archived';end if;
 return new;
end $$;
create trigger a_program_identity before insert or update on public.programs for each row execute function body_private.program_identity_guard();
-- Every structural writer serializes on its root, including direct DML. NOWAIT
-- avoids child-first direct DML waiting against root-first snapshots/clones.
create function body_private.lock_program_tree() returns trigger language plpgsql security invoker set search_path='' as $$
declare row_data jsonb; root uuid; day_id uuid; slot uuid; rule_program uuid;
begin
 row_data:=case when tg_op='DELETE' then to_jsonb(old) else to_jsonb(new) end;
 if tg_table_name='program_days' or tg_table_name in('program_equipment','program_progression_rules') then root:=(row_data->>'program_id')::uuid;
 elsif tg_table_name='program_slots' then day_id:=(row_data->>'program_day_id')::uuid;
 else slot:=(row_data->>'slot_id')::uuid;select program_day_id into day_id from public.program_slots where id=slot and owner_id=(row_data->>'owner_id')::uuid;end if;
 if day_id is not null then select program_id into root from public.program_days where id=day_id and owner_id=(row_data->>'owner_id')::uuid;end if;
 perform 1 from public.programs where id=root and owner_id=(row_data->>'owner_id')::uuid for update nowait;
 if not found and current_user='authenticated' then raise exception 'Program unavailable' using errcode='42501';end if;
 if tg_table_name='program_slots' and tg_op<>'DELETE' then
 if new.progression_rule_id is not null then
  select program_id into rule_program from public.program_progression_rules where id=new.progression_rule_id and owner_id=new.owner_id;
  if rule_program is distinct from root then raise exception 'Progression rule must belong to this program' using errcode='23514';end if;
 end if;end if;
 if tg_op='DELETE' then return old;end if;return new;
end $$;
create trigger a_program_tree_lock before insert or update or delete on public.program_days for each row execute function body_private.lock_program_tree();
create trigger a_program_tree_lock before insert or update or delete on public.program_slots for each row execute function body_private.lock_program_tree();
create trigger a_program_tree_lock before insert or update or delete on public.program_equipment for each row execute function body_private.lock_program_tree();
create trigger a_program_tree_lock before insert or update or delete on public.program_progression_rules for each row execute function body_private.lock_program_tree();
create trigger a_program_tree_lock before insert or update or delete on public.program_slot_equipment for each row execute function body_private.lock_program_tree();
create trigger a_program_tree_lock before insert or update or delete on public.program_slot_alternatives for each row execute function body_private.lock_program_tree();
create trigger a_program_tree_lock before insert or update or delete on public.program_set_prescriptions for each row execute function body_private.lock_program_tree();
create function public.program_slot_eligible(p_slot uuid,p_exercise uuid) returns boolean language sql stable security invoker set search_path='' as $$
 select exists(select 1 from public.program_slots s join public.exercises e on e.id=p_exercise and e.archived_at is null where s.id=p_slot and s.owner_id=auth.uid()
 and (not s.exercise_locked or s.exercise_id=e.id)
 and (s.required_exercise_type is null or s.required_exercise_type=e.exercise_type)
 and (s.movement_pattern_id is null or exists(select 1 from public.exercise_movement_patterns m where m.exercise_id=e.id and m.movement_pattern_id=s.movement_pattern_id))
 and (s.primary_muscle_id is null or exists(select 1 from public.exercise_muscles m where m.exercise_id=e.id and m.muscle_group_id=s.primary_muscle_id and m.muscle_role='primary'))
 and (not exists(select 1 from public.program_slot_equipment q where q.slot_id=s.id) or not exists(select 1 from public.exercise_equipment q join public.equipment_types t on t.id=q.equipment_type_id where q.exercise_id=e.id and t.slug<>'none' and not exists(select 1 from public.program_slot_equipment allowed where allowed.slot_id=s.id and allowed.equipment_type_id=q.equipment_type_id)))
 );
$$;
create function body_private.validate_program_slot_choices() returns trigger language plpgsql security invoker set search_path='' as $$
declare slot uuid; candidate uuid;
begin
 if current_user<>'authenticated' then return null;end if;
 if tg_table_name='program_slots' then slot:=new.id;else slot:=case when tg_op='DELETE' then old.slot_id else new.slot_id end;end if;
 select exercise_id into candidate from public.program_slots where id=slot and owner_id=auth.uid();
 if candidate is not null and not public.program_slot_eligible(slot,candidate) then raise exception 'Default exercise does not meet slot requirements' using errcode='23514';end if;
 if exists(select 1 from public.program_slot_alternatives a where a.slot_id=slot and not public.program_slot_eligible(slot,a.exercise_id)) then raise exception 'Alternative does not meet slot requirements' using errcode='23514';end if;
 return null;
end $$;
create trigger z_program_choice_validation after insert or update on public.program_slots for each row execute function body_private.validate_program_slot_choices();
create trigger z_program_choice_validation after insert or update or delete on public.program_slot_alternatives for each row execute function body_private.validate_program_slot_choices();
create trigger z_program_choice_validation after insert or update or delete on public.program_slot_equipment for each row execute function body_private.validate_program_slot_choices();
create function public.program_definition(p_program uuid) returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare recipe jsonb;
begin
 if auth.uid() is null then raise exception 'Sign in required' using errcode='42501';end if;
 select jsonb_build_object('schema_version',1,'program',to_jsonb(p)-array['source_attribution','clone_request_id'],
 'equipment',coalesce((select jsonb_agg(e.equipment_type_id order by e.equipment_type_id) from public.program_equipment e where e.program_id=p.id and e.owner_id=auth.uid()),'[]'::jsonb),
 'rules',coalesce((select jsonb_agg(to_jsonb(r) order by r.id) from public.program_progression_rules r where r.program_id=p.id and r.owner_id=auth.uid()),'[]'::jsonb),
 'days',coalesce((select jsonb_agg(to_jsonb(d)||jsonb_build_object('slots',coalesce((select jsonb_agg(to_jsonb(s)||jsonb_build_object(
 'equipment',coalesce((select jsonb_agg(e.equipment_type_id order by e.equipment_type_id) from public.program_slot_equipment e where e.slot_id=s.id and e.owner_id=auth.uid()),'[]'::jsonb),
 'alternatives',coalesce((select jsonb_agg(to_jsonb(a) order by a.position) from public.program_slot_alternatives a where a.slot_id=s.id and a.owner_id=auth.uid()),'[]'::jsonb),
 'sets',coalesce((select jsonb_agg(to_jsonb(x) order by x.position) from public.program_set_prescriptions x where x.slot_id=s.id and x.owner_id=auth.uid()),'[]'::jsonb)) order by s.position) from public.program_slots s where s.program_day_id=d.id and s.owner_id=auth.uid()),'[]'::jsonb)) order by d.cycle_position) from public.program_days d where d.program_id=p.id and d.owner_id=auth.uid()),'[]'::jsonb)) into recipe from public.programs p where p.id=p_program and p.owner_id=auth.uid();
 return recipe;
end $$;
create function body_private.program_version_guard() returns trigger language plpgsql security invoker set search_path='' as $$
declare cycle integer;
begin
 if tg_op='UPDATE' then
  if pg_trigger_depth()>1 and old.program_id is not null and new.program_id is null and (to_jsonb(new)-'program_id')=(to_jsonb(old)-'program_id') then return new;end if;
  raise exception 'Program versions are immutable' using errcode='23514';
 end if;
 if current_user<>'authenticated' then return new;end if;
 select cycle_length into cycle from public.programs where id=new.program_id and owner_id=auth.uid() for update;
 if cycle is null or new.owner_id is distinct from auth.uid() then raise exception 'Program unavailable' using errcode='42501';end if;
 if (select count(*) from public.program_days where program_id=new.program_id and owner_id=auth.uid())<>cycle or exists(select 1 from public.program_days d where d.program_id=new.program_id and not d.is_rest_day and not exists(select 1 from public.program_slots s where s.program_day_id=d.id)) then raise exception 'Complete the rotation before creating a version' using errcode='23514';end if;
 if exists(select 1 from public.program_slots s join public.program_days d on d.id=s.program_day_id where d.program_id=new.program_id and (s.exercise_id is not null and not public.program_slot_eligible(s.id,s.exercise_id) or exists(select 1 from public.program_slot_alternatives a where a.slot_id=s.id and not public.program_slot_eligible(s.id,a.exercise_id)) or exists(select 1 from public.program_set_prescriptions x where x.slot_id=s.id) and ((select count(*) from public.program_set_prescriptions x where x.slot_id=s.id)<>s.target_sets or (select max(x.position) from public.program_set_prescriptions x where x.slot_id=s.id)<>s.target_sets))) then raise exception 'Resolve slot requirements and set counts before versioning' using errcode='23514';end if;
 new.definition:=public.program_definition(new.program_id);select coalesce(max(version),0)+1 into new.version from public.program_versions where program_id=new.program_id and owner_id=auth.uid();return new;
end $$;
create trigger a_program_version_guard before insert or update on public.program_versions for each row execute function body_private.program_version_guard();
create function public.snapshot_program(p_program uuid) returns uuid language plpgsql security invoker set search_path='' as $$
declare result uuid;
begin
 if auth.uid() is null then raise exception 'Sign in required' using errcode='42501';end if;
 insert into public.program_versions(program_id,owner_id) values(p_program,auth.uid()) returning id into result;return result;
end $$;
alter table public.programs add column clone_request_id uuid,add constraint program_clone_request unique(owner_id,clone_request_id);
grant insert(clone_request_id) on public.programs to authenticated;
create function public.clone_program(p_version uuid,p_name text,p_request uuid) returns uuid language plpgsql security invoker set search_path='' as $$
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
 insert into public.programs(owner_id,name,description,cycle_length,is_template,objective,experience_level,estimated_sessions_per_week,duration_rotations,source_version_id,clone_request_id)
 values(auth.uid(),btrim(p_name),root->>'description',(root->>'cycle_length')::smallint,false,root->>'objective',root->>'experience_level',(root->>'estimated_sessions_per_week')::numeric,(root->>'duration_rotations')::int,source.id,p_request) returning id into target;
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

revoke all on function public.program_slot_eligible(uuid,uuid),public.program_definition(uuid),public.snapshot_program(uuid),public.clone_program(uuid,text,uuid) from public,anon,service_role;
grant execute on function public.program_slot_eligible(uuid,uuid),public.program_definition(uuid),public.snapshot_program(uuid),public.clone_program(uuid,text,uuid) to authenticated;
revoke all on all functions in schema body_private from public,anon,authenticated,service_role;
create index program_versions_owner on public.program_versions(owner_id,program_id,version);
create index program_rules_owner on public.program_progression_rules(owner_id,program_id);
create index program_prescriptions_owner on public.program_set_prescriptions(owner_id,slot_id);
create index program_slot_choices_owner on public.program_slot_alternatives(owner_id,slot_id);
create index program_equipment_owner on public.program_equipment(owner_id,program_id);
create index program_slot_equipment_owner on public.program_slot_equipment(owner_id,slot_id);
create index creator_authorizations_scope on public.creator_brand_authorizations(creator_id,program_id,brand_id);
create index program_reports_review on public.program_reports(review_status,created_at);
create index program_admin_events_identity on public.program_admin_events(entity_kind,entity_identity,created_at);
commit;
