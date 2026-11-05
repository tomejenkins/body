# Phase 2.2 authorization and privileges

The original Phase 2.1 migration is immutable. A new forward migration, `20261103174917_enable_database_security.sql`, adds policies and explicit column privileges. Validation is local only; no hosted SQL or production deployment was performed. Read this document alongside [the data model](database-schema.md).

## Authorization matrix

Every policy targets `authenticated`. All policies use `(select auth.uid())` or a non-recursive parent-exercise lookup whose visibility is itself RLS-protected. Anonymous users receive no table/column grants, including catalog reads. A role without a non-NULL verified UID sees no data. Ordinary users never receive catalog administration rights.

`I` and `U` are column-limited INSERT and UPDATE, **not** table-wide privileges. `D` means an explicit row-scoped DELETE policy. Parent/owner IDs, primary keys, created/updated timestamps are not updateable by clients. INSERT allows identifiers/owner IDs only where listed, and every row is checked against verified identity.

| Table                        | SELECT                                        | INSERT               | UPDATE                              | DELETE               |
| ---------------------------- | --------------------------------------------- | -------------------- | ----------------------------------- | -------------------- |
| `movement_patterns`          | Signed-in identity                            | Denied               | Denied                              | Denied               |
| `muscle_groups`              | Signed-in identity                            | Denied               | Denied                              | Denied               |
| `equipment_types`            | Signed-in identity                            | Denied               | Denied                              | Denied               |
| `profiles`                   | Own rows only                                 | Own rows, I          | Own rows, U                         | Denied               |
| `account_preferences`        | Own rows only                                 | Own rows, I          | Own rows, U                         | Denied               |
| `exercises`                  | System + own custom                           | Own rows, I          | Own rows, U                         | Denied               |
| `user_equipment`             | Own rows only                                 | Own rows, I          | Denied; replace link                | Own rows, D          |
| `user_exercise_preferences`  | Own rows only                                 | Own rows, I          | Own rows, U                         | Own rows, D          |
| `programs`                   | Own rows only                                 | Own rows, I          | Own rows, U                         | Denied               |
| `program_days`               | Own rows only                                 | Own rows, I          | Own rows, U                         | Own rows, D          |
| `program_slots`              | Own rows only                                 | Own rows, I          | Own rows, U                         | Own rows, D          |
| `program_assignments`        | Own rows only                                 | Own rows, I          | Own rows, U                         | Denied               |
| `workout_sessions`           | Own rows only                                 | Own rows, I          | Own rows, U                         | Denied               |
| `workout_exercises`          | Own rows only                                 | Own rows, I          | Own rows, U                         | Denied               |
| `workout_sets`               | Own rows only                                 | Own rows, I          | Own rows, U                         | Own rows, D          |
| `exercise_movement_patterns` | Visible parent exercise (system + own custom) | Own custom parent, I | Denied; replace link                | Own custom parent, D |
| `exercise_muscles`           | Visible parent exercise (system + own custom) | Own custom parent, I | Own custom parent, muscle_role only | Own custom parent, D |
| `exercise_equipment`         | Visible parent exercise (system + own custom) | Own custom parent, I | Denied; replace link                | Own custom parent, D |

All tables retain RLS. No `ALL`, `TRUNCATE`, `REFERENCES`, `TRIGGER`, or `MAINTAIN` grant is introduced. `PUBLIC`, `anon`, and `service_role` retain the Phase 2.1 revocations. The service-role API is intentionally not a catalog-population path. PostgreSQL table owners/superusers remain administrative authorities; this is not protection against a compromised database administrator.

## Exact column allowlists

Unlisted columns cannot be inserted/updated by authenticated clients. Defaults and integrity triggers supply server timestamps; users can set actual workout timestamps to support historical corrections. UUID defaults can supply omitted IDs.

- `profiles`: INSERT `id, display_name, avatar_url`. UPDATE `display_name, avatar_url`.

