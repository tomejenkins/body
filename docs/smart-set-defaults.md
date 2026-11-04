# Smart set defaults — Phase 5.3

Phase 5.3 refines the existing logger. New selections open with all expected rows visible; Add set is for extras. Unit preference lives in **Profile → Settings → Weight Units**, with no workout unit picker or modal. The existing queue, revisions, retry nonces, pending/completed controls, compact advanced types and draft recovery remain in place.

## Initialization and history service

`public.previous_exercise_sets(exercise_id)` is a reusable authenticated SECURITY INVOKER service. It selects the caller's most recent **completed session with completed, nondeleted sets for that canonical exercise ID**. It skips newer sessions without meaningful performance, abandoned sessions, removed selections, pending/skipped/deleted rows and other users. Ties are deterministic by session ID, selection position/ID and set position/ID. The source date is the previous session's finish timestamp, displayed as a UTC calendar date. Up to 100 completed rows from that single selection are returned in actual sequence; no fuzzy exercise matching, progressive overload or equipment substitutions occur.

`public.initialize_workout_sets(item_id, default_count = 3)` locks the verified owner's parent session, rejects closed/removed selections and returns existing rows unchanged if **any** set already exists, including tombstones. A new AFTER INSERT selection trigger invokes it in the same transaction as adding the exercise. Repeated selection requests return the existing live selection; concurrent calls serialize on the existing session lock. A failed source query rolls back the entire selection and set creation, and the selection action exposes a retryable error. There is no silent history-error fallback to a blank template.

Meaningful history determines set count and type/order, including warm-ups, normal, drop and rest-pause efforts. Warm-ups stay explicitly classified, never counted as normal sets. Only completed historical rows are used; incomplete rows are not assumed performed or copied as results. With no history, three blank pending normal rows are initialized. A supplied `workout_exercises.prescribed_sets` count replaces the ad-hoc default; the engine accepts counts 1–100. No program generator is added. History currently takes precedence over this fallback count.

Initialization occurs on new selection, not refresh or resume. Existing active/closed selections and legacy empty selections are not backfilled or reconstructed. The initializer can be invoked explicitly for a legacy empty active selection if a future client chooses; normal Add Set remains available. Deleting all visible automatic rows leaves tombstones, so initialization cannot recreate them. Extra sets retain the preceding set's current draft values and remain pending normal sets.

## Suggestions versus actual performance

The migration reuses `prescribed_reps_min/max` and `prescribed_weight_kg` as suggested inputs, with `is_automatic`, server-maintained `inputs_confirmed` and `suggested_from_date` as provenance. New automatic rows have **NULL actual reps/load/completion timestamp** and pending status. The UI displays their suggested inputs with a quiet “Previous <date> · suggested” annotation. Confirmation or material editing uses the existing logging RPC to save actual inputs; clearing a suggestion remains cleared after reload. Reorder and removal alone do not turn suggestions into actual performance. The original suggested snapshot remains available for future comparisons, without reapplying it over confirmed inputs.

Only completed, nondeleted actual rows may supply future performance/PR/volume calculations. No such analytics are implemented. Bodyweight remains NULL external load, distinct from zero or body mass. If historical bodyweight mode is no longer compatible with current equipment, the new row uses external mode and requires a real external load before completion; it does not invent one.

The existing removal guard now permits only automatic rows whose inputs are still unconfirmed, with no actual values/completion. This includes untouched historical suggestions and deleted blank automatic rows. Manual/legacy rows and materially recorded inputs retain protection even after soft deletion. Removal remains an exercise tombstone; retained set IDs/snapshots never dangle. Re-adding creates a new selection rather than resurrecting the old one. Dirty/pending browser edits still block exercise operations.

## Unit defaults and exact precision

The old `50 lb → 50.001 lb` path was: 50 × 0.45359237 = 22.6796185 kg → stored **22.680 kg** → inverse conversion **50.000841… lb** → three-decimal display **50.001**. Conversion itself was correct; the inverse display exposed storage quantization.

Canonical external load remains the existing `numeric(10,3)` kilograms. The forward migration adds nullable paired `entered_weight` (`numeric(13,6)`) and `entered_unit` metadata. New edits retain their original value/unit through save, reload and historical preloading. SQL validates that converting the metadata, rounded to 0.001 kg, exactly matches the canonical actual or unconfirmed suggested load. Metadata cannot misrepresent canonical performance. Direct legacy writes that change load clear stale metadata when it no longer matches. Existing records are not rewritten or guessed.

