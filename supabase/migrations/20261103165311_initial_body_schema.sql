-- Phase 2.1: initial MVP model. Apply locally only until separately approved.
-- No auth schema changes, auth triggers, public client policies, or catalog seed data.
begin;

create schema if not exists body_private;
revoke all on schema body_private from public, anon, authenticated, service_role;

create function body_private.touch_updated_at() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  new.updated_at := clock_timestamp();
  return new;
end;
$$;

create function body_private.immutable_owner() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if new.owner_id is distinct from old.owner_id then
    raise exception 'Ownership is immutable' using errcode = '23514';
  end if;
  return new;
end;
$$;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (length(btrim(display_name)) between 1 and 120),
  avatar_url text check (avatar_url is null or length(btrim(avatar_url)) > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.account_preferences (
  owner_id uuid primary key references public.profiles(id) on delete cascade,
  date_of_birth date,
  onboarding_completed_at timestamptz,
  training_goal text check (training_goal in ('strength', 'hypertrophy', 'fat_loss_preserve_muscle')),
  preferred_workouts_per_7_days smallint check (preferred_workouts_per_7_days between 1 and 7),
  preferred_split text check (preferred_split is null or length(btrim(preferred_split)) between 1 and 120),
  display_weight_unit text not null default 'kg' check (display_weight_unit in ('kg', 'lb')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.movement_patterns (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z][a-z0-9_]*$'),
  name text not null check (length(btrim(name)) between 1 and 120),
  description text,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.muscle_groups (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z][a-z0-9_]*$'),
  name text not null check (length(btrim(name)) between 1 and 120),
  description text,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.equipment_types (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z][a-z0-9_]*$'),
  name text not null check (length(btrim(name)) between 1 and 120),
  description text,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.exercises (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references public.profiles(id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 200),
  description text,
  instructions text,
  archived_at timestamptz,
  unique (id, owner_id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- NULL exercise owner denotes a system catalog entry; non-NULL denotes a private custom entry.

create table public.exercise_movement_patterns (
  exercise_id uuid not null references public.exercises(id) on delete cascade,
  movement_pattern_id uuid not null references public.movement_patterns(id),
  primary key (exercise_id, movement_pattern_id),
  created_at timestamptz not null default now()
);

create table public.exercise_muscles (
  exercise_id uuid not null references public.exercises(id) on delete cascade,
  muscle_group_id uuid not null references public.muscle_groups(id),
  primary key (exercise_id, muscle_group_id),
  muscle_role text not null check (muscle_role in ('primary', 'secondary')),
  created_at timestamptz not null default now()
);

create table public.exercise_equipment (
  exercise_id uuid not null references public.exercises(id) on delete cascade,
  equipment_type_id uuid not null references public.equipment_types(id),
  primary key (exercise_id, equipment_type_id),
  created_at timestamptz not null default now()
);

create table public.user_equipment (
  owner_id uuid not null references public.profiles(id) on delete cascade,
  equipment_type_id uuid not null references public.equipment_types(id),
  primary key (owner_id, equipment_type_id),
  created_at timestamptz not null default now()
);

create table public.user_exercise_preferences (
  owner_id uuid not null references public.profiles(id) on delete cascade,
  exercise_id uuid not null references public.exercises(id),
  is_favorite boolean not null default false,
  preference text not null default 'neutral' check (preference in ('neutral', 'preferred', 'avoid')),
  notes text,
  primary key (owner_id, exercise_id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.programs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 200),
  description text,
  is_template boolean not null default false,
  cycle_length smallint not null check (cycle_length between 1 and 366),
  revision integer not null default 1 check (revision > 0),
  derived_from_program_id uuid,
  archived_at timestamptz,
  unique (id, owner_id),
  unique (id, owner_id, cycle_length),
  foreign key (derived_from_program_id, owner_id) references public.programs(id, owner_id),
  check (derived_from_program_id is distinct from id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.program_days (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  program_id uuid not null,
  cycle_length smallint not null,
  cycle_position smallint not null check (cycle_position between 1 and cycle_length),
  name text not null check (length(btrim(name)) between 1 and 200),
  is_rest_day boolean not null default false,
  notes text,
  foreign key (program_id, owner_id, cycle_length)
    references public.programs(id, owner_id, cycle_length) on update cascade on delete cascade,
  unique (program_id, cycle_position),
  unique (id, owner_id),
  unique (id, program_id, owner_id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.program_slots (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  program_day_id uuid not null,
  position integer not null check (position > 0),
  movement_pattern_id uuid references public.movement_patterns(id),
  exercise_id uuid references public.exercises(id),
  target_sets smallint not null check (target_sets between 1 and 100),
  target_reps_min integer check (target_reps_min > 0),
  target_reps_max integer check (target_reps_max > 0),
  target_weight_kg numeric(10,3) check (target_weight_kg >= 0 and target_weight_kg <> 'NaN'::numeric),
  rest_seconds integer check (rest_seconds >= 0),
  notes text,
  foreign key (program_day_id, owner_id) references public.program_days(id, owner_id) on delete cascade,
  unique (program_day_id, position),
  unique (id, owner_id),
  check (movement_pattern_id is not null or exercise_id is not null),
  check ((target_reps_min is null) = (target_reps_max is null)),
  check (target_reps_max >= target_reps_min),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.program_assignments (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  program_id uuid not null,
  cycle_length smallint not null,
  state text not null default 'active' check (state in ('active', 'paused', 'completed', 'archived')),
  next_cycle_position smallint not null default 1 check (next_cycle_position between 1 and cycle_length),
  completed_rotations integer not null default 0 check (completed_rotations >= 0),
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  foreign key (program_id, owner_id, cycle_length)
    references public.programs(id, owner_id, cycle_length) on update cascade,
  foreign key (program_id, next_cycle_position) references public.program_days(program_id, cycle_position),
  unique (id, owner_id, program_id),
  check ((state in ('completed', 'archived')) = (ended_at is not null)),
  check (ended_at >= started_at),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index program_assignments_one_active_per_user on public.program_assignments(owner_id) where state = 'active';

create table public.workout_sessions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  source_program_id uuid,
  source_program_day_id uuid,
  program_assignment_id uuid,
  source_cycle_position smallint check (source_cycle_position > 0),
  source_rotation integer check (source_rotation >= 0),
  program_name_snapshot text,
  day_name_snapshot text,
  name text not null check (length(btrim(name)) between 1 and 200),
  status text not null default 'in_progress' check (status in ('in_progress', 'completed', 'abandoned')),
  completion_status text not null default 'none' check (completion_status in ('none', 'partial', 'full')),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  notes text,
  foreign key (source_program_id, owner_id) references public.programs(id, owner_id),
  foreign key (source_program_day_id, source_program_id, owner_id) references public.program_days(id, program_id, owner_id),
  foreign key (program_assignment_id, owner_id, source_program_id) references public.program_assignments(id, owner_id, program_id),
  unique (id, owner_id),
  check (source_program_day_id is null or source_program_id is not null),
  check (program_assignment_id is null or source_program_day_id is not null),
  check (source_program_id is null or length(btrim(program_name_snapshot)) > 0),
  check (source_program_id is null or program_name_snapshot is not null),
  check (source_program_day_id is null or (day_name_snapshot is not null and length(btrim(day_name_snapshot)) > 0 and source_cycle_position is not null)),
  check (program_assignment_id is null or source_rotation is not null),
  check ((status = 'in_progress') = (finished_at is null)),
  check (finished_at >= started_at),
  check ((status = 'completed' and completion_status in ('partial', 'full'))
    or (status <> 'completed' and completion_status in ('none', 'partial'))),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.workout_exercises (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  workout_session_id uuid not null,
  position integer not null check (position > 0),
  source_program_slot_id uuid,
  exercise_id uuid not null references public.exercises(id),
  prescribed_exercise_id uuid references public.exercises(id),
  exercise_name_snapshot text not null check (length(btrim(exercise_name_snapshot)) > 0),
  exercise_instructions_snapshot text,
  prescribed_exercise_name_snapshot text,
  status text not null default 'pending' check (status in ('pending', 'partial', 'completed', 'skipped')),
  prescribed_sets smallint check (prescribed_sets between 1 and 100),
  prescribed_rest_seconds integer check (prescribed_rest_seconds >= 0),
  notes text,
  foreign key (workout_session_id, owner_id) references public.workout_sessions(id, owner_id) on delete cascade,
  foreign key (source_program_slot_id, owner_id) references public.program_slots(id, owner_id) on delete set null (source_program_slot_id),
  unique (workout_session_id, position),
  unique (id, owner_id),
  check (prescribed_exercise_id is null or (prescribed_exercise_name_snapshot is not null and length(btrim(prescribed_exercise_name_snapshot)) > 0)),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.workout_sets (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  workout_exercise_id uuid not null,
  position integer not null check (position > 0),
  set_type text not null default 'working' check (set_type in ('warm_up', 'working', 'drop', 'rest_pause')),
  status text not null default 'pending' check (status in ('pending', 'completed', 'skipped')),
  prescribed_reps_min integer check (prescribed_reps_min > 0),
  prescribed_reps_max integer check (prescribed_reps_max > 0),
  prescribed_weight_kg numeric(10,3) check (prescribed_weight_kg >= 0 and prescribed_weight_kg <> 'NaN'::numeric),
  actual_reps integer check (actual_reps >= 0),
  actual_weight_kg numeric(10,3) check (actual_weight_kg >= 0 and actual_weight_kg <> 'NaN'::numeric),
  completed_at timestamptz,
  notes text,
  foreign key (workout_exercise_id, owner_id) references public.workout_exercises(id, owner_id) on delete cascade,
  unique (workout_exercise_id, position),
  check ((prescribed_reps_min is null) = (prescribed_reps_max is null)),
  check (prescribed_reps_max >= prescribed_reps_min),
  check ((status = 'completed') = (completed_at is not null)),
  check (status <> 'completed' or (actual_reps is not null and actual_weight_kg is not null)),
  check (status <> 'skipped' or (actual_reps is null and actual_weight_kg is null)),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Cross-table rules are invoker triggers, not privileged RLS bypasses.
create function body_private.check_exercise_access() returns trigger
language plpgsql security invoker set search_path = '' as $$
declare
  column_name text;
  exercise_uuid uuid;
  exercise_owner uuid;
begin
  foreach column_name in array tg_argv loop
    exercise_uuid := (to_jsonb(new) ->> column_name)::uuid;
    if exercise_uuid is not null then
      select owner_id into exercise_owner from public.exercises where id = exercise_uuid for share;
      if not found then
        raise exception 'Referenced exercise does not exist' using errcode = '23503';
      end if;
      if exercise_owner is not null and exercise_owner <> new.owner_id then
        raise exception 'Cannot reference another user custom exercise' using errcode = '23514';
      end if;
    end if;
  end loop;
  return new;
end;
$$;

create function body_private.check_rest_day() returns trigger
language plpgsql security invoker set search_path = '' as $$
declare is_rest boolean;
begin
  if tg_table_name = 'program_slots' then
    select is_rest_day into is_rest from public.program_days
      where id = new.program_day_id and owner_id = new.owner_id for share;
    if is_rest then
      raise exception 'Rest days cannot contain exercise slots' using errcode = '23514';
    end if;
  elsif new.is_rest_day and exists (select 1 from public.program_slots where program_day_id = new.id) then
    raise exception 'A day with exercise slots cannot become a rest day' using errcode = '23514';
  end if;
  return new;
end;
$$;

create function body_private.check_session_source() returns trigger
language plpgsql security invoker set search_path = '' as $$
declare day_row public.program_days;
begin
  if tg_op = 'UPDATE' and
    (new.source_program_id, new.source_program_day_id, new.program_assignment_id, new.source_cycle_position, new.source_rotation)
    is distinct from
    (old.source_program_id, old.source_program_day_id, old.program_assignment_id, old.source_cycle_position, old.source_rotation) then
    raise exception 'Session source attribution is immutable' using errcode = '23514';
  end if;
  if tg_op = 'INSERT' and new.source_program_day_id is not null then
    select * into day_row from public.program_days where id = new.source_program_day_id for share;
    if day_row.is_rest_day then
      raise exception 'Rest days do not create workout sessions' using errcode = '23514';
    end if;
    if new.source_cycle_position is distinct from day_row.cycle_position then
      raise exception 'Source cycle position must match program day' using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;

create function body_private.check_slot_source() returns trigger
language plpgsql security invoker set search_path = '' as $$
declare session_day uuid;
begin
  if new.source_program_slot_id is not null then
    select source_program_day_id into session_day from public.workout_sessions
      where id = new.workout_session_id and owner_id = new.owner_id for share;
    if not exists (select 1 from public.program_slots
      where id = new.source_program_slot_id and owner_id = new.owner_id and program_day_id = session_day) then
      raise exception 'Source slot must belong to session source day' using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;

create trigger exercise_preferences_access before insert or update on public.user_exercise_preferences
for each row execute function body_private.check_exercise_access('exercise_id');
create trigger program_slot_exercise_access before insert or update on public.program_slots
for each row execute function body_private.check_exercise_access('exercise_id');
create trigger workout_exercise_access before insert or update on public.workout_exercises
for each row execute function body_private.check_exercise_access('exercise_id', 'prescribed_exercise_id');
create trigger program_slot_rest_guard before insert or update on public.program_slots
for each row execute function body_private.check_rest_day();
create trigger program_day_rest_guard before update of is_rest_day on public.program_days
for each row execute function body_private.check_rest_day();
create trigger workout_session_source_guard before insert or update on public.workout_sessions
for each row execute function body_private.check_session_source();
create trigger workout_slot_source_guard before insert or update on public.workout_exercises
for each row execute function body_private.check_slot_source();

create index exercises_lookup_1 on public.exercises (owner_id);

create index exercise_movement_patterns_lookup_1 on public.exercise_movement_patterns (movement_pattern_id);

create index exercise_muscles_lookup_1 on public.exercise_muscles (muscle_group_id);

create index exercise_equipment_lookup_1 on public.exercise_equipment (equipment_type_id);

create index user_equipment_lookup_1 on public.user_equipment (equipment_type_id);

create index user_exercise_preferences_lookup_1 on public.user_exercise_preferences (exercise_id);

create index programs_lookup_1 on public.programs (owner_id);

create index programs_lookup_2 on public.programs (derived_from_program_id, owner_id);

create index program_days_lookup_1 on public.program_days (owner_id);

create index program_slots_lookup_1 on public.program_slots (owner_id);

create index program_slots_lookup_2 on public.program_slots (movement_pattern_id);

create index program_slots_lookup_3 on public.program_slots (exercise_id);

create index program_assignments_lookup_1 on public.program_assignments (owner_id);

create index program_assignments_lookup_2 on public.program_assignments (program_id, next_cycle_position);

create index workout_sessions_lookup_1 on public.workout_sessions (owner_id, finished_at desc);

create index workout_sessions_lookup_2 on public.workout_sessions (source_program_id, owner_id);

create index workout_sessions_lookup_3 on public.workout_sessions (source_program_day_id, source_program_id, owner_id);

create index workout_sessions_lookup_4 on public.workout_sessions (program_assignment_id, owner_id, source_program_id);

create index workout_exercises_lookup_1 on public.workout_exercises (owner_id, exercise_id, workout_session_id);

create index workout_exercises_lookup_2 on public.workout_exercises (source_program_slot_id, owner_id);

create index workout_exercises_lookup_3 on public.workout_exercises (prescribed_exercise_id);

create index workout_exercises_lookup_4 on public.workout_exercises (exercise_id);

create index workout_sets_lookup_1 on public.workout_sets (owner_id);

create index workout_sets_completed_history on public.workout_sets(workout_exercise_id, completed_at desc) where status = 'completed';

create trigger touch_updated_at before update on public.profiles
for each row execute function body_private.touch_updated_at();

create trigger touch_updated_at before update on public.account_preferences
for each row execute function body_private.touch_updated_at();

create trigger touch_updated_at before update on public.movement_patterns
for each row execute function body_private.touch_updated_at();

create trigger touch_updated_at before update on public.muscle_groups
for each row execute function body_private.touch_updated_at();

create trigger touch_updated_at before update on public.equipment_types
for each row execute function body_private.touch_updated_at();

create trigger touch_updated_at before update on public.exercises
for each row execute function body_private.touch_updated_at();

create trigger touch_updated_at before update on public.user_exercise_preferences
for each row execute function body_private.touch_updated_at();

create trigger touch_updated_at before update on public.programs
for each row execute function body_private.touch_updated_at();

create trigger touch_updated_at before update on public.program_days
for each row execute function body_private.touch_updated_at();

create trigger touch_updated_at before update on public.program_slots
for each row execute function body_private.touch_updated_at();

create trigger touch_updated_at before update on public.program_assignments
for each row execute function body_private.touch_updated_at();

create trigger touch_updated_at before update on public.workout_sessions
for each row execute function body_private.touch_updated_at();

create trigger touch_updated_at before update on public.workout_exercises
for each row execute function body_private.touch_updated_at();

create trigger touch_updated_at before update on public.workout_sets
for each row execute function body_private.touch_updated_at();

create trigger immutable_owner before update of owner_id on public.account_preferences
for each row execute function body_private.immutable_owner();

create trigger immutable_owner before update of owner_id on public.exercises
for each row execute function body_private.immutable_owner();

create trigger immutable_owner before update of owner_id on public.user_equipment
for each row execute function body_private.immutable_owner();

create trigger immutable_owner before update of owner_id on public.user_exercise_preferences
for each row execute function body_private.immutable_owner();

create trigger immutable_owner before update of owner_id on public.programs
for each row execute function body_private.immutable_owner();

create trigger immutable_owner before update of owner_id on public.program_days
for each row execute function body_private.immutable_owner();

create trigger immutable_owner before update of owner_id on public.program_slots
for each row execute function body_private.immutable_owner();

create trigger immutable_owner before update of owner_id on public.program_assignments
for each row execute function body_private.immutable_owner();

create trigger immutable_owner before update of owner_id on public.workout_sessions
for each row execute function body_private.immutable_owner();

create trigger immutable_owner before update of owner_id on public.workout_exercises
for each row execute function body_private.immutable_owner();

create trigger immutable_owner before update of owner_id on public.workout_sets
for each row execute function body_private.immutable_owner();

-- Phase 2.2 must deliberately add operation-specific grants AND policies.
-- Revoke Supabase default grants for these tables only; leave managed tables untouched.

alter table public.profiles enable row level security;
revoke all on table public.profiles from public, anon, authenticated, service_role;

alter table public.account_preferences enable row level security;
revoke all on table public.account_preferences from public, anon, authenticated, service_role;

alter table public.movement_patterns enable row level security;
revoke all on table public.movement_patterns from public, anon, authenticated, service_role;

alter table public.muscle_groups enable row level security;
revoke all on table public.muscle_groups from public, anon, authenticated, service_role;

alter table public.equipment_types enable row level security;
revoke all on table public.equipment_types from public, anon, authenticated, service_role;

alter table public.exercises enable row level security;
revoke all on table public.exercises from public, anon, authenticated, service_role;

alter table public.exercise_movement_patterns enable row level security;
revoke all on table public.exercise_movement_patterns from public, anon, authenticated, service_role;

alter table public.exercise_muscles enable row level security;
revoke all on table public.exercise_muscles from public, anon, authenticated, service_role;

alter table public.exercise_equipment enable row level security;
revoke all on table public.exercise_equipment from public, anon, authenticated, service_role;

alter table public.user_equipment enable row level security;
revoke all on table public.user_equipment from public, anon, authenticated, service_role;

alter table public.user_exercise_preferences enable row level security;
revoke all on table public.user_exercise_preferences from public, anon, authenticated, service_role;

alter table public.programs enable row level security;
revoke all on table public.programs from public, anon, authenticated, service_role;

alter table public.program_days enable row level security;
revoke all on table public.program_days from public, anon, authenticated, service_role;

alter table public.program_slots enable row level security;
revoke all on table public.program_slots from public, anon, authenticated, service_role;

alter table public.program_assignments enable row level security;
revoke all on table public.program_assignments from public, anon, authenticated, service_role;

alter table public.workout_sessions enable row level security;
revoke all on table public.workout_sessions from public, anon, authenticated, service_role;

alter table public.workout_exercises enable row level security;
revoke all on table public.workout_exercises from public, anon, authenticated, service_role;

alter table public.workout_sets enable row level security;
revoke all on table public.workout_sets from public, anon, authenticated, service_role;

revoke all on all functions in schema body_private from public, anon, authenticated, service_role;

commit;