- `account_preferences`: INSERT `owner_id, date_of_birth, onboarding_completed_at, training_goal, preferred_workouts_per_7_days, preferred_split, display_weight_unit`. UPDATE `date_of_birth, onboarding_completed_at, training_goal, preferred_workouts_per_7_days, preferred_split, display_weight_unit`.

- `exercises`: INSERT `id, owner_id, name, description, instructions, archived_at`. UPDATE `name, description, instructions, archived_at`.

- `user_equipment`: INSERT `owner_id, equipment_type_id`. UPDATE none.

- `user_exercise_preferences`: INSERT `owner_id, exercise_id, is_favorite, preference, notes`. UPDATE `is_favorite, preference, notes`.

- `programs`: INSERT `id, owner_id, name, description, is_template, cycle_length, revision, derived_from_program_id, archived_at`. UPDATE `name, description, is_template, cycle_length, revision, derived_from_program_id, archived_at`.

- `program_days`: INSERT `id, owner_id, program_id, cycle_length, cycle_position, name, is_rest_day, notes`. UPDATE `cycle_position, name, is_rest_day, notes`.

- `program_slots`: INSERT `id, owner_id, program_day_id, position, movement_pattern_id, exercise_id, target_sets, target_reps_min, target_reps_max, target_weight_kg, rest_seconds, notes`. UPDATE `position, movement_pattern_id, exercise_id, target_sets, target_reps_min, target_reps_max, target_weight_kg, rest_seconds, notes`.

- `program_assignments`: INSERT `id, owner_id, program_id, cycle_length, state, next_cycle_position, completed_rotations, started_at, ended_at`. UPDATE `state, next_cycle_position, completed_rotations, ended_at`.

- `workout_sessions`: INSERT `id, owner_id, source_program_id, source_program_day_id, program_assignment_id, source_cycle_position, source_rotation, program_name_snapshot, day_name_snapshot, name, notes`. UPDATE `name, status, notes, program_name_snapshot, day_name_snapshot, continuation_nonce`. Session times, completion summary, activity/evidence, effective end, duration provenance, idle context and recognition are server-owned.

- `workout_exercises`: INSERT `id, owner_id, workout_session_id, position, source_program_slot_id, exercise_id, prescribed_exercise_id, exercise_name_snapshot, exercise_instructions_snapshot, prescribed_exercise_name_snapshot, status, prescribed_sets, prescribed_rest_seconds, notes`. UPDATE `position, exercise_id, prescribed_exercise_id, exercise_name_snapshot, exercise_instructions_snapshot, prescribed_exercise_name_snapshot, status, prescribed_sets, prescribed_rest_seconds, notes`.

- `workout_sets`: INSERT `id, owner_id, workout_exercise_id, position, set_type, status, prescribed_reps_min, prescribed_reps_max, prescribed_weight_kg, actual_reps, actual_weight_kg, completed_at, notes`. UPDATE `position, set_type, status, prescribed_reps_min, prescribed_reps_max, prescribed_weight_kg, actual_reps, actual_weight_kg, completed_at, notes`.

- `exercise_movement_patterns`: INSERT `exercise_id, movement_pattern_id`. UPDATE none; replace via DELETE/INSERT.

- `exercise_muscles`: INSERT `exercise_id, muscle_group_id, muscle_role`. UPDATE `muscle_role`.

- `exercise_equipment`: INSERT `exercise_id, equipment_type_id`. UPDATE none; replace via DELETE/INSERT.

## Policy inventory and intent

Policy names are scoped to their table:

