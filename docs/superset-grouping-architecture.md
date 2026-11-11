# Superset grouping architecture — Phase 7.7C

## Authority and scope

Supersets are ordered structural relationships between **two or three existing workout members**, not combined exercises or training evidence. Multiple groups and standalone movements coexist. Group UUIDs remain stable through edits; “Superset 1” numbering follows the first member's position in Workout Home, independently of A1/A2/A3 order. No naming step is required.

The preflight reviewed `AGENTS.md`, the movement-first session loader, movement selection, set queue/revisions/transport recovery, continuity/closure coordination, immutable program snapshots, Favorites and retention. Main was fetched at `542beb8f264277ea998fc63b7b8383dd9d5dec69`. The existing `WorkoutLogger` already owns local drafts, the single mutation queue and acknowledgement reconciliation. Consequently grouping extends that logger and the existing assignments/session structures; it introduces no separate execution, completion, recommendation, performance or scheduling engine.

Actual workout selections and sets remain authoritative. Group commands never change exercise IDs, movement attribution, set IDs/order, weights/reps, effort, confirmation, performance qualification, PRs or duration. Program qualification still requires the original prescribed movement evidence. A completed group does not resolve the remaining program workout.

## Persistence and boundaries

The forward migration `20261111202827_workout_exercise_groups.sql` adds:

- `program_day_groups`: stable IDs, `superset` type and ordered program-slot UUID arrays. Two or three distinct same-day slots only; no overlaps, rest-day groups or foreign slots. Ordinary authenticated writes are limited to the owned day's members; source program snapshots remain immutable. Parent locking serializes overlapping template edits. Grouped slots must be ungrouped before direct deletion.
- `workout_group_commands`: immutable typed create/edit/ungroup facts, also serving as idempotency receipts. Owner/session/group/request identities, expected and resulting revisions, ordered members, server time and validated source-group reference are retained. There is no redundant mutable membership or group-completion flag.

A member is `{type: "movement" | "selection", id: UUID}`. Program, suggested, exercise-first and Favorite workouts reference their real `workout_movements.id`; an ordinary blank-workout selection references its `workout_exercises.id` only when it has no movement parent. This prevents simultaneously grouping a movement and its current selection as two independent members. The canonical exercise remains on the original selection; several deliberately chosen exercises can share an intent without sharing selection identity.

Both tables have RLS and explicit authenticated owner policies. No caller owner IDs, source IDs, revisions, timestamps, actuals or completion fields are accepted as authority. Private trigger functions are invokers with empty search paths and no client execution grants. Anonymous and service-role grouping RPC access is revoked. Program references use existing visibility/RLS. Closed/archived, removed, foreign and stale members are rejected.

`change_workout_group(session, group, operation, expected, members, request)` locks the same session row as selection, logging and closure. Expected-revision CAS prevents stale overwrites. An identical request returns its durable receipt/current groups; reuse with another payload fails. Concurrent overlapping groups serialize under the session lock. Direct inserts cannot bypass the validating trigger. Ungroup uses an empty member list; a one-member edit is converted to ungroup in the client. Each session permits at most 1,000 structural commands, bounding latest-state reconstruction. The latest owner/session/group revision index supports reads. There is no new background job.

`workout_groups` derives current structure from latest commands. `workout_group_layout` combines that structure with bounded session-local labels/order and provenance in one owner-checked RPC, loaded concurrently with preferences. It does not download lifetime history or call per set/member. Historical structural facts are readable only by their owner.

## Interaction and logging

The small circular Workout Home button and Edit Workout management action open the same `SupersetBuilder`. The sheet/dialog lists real movement labels and selected exercise names. Two/three-member limits, existing memberships, reorder controls and under-two dissolution are explicit. Radix supplies modal focus management, Escape/outside dismissal and accessible labels. Saving disables dismissal until the result is known; failures preserve choices and the request UUID. Secondary card actions are a two-item contextual menu: Edit / Reorder and Ungroup.

A group replaces its members' standalone Home cards. Collapsed summaries expose all member names/exercises and authoritative working-set progress. Only the expanded group's selectors mount; each uses the existing matching/recommendation component with scoped compact tiles. Selecting does not leave Home. Once selected, Start/Continue opens `?group=<validated UUID>` directly. The route loader validates ownership and membership; a query parameter grants no access.

