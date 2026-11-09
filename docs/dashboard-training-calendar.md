# Dashboard training calendar — Phase 7.5C

## Preflight and architecture

Base main `05e28cc` includes merged PR #24. Review covered AGENTS.md, Dashboard layout/recent training/shortcuts/loading, adaptive scheduling, selection/Favorites and entry-refinement documentation, Programs calendar/query/model, current schedule/cursor/decision SQL, validated starts, Workout entry, auth/no-store adapters, continuity, error boundaries and retained tests.

The prior Dashboard had a large generic Start/Blank-or-Resume card followed by shortcuts and recent training. The implementation plan replaces that card with a compact Training Week widget, reuses the authoritative schedule and start action, adds date selection and contextual links, preserves useful Dashboard content, then verifies ownership, stale starts, responsive behavior and retained flows. No scheduling algorithm, execution engine, table, dependency or migration is added.

`loadTrainingWeek` verifies the user and calls the existing owner-scoped `program_schedule` once with a seven-day range. That response supplies assignment/version identity, authoritative local today, projection, historical scheduling facts, current cursor/work index and decision revision. Dashboard never calculates program progression, recovery or due status. Workout uses `workout_start_options`; both SQL APIs derive their recommendation from the same `program_schedule_cursor`.

The Dashboard retains its greeting, training shortcuts and recent training. The widget is the first major actionable surface. Active-session identity reuses the continuity result already obtained by the existing history loader, replacing the old Dashboard `loadWorkout()` call and avoiding a second full active-workout/set load. An in-progress notice and Resume take priority within the widget. Dedicated route loading/error states report loading or failure rather than inventing an empty plan.

## Dates, navigation and selection

The scheduling assignment's persisted IANA timezone and SQL-returned `today` are authoritative. No browser clock, device zone, locale or elapsed weekday advances the program. ISO calendar-date helpers lay out Monday–Sunday and normalize requested weeks; they do not determine training order. Formatting uses explicit English/UTC noon for date-only labels, retaining dates across DST and year/month boundaries.

Previous/next links use `/dashboard?week=YYYY-MM-DD#training-week`. Each server navigation requests one seven-day projection; links disable speculative prefetch. On loading a week, today is selected if present, otherwise Monday. Week changes remount the selection surface, so Back/Forward restores the requested week with that deterministic selection. Date selection within a week stays local and makes no network request or scheduling write. Selection is not persisted as an execution decision.

Today has a circled, bold date and `aria-current=date`; selection has its own background/border and `aria-pressed`. Seven buttons fit one row at normal phone widths, with at least 44 px width and 76 px height. Full-date labels include every event/status. Keyboard arrows, Home and End move focus/selection; normal Tab and links remain available. Selected details announce politely and retain all events in a bounded-height scroll surface.

View Full Schedule preserves the loaded week and links to the existing `/programs?week=…#program-calendar`. Unconfigured states link to the existing Programs initialization form; the Dashboard neither confirms a timezone nor creates historical dates.

## Status mapping and multiple events

Status and identity come from existing facts, never from the mere passage of time.

| API status       | Strip indicator    | Selected detail                                                  |
| ---------------- | ------------------ | ---------------------------------------------------------------- |
| due              | ●                  | Recommended for the current eligible occurrence                  |
| completed        | ✓                  | Completed; authorized View Workout link                          |
| recorded_partial | ◐                  | Partial training recorded; actual history reference              |
| accepted_partial | ≈                  | Partial accepted · scheduling only; session remains partial      |
| skipped          | Skip SVG           | Skipped, distinct from completed training                        |
| deferred         | Calendar/clock SVG | Deferred and target date when present                            |
| overdue          | !                  | Not completed · Carried forward, retaining the original due date |
| defer_cancelled  | Undo SVG           | Deferral cancelled, retaining the original decision              |
| recovery         | ~                  | Recovery guidance, without inventing a program rest position     |
| planned_rest     | —                  | Rest Day · Planned recovery                                      |
| scheduled        | ○                  | Scheduled projection                                             |
| no event         | ·                  | No scheduled activity                                            |

A returned carried recommendation includes its original date separately. Overdue does not mean failed training and has no attendance/streak penalty. Color supplements distinct symbols and full text; it never carries status alone. Light/dark palettes reuse existing accessible status variables.

