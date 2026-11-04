# Workout History and Look Back — Phase 6.1

History replaces the placeholder at `/history`. It is a compact chronological list, with paginated workout review at `/history/[id]` and exercise Look Back at `/exercises/[id]/history`. Exercise details and active workout sections link to Look Back. Closed `/workout/[id]` routes reuse the read-only review; active workouts retain the existing logger, queue, draft recovery and lifecycle. No historical editing or deletion controls are introduced.

## Queries, pagination and ownership

`src/features/history` contains strict DTOs, formatting rules and verified server queries. Every loader calls `requireUser()` (server `getUser()` verification) before using the cookie-scoped, read-only Supabase adapter. New `public.workout_history` and `public.exercise_history` RPCs are SECURITY INVOKER with empty search paths, explicit `auth.uid()` scope and existing RLS. Anonymous and service-role EXECUTE remain revoked. No service-role key, owner parameter, duplicate history table or privileged bypass is used. Missing/foreign workout IDs return not found; unavailable queries raise retryable errors rather than fabricated empty history.

The landing page requests 21 summary rows, displays 20 and uses one as lookahead. Keyset order is `(started_at DESC, id DESC)`. Cursor links preserve the database timestamp's microseconds plus UUID; no offset scans, browser-local sort, whole-lifetime set download or per-exercise API query is used. Invalid UI cursors reset to the first page; SQL requires a valid paired cursor and caps requests at 51 rows. The database first materializes only the requested session page, then aggregates its nonremoved selections/nondeleted sets. Owner/start/ID and owner/exercise/session indexes support these reads. Pending edits to an already displayed row can change its counters; newly inserted sessions appear on returning to the newest page without shifting older cursor boundaries.

- **All workouts:** includes current, finished and abandoned workouts.
- **Completed:** status `completed`, including workouts intentionally finished with incomplete sets.
- **Incomplete:** active workouts, or finished workouts whose stored completeness is not `full`.
- **Abandoned:** status `abandoned`, separately from the incomplete filter.

Counts distinguish non-warm-up completed efforts (normal/drop/rest-pause), completed warm-ups and incomplete pending/skipped sets. Suggestions are never completed performance. Recorded completed efforts in an abandoned workout remain reviewable there; Look Back uses only completed sessions. Unsupported duration/assistance measurements are excluded from completed-performance counts. Stored historical session status/completeness is not retroactively rewritten. Removed selections and soft-deleted rows are excluded from ordinary totals and views, while tombstones and snapshots remain in PostgreSQL.

Workout review reuses `loadWorkout`, now fetching selection metadata and paginated batches of all set rows for that one workout. This avoids embedded-child response truncation and N+1 API calls. Original exercise order, names/instructions snapshots, stable IDs, set types, actual data, entered-unit metadata and pending suggestions are retained. Current catalog renames do not rename historical snapshots. Archived custom exercise details can be read by their owner and link to Look Back; archived rows remain absent from normal selection/search and have no edit/archive controls. Foreign private catalog/history remains inaccessible.

## Exercise Look Back

The service filters by exact canonical exercise UUID. It considers only completed sessions with actual completed, nondeleted sets in nonremoved selections. Related press, squat and hinge variations are never combined. A workout with repeated selections of the same canonical exercise counts once; completed sets retain selection-position then set-position order. Each row carries its original measurement context. Warm-up, normal, drop and rest-pause types remain distinct.

Look Back displays ten workouts with an eleventh lookahead, using `(finished_at DESC, id DESC)` cursor order. Total completed-workout count and the actual latest set `completed_at` timestamp are computed in SQL; only the requested page's sets are serialized. The last-performed timestamp does not move merely because an older workout was closed later. Per-workout review dates show the session close; the separate Last performed label uses the latest actual set completion. No pending suggestions, abandoned sessions, removed selections, deleted sets or unsupported measurement records become Look Back performance. Archived custom history remains owned and accessible, with current exercise identity and original session names shown separately.

## Local time, naming and preferences

All timestamps remain UTC `timestamptz` in storage and cursor ordering. `LocalTime` uses the browser's IANA timezone with `Intl.DateTimeFormat`; explicit-zone pure functions cover daylight saving and midnight transitions. `useSyncExternalStore` renders the same short placeholder on the server and first hydration, then formats in the browser, avoiding server-zone guesses and hydration mismatches. UTC labels are not shown in normal workout/history UI. Duration is elapsed start-to-finish time only when valid, not active exercise time or an invented duration for unfinished workouts.

The current account lb/kg preference is read on the server. Same-unit entered metadata preserves exact values such as 50, 135 and 52.5 lb; alternate units use the existing canonical kg formatting without rewriting loads. Settings changes invalidate workout, History and exercise routes. An open workout is not live-reformatted underneath typing. See [smart-set-defaults.md](smart-set-defaults.md) for quantization and metadata validation.

The main action is **Record Workout**, or **Resume Workout** when active. New workouts are named **Workout** through the existing start RPC. Exact recognizable legacy generic names (`Ad-hoc workout/session` and spaced equivalents) display as Workout without updating stored records. Arbitrary user/program names are preserved. Scheduled workouts remain future work; no dead-end button is exposed. API names/status values remain unchanged.

## Bodyweight and supported measurements

New selections receive an immutable `logging_kind` snapshot: loaded, bodyweight, assisted or duration. The client cannot INSERT or UPDATE this column. The insert trigger derives reps-based bodyweight from the existing conjunctive equipment taxonomy, with explicit canonical-ID exceptions for time/distance movements and assisted machines. It does not infer from compound/isolation or broad movement families. In particular, dynamic plank shoulder taps remain repetition-based, while named static planks/holds and loaded carries require time/distance. Explicit exceptions exist in SQL and the legacy-display TypeScript registry; future taxonomy corrections need a forward migration plus matching tests.