- `catalog_read`: SELECT on `movement_patterns`, `muscle_groups`, `equipment_types`; requires a non-NULL `auth.uid()`. There are no client mutation policies on these taxonomies.
- `exercise_read`: SELECT on `exercises` allows system (`owner_id IS NULL`) and own custom rows for a signed-in identity; SELECT on each classification junction requires a visible system or own custom parent exercise. Archived exercises remain readable for history and preference management.
- `owner_read`, `owner_insert`, `owner_update`: owner tables use `auth.uid() = owner_id`; `profiles` uses `auth.uid() = id`. `exercises` uses owner INSERT/UPDATE plus its wider system/own SELECT policy. INSERT has `WITH CHECK`; every UPDATE has both `USING` and `WITH CHECK`. The supplied owner field never establishes authority: it must match the verified subject. Column permissions and existing immutable-owner triggers independently prevent reassignment.
- `owner_delete`: DELETE only on `user_equipment`, `user_exercise_preferences`, `program_days`, `program_slots`, `workout_sets`. Owned structural child rows use their safe denormalized owner field plus the existing composite owner/parent FKs. No recursive parent RLS chains are needed. Deletes of referenced/assigned program days still fail their preserved FKs.
- `custom_insert`, `custom_delete`: classification junction mutations require `EXISTS` a parent exercise whose owner equals `auth.uid()`. System and another user's custom classifications cannot be mutated. `custom_update` exists only on `exercise_muscles` and has both `USING` and `WITH CHECK`, with only `muscle_role` updateable. Other classification keys use DELETE/INSERT instead of retargeting relationships.

There are no permissive public policies, user-metadata roles, unrestricted views, or new RPC endpoints. Policies have no circular dependencies: junctions depend on the exercises SELECT policy, which depends only on verified identity. Owned rows use direct indexed owner comparisons. No new indexes were needed: Phase 2.1 already indexes owners, parent positions, exercise IDs, and history. Child ownership remains enforced by the original validated foreign keys.

## Internal trigger compatibility

The forward migration replaces only `body_private.check_exercise_access()` with a `SECURITY INVOKER`, empty-search-path implementation. It uses ordinary SELECT instead of `FOR SHARE` on exercises. PostgreSQL locking SELECTs may require UPDATE privileges and eligible UPDATE rows, so the original implementation could reject legitimate references to read-only system catalog entries. Granting system UPDATE access or adding a privileged bypass to make that pass would be unsafe.

No ownership or FK constraint is removed: exercise ownership remains immutable, and real FK checks protect against concurrent parent deletion. System catalog rows and own custom rows are visible under SELECT policies; another user's private exercise is not. Inaccessible exercise references raise a generic foreign-key-style error without revealing private catalog contents. Other parent locks and source-consistency checks remain unchanged. The full relational regression suite is retained.

`body_private` remains non-exposed, with no client schema usage or direct function EXECUTE grants. Existing triggers invoke installed functions as ordinary invokers; no `SECURITY DEFINER` was added. Real authenticated INSERT/UPDATE tests verify that these revocations do not produce accidental permission errors in legitimate trigger paths.

## Deletion and historical safety

Clients cannot DELETE profiles, account preferences, exercises, programs, program assignments, sessions, or performed exercises. These decisions avoid exposing the root cascades from profiles → all user data and sessions/performed exercises → recorded sets. Use field updates for preferences, exercise/program archival, assignment lifecycle state, and exercise skip/partial status. A future audited cleanup workflow may add narrower deletion behavior, but it is not silently enabled here.

Owners can explicitly DELETE individual sets for corrections; no child data cascades from a set. Plan-slot deletion may clear nullable source-slot provenance, but historical snapshot labels, prescriptions, performed exercises and sets survive. Deleting a program day referenced by an assignment/session remains restricted by Phase 2.1 FKs. Client parent/ownership/key changes are denied by column grants, not solved by weakening constraints. The invariant tests retain full seven-/ten-position cycles, rest-day guards, ad hoc/partial/abandoned states, immutable sources, and corrected historical volume checks.

The database still does not compute reliable aggregate session completion labels, instantiate prescriptions, validate complete-cycle activation, advance rotations, or produce immutable edit audits. Those are transactional logging-service concerns. A user's own snapshots and performance can be edited; this authorization model does not assert trainer verification or factual truth of client-entered workout data.

