# Program progression — Phase 7.4

Phase 7.4 extends the existing program copies, immutable versions, assignments, session/movement snapshots and logger. It does not create AI programs or a second execution engine. Base: merged PR #18 (`b4247a7`).

## Matching

Four internal levels remain unchanged. Level 4 has no visible quality label; level 3 says **Close**, level 2 **Similar**, level 1 **Same Muscle**. **Program Pick** and **Last Used** describe independent roles. Pick/last priority, deduplication, deterministic taxonomy ranking and See All remain. Flat barbell, dumbbell/machine, incline and fly comparisons retain their distinct mechanics; a creator pick is never automatically promoted.

## Starting load

Only authenticated, owner-scoped completed actual working sets for the exact canonical exercise are evidence. Existing `performance_source` excludes unconfirmed/pending/deleted sets, removed selections, abandoned sessions, warm-ups and unsupported measurements. Starting-load guidance excludes bodyweight, added-resistance bodyweight, assistance and duration modalities. It never transfers machine/free-weight loads, groups exercise IDs, or multiplies a dumbbell load into a new convention.

Evidence is limited to 180 days before the session and the latest 24 eligible exercise sessions. Stale history intentionally yields no suggestion. This is a recent training recommendation, not a lifetime record lookup; lifetime PRs retain their existing independent queries. Historical session timestamps bound the query, not the browser clock. Current completed-session evidence is included for post-workout evaluation; active sessions use only prior completed sessions.

The hierarchy is recent exact-slot/exercise performance near the target range, recent exact-exercise performance in the target range, nearby reps (within two), then conservative extrapolation. Estimation uses the existing Epley 1–10-rep boundary: `e1RM = load × (1 + reps/30)` (single = actual load), inverted for the prescribed upper rep bound, then multiplied by 0.90. Only targets up to 15 reps are estimated. This is not an actual lifted record or guaranteed capacity.

Suggestions floor to practical display increments: 5 lb, 2.5 kg for ordinary loads, 2 kg for classified dumbbell exercises. There is no equipment inventory inference; users may adjust to available increments. Display-unit rounding never changes stored actual loads. A rule step is never rounded upward into a larger increase.

The logger displays Suggested, a short optional explanation and **Use suggested weight**. Applying is explicit and uses the existing draft/save queue. It affects only untouched automatic pending external-load working rows; dirty/recovered/queued/edited/completed rows remain unchanged. Arriving server props do not apply anything. Recommendations never mark sets complete or fill actual effort. The existing input, precision, conflict, retry and draft behavior remains authoritative.

## Typed progression

Rules are read from the immutable executed version, validated with Phase 7.1's strict version-1 schema. No executable expressions or client-authored authoritative outputs are stored.

- Fixed: retain the prescription; no automatic increase.
- Manual: leave the decision to the user.
- Linear: modest configured load step after all required sets meet the lower rep boundary.
- Double progression: configured step only when every required set meets/exceeds the rule's upper bound. 12/10/9 does not qualify for an 8–12 prescription; 12/12/12 may qualify.
- Rep progression: add the configured integer rep step, capped at the rule maximum, at the same load.
- Effort guided: require actual ratings on the configured scale meeting the target, in addition to completed reps/sets. Missing or differently scaled reports hold.

Evaluation uses normal working sets for the same exact exercise and movement identity. Additional unprescribed sets cannot substitute for failed required prescription positions. Mixed working loads hold rather than assuming all prescribed sets were completed at the heaviest load. Incomplete required sets hold. Reported To Failure, RPE at least 9.5, or RIR 0 blocks increases independently; no scale conversion or inferred failure occurs. Matching reports exceeding prescribed effort also hold. Missing ratings do not imply easy effort: non-effort strategies explicitly fall back to completed sets/reps and a modest step; effort-guided rules do not infer a result. Steps above 10% of prior load or 10 kg hold for manual review, as do steps beyond the canonical recording range. Higher-rep prescriptions may use comparable actual history without extending the estimation formula beyond its documented range. No load or historical performance is rewritten.

Mixed drop/rest-pause prescriptions or differing per-set rep/effort targets use an explicit manual fallback rather than flattening their targets into a uniform-load increase. They remain fully loggable, with no blanket starting-load application across differing targets; advanced per-set load guidance/progression is deferred.