Deterministic display order is due, actual completed, actual partial, accepted partial, skipped, deferred, overdue, cancelled deferral, recovery, prescribed rest, scheduled. Ties use name, session identity and target date. The strip shows the first indicator plus `+N` for additional events. Details retain every event, including partial-plus-acceptance records sharing a session. The widget does not merge a scheduling decision into training or hide a second session.

## Actual independent training

`program_schedule` remains the only authority for current-assignment completion. A separate bounded owner-filtered `workout_sessions` summary query adds completed independent/Favorite and other-program training within the week, using existing `full`/`partial` session classifications. It explicitly excludes current-assignment rows already represented by the schedule API. Empty/abandoned sessions are excluded. No actual sets, lifetime history or full exercise catalog are downloaded for the widget.

The query reads a padded UTC interval covering all possible assignment-local boundaries, then filters completion timestamps into the exact local date range on the server. This safely handles cross-midnight completion and both DST changes without assuming 24-hour local days. It returns at most 201 rows: 200 displayed summaries and one overflow sentinel. Overflow is disclosed with a History link. Independent and other-program records have explicit source labels and cannot resolve a scheduled position or alter an assignment.

Calendar markers use the assignment-local completion date, consistently with Programs; the existing Recent training list still presents session start time. View Workout points to the existing owner-verified history route. An overdue original date never masquerades as the late actual completion date.

## One-tap start and active sessions

Start Workout appears only when the selected date equals the SQL local today and `next.recommendedOn` is today for an active, configured, incomplete assignment. The hidden start payload contains the same immutable assignment/version/day, rotation context, expected work index, decision revision and fresh request UUID. It invokes existing `startSelection` → `start_assigned_workout`; no session-start SQL, alternate logger or assignment initialization is recreated.

Existing profile/assignment locks, payload-bound retries, cursor/revision checks and single-active protection reject stale recommendations, archived/replaced assignments and concurrent starts. The existing friendly refresh/resume messages remain visible in the widget. A successful start enters the existing Workout Home directly. Active sessions replace Start with Resume to the actual session on any selected date; drafts, pause and timing remain under the existing engine.

A past date exposes history or carry-forward information, never a backdated start. Future selections show projections and only a secondary route to `/workout?choices=program#program-workout-options`, which opens the existing alternatives disclosure. Existing override/repeat semantics remain authoritative; there is no future-day start operation.

No active assignment produces a useful empty state with Browse Programs and direct Other setup. An unconfigured assignment explains the missing start/timezone and links to Programs. Completed assignments have no recommended start or future prescribed workouts; archived assignments are not selected as current. Actual training remains accessible through History/Programs.

## Loading, security and invalidation

The app's protected force-dynamic layout, verified identities and no-store Supabase fetches remain intact. No global/private shared cache, public schedule route, caller-supplied owner, privileged bypass or secret is introduced. URL input controls only a validated calendar window, not assignment identity or progression. Projection and supplemental history are separate reads; a concurrent device can change the view between requests, but all starts revalidate against the database before writing.

Workout closure, scheduling decisions, schedule initialization and program activation invalidate Dashboard and Programs as well as their existing routes. Independent ad-hoc/focus/exercise/Favorite starts also invalidate Dashboard so Resume stays current. Individual active-set saves keep the existing queue behavior; program completion is finalized and invalidated at normal session closure. The Dashboard does not poll. Reopening/navigation/refresh obtains the current server date and facts; an already-open tab is not a realtime subscription or midnight clock authority.

Validation and screenshots: [phase-7-5c-validation.md](phase-7-5c-validation.md). Underlying contracts remain documented in [adaptive scheduling](adaptive-program-scheduling.md), [selection/Favorites](workout-selection-and-favorites.md) and [entry refinement](workout-entry-refinement.md).

## Limits and rollout

No new migration is required. Deploy only after all previously merged Phase 7.5A/B/B.1 migrations are present. This delivery performs no hosted SQL, deployment or merge, and leaves Supabase preview disablement unchanged. Week summaries are intentionally bounded; unusually dense history is disclosed through the overflow note. Physical Safari/iOS, physical-device screen readers and hosted-provider behavior need separate verification. Feed, billing, premium builders, community and administration remain outside scope.
