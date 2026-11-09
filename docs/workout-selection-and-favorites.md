# Workout selection, schedule decisions and Favorites — Phase 7.5B

## Existing authority and entry flow

Base: latest merged main `9537aa9` (Phase 7.5A). The immutable program version, assignment, source day/rotation, actual performance and existing shared scheduling cursor remain authoritative. No second workout, scheduling or performance engine is introduced.

The Workout entry and Quick Workout setup show the configured assignment's recommendation first, then a disclosed list of other training days and Your Favorites. The existing Quick/Blank paths remain available. Active sessions prioritize Resume, disable new selection starts and keep all existing single-active/profile-lock, nonce, continuity, pause, draft and logging safeguards. This phase does not redesign Dashboard or add its weekly tile.

`workout_start_options()` returns one bounded owner-scoped aggregation: active session, active configured assignment/cursor, immutable training-day UUIDs and at most 100 active Favorite summaries. Rest days are excluded. Repeated names do not define identity. No browser reconstruction of progression or lifetime set download is required.

`start_assigned_workout` checks the owned active assignment, exact immutable version/day UUID, expected cursor and decision revision under the profile lock, then delegates to existing `start_program_workout`. The Recommended action needs one click. Alternatives and repeats preserve their actual selected day and the scheduler's current rotation. A repeat within that rotation cannot satisfy another position or double-count a full rotation; unresolved earlier days remain pending. Beyond a fixed-duration completion, starting more training is an explicit additional rotation, not an invented achievement.

The recovery note is guidance, never a training prohibition. A user may deliberately train an alternative earlier. Starting an alternative does not archive/change the program. A new program/version follows existing assignment archival behavior.

## Explicit scheduling decisions

`program_schedule_decisions` is an append-only owner-private intent log, not a training or completion table. Each row records assignment/version/day, rotation, expected work index/revision, request UUID, server timestamp and verified actor. Original due date is server derived. Actual sets, session status, PRs and historical clocks are never edited by decisions.

| Operation      | Scheduling behavior                                                                                   | Actual training / full rotations                                                                                   |
| -------------- | ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| accept_partial | Resolves the exact current occurrence using a real owned qualifying partial-session reference.        | Session stays partial; missing sets remain missing. Does not establish full completion.                            |
| skip           | Resolves the current occurrence and advances the cursor; it can move into the next rotation.          | No session, sets, volume or achievements. A rotation containing a skip is not a fully completed training rotation. |
| defer          | Keeps the same occurrence pending; stores its original due date and a future assignment-local target. | No training is created. Readiness respects both the target and actual recovery.                                    |
| cancel_defer   | Appends cancellation of the current deferral and restores natural guidance.                           | Old decisions and actual history remain intact.                                                                    |

Deferrals may be replaced with a different valid future date; choosing the same target again is rejected as a no-op. Dates must be later than the assignment-local today, respect natural recovery and be within one year. Cancellation/replacement never delete old intent or silently extend a target. Natural readiness is calculated independently of the previous defer, so an explicit shorter valid deferral can be chosen.

The common cursor uses `program_schedule_resolutions` to combine real full completion with explicit skip/accepted-partial resolution. Full-rotation metrics continue to use only actual fully completed positions. Fixed-duration requirements are not met by skipping or accepting partials; the cursor can advance while the full-rotation target stays unmet. The calendar distinguishes Skipped, Partial accepted (scheduling only), Deferred and Deferral cancelled from actual Completed, Partial training, Overdue and rest. Actual completion dates are never backdated to original due dates.

Accept/skip/defer operations apply only to the currently outstanding occurrence. The UI presents secondary disclosed controls with confirmation for skip and partial acceptance. Any active workout blocks schedule decisions, including an independent one; finish or resume it first. This conservative default avoids resolving a position during a queued/closing session. Expiry cleanup returns a committed rejection instead of rolling it back behind a thrown error.

Same-request retries return the original decision after advancement; changed payloads are rejected. Decision count supplies the owner-scoped revision, avoiding a second mutable completion counter. Profile/assignment locks, expected cursor/revision checks, an explicit-resolution unique index and immutable table grants prevent concurrent devices from resolving twice. Direct inserts run the same trigger validation with NOWAIT root-lock ordering. Calendar reads remain single-statement coherent views.

If future authorized corrections remove all eligible evidence from an accepted partial, that acceptance no longer resolves progress; the durable original intent remains in the calendar. Skip remains an explicit nontraining decision. No ordinary history-correction or decision-edit endpoint is introduced.

## Favorite sources and immutable structure

