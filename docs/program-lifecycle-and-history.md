# Program lifecycle and enrollment history

Phase 7.6B extends the existing assignment, scheduling, session and performance authorities. `program_assignments.id` is one enrollment. Rejoining a version creates a different assignment; it never inherits another assignment's positions or baseline. No new enrollment/history root, performance engine, workout execution engine or mutable best-lift totals were added.

## Shared qualifying evidence and the P1 correction

The audit's zero-load and zero-repetition probes were reproduced before changes. The former had stored `full`, two saved program sets and zero performance sets; the latter had stored `full` with zero saved progress. Both now derive `none`, zero saved progress and an unresolved first position.

`training_sessions` is the common owner-scoped session eligibility gate. `qualifying_workout_sets` contains the existing `performance_source` measurement rules. `performance_source` delegates to it without changing PR formulas. `program_training_progress` consumes the same evidence; `program_saved_progress` retains its existing signature. Required movement completion, cursor facts, full rotations, history counts, closed workout labels, program outcomes and automatic ending therefore use actual eligible work.

Eligible evidence requires a completed session (except the explicit before-close classification path), a retained selection and set, confirmed completed non-warm-up working sets, positive integer repetitions within existing limits, and a supported measurement category. External-load evidence requires positive canonical load. Bodyweight sets can qualify with **no external load**; optional added resistance retains existing nonnegative bounds. Unsupported legacy categories retain the performance engine's exclusion rules. Pending, skipped, removed, soft-deleted, warm-up and abandoned evidence cannot resolve prescribed work.

Full means all immutable prescribed movements have their required number of eligible working sets. Rep-target attainment remains the existing separate outcome; this phase does not require every saved set to hit the target rep range to resolve its prescribed set. A partial has qualifying prescribed work without every required set. No qualifying work is `none`. Fully completed optional extra rows are unnecessary; extra pending rows do not invalidate fulfilled required work.

The before-close trigger writes correct classifications for new closures. Old stored classifications and all actual weights, repetitions and timestamps are retained. `workout_program_classifications` derives authoritative closed program labels. History, workout review/completion loaders and other-program Dashboard markers use those labels; history's incomplete filter uses the effective label too. Corrections change the result without rewriting training evidence. A previously ended assignment is never silently reactivated when its evidence changes.

### Affected-data review

Apply both forward migrations in timestamp order. There is no automatic rewrite of historical actuals or blanket reclassification UPDATE. An authenticated owner can detect their mismatches with:

```sql
select w.id, w.completion_status as stored, c.completion_status as effective
from public.workout_sessions w
cross join lateral public.workout_program_classifications(array[w.id]) c
where w.owner_id = auth.uid()
  and w.status = 'completed'
  and w.completion_status is distinct from c.completion_status;
```

A privileged deployment review can run equivalent owner-by-owner checks in an approved environment; ordinary functions intentionally remain owner-scoped. Existing `full` flags are not sufficient evidence for a lifecycle transition. Legacy sessions remain viewable and correctly classified even where an old enrollment has no schedule configuration. Reconciliation is derived, so deleting/reinstating eligible set evidence changes progress and comparisons deterministically.

## Lifecycle state machine

| Command/event      | Required state                                                                           | Result                                                                                               |
| ------------------ | ---------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Start              | No active assignment; readable exact version; confirmed date/timezone; no active workout | New active assignment, server enrollment instant, initialized existing adaptive schedule; no session |
| Start same version | Same active execution version                                                            | Continue original assignment, no reset                                                               |
| End now            | Active, exact revision, no active workout                                                | Ended with `ended_now`; genuinely complete fixed programs retain `completed`                         |
| End after next     | Active version-bound incomplete assignment, no pending request                           | Pending request ID/time and incremented lifecycle revision                                           |
| Cancel end         | Active with pending request and exact revision                                           | Clear pending intent, increment revision                                                             |
| Switch             | Active, exact revision, different readable immutable version, no active workout          | End old with `switched`, create new active assignment atomically                                     |
| Qualifying close   | Exact active assignment/version, newly closed fully prescribed eligible session          | Satisfy pending end or genuine fixed-duration completion in the same workout closure transaction     |