Ordinary bodyweight rows show **Set | Reps | Done**, with no zero or disabled load input. Compact **+ Add weight** switches an individual row to additional external resistance; mixed rows retain a Bodyweight designation and weighted rows show Added LBS/KG. Changing mode returns that row to pending for explicit confirmation. Removing added resistance is also an explicit action. New extra sets copy the preceding current mode/values. Existing historical preload types/modes and exact weight metadata are preserved.

History displays bodyweight as `10 reps · Bodyweight`, added resistance as `+25 lb × 8 · Added weight`, and ordinary external load as `50 lb × 8`. Body mass is never inferred, added or treated as external zero. Bodyweight and weighted results share a canonical exercise history but retain distinct loading contexts; they are not comparable record metrics.

Assistance reduces resistance and is not positive added weight. Duration/assistance capture is not implemented: the logger explains the limitation, disables ordinary completion/inputs, and a database guard rejects authenticated completion through RPC or direct DML. Existing measurements are not rewritten or guessed. The new column defaults old selections to **legacy**; legacy external load is labelled conservatively rather than asserted to be added bodyweight resistance. Known unsupported legacy measurements are flagged for review and excluded from performance summaries/Look Back. Legacy active unsupported movements are also blocked. Custom time/assistance metadata needs a future explicit editor contract; naming a custom exercise after a hold cannot safely establish its metric.

## PR data quality and corrections

Phase 6.2 must use owner-scoped, completed actuals from eligible completed sessions, nondeleted sets and nonremoved selections. Require a supported measurement context, canonical exercise ID, set type, actual reps/load and completed timestamp; suggestions and incomplete inputs are not performances. Keep bodyweight reps, added load, ordinary external load and future assistance/time metrics separate. Never merge records merely because exercises share a family or prominence. Warm-up inclusion must be an explicit future record rule, not an accidental working-set count.

Closed workouts remain protected by existing database guards, RLS, revisions and narrow grants. New SQL adds no UPDATE or DELETE rights to historical data. A future reviewed correction workflow must preserve attribution/audit, invalidate derived records/caches and recompute affected PRs and analytics. None of those calculations or corrections are implemented now. See [record-prominence.md](record-prominence.md).

## Migration and validation

`20261104160610_workout_history_foundation.sql` adds the measurement snapshot/guards, two indexes, read-only history services, classification helper and friendly default for new starts. The seven earlier migrations remain immutable. No new dependencies, public environment keys, Workers bindings or deployment scripts are required. Unit tests map Next's server-only marker to its bundled empty implementation in Vitest only, allowing mocked server-loader boundary tests; production imports keep the marker.

Before an approved release, review/apply the migration through the existing single delivery path, confirm target/migration history, backup/PITR and forward recovery, and verify RPC ACLs, indexes and cache visibility before serving the app. Both indexes are built within the migration transaction; assess their write-lock duration against the actual project size before an approved rollout. This work does not authorize merge, hosted SQL, remote migrations or production deployment. Publication relies on the user's repository-wide confirmation that automatic Supabase preview branching is disabled, not a live dashboard inspection.

Validated 2026-11-04 (America/Los_Angeles):

- Fresh LOCAL replay of all eight migrations, database lint and **1,231 pgTAP assertions across seven suites** passed.
- **115 Vitest tests across 23 files** passed, including loader identity/error boundaries, pagination, precise names/dates/durations, load contexts and exact prominence assignments.
- ESLint, strict typecheck, Prettier, catalog consistency and whitespace checks passed.
- Next.js production build, OpenNext Workers build and Wrangler no-upload dry-run passed.
- **36 desktop/mobile Playwright tests passed on Next.js and 36 on local Workers**. Four final Next history tests additionally passed after verifying rapid added-weight selection while editing reps.
- Local Worker mobile light/dark History, read-only review, Look Back and mixed bodyweight screens were visually reviewed, with no horizontal overflow.

Initial runs corrected type narrowing, a stale placeholder-heading assertion, and a custom fixture's invalid muscle slug. The first server-loader test also needed Vitest to resolve Next's server-only marker as documented above. Final runs pass; no local functional check remains blocked. GitHub git transport works, but the GraphQL PR API returns Forbidden, so manual draft PR creation may be required.

Run fresh local reset, database lint/pgTAP, lint/typecheck/Vitest/format/catalog checks, Next build, Workers build/dry-run and desktop/mobile browser suites. Local tests use disposable Supabase/Auth/Mailpit users and rollback-only SQL fixtures. Hosted configuration, real SMTP and physical devices require separate verification. Offline synchronization, duration/assistance logging, PR calculations, charts, programs, scheduling, OAuth, social/trainer features, timers and uploads remain out of scope.

## Phase 6.2 records and qualified durations

History summaries include effective endpoint, duration provenance, closure reason, idle gaps and recognition flag; the bounded batch achievement-count RPC supplies up to three diverse improvement counts. Lazy continuity runs before the history read. [Continuity](workout-continuity.md) explains elapsed/estimated/legacy/unknown labels and auto-abandonment. [Personal Records](personal-records.md) documents `/history/records`, Look Back summaries/load pages, strict exact-rep records, historical baselines and postfinish recognition. Existing snapshots, timezones, private keyset history and navigation context remain.

## Phase 6.3 Progress

History links to `/history/progress`; Look Back embeds exercise Progress while retaining workout-builder context and existing pagination. Local start date groups activity, actual set times position exercise observations, and reliable elapsed duration is separated from estimates/legacy/gaps. See [progress analytics](progress-analytics.md) for period/window/sample semantics, numeric volume and primary/secondary exposure. Meaningful achievement counts share the [recognition](intelligent-pr-recognition.md) engine with postfinish cards.
