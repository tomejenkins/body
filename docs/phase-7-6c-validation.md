# Phase 7.6C validation

Base: fetched `main`, `f17182d358893e97e9f806933ea69e740224123f` (PR #28). Branch: `feat/phase-7-6c-workout-retention`. Validation date: November 10, 2026. All database/Auth/browser work used disposable local records. No hosted Supabase modification, deploy or merge.

## Preflight and implementation

Read AGENTS.md, Phase 7.6A audit, Phase 7.6B architecture/validation, actual qualifying evidence and performance consumers, scheduling resolutions, post-close lifecycle hook/receipts, History/Workout Complete routes, Favorites snapshots, timers/continuity, pending-set safeguards, RLS/grants and every session-dependent FK. Read the pinned Next Server Actions guide and applicable Supabase/runtime instructions.

The plan was shared before source changes: revisioned owner commands and FK cleanup → central active/retained evidence → secondary History controls → shared inline closure state → database/security/browser regression and delivery. The dependency map and exact semantics are in [architecture](workout-retention-and-abandon.md).

One new CLI-created forward migration: `20261110155120_workout_retention.sql`. No earlier migration, catalog definition, package version or lockfile changed. Existing sessions remain unarchived; no actual weights/reps or original timing values were corrected or fabricated.

## Executed validation

| Check                           | Result                                                               |
| ------------------------------- | -------------------------------------------------------------------- |
| `npm run lint`                  | Passed on final production source                                    |
| `npm run typecheck`             | Passed strict TypeScript and route generation                        |
| `npm test -- --maxWorkers=2`    | Passed 329 tests, 64 files                                           |
| `npm run format:check`          | Passed                                                               |
| `npm run catalog:check`         | Passed: 183 exercises                                                |
| `npm run programs:check`        | Passed: 12 programs, 46 training days, 205 slots                     |
| Fresh isolated migration replay | Passed final schema in `body_retention_76c_release`                  |
| Full pgTAP                      | Passed 2,308 assertions, 26 files, including 61 retention assertions |
| `npm run db:lint`               | Passed `public,body_private`; no warnings/errors                     |
| `npm run build`                 | Passed final Node production build                                   |
| `npm run cf:build`              | Passed, including rebuilt Next output after runtime recovery         |
| `npm run cf:check`              | Passed; `--dry-run` exited without upload                            |
| Playwright desktop/mobile       | Passed 148 tests; 10 existing duplicate viewport cases skipped       |
| Local Worker requests           | Passed 10/10 local routing/auth-boundary requests                    |

The isolated replay helper created a new local database, loaded the local stack's managed Auth/extensions schema-only bootstrap, then applied every migration in sorted order using `psql -v ON_ERROR_STOP=1`. No hosted data were copied. Clean disposable-stack alternative: `npm run db:reset`. Actual helper: `/workspace/work/retention-7-6c/replay-release.py`.

The full database runner used `ghcr.io/supabase/pg_prove:3.36` with `/tests/*.sql`, `PGHOST=supabase_db_body`, `PGDATABASE=body_retention_76c_release` on the local `body_validation` network. Lint used the pinned CLI against the local browser database with the same final schema/functions. Local browser launch: `node /workspace/work/active-workout/run-e2e.mjs` (system Chromium, public local API configuration, loopback app port 3000). Unit workers were bounded to two; every test ran.

## Evidence and regression coverage

Retention SQL covers completed ad-hoc/program and abandoned sessions; active rejection; exact archive/delete retries; changed intent rejection; stale revision; raw state/delete protection; owner/anonymous denial; immutable private receipts; actual timing preservation; retained detail eligibility; PR next-best fallback; previous defaults and Look Back; preserved Favorite structure/source cleanup and independent launch; deleted start-nonce rejection; actual root/selection/movement cleanup; whole-transaction rollback on a deliberate FK cleanup failure; program enrollment retention; genuine fixed completion versus surviving evidence; pending-end bodyweight evidence; no restore lifecycle replay; exact comparison baseline/later-best withdrawal and restoration.

A regression scenario archives an accepted partial, explicitly skips its reopened occurrence, then restores/deletes the source without overriding the newer skip. Another withdraws the latest of two accepted partial sources: the cursor must not fall back to an older superseded acceptance. A deliberate fresh acceptance of restored evidence remains possible. This required replacing the old combined terminal-decision uniqueness invariant with unique skip protection plus existing profile locks, exact cursor revision and request checks. Decision history is never rewritten into a fabricated skip.

Browser retention scenarios seed actual sets through existing RPCs, verify normal/archived History and original detail, cancel confirmation, restore, compare authoritative PRs, delete actual evidence and follow the now-missing detail route. They launch the retained Favorite independently and reconcile an ended program's counts, reason, timestamp and revision. Parallel RPC scenarios check exact request retries, owner privacy and conflicting restore/delete and archive/delete outcomes.

The inline closure scenario preserves one saved actual set and one pending set in an eight-day program with a pending end request. First tap and cancellation send no abandonment POST. It checks keyboard focus, refresh reset, choosing Finish, readable red confirmation, 44px targets, no horizontal overflow, fixed footer positioning, 375/390/430 px and both themes with reduced motion. A deliberately aborted first POST leaves the workout active with an actionable error. A delayed retry disables both closure paths; final abandonment preserves saved evidence and leaves program cursor/pending end unchanged, without a record or completion celebration.

Retained regression suites cover scheduling/nonweekly rotations, decisions/Favorites, Full Body/exercise-first starts, Dashboard calendar, Workout Complete, smart defaults, advanced effort, manual input, draft queues/revision conflicts, pause/timers, navigation/history, program progression, lifecycle, PRs/achievements and RLS.

## Actual before/after examples

- Local independent bench workouts recorded 50 kg and 100 kg at five reps through the ordinary logger RPC. Before archive, current best was 100 kg; after archiving the peak it was 50 kg while the archived rows still contained 100 kg. Restore returned the best to 100 kg. Permanent deletion returned it to 50 kg and physically removed the peak session's sets/selections/movements; the independently saved structural Favorite still launched.
- An exact-enrollment comparison used a first-session best of 52 kg × 5 and a later 60 kg × 5: +8 kg. Archiving the baseline left one eligible comparable session and no invented later comparison. Restoring reinstated +8 kg; deleting the later session removed that improvement again.
- A fixed-duration enrollment had two qualifying full workouts and a genuine terminal completion. Archiving the terminal workout reduced the eligible count to one and removed the current Completed claim; restore reinstated evidence without a lifecycle revision change. Deleting the trigger nulled only its reference, retained the original terminal reason/time and left the enrollment readable. Deleting the remaining workout reduced its eligible count to zero.

Previously stored sessions are not rewritten by this migration. Once a stored session is archived, all active shared readers exclude it; restoring uses its original valid evidence. Stored legacy completion classifications still use Phase 7.6B's authoritative derived interpretation. The latest explicit-decision rule affects an old accepted partial only when its underlying evidence is withdrawn or a newer explicit resolution exists; immutable historical decision rows remain.

## Findings during validation

Initial local-only iterations caught closed-row timer/continuity guards rejecting retention-only metadata updates, FK cleanup guard restrictions and a PL/pgSQL alias conflict. Narrow validated exceptions and an unambiguous alias fixed these without changing actual session timing or logged performance. Tests now exercise those paths.

The first complete browser run passed 146 cases, skipped ten duplicate viewport cases, and failed the dirty-draft review scenario in both projects: the outer Finish review trigger had incorrectly inherited the actual-submit dirty guard. Restoring its existing readable-review behavior keeps the real Finish submission and Abandon disabled while unsaved. A dedicated component regression test and the original browser scenario verify this distinction.

Early mobile closure tests caught a wrapped Confirm/Cancel row. Visual inspection then found that whitespace in a conditional CSS class had been stripped, losing the existing fixed footer. Class handling now uses `cn`; an explicit computed `position:fixed` assertion prevents recurrence. The superseded full browser run was interrupted to rebuild; it is not counted as the final result. An earlier retained-state browser helper also asserted metrics before the redirect committed; it now waits for the authoritative rendered state.

A subsequent three-worker complete run passed 147 cases and hit an existing decision-test synchronization race: the database had committed a replacement deferral, but the test clicked Cancel before its refreshed form revision arrived. The server correctly rejected stale intent. The test now waits for the rendered hidden revision matching the authoritative cursor before the next action; scheduling production code was not changed. The corrected scenario is checked in both projects before the final full rerun.

Schema/security fixture expectations were updated for the new receipt table, narrowly granted retention-command column and guarded DELETE privilege. Raw owned deletion now reaches the rejecting transition trigger rather than failing at the former missing table privilege; foreign rows remain unavailable. Existing smart-default warm-up/advanced source behavior was preserved, and its fixture remains unchanged.

## Screenshots

Actual locally seeded evidence; no fabricated production data. Mobile projects emulate Chromium rather than physical iOS/Android.

- [Default Finish / Abandon](evidence/phase-7-6c/finish-abandon-default.png).
- [375 light](evidence/phase-7-6c/confirm-abandon-375-light.png), [375 dark](evidence/phase-7-6c/confirm-abandon-375-dark.png).
- [390 light](evidence/phase-7-6c/confirm-abandon-390-light.png), [390 dark](evidence/phase-7-6c/confirm-abandon-390-dark.png).
- [430 light](evidence/phase-7-6c/confirm-abandon-430-light.png), [430 dark](evidence/phase-7-6c/confirm-abandon-430-dark.png).

- [History management](evidence/phase-7-6c/history-management.png) and [mobile](evidence/phase-7-6c/mobile-history-management.png).
- [Archive confirmation](evidence/phase-7-6c/archive-confirmation.png).
- [Archived History](evidence/phase-7-6c/archived-history.png) and [mobile](evidence/phase-7-6c/mobile-archived-history.png).
- [Archived original detail](evidence/phase-7-6c/archived-workout-detail.png) and [mobile](evidence/phase-7-6c/mobile-archived-workout-detail.png).
- [Restored workout](evidence/phase-7-6c/restored-workout.png).
- [Permanent Delete confirmation](evidence/phase-7-6c/permanent-delete-confirmation.png) and [mobile](evidence/phase-7-6c/mobile-permanent-delete-confirmation.png).

Complete final outputs: [browser regressions](evidence/phase-7-6c/browser-regression.txt), [unit tests](evidence/phase-7-6c/unit-tests.txt), [database suite](evidence/phase-7-6c/database-regression.txt), [OpenNext build](evidence/phase-7-6c/opennext-build.txt), [Wrangler dry-run](evidence/phase-7-6c/wrangler-dry-run.txt), and [Worker status evidence](evidence/phase-7-6c/worker-smoke.json).

The final complete default-worker browser run passed 148 cases and skipped ten existing duplicate viewport-matrix cases. Both earlier failing scenarios passed in that complete run. No test retry setting was added. Local Worker emulation used `npm run cf:preview -- --port 8787 --ip 127.0.0.1`: login/manifest returned 200; Dashboard, Workout, Programs/current, History/Archived History/detail and Program History returned authentication redirects (307). These are routing/auth-boundary smoke checks, not authenticated database workflows under Worker emulation; the local database was stopped after the successful Node browser suite to free build storage. Miniflare emitted two cancelled-request startup messages before becoming ready; all subsequent smoke checks passed.

## Rollout and environmental limits

Apply the new migration through the normal reviewed process before deploying the matching app. Validate owner RLS/concurrency and recovery readiness in staging. No actual-data backfill is needed. Code rollback must continue excluding archived evidence; a committed permanent delete has no application undo. Provider backup/PITR and external/log/browser-copy retention are outside this command; no promise of backup erasure is made.

Node 24, pinned dependencies/Supabase CLI 3.0.0, Docker VFS, local Supabase and system Chromium. The local Auth health check required its loopback wget probe to bypass the inherited proxy; this affected only the disposable container. The Supabase changelog URL was denied by network policy (HTTP 403); no proxy bypass was attempted for that external request. Existing middleware deprecation and optional Cloudflare metadata/network notices are reported separately from application test results.

Dependency/Next build directories temporarily used `/tmp` storage while Docker/browser tests ran. The environment disconnected after the successful final browser run; source, logs and screenshots survived, but temporary dependencies/build output did not. The exact lockfile dependencies were reinstalled into normal workspace directories before native OpenNext packaging; the local Supabase containers were stopped/removed without deleting their named data volumes. This is local disk management, not a package/config workaround. Authentication traces remain ignored because they may contain disposable session credentials. Committed logs are limited to test/build summaries and nonsecret HTTP status evidence.

No hosted deployment/migration, real cellular, physical-device or production-scale plan validation is claimed. Other open devices update on refresh/normal navigation; no realtime retention synchronization or offline queue was introduced. Bulk archive, account deletion and historical editing remain outside this phase.