Storage uses existing active/archived/completed states, plus explicit terminal reasons. UI distinguishes Active, Completed, Ended and Switched. An archived row alone is never proof of completion. Legacy inactive assignments without a reliable terminal reason are conservatively Ended. A legacy paused row is labeled Inactive rather than pretending that it ended, and remains historical; no new pause API is introduced.

Added assignment fields: provenance, stable enrollment timezone, exact selected immutable source version, lifecycle revision, pending request/time, terminal reason/request/session and validated lifecycle command. Existing `started_at`/`ended_at` hold enrollment endpoints. Old timestamps are not relabeled as exact server enrollment evidence: all pre-migration rows are `legacy`, and duration is unavailable. Their recorded dates and exact attribution remain readable.

Public program enrollment reuses the existing owned execution clone. A public source resolves to its first frozen execution version, even if the owner later snapshots an edited copy. The selected public version is also recorded explicitly. An explicitly selected newer owned version is a real switch, not a same-template continuation.

The old workout-start API can still initialize a **first** enrollment using a previously confirmed scheduling timezone. It cannot silently switch programs, reopen a completed program, or reenroll a previously ended program. The new Programs flow explicitly enrolls before workout launch. Browsing and previews are read-only. Existing active-version day launch, Workout tab recommendation, alternatives, Favorites, picker and logger continue through their existing operations.

## Commands, receipts and locks

`program_lifecycle` accepts kind, request UUID, exact expected assignment/revision and (for enrollment) immutable version, local date and IANA timezone. No caller owner, enrollment timestamp, terminal timestamp, counts or reason is accepted as authority. Server Actions verify `getUser`, require scheduling confirmation, and require switch/immediate-end confirmation.

`program_lifecycle_receipts` has owner RLS and unique `(owner_id, request_id)`. Input triggers validate and serialize under the existing profile lock, resolve protected target IDs and apply the entire transition transactionally. Retrying the exact payload returns the original durable result even after termination. Reusing its request UUID with any changed command argument fails. Receipts are immutable; no client UPDATE or DELETE. Receipt INSERT is limited to validated input columns; trigger validation applies equally to direct REST inserts.

Assignment INSERT/UPDATE guards accept only a validated owned receipt or a verified qualifying closure. Clients cannot directly update state, enrollment/end times, version, revision, terminal reason or pending references. The existing unique active-assignment index remains the final single-active constraint. Owner guards, source validation and existing immutable version protection remain in force. Functions use invoker/RLS, empty search paths and explicit authenticated grants; there is no new definer bypass, secret or service-role access.

Lock order is profile, assignment, then existing session operations. Immediate end/switch reject **any** active session, including independent workouts. Pending/cancel may occur while training because they do not detach or replace it. Cancel and completion serialize on the same profile lock: cancellation first prevents ending; qualifying completion first ends the assignment and rejects stale cancellation. The existing continuity path uses NOWAIT locks: if cancellation holds the profile lock first, a simultaneous close can return a retryable `55P03` instead of waiting. The close transaction rolls back without losing saved sets; its existing ordinary retry completes after cancellation. Logger synchronization is unchanged. Duplicate closure does not retrigger ending. Concurrent switch requests cannot both apply the same revision.

## Pending and fixed-duration completion

The closure-only assignment command additionally requires nested trigger context, so a client cannot replay an old session UUID as an automatic-ending command. The hook is AFTER the actual session status becomes completed, after closure evidence is authoritative. It verifies exact assignment/version, no Favorite linkage, a fully prescribed effective classification and a completion instant later than the pending request. A historic already-completed session, duplicate close, partial, accepted partial, skip, defer, abandonment, empty session, ad-hoc workout or Favorite cannot consume the pending end. No client polling, background timer or second completion write is responsible.

`program_training_rotations` and `program_assignment_complete` derive enrollment completion independently of calendar initialization; the calendar cursor, lifecycle and history reuse this authority. Legacy unconfigured assignments can therefore complete naturally without inventing a calendar. Genuine fixed-duration completion requires actual full training at every prescribed position for enough rotations. Skip/accepted-partial cursor resolution is not full training. Natural completion takes precedence over pending user intent; the terminal request reference still records that intent as satisfied. Open-ended programs never end automatically without intent. A pre-existing complete active assignment cannot start more training; management allows ending it before explicit reenrollment. Reads never mutate its state.

## Statistics and history membership