`favorite_workouts` stores one source-aware, owner-private single-workout template. Source types are `program_day` and `completed_ad_hoc`. It stores the user name, stable ID, optional original source pointers, source attribution, immutable structure and server creation time. It does not clone an entire program or grant editing/publication rights.

Program sources must be readable immutable approved/owned versions and real training-day UUIDs. Ad-hoc sources must be owned completed sessions with supported, confirmed, nondeleted positive-repetition training. Unselected movements, unconfirmed suggestions, empty and abandoned sessions cannot become fabricated templates. For a continued movement, the latest qualifying selected exercise is the default; the movement appears once in Home order.

The database constructs a whitelist of movement intent, ordering, default exercise identity, prescribed set types/counts, rep ranges, optional prescribed effort/failure targets, rest guidance and equipment context. Where an ad-hoc exercise had no explicit prescription, the default is three working sets of 8–12 reps. Actual reps/loads/effort/failure, completed status, PR claims, timestamps, duration, source session identity and actual performed records are never copied as new performance. Even author-prescribed load values are omitted from saved structures.

Normal exact-exercise history suggestions may still prefill unconfirmed prescribed values during a later selection, using the unchanged logging engine. Those suggestions are independent of the saved template and remain distinct from actual saved work. No weights transfer between canonical exercises through shared intent.

Save retries deduplicate by source identity. Saving the same source again returns its existing Favorite rather than silently creating copies or renaming it. Saving a removed source shortcut restores that immutable shortcut with a fresh explicit save; source snapshots are not silently rebuilt. Rename is a separate operation. There is a documented cap of 100 active Favorites; reaching it does not remove existing items. Removal is confirmed soft archival, not deletion of history. Restore cannot bypass the cap.

## Independent execution

`start_favorite_workout` reuses the existing session, movements, actual exercise selection and set initialization. Server triggers copy the Favorite's saved definition/attribution into a new private session, then create unselected movement rows. Initial actuals are empty, pending sets appear only after selection, actual effort is unrated and To Failure starts false. The Favorite session has no assignment, program version/day or rotation execution link. Source attribution is display metadata, not program completion authority.

Favorite slot identities are stable per Favorite/position and distinct from original program slots. Independent Favorite performance therefore cannot impersonate a program slot's Last Used preference. Tiles say Favorite default rather than Program Recommended; saved exact-Favorite choice history can still be Last Used. The movement-match engine and grades remain unchanged.

An archived/unavailable default does not destroy the template or auto-select another exercise. The user sees a clear message and chooses another supported canonical exercise through the existing selector/See All. Exercise substitutions, added sets, loads and other current-workout edits never mutate the Favorite. Renaming/removing the Favorite likewise does not rewrite an already-started session or source history. Optional source-pointer cleanup preserves saved structure and attribution.

`Save as Favorite` is available for program-day details, start-page program choices and existing completed-workout review. No polished new completion screen or Feed publication is introduced. Your Favorites is a compact, bounded list with one-action starts and disclosed rename/removal controls; there is no premium gate.

## Security and performance

Both new tables enable owner RLS with explicit grants. Snapshots, actors, timestamps, source keys and decision originals are not client writable. New RPCs use SECURITY INVOKER, empty search paths and verified `auth.uid()` with no caller-owner authority. Server actions independently verify `getUser()` and validate UUIDs, revisions, dates and confirmations. Anonymous/service-role RPC/table access and hard deletion are denied; private helpers remain unexposed.

Existing profile/session locking, single-active constraints, immutable program versions, set CAS/nonces, queues, source snapshots, continuity and actual PR calculations remain intact. Reads are bounded; Favorite summaries do not download full structures or lifetime set history. Structural mutation is limited to explicit source save, rename and archival rather than a premium builder/editor.

The Phase 7.4 progression evidence audit found that the existing `performance_source` cutoff filters session start timestamps, so a closed session is already included by the `started_at + 1 microsecond` endpoint. Real browser tests confirm current 3 × 12 feedback can increase while 12/10/9 holds; active evidence remains prior-only. No unnecessary cutoff rewrite is introduced.

## Rollout and future phases

Apply the reviewed forward migration `20261109155417_workout_selection_decisions_favorites.sql` before shared app use. No previous migration is edited or automatically deployed. Existing repository-wide Supabase preview disablement stays in effect; no alternate deployment mechanism, hosted SQL or production infrastructure change is introduced.

`link_independent_workout` remains a preparatory contract only. Favorites cannot automatically count toward assignments, even when their source day matches. Deliberate linking, in-place assignment timezone revisions, advanced Favorite editing/copies, premium builders, Dashboard weekly tiles, polished completion and social/Feed/community functionality remain later work. Physical iOS/Safari and hosted-provider behavior require separate verification.
