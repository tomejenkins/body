# Workout retention and two-tap abandonment

## Authority and scope

A workout retains its existing `workout_sessions.id`, source snapshots, sets, timing and assignment identity. `archived_at` changes eligibility, not execution status. Archive and restore never call `end_workout`, update performance values, create scheduled occurrences or replay enrollment transitions. Permanent deletion removes the session and its actual children. `program_assignments.id` remains the enrollment/history root.

Migration: `20261110155120_workout_retention.sql`. Existing rows begin unarchived at retention revision zero. No historical training backfill or performance rewrite occurs.

## Shared eligibility dependency map

The existing public APIs remain active-evidence wrappers. Their common implementations accept an explicit retained-read flag; owner checks apply in either mode.

| Reader                                                           | Source and retention behavior                                                                                                                                                   |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `training_sessions`                                              | `workout_evidence_sessions(...,false)`: completed sessions, plus active sessions only when explicitly requested; excludes archived sessions.                                    |
| `qualifying_workout_sets` / `performance_source`                 | `workout_evidence_sets(...,false)`: unchanged confirmed, supported, nondeleted working-set measurement rules; archived sessions excluded centrally.                             |
| PRs, actual/estimated records, charts, progression, achievements | Existing performance APIs consume the common active source; no mutable best-record counter is introduced.                                                                       |
| Program prescribed progress/classification                       | `workout_evidence_progress` and `workout_evidence_classifications`; ordinary wrappers use active evidence.                                                                      |
| Calendar facts, cursor, resolutions and genuine rotations        | Existing saved-progress chain consumes active evidence; withdrawing a session can reopen its exact occurrence.                                                                  |
| Enrollment counts and comparable lift baselines                  | Existing statistics derive from active exact-assignment evidence. Withdrawal can change both baseline and later best.                                                           |
| Smart previous sets                                              | Existing previous-selection/default recipe, warm-up and advanced-row behavior retained; source session must be unarchived. Next eligible previous selection becomes the source. |
| Look Back / exercise history                                     | Existing bounded query excludes archived sessions.                                                                                                                              |
| Exercise-first recents / last exact-exercise choice              | Existing qualifying performance chain excludes archived evidence. Library selection recents additionally filter their parent session.                                           |
| Dashboard activity                                               | Program performance chain plus explicit unarchived predicate on the independent-session activity query.                                                                         |
| Normal Workout History / Program History workout pages           | Owner-scoped, bounded pages exclude archived sessions. Existing keyset pagination remains.                                                                                      |
| Favorite source capture                                          | Completed ad-hoc source must be unarchived and contain qualifying evidence; existing independent structural snapshots remain usable.                                            |
| Archived History / private workout detail                        | Explicit retained classification/summary reads and original raw saved sets; no current achievements, progression suggestions, completion celebrations or Save Favorite action.  |

The retained flag is a read contract, never a way to insert archived evidence into current metrics. The common measurement implementation is shared rather than copied. Abandoned sessions retain their recorded rows but remain ineligible for completed-training metrics as before.

Current bests recalculate against surviving evidence. Historical recognition still uses the existing strict record-event engine; withdrawal does not perform a new completion or award-write on a different historical workout. Archived detail presents original actuals, not current PR claims.

## Commands, ownership and concurrency

`retain_workout(session, kind, request, expected_revision)` supports archive, restore and delete. It verifies authenticated identity, locks the owner profile and exact owned session, requires a closed workout, and compares the expected retention revision. Each success advances that revision exactly once. In-progress sessions cannot be archived or deleted, and raw browser writes cannot change server-owned archive/revision fields.

Owner-only `workout_retention_receipts` bind a request UUID to the exact session, kind and expected revision. Exact retries return the original durable result even after deletion. Changed-payload reuse is rejected. The receipt stores only identifiers, kind, revisions, server time and original start-request UUIDs for deletion; no exercise names, actual weights/reps, sets or workout snapshots are copied into it. There is no session FK on this minimal receipt, so retry protection survives physical deletion. Deleted session IDs and start nonces are reserved against resurrecting an old start request.

RLS, column grants and invoker triggers enforce all transitions. Receipt input INSERT is narrowly granted to support the invoker RPC; its trigger performs the same validation and atomic work for a direct insert. Application users cannot update/delete receipts. Functions have empty search paths and explicit authenticated grants; no new SECURITY DEFINER bypass, service key or caller-controlled timestamp is used.

Conflicting commands serialize under the existing profile lock. The first valid revision commits; a later conflicting stale revision fails. Exact retry and changed-intent rejection are tested. A failed cleanup rolls back child deletion, root deletion and receipt together. Existing NOWAIT operations elsewhere may require an ordinary safe retry when another transaction holds the profile/session lock.

## Archive and restore

Archive is a secondary action at the bottom of private Workout History detail. Its confirmation explains exclusion from current statistics and later restoration. Archived Workouts is secondary navigation under History → Workouts; the top Workouts/Programs selector is unchanged. The archived list uses the original training finish/start date, never the archive time, while retaining the established start/id pagination order.