## Phase 3 authentication integration

After Supabase signup creates an `auth.users` identity and a valid authenticated session exists, create `profiles` with `id = auth.uid()` and the required display name, then create `account_preferences` with `owner_id = auth.uid()`. These are explicit idempotent provisioning steps: confirm existence before retrying (do not send blanket UPSERT updates of protected ID/owner columns), and never use a service-role browser client or insert another user's identifier. With email confirmation enabled, wait for a real session; anonymous signup requests cannot insert profiles. No signup/auth trigger or UI is added here.

The Supabase API must verify JWTs; `auth.uid()` is the signed token subject, not editable `user_metadata`. Tests set database roles and subjects to simulate verified request contexts. Use the existing browser/server helpers with public project settings and real user tokens; authentication refresh/callback handling is still future work. An authenticated user can see only their own profile; DOB stays in the separate owner-only preference table. There is no publicly readable profile or workout feed.

Catalog population remains a reviewed database-administration action. For a future automated writer, define a dedicated non-login catalog role with explicit grants and policies on catalog tables only, narrow column lists, system-only exercise policies (`owner_id IS NULL`) and system-parent junction checks, no private custom-exercise or user-data privileges, no ordinary authenticated membership, and independent tests. Do not grant `service_role` global access, trust an `admin` metadata flag, or create a general-purpose privileged RPC. No administrative role or automation was enabled in Phase 2.2.

Trainer sharing, social publishing, set videos, subscriptions, auth UI, logging UI, hosted migrations, and Cloudflare changes remain out of scope. Private FK errors and uniqueness checks can reveal the existence of a supplied opaque ID as standard PostgreSQL referential behavior; they do not authorize reading the referenced row. Avoid turning raw database errors into public diagnostic data, and apply normal API rate limits/validation in Phase 3.

## Tests and local verification

```sh
npm run db:start
npm run db:reset  # destructive only to the disposable LOCAL stack
npm run db:lint
npm run db:test
npm run lint
npm run typecheck
npm test
npm run format:check
npm run build
```

The invariant file retains Phase 2.1 relational/history assertions and replaces now-obsolete blanket-denial assertions with `security.test.sql`. The security file independently verifies the exact per-column/table grant matrix, all policies targeting authenticated, UPDATE checks, anonymous denial, empty-subject denial, real owner success, other-owner invisibility/zero-row mutations, forged owners/parents, system/catalog protection, preference CRUD, classification ownership, substitutions, immutability, and deletion state. Fixtures and all writes roll back. Metadata/grant checks are independent from the actual role/claim DML tests.

Local-only publication boundary: do not push this new migration branch or open a PR until automatic hosted Supabase migration/preview deployment is confirmed disabled for **this branch**. The earlier Phase 2.1 exception does not establish Phase 2.2 safety. No remote SQL command, migration push, history repair, automatic merge, or deployment may run under this task. If safe publication cannot be established, commit locally and provide publishing instructions.