Read RPCs aggregate owner-side; browsers receive bounded pages, not lifetime sets. Enrollment pages contain ten records plus one lookahead (RPC max21), associated workout pages twenty plus one (RPC max51), and classification batches max51. Statistics accept max21 assignment IDs. Keyset cursors use server start timestamp plus UUID. Strength comparisons are capped at 100 per enrollment with a visible count/truncation note. Queries reuse shared evidence and existing performance/session indexes; an enrollment ordering index supports history pagination.

Statistics belong to the **exact assignment UUID and immutable execution version**. New authoritative enrollments additionally bound completed evidence by the enrollment/end instants. Legacy membership trusts original assignment identity, without claiming precise elapsed enrollment time. Primary workout count is distinct completed sessions with at least one qualifying set, including partial recorded training. Details distinguish full prescribed and partial sessions. This is not a count of unique resolved positions. Independent workouts/Favorites, empty/abandoned sessions and decisions do not contribute. Full-rotation counts require full actual positions; repeated days cannot substitute for outstanding days.

Program names come from immutable version definitions, falling back to original session snapshots for versionless legacy records. Root renames and published newer versions do not reinterpret enrollment statistics. Archived owned program versions remain readable through historical identity. Ended enrollment remains an enrollment even with no qualifying workouts.

History defaults to its existing chronological **Workouts** view, with original pagination, filters, records and links. A compact Workouts/Programs selector opens separate enrollment cards and private detail pages. Detail contains stable-timezone dates, provenance, terminal reason, full/partial counts, rotation summary, comparisons and paginated links to exact associated sessions.

## Duration

New durations use the server enrollment instant through terminal instant or the response's server `asOf`. The enrollment timezone remains stable independently of device travel or later scheduling preference changes. Short durations show elapsed whole days/weeks. Longer durations use calendar anniversaries, clamped month-end/leap-year dates, then remaining days; months are never assumed to be 30 days or years 365 days. Legacy recorded timestamps are shown explicitly as legacy, without fabricated exact duration.

## Comparable strength metrics

Existing `performance_metrics` provides qualifying per-session metrics. Comparison identity is exact canonical exercise, measurement category, metric and exact-rep key within one assignment. For each metric:

1. Find the first eligible session containing it, ordered by completion instant then session UUID.
2. Use that session's **best** qualifying value as baseline, with existing deterministic set tie-breaking.
3. Compare the best value in strictly later sessions of the same identity.
4. Preserve insufficient history, zero change and negative change; highlight only strictly positive actual comparable load gains.

A heavier triple cannot establish a five-rep gain; squat cannot borrow a bench baseline; another enrollment or pre-program lifetime PR is not a baseline. Actual exact-rep values and estimated 1RM stay separate and labeled. Bodyweight repetition results stay repetitions; no bodyweight resistance or assisted load is invented. Canonical kilograms are compared before display conversion/rounding. Up to two distinct lift highlights favor existing record prominence and recognizable exact five/three/one-rep results. Detail retains neutral/negative supported comparisons.

## Phase 7.6C dependency and limitations

Archive/delete is deliberately unimplemented. Extend the shared `training_sessions` eligibility gate and ensure all session-list paths apply the same retention predicate; then PRs, program progress, completion classifications, counts and comparison baselines derive from surviving evidence. Test baseline removal/restoration, completed-rotation loss, scheduled decisions referencing removed evidence and no automatic enrollment reactivation. Structural Favorite snapshots remain independent from actual evidence. Phase 7.6C must explicitly reconcile `terminal_session_id`, `schedule_first_session_id` and schedule-decision session references before deleting a session: current restrictive foreign keys intentionally prevent unreviewed cleanup. Choose reviewed nullable references or minimal non-performance tombstones, never cascade-delete enrollments/receipts or retain deleted actual sets inside a Favorite. Do not add cached assignment totals.

This phase adds no lifecycle timezone-change API, program pause/resume lifecycle, historical editing endpoint or archive/delete UI. Completion history reflects current surviving evidence, while terminal intent/timestamps remain durable; a changed completed-program evidence state is disclosed. Legacy exact enrollment duration and unknown terminal reasons cannot be recovered automatically. Very large enrollments still require owner-side aggregation across their evidence; the client payload and pagination are bounded, but hosted query plans at production scale need release verification. Local emulation does not establish hosted or physical-device behavior.