Same-unit display uses original entered metadata when available: **50, 135, 52.5 and 52.125 lb stay exactly those values**, including meaningful input up to six decimal places. Otherwise lb display rounds to two decimal places and trims zeros, eliminating quantization noise for legacy practical loads; kg retains its existing three decimals. Input text is retained while saving, and only acknowledged canonical responses may normalize it. Unchanged fields use canonical kg directly, never an inverse display round trip. Changing Settings affects presentation only; no set load or revision is written. Alternate-unit displays can be rounded, but returning to the entered unit restores original precision. This is presentation metadata, not a replacement load identity or concurrency mechanism.

`account_preferences.display_weight_unit` now defaults to **lb for new accounts**. All existing preferences are preserved because old defaulted kg and intentionally selected kg cannot be reliably distinguished. Existing beta users who want pounds choose Profile → Settings → Weight Units → Pounds once. The owner-verified action saves the existing RLS-scoped preference, reports errors, and invalidates workout/profile route caches. Other devices read the persisted preference on their next load; an already open workout does not live-switch units underneath typing. Recovered dirty drafts retain their original input unit until resolved.

## Migration, security and rollout

`20261104075424_smart_set_defaults.sql` is forward-only; the six earlier migrations are unchanged. It adds five set columns, changes only the new-account unit default, introduces two authenticated invoker services and the initialization trigger, and extends logging/removal guards. Narrow INSERT grants cover provenance and entry metadata; only entry metadata gets additional UPDATE grants. Clients cannot UPDATE `inputs_confirmed`, automatic provenance, revisions or ownership. Anonymous/service-role RPC access and private helper EXECUTE remain revoked. Existing RLS, composite owner constraints, active-session uniqueness, close locks and transaction boundaries remain intact.

The logging RPC retains existing named parameters with two optional trailing metadata parameters. Old named calls still work; the previous SQL signature is replaced to avoid overloaded PostgREST ambiguity. The database revision/nonce remains the concurrency authority. No floating-point identity comparisons, SECURITY DEFINER, service-role browser key, client hard DELETE, dependency or environment-key change is introduced.

Review/apply this migration through the existing single delivery mechanism **before** the approved application rollout. Confirm project identity, prior migration order, backup/PITR and forward recovery. Verify RLS/RPC ACLs and actual/suggested separation afterward. This task does not merge, run hosted SQL, apply remote migrations or deploy production. Publication relies on the user's repository-wide confirmation that Supabase automatic preview branching is disabled; it is not an independent live dashboard audit.

## Validation and limits

Run fresh local migration replay, database lint/pgTAP, ESLint, typecheck, Vitest, formatting, catalog consistency, Next build, Workers build/dry-run and desktop/mobile Playwright. Database fixtures roll back; one narrowly disabled local fixture trigger simulates an administrator-imported removed historical selection, and is immediately restored before all authenticated assertions. Legacy authorization tests explicitly isolate manually created set fixtures from new templates rather than weakening expected denials.

Validated 2026-11-03 (America/Los_Angeles):

- Fresh disposable LOCAL replay of all seven migrations and database lint passed.
- **1,197 pgTAP assertions across six suites** passed, including history isolation, advanced types, automatic counts, rollback failure injection, removal, immutable closed sessions, metadata validation and retained role/grant tests.
- **103 Vitest tests across 20 files** passed, including exact 50/135/52.5 lb reloads, fractional entered metadata, unchanged canonical loads, suggestions, Settings acknowledgement/failure and prior logger behavior.
- ESLint, strict typecheck, formatting, catalog consistency and whitespace checks passed.
- Next.js production build, OpenNext Workers build and Wrangler no-upload dry-run passed.
- **32 desktop/mobile Playwright tests passed on Next.js and 32 on local Workers**. Final explicit screen-reader unit labels additionally passed both desktop/mobile smart-default flows on Next.js and local Workers (two tests on each).
- Local Worker mobile light/dark logging and Profile Settings were visually reviewed: three automatic suggested rows, exact practical pounds, no horizontal overflow and retained 48px completion targets.

Early validation corrected a PL/pgSQL CASE-expression parse issue and legacy fixture assumptions about zero initial rows/default kg. The injected-failure assertion uses an actual existing catalog exercise and a rollback-only trigger, rather than relying on an invalid prescribed count that an earlier constraint rejects. Final retained role denials and new behavior pass. No local functional check is blocked. GitHub git transport works, but the GraphQL PR API returns Forbidden, so manual draft PR creation may be necessary.

Hosted security/configuration, SMTP and physical devices are not validated here. Draft recovery is tab-local, not offline synchronization. Timed holds and multipart drop/rest-pause efforts remain future structured-model work. No progressive overload, coaching, analytics, programs, timers, trainer/social features, video uploads or OAuth are included.