Official guidance: [Supabase RLS and operation grants](https://supabase.com/docs/guides/database/postgres/row-level-security). No production database access is required to run these tests.

## Phase 2.2 validation record

| Check                                             | Result                                                                                                                 |
| ------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Fresh local reset                                 | Both migrations applied in order successfully.                                                                         |
| Initial Phase 2.1 migration                       | Byte-for-byte unchanged from current main; SHA-256 `15e8d7316b9727177ae0afd4438d57062c597d0647c2f6f40081019fe9bbb049`. |
| Local database lint                               | Passed for `public,body_private`, warnings fail.                                                                       |
| Database tests                                    | 1,038 assertions passed across invariant and role/security suites; no skipped assertions.                              |
| Schema metadata                                   | 18 RLS-enabled tables, 53 authenticated policies, all 35 foreign keys preserved/validated.                             |
| Fixture rollback                                  | Zero profile fixtures remain after tests.                                                                              |
| App lint, strict typecheck, formatting            | Passed.                                                                                                                |
| App unit tests                                    | 2 passed.                                                                                                              |
| Production build                                  | Passed; existing route generation unchanged.                                                                           |
| Cloudflare/app/client code                        | Unchanged from main.                                                                                                   |
| Hosted SQL, migration push, production deployment | Not run; forbidden by this task.                                                                                       |
| Git publication / PR                              | Kept local at the user's explicit request for Phase 2.2.                                                               |

Docker and the local test runner were available; no required local check was blocked. These tests exercise database roles/claims and constraints, not the future live HTTP authentication/session-refresh workflow. No live Supabase authorization claim or deployment success is asserted.

## Phase 4.1 additive classification

The Phase 4.1 forward migration adds `exercise_type` to authenticated exercise INSERT/UPDATE allowlists and `is_primary` to pattern-link INSERT. Owner/system RLS remains unchanged; `slug` is readable and database-generated for custom records, with no client INSERT/UPDATE grant. The primary-pattern index permits at most one flagged link. Existing low-level/legacy records may lack a primary until edited.

`public.save_custom_exercise` is an authenticated-only SECURITY INVOKER transaction with empty search path, active taxonomy validation and verified owner checks; it has no owner parameter, privilege bypass or system administration capability. Its underlying operations still require RLS and existing narrow grants. See [exercise-library.md](exercise-library.md) and the retained exact-allowlist plus new role tests. No new DELETE or anonymous/service-role access is granted.

## Phase 5.1 lifecycle extension

The forward lifecycle migration adds only `removed_at` to the authenticated workout-exercise UPDATE allowlist; INSERT of that field and hard DELETE remain denied. New authenticated-only SECURITY INVOKER functions implement start/edit/end with verified-owner session locks and existing RLS. Private triggers guard terminal state, removal and direct authenticated selection writes; no privileged RPC is introduced. A partial index enforces one active session per owner. See [workout-lifecycle.md](workout-lifecycle.md) for concurrency, tombstones, completion-without-sets semantics and migration preflight.

## Phase 5.2 extension

See [set logging](set-logging.md) for the forward migration, active-only set write guards, load modes, server revisions, idempotent invoker operations and updated none/partial/full completion rules. The earlier phase descriptions above are historical. Closed set edits/deletion are now denied to ordinary clients; a future explicit correction workflow is required. Prior migrations remain immutable.

## Phase 5.3 extension

See [smart defaults](smart-set-defaults.md) for the additive provenance/entry metadata, authenticated history/initialization services, automatic pending templates and untouched-selection removal rules. Existing actual performance and account units are not backfilled. Prior migrations remain immutable.

## Phase 6.1 follow-up

See [workout history](workout-history.md) for paginated owner-scoped History/Look Back, read-only review, local-time display, friendly workout naming, measurement-context snapshots and reps-first bodyweight logging. The new forward migration leaves prior snapshots and SQL immutable, and blocks unsupported duration/assistance completion without weakening historical guards. Internal [record prominence](record-prominence.md) remains display metadata only.

## Phase 6.2 grants and read models

Session authenticated INSERT no longer includes status, completion_status, started_at or finished_at; UPDATE no longer includes completion_status, started_at or finished_at. Only continuation_nonce is newly updatable. All new evidence/effective-end/activity/idle/recognition fields have no write grants. Trigger-controlled status closure computes summary/times and rejects ordinary closed writes. Existing FK historical-reference cleanup does not touch closed activity. Parent-first invoker RPCs check expiry before accepting stale writes; direct child guards use NOWAIT to avoid reversed-lock waits. No SECURITY DEFINER bypass or private-helper execution grant is added.

workout_policy/workout_continuity and record_performances/record_metrics/personal_records/record_load_bests/workout_achievements/history_achievement_counts are authenticated-only, empty-search-path SECURITY INVOKER functions, explicitly scoped to auth.uid() and existing RLS. Anonymous and service-role execution is revoked; array/page bounds protect UI-facing aggregate queries. Read models have no owner argument or mutable record-summary grants. Retained authorization tests plus new local suites prove exact grants, protected timestamps, expiration retention, baselines and cross-owner denials. See [records](personal-records.md) and [continuity](workout-continuity.md).

Set completion timestamps are also server-assigned by the logging trigger. Existing narrow invoker column grants are retained, but submitted completion times are ignored: first completion uses database time, completed corrections keep the original event time, and pending sets clear it. Privileged historical imports remain distinct from ordinary authenticated writes.

## Phase 6.3 aggregate security

New performance_source/performance_metrics/progress_window/exercise_progress/training_progress/achievement_candidates functions use SECURITY INVOKER, empty search paths, existing RLS and authenticated UID scope. Anonymous/service-role execution is revoked; no write grants or privileged bypass are added. Date/timezone/load/UUID/month selectors are bounded/validated; ordinary date ranges filter at source and return bounded chart observations. Batched history recognition preserves prior-only comparisons and owner isolation. No client owner parameter or shared private-data cache exists. See [analytics](progress-analytics.md) for query/precision limits and [recognition](intelligent-pr-recognition.md) for dominance versus record truth.

## Phase 7.1 least-privilege additions

Authenticated sets gain INSERT/UPDATE only for effort_scale, effort_value and performed_to_failure; closed/removed/CAS/expiry guards remain. Prescribed effort and session source-version snapshots have no new client write grants. Preferences gain UPDATE preferred_effort_scale only. The logging RPC has one trailing optional validated effort object; omitted data preserves legacy updates rather than clearing reports.

Program recipe fields receive explicit column grants; publisher/origin/source attribution/publication eligibility/moderation/recommendation remain protected. New children use owner RLS, composite parent ownership, controlled root locking and narrow updates. Version INSERT permits only program_id/owner_id; triggers generate immutable definition/version, with no client UPDATE/DELETE. Invoker snapshot/clone/eligibility/definition RPCs verify owner/readable-source RLS. Public visibility intent adds no cross-owner SELECT policy. All six platform preparation tables deny ordinary and service-role client access and have RLS with no public policies. Full role tests cover these controls. See [program architecture](program-architecture.md).

## Phase 7.2 official catalog boundary

The non-login Body platform principal is explicitly typed; generated auth_user_id preserves mandatory auth.users references and deletion cascades for every person. Clients cannot set identity kind. Four new media/tag/gallery tables have RLS and explicit grants; platform media/tag definitions have no ordinary writes. Program metadata/tag/gallery edits remain owner-only, with parent locks. First publication, Featured, published pointers, version projections and platform installer functions are protected. Self-contained official-root policies and root-gated immutable-version reads avoid recursive RLS; mutable official children and private/public-intent community plans remain hidden. Application loaders verify identity and expose only approved official versions. See [program library](program-library.md) for exact predicates, replay and rendering safety.

## Phase 7.3 selection security

workout_movements has owner SELECT and narrow validated INSERT inputs only; snapshots cannot be submitted/updated/deleted by ordinary clients. Program session and exercise inputs are validated against owned immutable source versions; program retry/source/prescription/identity fields remain guarded and source plan numbers have no client write grants. Session-first locks, expected selection IDs and payload-checked UUID retries prevent stale or duplicate mutation. Existing closed/expiry, removal, set CAS, auth and owner policies remain. Last-choice queries reuse actual eligibility scoped by exact slot and owner, never client preference claims. Actual substitutions require explicit continuation after recorded input and preserve canonical identities. All new RPCs are invoker/empty-search-path with anonymous/service-role execution revoked; no hosted SQL is part of validation.
