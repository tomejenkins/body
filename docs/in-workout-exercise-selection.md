# Phase 7.3 — In-workout exercise selection

## Start and movement lifecycle

A program detail training day now has Start Workout N. Its verified server action calls start_program_workout and redirects immediately to /workout/[id], never to the exercise builder. Every prescribed movement appears in order with no exercise or actual set fabricated before selection. The existing single WorkoutLogger renders all selected entries; selecting a tile reveals its real set inputs in the same screen. Another movement can be selected/logged without leaving.

This is the program execution/start contract, not a complete calendar scheduler, program editor or automatic rotation advancement. A future scheduled occurrence must use the same start action/RPC and a stable request UUID. Template detail provides a functional start entry today. It creates/reuses a private version-safe copy for the caller; starting an owned version is supported by the same RPC. An existing active workout must be finished/resumed before another starts. Same-request retries return the same session and cannot be reused for a different source/day. Rest days do not create sessions.

workout_movements is an owner-only immutable session snapshot of each source slot. It exists before an actual exercise is chosen. An exercise binding is an ordinary workout_exercises row referencing that movement. The immutable source version and creator prescription are separate from the selected exercise. Consumers see Workout N, day names and Movement N; storage sequencing names are not consumer labels. The old library rollout footnote and position wording are normalized in presentation without rewriting published definitions.

## Carousel and match indicators

Each movement uses a native horizontal touch-scroll carousel with about 2.7 tiles visible on phone widths. The shared exercise/movement illustration resolver supplies a small controlled image. Tiles show exercise name, one compact match label, Program Pick / Your Last Choice when applicable, and a distinct persisted selected state. Selected tiles scroll into the carousel's visible area after hydration/refresh without moving the page or changing ranking.

Priority is Program Pick first, latest qualifying choice for this exact slot second when different, then alternatives by match level, equipment overlap, stable slug and canonical ID. Duplicate IDs are removed; a shared program/last exercise carries both labels in one tile. The compact pool retains a representative of each available match level when space allows, then sorts the displayed alternatives. The selected exercise is retained without upgrading its grade. See All exposes broader search rather than fabricating alternatives.

Match quality is calculated independently from role labels using existing pattern, primary-muscle, equipment and compound/isolation/other metadata:

| Level | Label       | Deterministic interpretation                                                                       |
| ----- | ----------- | -------------------------------------------------------------------------------------------------- |
| 4     | Best Match  | Same primary target, primary pattern and type; same classified equipment combination               |
| 3     | Close Match | Same primary target/pattern/type with different equipment                                          |
| 2     | Similar     | Same primary target with changed angle/pattern but similar type, or same pattern with changed type |
| 1     | Same Muscle | Same primary target with substantially different pattern and type                                  |

For a flat barbell press slot: paused flat barbell press can be Best Match, flat dumbbell/machine press Close Match, incline press Similar, and chest fly Same Muscle. Program Pick is not automatically level 4. Level 1 remains selectable. Best Match uses subtle theme green; other labels are neutral text. These are contextual compatibility estimates, not user ratings, absolute exercise quality, effort, or proof of biomechanical equivalence. Coarse catalog metadata cannot infer every grip, angle or individual suitability detail.

See All is inline, searchable and paginated (20 returned options) with optional pattern, muscle, type and account-equipment filters. It does not silently enforce the slot's exact pattern/type on actual user choices. Outside-target/unclassified search choices show Check fit rather than falsely claiming Same Muscle. Unsupported assistance/duration options are not loggable. Known equipment preferences limit additional carousel suggestions; an explicit program/last pick remains visible with Check equipment when necessary. Unconfigured equipment is unknown, not a claim of compatibility. No new taxonomy or heavy dependency is introduced.

The authoring/recommendation engine's hard prescription constraints remain unchanged. Deliberate actual substitutions do not rewrite creator recommendations or pretend that a fly fulfilled the same mechanics as a press.

## Persistence and qualifying last choice

