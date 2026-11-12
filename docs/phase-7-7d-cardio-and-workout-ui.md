# Phase 7.7D — Manual Cardio and Workout UI

## Scope and authority

Manual Cardio supports Treadmill, Outdoor Run, Elliptical, Bike and Stationary Bike in any active workout: independent, assigned, Favorite or grouped. Add Cardio creates pending structure; Save Cardio records an explicit positive duration. Nothing is completed merely by adding it. Duration accepts minutes or `m:ss`, resolves to whole seconds, and is bounded to 1 second–24 hours per item. Decimal minutes that imply fractional seconds are rejected rather than silently rounded. Display preserves seconds.

Preflight on main `7e3fe36ff22e18fe7bd294e5877c8a3c3390700d` reviewed the actual Home/logger, queue and validation, grouping, footer/continuity, catalog/logging categories, immutable program sources, Favorites, history/retention, RLS and tests. The plan delivered before changes was separate duration evidence → shared local gear controls → compact Home/group presentation → completion/history integration → regression and packaging. The catalog has no canonical entries for these five activities. Existing duration-classified strength exercises are not cardio identities and remain unsupported by the strength logger. No catalog identity is fabricated or reclassified.

## Persistence and security

Forward migration `20261111230809_manual_cardio.sql` adds one table, `workout_cardio_commands`. Its typed add/save/remove facts are also payload-bound request receipts. It does not create a second session, mutable completion flag or strength set. Latest revision per stable item UUID defines current membership/duration; initial creation time and UUID define stable item order. A saved duration has the server's save instant. Saving a correction replaces the derived duration, not session wall-clock time. Remove is a tombstone; the same item cannot be resurrected. Adding again creates a new identity.

The owner/session composite foreign key cascades when the existing permanent-delete operation deletes the session. Owner RLS and narrow INSERT columns protect owner, timestamps and revisions. No UPDATE/DELETE grant, anonymous RPC write, service-role path or SECURITY DEFINER is added. Both raw INSERT and the RPC pass the same invoker trigger checks: live owned unarchived session, continuity, valid activity/duration, exact parent/item, immutable activity and compare-and-swap revision. Parent session locking serializes strength writes, cardio writes and closure. There are at most 20 live items and 1,000 commands per session. The owner/item/revision index supports bounded reconstruction.

`record_workout_cardio` checks the request UUID and exact payload under the parent lock. Identical retry never records activity twice; changed intent with an old UUID is rejected. CAS conflict requires refresh. An already acknowledged command can be retried after closure to recover its receipt, but a new write cannot change a closed session. The response returns current authoritative items, which can include a later revision. The server action verifies `getUser`, validates input, invokes the owner-scoped RPC and invalidates workout/completion/history/dashboard views. No performance values, owner or timestamps come from the caller.

`workout_cardio_items` is one owner-verified detail read. `workout_cardio_summary` aggregates at most 51 requested owned sessions; history uses one batch call alongside its existing bounded page. Workout loading reads cardio concurrently with grouping/preferences. There is no per-set API loop, polling or lifetime-set download. Read failures propagate instead of appearing as empty cardio history.

## Training, timing and retention

Cardio is not `performance_source`, a strength working set, movement resolution, rotation advancement, strength PR or prescribed program completion. A cardio-only assigned session retains the existing truthful program none/partial classification. It cannot satisfy End After Next Workout. No program, schedule, achievement or strength-evidence function is changed.

A finished independent cardio-only session is displayed as **Finished · Cardio**, rather than a failed strength workout. The History incomplete filter excludes it only when there are no active strength selections, at least one saved cardio duration and no pending cardio. Mixed and assigned sessions retain strength/program classification. Workout Complete and detail show a separate Manual cardio section, actual summed duration, activity names and pending labels. Cardio duration may differ from elapsed workout duration because it is user-recorded activity, not a timer correction.

A successful new cardio command counts as existing session activity and resumes a manual pause through the established session trigger transport. Reads and identical retries do not touch timing. Lazy expiry/mandatory check-in still block new writes. The approved timer/Back/Abandon/Finish footer and closure operation are retained. Pending cardio is included in explicit incomplete-finish acknowledgement; unsaved duration and in-flight commands block finish/navigation through the existing closure guard. Closing an idle duration sheet explicitly discards its local edit back to the persisted value.

Archive hides the parent from normal history while retaining cardio facts; Archived History can display them and restore recovers them without inserting duplicate evidence. These detail/summary RPCs are retained-display reads, not active analytics eligibility sources. Future cardio analytics must join the same retained-training eligibility policy rather than sum archived facts. Permanent session deletion cascades cardio commands. No physical backup erasure is promised.

## Interaction changes

Set rows show number, weight/bodyweight, reps, Done and a 44px gear target. The gear opens a local nonmodal Radix popover; type, optional effort/RIR, advanced effort, remove/reorder, discard and optional added-load controls remain contextual. The original input row remains mounted. The existing set queue, mutation UUIDs, CAS, blur/Done behavior, invalid-value checks, defaults and authoritative Saved acknowledgement are unchanged. One row's gear is open at a time. Escape/close returns focus; outside interaction preserves the newly focused input or gear. Older acknowledgements cannot close a newer edit/reopen.

Standalone Home cards have a gear instead of a repeated lower edit list. Suggested movement replacement/removal uses the existing validated operation, including recorded-work confirmation. Prescribed movements offer Change exercise through the original picker and cannot delete their immutable source. Bare selections use existing safe reorder/removal controls. Superset gears retain edit/reorder, ungroup and exercise choice through the existing grouping flow. Successful movement changes close their sheet.

Home exposes Create Superset, Add exercises, Add movement and Add Cardio directly. The large Manage Workout disclosure is removed. Supersets use the same transparent divided list rhythm, retaining Superset, A1/A2/A3, exact exercise names, progress and direct logging. Their identities, grouping commands and alternating round logger are unchanged.

Shared management sheets use Radix Dialog for outside/Escape dismissal and focus handling. Set popovers reserve header/footer space and scroll internally when needed. Cardio sheets reuse the existing measured keyboard inset, published as a CSS variable by the existing footer effect; no new viewport polling or keyboard heuristic is introduced. Light/dark, reduced motion, 200% text and viewport/keyboard emulation are browser-tested. Physical iOS/Android keyboard behavior remains a release gate.

## Favorites, programs and deferred work

Favorites still snapshot reusable strength/group structure with no actual recorded performance. Cardio template preservation is deliberately deferred: mixed workouts state that Favorites save strength movements only; cardio-only independent sessions do not offer an empty strength Favorite. Program-day template Favorites remain available through their existing source behavior. Launching a Favorite does not copy cardio duration or alter an assignment. Seeded programs are unchanged. Cardio can be added during their active session without resolving prescribed work.

No HIIT, intervals, circuits, giant sets, distance/pace/heart-rate/calories, wearables, cardio PRs, cardio program prescriptions, subscriptions, promotions or admin functionality is included. Duration drafts survive uncertain responses while mounted and retry the same request; there is no durable/offline synchronization queue. Final hardening and physical-device release review remain required.

See [actual validation and screenshots](phase-7-7d-validation.md).