Repeated renders/completion requests are deterministic. Outputs are derived on demand without a persisted recommendation cache or celebration event. Deleting/correcting eligible history changes future evaluation when reread. Existing top-three dominance-aware PR recognition remains separate and unchanged.

## Assignment and rotation progress

The forward migration binds future program sessions to the existing `program_assignments`, adding an immutable owned source-version reference. Starting a different program/version archives the previous active assignment and creates a new one; original copies/history remain intact. Starts use the existing profile lock, nonce and single-active-session protection. Session assignment and rotation identity are protected against ordinary updates.

Authoritative saved positive-repetition working-set progress is shared by adherence and completion summaries, matching Workout Home rather than trusting cached completion labels. Zero external load remains logged progress where valid, never load/PR evidence; zero reps, deleted and pending sets do not count.

Actual completed sessions with recorded work advance the displayed next training position. Rest positions are skipped for the next-workout action and remain documented recovery guidance. No weekday mapping, hard deadlines, punitive missed days or artificial adherence percentage is introduced. Partial completed sessions are retained; abandoned/empty sessions never count or advance. Starting ahead leaves a genuine gap instead of fabricating completion. Retrying a partial workout at the same position remains within its rotation; wrapping after a completed position starts another rotation. A complete rotation requires full completion at every training position within that recorded rotation. Fixed-duration programs report completion when that many full rotations exist; they do not automatically erase or lock further training.

Programs shows current program, completed workouts/rotations, complete/partial movement counts, recent 30-day activity, last completion and the next training workout. An actual active session offers Resume instead of another start. Closed program review adds prescribed set/rep outcomes and load guidance, separately from genuine PRs. Existing legacy assignment counters are not the derived analytics authority; SQL aggregates saved sessions directly. Pre-7.4 sessions are preserved without retroactively assigning or manufacturing rotation history.

## Data/security and release

`20261106142736_program_progression_evidence.sql` is forward-only. It adds assignment-version binding/identity guards, a history index and four read-only invoker functions: `program_progression_evidence`, `program_adherence`, `program_workout_outcomes` and their shared `program_saved_progress` source. Every query verifies/scopes to `auth.uid()` and retained RLS; no caller owner ID, definer bypass, browser service key, writable recommendation table or new broad role privileges. Source-version INSERT is checked against the owned matching program/cycle; UPDATE is denied. Empty/foreign summaries reveal no other user's data; foreign load evidence rejects.

History is date/exercise-filtered in SQL, batched across selected exercises, and returned in bounded recent-session groups. Adherence aggregates remain on the server; ordinary pages never download lifetime sets. No cross-user cache is used. Program children, authored version rules, immutable performance, concurrency, duration/activity clocks, preferences and canonical units retain their existing boundaries.

Apply the single reviewed migration through the approved process before app rollout. No new dependency, secret, binding, hosted migration, production deployment or merge is required/performed by local validation. Calendar scheduling, program editing, advanced periodization, community, creators, payments and native apps remain out of scope.

## Validation and limits

Executed results are recorded in `phase-7-4-validation.md`. Guidance is deliberately conservative and may be unavailable for sparse/stale history, unsupported modalities, very high rep targets or large configured steps. The coarse catalog does not encode every machine increment or biomechanical difference. No claim is made that a completed set was maximal effort. Physical iOS/Safari/device accessibility and hosted deployment still require separate verification.

## Phase 7.5A configured calendars

[Adaptive scheduling](adaptive-program-scheduling.md) now supplies the authoritative next position/rotation for explicitly configured assignments. Partials remain recorded training but hold the required position until a full retry; unscheduled legacy assignments keep the Phase 7.4 behavior above. Existing saved-performance evidence, actuals and progression suggestions remain unchanged.

## Phase 7.5B closed-session audit

The existing start-timestamp cutoff already includes a closed current session at `started_at + 1 microsecond`. Real browser regressions verify current 3 × 12 increase feedback, 12/10/9 hold and prior-only active-session evidence. No cutoff SQL change was needed. Scheduling resolution through accepted partials or skips does not create fully completed training rotations. See [selection contracts](workout-selection-and-favorites.md).