Current selection is stored immediately in owner-scoped exercise entries and survives refresh/another client. Selection writes use session-first locking, expected-current-entry comparison and retry UUIDs; stale clients cannot overwrite a newer binding. Unknown network outcomes retain the same retry request. The UI does not acknowledge Saved until persistence returns successfully, and blocks selection while existing logger drafts are dirty/pending.

If another client replaces a server-untouched selection while this device has unsaved edits, recovered drafts remain visible under their original exercise name. They are explicitly unrecorded and can be cleared; they never populate the replacement exercise. Closed-workout recovery retains the same context.

No mutable global preferred-exercise setting is written. program_last_choices derives the latest qualifying performance for the exact immutable slot identity and authenticated owner, using performance_source eligibility. Completed sessions and actual confirmed positive-rep working/drop/rest-pause performance can qualify; warm-ups, suggestions, incomplete/abandoned sessions, unsupported measurements and deleted/removed records cannot. Selecting/browsing alone does not establish a future preference. Corrections to eligible source data affect future recomputation without a stale preference table. Different slots and exercises never share PR identities.

## Prescriptions, defaults and substitutions

Selecting a tile initializes the prescribed set count/types and rep ranges. Protected snapshots retain planned RPE/RIR and intended failure separately. Actual effort stays NULL and actual performed_to_failure false until reported. Unit and effort-input preferences remain account-scoped. The existing logger retains working/warm-up/drop/rest-pause options, queue/CAS/nonces, draft recovery, optional effort/failure, actual completion timing and record calculations.

Load suggestions use the existing completed history lookup for the exact selected exercise and matching set type. Missing history leaves load blank; no other exercise's weights/PRs or extrapolated actual performance are transferred. Program rep targets remain distinguishable from history-derived load suggestions. No new mathematical load/progression recommendation is introduced.

Changing an untouched selection may replace its automatic unconfirmed suggestions. Once any actual/edited inputs exist, a separate inline Keep sets and continue confirmation is mandatory. Completed and edited rows remain under their original canonical exercise; only untouched pending suggestions are soft-deleted. A new exercise entry receives the remaining prescribed set identities. Protected program_set_number links automatic rows to authored prescriptions so out-of-order completion and mixed warm-up/working/drop plans do not shift targets or repeat completed intent. Explicitly added extra sets have no inferred prescription identity. When all prescribed sets are done, continuation offers one optional extra set rather than inventing more planned work.

Direct client writes cannot relabel a program exercise, change its source/prescriptions/order or mutate the session source snapshot. Internal FK cleanup may clear a deleted live-slot pointer while immutable movement/actual snapshots remain usable. Completed working targets are evaluated across all preserved continuations; unselected movements and incomplete inputs never become silently complete. Warm-ups are not counted as working-set targets. Existing normal-finish/inactivity duration rules and PR eligibility remain authoritative. Passive carousel/search/history reads do not count as training activity.

## Security, performance and release

One forward migration is genuinely required: an unselected movement cannot be represented honestly by the existing non-null exercise_id actual-entry table. It adds the immutable owner movement table, protected plan references, narrow insert inputs and invoker start/select/history RPCs. All server operations verify getUser(); SQL independently uses auth.uid(), RLS, composite session ownership, authoritative version snapshots, guarded source identity and explicit least-privilege grants. There is no service-role client, caller owner argument, hosted SQL, history repair, production deploy or automatic merge.

The current logger fetches the existing readable catalog once server-side and emits only compact movement candidates/facets, not the catalog or lifetime performance to the client. Last-choice reads use exact-slot owner indexes and reuse source eligibility. Search returns bounded pages; it currently reuses the full server catalog read model. Very large exercise catalogs should move this search to indexed SQL after measurement. Archived/unavailable catalog choices are not fabricated as selectable alternatives. Calendar/editor/activation-management UI, autonomous progression, community, cardio and subscriptions remain separate scope.

Review/apply the single forward migration through the approved mechanism before app rollout. No new environment keys or dependencies are required. See the Phase 7.3 validation report for executed checks and unverified hosted/physical-device items. Keep this feature and the match amendment on the same Phase 7.3 branch and PR.