Archived detail is visibly labeled and retains original movements, exercise identities, actual sets and timing. Restore returns that same row to normal history and active eligibility. No copied session, refreshed completion time, new set, synthetic workout or lifecycle transition is created. A server-rendered retention-revision key resets confirmation state and request identities after each successful transition.

All successful commands invalidate History (including records, progress and Program History), Exercises, Dashboard, Programs, Workout and Profile layouts. Other open devices still need a refresh or their next normal navigation; this phase adds no realtime/offline synchronization model.

## Schedule decisions and terminal enrollments

Archiving/deleting a full assigned workout removes its current resolution evidence. Archiving/deleting an accepted partial removes that partial's resolution evidence too; it does not fabricate a skip. The latest explicit skip/accept-partial intent for an occurrence wins. If the newest accepted source disappears, the engine does not silently fall back to an older superseded acceptance. Users may make a new validated decision against the reopened cursor, including deliberately accepting restored evidence again. Immutable decision rows remain history; unique skip protection, request UUIDs, cursor revision checks and profile locks prevent conflicting advancement.

Already ended/completed/switched assignments remain terminal, with original timestamps, reason and revision preserved. Their derived counts/rotations/strength results can change. A completed label requires surviving genuine completion evidence. When a previously qualifying terminal workout is withdrawn, Program History explains that current retained evidence no longer supports the original ending/completion; restoring it reinstates derived statistics without reactivating the assignment or consuming pending-end intent again.

## Physical deletion and reference cleanup

The validated delete transaction removes saved sets while their closed parent still exists, then deletes the root; existing owned FK cascades remove exercise selections and movement snapshots. This also removes set-local mutation/actual/effort/unit evidence. Guard exceptions accept only the nested validated delete and preserve ordinary closed-session protections.

| Reference                                         | Treatment                                                                                                                                                   |
| ------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Program assignment terminal/first-session pointer | Nullable `ON DELETE SET NULL`; enrollment, source version, lifecycle reason/time/receipts remain.                                                           |
| Accepted-partial decision session pointer         | Nullable `ON DELETE SET NULL`; immutable intent remains, missing source cannot resolve training. New accept requests still require a real eligible partial. |
| Favorite source session                           | Existing nullable FK and a narrowly guarded cleanup; reusable structural definition/name/identity unchanged. No deleted actuals retained.                   |
| Actual session, sets, selections, movements       | Physically removed in the same transaction.                                                                                                                 |
| Retention receipt                                 | Minimal owner/idempotency/deleted-start marker only.                                                                                                        |

Permanent Delete requires a separate destructive confirmation and explicit acknowledgement. It removes application-visible actual evidence from ordinary and archived history, records, achievements, totals, comparisons and schedule completion. There is no undo in Body. This operation does not promise physical removal from provider backups/PITR, infrastructure logs, already downloaded data or an already open browser's memory. Backup retention and account/data-subject erasure remain operational policies outside this command.

## Two-tap Abandon

The active footer shows Finish Workout beside Abandon. Finish retains the existing review/partial acknowledgement flow. First Abandon tap only arms local state; it sends no closure RPC, does not pause time, save sets or modify program state. Confirm Abandon is visibly destructive, with Cancel alongside it. Keyboard focus moves to confirmation and returns on Cancel. Refresh, session identity change, or choosing Finish resets the armed state.

The second tap invokes the existing `endWorkout` server action and `end_workout(...,'abandoned')`. Both closure paths share pending state and a synchronous submit mutex, and respect existing dirty/pending-save eligibility. No completed sets are manufactured. An uncertain transport result remains an actionable error; there is no optimistic successful-close message. Retry uses the existing authoritative idempotent session-close behavior. Saved sets remain saved, pending rows remain pending, and abandonment cannot advance a program, consume pending-end intent or produce a completion celebration.

Only closure layout/state and necessary footer space change. Logger inputs, queue, defaults, set saving, navigation, exercise selection, manual pause and timer semantics remain unchanged. Controls are tested at 375/390/430 px, both themes, reduced motion and keyboard navigation.

## Rollout and limitations

Apply the new forward migration before releasing the matching app; review staging RLS/concurrency and recovery readiness first. No hosted migration or deployment was performed here. There is no data rollback for a committed permanent deletion; code rollback must retain archived-evidence exclusion and cannot restore deleted actuals. Existing timestamps and source snapshots need no backfill.

Tests use local Docker/Supabase and Chromium mobile emulation. Physical iOS/Android, production-scale query plans, multiple deployed Workers, hosted backup policies and real unreliable cellular networks require release verification. Legacy enrollments keep Phase 7.6B’s uncertain provenance: if no immutable version exists and the last old workout-name snapshot is deleted, only the remaining legacy program-name fallback is available; exact original attribution cannot be invented. No bulk retention operation, archived subfilters, retention realtime sync, account deletion or workout correction editor is added. The existing bounded history APIs remain the integration contract.
