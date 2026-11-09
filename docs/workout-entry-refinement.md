# Workout entry refinement — Phase 7.5B.1

## Preflight and consolidated entry

Base: merged Phase 7.5B main `792f428` / PR #23. Review covered AGENTS.md, selection/Favorites contracts, Workout and setup routes/components, quick-focus recipes, suggested-shell/actions, catalog intents/history/selection, suggested/ordinary starts, profile locks, draft continuity, RLS and protected session/movement snapshots.

Previously the Workout tab displayed a program recommendation, alternatives, scheduling controls, Favorites, Record Workout and Start Blank. `/workout/new` repeated the same program selection above the focus form. The refinement removes that repeated selection and presents two entry paths: the authoritative recommended program start and Start Other Workout directly to `/workout/new`. Alternatives remain in the secondary “Choose a different program workout” disclosure, with existing exact day/rotation identity, repeat/partial semantics and program-day Favorite actions. Schedule decisions remain in their existing disclosure. Your Favorites stays on Workout and launches directly using its original operation.

An active workout puts Resume first, removes the Other entry and disables other starts/decisions. Setup retains the verified active-session redirect and Back to Workout. No start is issued by choosing a focus, changing setup mode or searching. No-program users receive the prominent Other entry, Browse Programs and Favorites, with no fabricated recommendation. The existing blank start remains under setup's closed More options disclosure; it is absent from the primary Workout page. The existing Dashboard setup link shares the clearer Start Other Workout label; no Dashboard tile or new shortcut was added.

Implementation plan: consolidate entry presentation, extend the existing movement recipe with a balanced preset, add bounded exercise-choice presentation, validate/bind explicit choices through the existing session engine, then retain database/browser regressions and capture before/after evidence. Scheduling decisions and program/Favorite execution semantics are unchanged.

## Full Body recipe

Full Body is a preset, never a muscle taxonomy row. It selects the first supported intent in each category, in this order:

| Category              | Preferred  | Ordered alternatives               |
| --------------------- | ---------- | ---------------------------------- |
| Knee-dominant         | squat      | single_leg, leg_extension          |
| Hinge/posterior chain | hinge      | hip_thrust, leg_curl               |
| Push                  | flat_press | incline_press, overhead_press      |
| Pull                  | row        | vertical_pull, lat_row             |
| Trunk                 | crunch     | reverse_crunch, bicycle, wood_chop |

All keys come from the curated registry and are checked against active supported catalog coverage. The current catalog produces five distinct slots: squat, hinge, flat_press, row, crunch. If a category has no supported candidate it is omitted and the count explicitly reports limited coverage; no fabricated option or duplicate fills the gap. Fallbacks preserve broad balance while acknowledging that isolation alternatives are not mechanically identical to the preferred compound pattern. The preset creates at most five unselected slots, with no exercise or weight automatically chosen.

Selecting Full Body clears the secondary focus and resets emphasis; those controls are hidden and omitted from its request. The server also rejects incompatible Full Body focus parameters. Returning to a muscle group restores the ordinary controls with empty secondary and balanced emphasis. Existing muscle recipes, emphasis order, movement counts and six-slot automatic cap remain intact.

## Exercise-first contract and intent mapping

Choose by Exercise Instead changes content on the same setup surface. Movement Focus returns without starting or losing the selected list. The client keeps one to six distinct canonical exercise IDs in explicit order. Users can remove or move an item up/down before starting. Different exercises may deliberately share a movement intent. Result names are actual catalog names, and Start remains disabled for an empty list.

The existing authenticated `loadLibrary` supplies readable, active catalog rows. Setup passes only ID/name summaries for supported loaded/bodyweight exercises with primary taxonomy. Case-insensitive inline name search returns at most 20 results and requests refinement at the bound. No external search service or new dependency is used. This reuses the existing catalog load; it is not an unbounded owner-history download.

`start_exercise_workout(uuid[], uuid)` verifies authentication, one-dimensional list length, unique/non-null IDs and request identity under the existing owner profile lock. `exercise_setup_slot` derives primary pattern, supported primary muscle, type and title from RLS-readable active catalog rows. Explicit curated slug membership wins over broader registry matches, then immutable registry order breaks ties. A private exercise uses its declared valid taxonomy without inventing a curated intent. Missing or inactive taxonomy and unsupported logging kinds are rejected. Archived, foreign and nonexistent rows are unavailable.

The operation delegates to `start_suggested_workout`, retaining the existing session start, nonce, expiry and single-active protections. The immutable `ad_hoc_focus` snapshot carries a verified `exerciseId` for this explicit-choice path. A before-insert trigger compares every slot to its server-derived canonical structure and rejects mixed/forged lists or linked program/Favorite sources. The normal initializer creates each existing movement and calls `select_program_exercise` in the same transaction, so chosen exercises open ready for logging. A failure rolls back session, movements, selections and sets together.

Ordinary movement-first starts still reject duplicate intent shells. The narrow explicit-choice branch permits repeated intents only for distinct validated exercise IDs; it does not relax the general suggested-shell rule. Movement identities remain per actual slot. Existing selection/continuation controls can change a choice during training and preserve recorded sets.

## Recents and actual performance

`workout_setup_recents()` aggregates the existing owner-scoped `performance_source`. It returns at most six canonical IDs ordered by latest qualifying completed-set time descending, then canonical UUID. Confirmed positive supported non-warm-up training in completed sessions qualifies; unconfirmed drafts, abandoned/removed/deleted work and archived catalog exercises do not. Canonical IDs are deduplicated. An empty account gets a brief search-first state.

Selection creates only ordinary pending automatic working rows. Actual reps, actual weight, completion timestamps, actual effort and failure remain empty/unrated/false. Existing smart defaults may provide separately marked, unconfirmed prescriptions from that exact exercise's history; these are not copied actuals. Normal queue/CAS, effort, unit precision, logging, reliable duration, pause, history and PR calculations are unchanged. No second workout type or logger is introduced.

## Ownership, retries and isolation

No new table or exposed write column is needed. The forward migration replaces two existing invoker triggers and adds three narrowly granted invoker functions with empty search paths. Existing RLS, source immutability and profile/session locking remain authoritative. Callers supply IDs and a request UUID, never owner, timestamps, actual performance or completion claims.

Retries compare the stored ordered exercise identities before catalog revalidation, so retrying a committed start remains safe after source retirement. Reusing a nonce with reordered/changed identities is rejected. Concurrent distinct starts serialize through the owner lock and single-active guard; only one succeeds. The app retains the same request identity after uncertain failures. Exact-once recovery returns the original session, including a subsequently closed session, rather than starting another.

Independent setup has no assignment/version/day/rotation or Favorite execution link. It cannot resolve pending schedule positions, change skip/defer decisions, advance program rotations or mutate a Favorite. Retained Phase 7.5B APIs and their protections remain unchanged.

## Limitations and rollout

Apply `20261109185258_exercise_first_workout_entry.sql` before serving the new setup code. No earlier migration is edited. Setup is deliberately bounded to six explicit exercises; normal existing in-workout additions remain available. Recents are bounded server aggregation; the shared catalog still uses its existing batched loader rather than a new paginated search API. The SQL intent mapping uses the current immutable registry edition; future registry changes require an appropriate forward migration.

Physical iOS/Safari and hosted-provider behavior remain separately verifiable. No premium builder, Favorites editor, Dashboard weekly tile, Feed/social, billing or infrastructure deployment is introduced. Actual checks and screenshots are in [the validation report](phase-7-5b-1-validation.md).
