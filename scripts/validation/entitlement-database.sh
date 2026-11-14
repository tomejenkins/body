#!/usr/bin/env bash
# Full forward-only replay against a disposable local database, never hosted.
set -euo pipefail
cd "$(dirname "$0")/../.."
container=supabase_db_body
database=body_entitlement_isolated
artifact_dir=${BODY_DATABASE_ARTIFACT_DIR:-/tmp/body-entitlement-database}
mkdir -p "$artifact_dir"
docker exec "$container" dropdb -U postgres --if-exists "$database"
docker exec "$container" createdb -U postgres "$database"
docker exec -i "$container" psql -U postgres -d "$database" -v ON_ERROR_STOP=1 <<'SQL'
create schema auth;
create schema extensions;
-- Auth boundary fixture only; browser validation separately exercises real GoTrue.
create table auth.users(id uuid primary key,email_confirmed_at timestamptz,is_anonymous boolean default false);
create function auth.uid() returns uuid language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claim.sub',true),''),current_setting('request.jwt.claims',true)::jsonb->>'sub')::uuid$$;
grant usage on schema auth,extensions to authenticated,anon,service_role;
grant execute on function auth.uid() to authenticated,anon,service_role;
SQL
for migration in supabase/migrations/*.sql; do
  docker exec -i "$container" psql -U postgres -d "$database" -v ON_ERROR_STOP=1 < "$migration" > "$artifact_dir/$(basename "$migration").log" 2>&1
  printf 'Replayed %s\n' "$(basename "$migration")"
done
for fixture in supabase/tests/database/*.sql; do
  log="$artifact_dir/$(basename "$fixture").log"
  docker exec -i "$container" psql -U postgres -d "$database" -v ON_ERROR_STOP=1 < "$fixture" > "$log" 2>&1
  if rg -q 'not ok|Looks like you failed|ERROR:' "$log"; then
    cat "$log"
    exit 1
  fi
  printf 'Passed %s\n' "$(basename "$fixture")"
done
python3 scripts/validation/entitlement-concurrency.py