The grouped screen reuses the existing row renderer, draft recovery, validation, set options, effort, warm-up/drop/rest-pause behavior, queue, request nonce, CAS and acknowledgement checks. Rows are interleaved into derived rounds in A1/A2/A3 order. Unequal counts render only real rows: a fourth A1 row does not create an A2 row. Add A1/A2/A3 Set invokes the ordinary single-selection operation. Prior selections retained after recorded exercise changes remain attached to their own sets. No round record is persisted and no automatic performance is generated.

“Up next” and round Saved labels use the existing logger confirmation guard, including pending/dirty/error/conflict state; an older completed row cannot advertise a newly edited round as Saved before acknowledgement. Completing a row never routes, focuses or scrolls to the next row. The existing navigation focus behavior runs only when intentionally changing screens. Next Exercise returns to the same collapsed Home. Change exercises returns to that group's Home selectors. The existing timer/footer and Finish/Abandon coordination remain; grouping is disabled while set edits/saves or closure make structural changes unsafe. Ordinary ungrouped rendering and History ordering remain unchanged.

## Programs and reusable snapshots

`program_definition` adds ordered group definitions containing exact immutable program-day slot identities. `clone_program` remaps both slots and groups while retaining the latest library implementation's summary, tags, equipment and media. A draft edit creates a new snapshot/version; it cannot rewrite a published definition or existing session.

The new catalog migration `20261111204706_superset_program_catalog.sql` installs **Upper/Lower Superset Split** and **Full Body Superset Training**. Both have real prescribed groups, valid existing exercises, moderate three-set 8–12-rep prescriptions and explicit rest positions. Squat/hinge work remains standalone. The first training day of each program has two groups. Source JSON and the new generator validate group bounds, distinct/nonoverlapping members and catalog references. The original twelve-program migration is checked unchanged; the new installer is repeatable by fingerprint without duplicating roots. The catalog now has 14 programs, 53 training days and 238 slots.

An after-insert initializer runs after existing movement creation and uses the same validated grouping command for program and Favorite sources. New session/group/member IDs are created; `sourceGroupId` records the proven immutable source. Local edits change only session structural facts, never source slots or progress.

Favorite snapshots add only per-slot `{key,type,position}` group metadata. No recorded actual weights/reps, confirmation or PR data is copied. Existing `program_day` and `completed_ad_hoc` behavior is retained. The additive `completed_workout` source supports the actual final structure of a program session, or a Favorite whose local grouping was changed, rather than substituting the original template. The source must be owned, completed, unarchived and contain qualifying supported training. Only qualifying members survive the existing reusable-structure filter; fewer than two surviving members cannot form a group. Starting a Favorite is independent of the program schedule and remaps its groups through the same initializer.

Unmodified Favorite launches retain original attribution; locally edited grouping can be saved as a separate snapshot. The original Favorite definition is never updated. Historical source attribution is retained where available. Grouped and ungrouped ordinary workouts continue to use their existing saving paths.

## History and retention

History reads the final group structure and the original recorded exercise/set evidence. It does not pretend that a missing exercise was selected. Ungrouping preserves every movement and set. Archive/restore retains grouping, does not replay commands or change eligibility rules, and permanent parent deletion cascades the session's structural facts. Reusable Favorite structures survive source deletion under the existing retention contract. Existing performance, PR, achievement, enrollment statistics and schedule reconciliation remain authoritative.

## Future extension contract

This phase exposes **only `superset`**, two or three members. Larger groups require an explicit forward migration of cardinality constraints, command validation, UI limits and tests; existing groups remain valid. Adding a circuit/giant-set/abdominal sequence would add an approved group type and explicit navigation policy over these existing ordered identities. It would not merge set ownership, create synthetic completed rounds or change canonical exercise identity.

Timed stations require a separate validated measurement contract supporting duration and its performance eligibility, not fake repetition sets. Rest-between-rounds and prescribed repeating sequences need reviewed versioned structure and timer semantics; no speculative columns or runtime timers are included here. Existing program definitions and Favorite JSON can be extended additively under versioned validation while old snapshots remain readable. Circuit/HIIT execution, cardio, new scheduling rules, durable offline queues and billing remain outside this phase.

## Limits and rollout

The grouping command budget is 1,000 per session. Current template group authoring is available through validated data contracts and seeded versions, not a new premium builder. Source snapshots saved before this migration have no grouping. The grouping UI requires the migration before the new app version. Physical iPhone Safari/PWA/keyboard/safe-area and Android testing remains a release gate; Chromium viewport emulation is not physical-device verification. See [validation](phase-7-7c-validation.md).
