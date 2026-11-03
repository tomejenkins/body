-- Phase 4.1: additive classification; existing exercises/history are preserved.
begin;
alter table public.exercises add column slug text;
update public.exercises set slug = 'legacy_' || replace(id::text, '-', '');
alter table public.exercises alter column slug set default ('custom_' || replace(gen_random_uuid()::text, '-', ''));
alter table public.exercises alter column slug set not null;
alter table public.exercises add constraint exercises_slug_format check (slug ~ '^[a-z][a-z0-9_]*$');
alter table public.exercises add constraint exercises_slug_key unique (slug);
-- Legacy private exercises cannot be reliably inferred from names. Explicit 'other'
-- is a conservative classification until owners review them; new forms require a choice.
alter table public.exercises add column exercise_type text not null default 'other'
  constraint exercises_type_check check (exercise_type in ('compound', 'isolation', 'other'));
alter table public.exercise_movement_patterns add column is_primary boolean not null default false;
create unique index exercise_one_primary_pattern on public.exercise_movement_patterns(exercise_id) where is_primary;
grant insert (exercise_type), update (exercise_type) on public.exercises to authenticated;
grant insert (is_primary) on public.exercise_movement_patterns to authenticated;

-- Atomic custom editor. INVOKER: RLS and column grants still apply to every statement.
-- No owner, slug, server timestamp or system-catalog administration parameters.
create function public.save_custom_exercise(
  p_id uuid, p_name text, p_type text, p_primary_pattern uuid,
  p_secondary_patterns uuid[], p_primary_muscles uuid[], p_secondary_muscles uuid[],
  p_equipment uuid[], p_instructions text
) returns uuid language plpgsql security invoker set search_path = '' as $$
declare
  uid uuid := auth.uid();
  result_id uuid;
begin
  if uid is null then raise exception 'Sign in required' using errcode = '42501'; end if;
  if p_name is null or length(btrim(p_name)) not between 1 and 200
    or p_type is null or p_type not in ('compound','isolation','other')
    or p_primary_pattern is null
    or coalesce(cardinality(p_primary_muscles),0) not between 1 and 10
    or coalesce(cardinality(p_secondary_muscles),0) > 10
    or coalesce(cardinality(p_secondary_patterns),0) > 5
    or coalesce(cardinality(p_equipment),0) not between 1 and 10
    or coalesce(length(p_instructions),0) > 3000
  then raise exception 'Invalid exercise fields' using errcode = '22023'; end if;
  if p_primary_pattern = any(coalesce(p_secondary_patterns, '{}'))
    or p_primary_muscles && coalesce(p_secondary_muscles, '{}')
  then raise exception 'Primary and secondary classifications must differ' using errcode = '22023'; end if;
  if exists (select 1 from unnest(array[p_primary_pattern] || coalesce(p_secondary_patterns,'{}')) x
       where x is null or not exists(select 1 from public.movement_patterns t where t.id=x and t.archived_at is null))
    or exists (select 1 from unnest(p_primary_muscles || coalesce(p_secondary_muscles,'{}')) x
       where x is null or not exists(select 1 from public.muscle_groups t where t.id=x and t.archived_at is null))
    or exists (select 1 from unnest(p_equipment) x
       where x is null or not exists(select 1 from public.equipment_types t where t.id=x and t.archived_at is null))
    or (cardinality(p_equipment)>1 and exists(select 1 from public.equipment_types where id=any(p_equipment) and slug='none'))
  then raise exception 'Invalid classification' using errcode = '22023'; end if;
  if p_id is null then
    insert into public.exercises(owner_id,name,exercise_type,instructions)
      values(uid,btrim(p_name),p_type,nullif(btrim(p_instructions),'')) returning id into result_id;
  else
    select id into result_id from public.exercises where id=p_id and owner_id=uid and archived_at is null for update;
    if result_id is null then raise exception 'Exercise not editable' using errcode = '42501'; end if;
    update public.exercises set name=btrim(p_name), exercise_type=p_type, instructions=nullif(btrim(p_instructions),'') where id=result_id and owner_id=uid;
    delete from public.exercise_movement_patterns where exercise_id=result_id;
    delete from public.exercise_muscles where exercise_id=result_id;
    delete from public.exercise_equipment where exercise_id=result_id;
  end if;
  insert into public.exercise_movement_patterns(exercise_id,movement_pattern_id,is_primary) values(result_id,p_primary_pattern,true);
  insert into public.exercise_movement_patterns(exercise_id,movement_pattern_id)
    select result_id,x from (select distinct unnest(coalesce(p_secondary_patterns,'{}')) x) t;
  insert into public.exercise_muscles(exercise_id,muscle_group_id,muscle_role)
    select result_id,x,'primary' from (select distinct unnest(p_primary_muscles) x) t;
  insert into public.exercise_muscles(exercise_id,muscle_group_id,muscle_role)
    select result_id,x,'secondary' from (select distinct unnest(coalesce(p_secondary_muscles,'{}')) x) t;
  insert into public.exercise_equipment(exercise_id,equipment_type_id)
    select result_id,x from (select distinct unnest(p_equipment) x) t;
  return result_id;
end;
$$;
revoke all on function public.save_custom_exercise(uuid,text,text,uuid,uuid[],uuid[],uuid[],uuid[],text) from public,anon,service_role;
grant execute on function public.save_custom_exercise(uuid,text,text,uuid,uuid[],uuid[],uuid[],uuid[],text) to authenticated;
commit;
