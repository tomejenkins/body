# Workout set logging — Phase 5.2

Phase 5.2 extends the existing workout lifecycle; it does not replace exercise selection, Auth or the deployment configuration. All sets are visible together in each exercise section. The new forward migration is `20261104001416_workout_set_logging.sql`; earlier migrations remain unchanged.

## Model and actual performance

`workout_sets` retains stable IDs, owner/parent constraints, positions, actual reps, actual external load in kg, status and timestamps. It adds `load_mode` (external/bodyweight), server-maintained integer `revision`, `last_mutation_id` and `deleted_at`. Removal is a tombstone, retaining stable identity and relative historical positions. Visible row numbers are presentation, not identity; gaps are valid. A deferrable position constraint permits atomic adjacent swaps. At most 100 live sets per exercise can be added through the logging RPC.

Canonical set types are `working` (Normal), `warm_up` (W), `drop` and `rest_pause`. One row records one measured effort; compound drop chains, rest-pause sub-bouts and durations need a future structured extension. Never infer multiple performances from a classification. Warm-ups can be excluded explicitly by future analytics rather than misclassified as working sets.

New rows are pending, even when copying the preceding row's currently entered weight/reps. Blank is NULL, distinct from explicit zero. Complete requires integer reps 0–1,000 and, for external mode, a finite nonnegative load up to 100,000 kg. Reopening restores pending and clears completion time. Editing a completed row preserves its original completion time and updates actual performance. Bodyweight mode requires reps and NULL external load; it never invents body mass or treats bodyweight as zero-load performance. Eligible catalog equipment is restricted to nonempty subsets of None, pull-up bars, neutral grips, parallel bars, steps and suspension trainers, enforced again in SQL. Weighted versions can use external mode.

Machine stack/assistance values remain user-recorded external measurements; no mechanical advantage, body mass or effective resistance is inferred. Timed holds still have no duration field and cannot be represented as timed performance in this phase. Selection never fabricates actual sets.

## Units

Use existing `account_preferences.display_weight_unit`, default lb for new accounts (existing preferences preserved). Inputs accept up to six decimal places; exact integer/rational conversion uses 1 lb = 0.45359237 kg and rounds once to the existing 0.001 kg storage precision. Phase 5.3 retains exact entered-unit metadata; fallback lb display uses two decimals, kg three. Unchanged displayed loads reuse canonical kg when saving other fields, preventing conversion drift. Unit changes persist preference and reformat only; they never update set loads or revisions. Unit selection now lives in Profile Settings, not the active logger. Cross-device preferences and confirmed performance load from Supabase on revisit.

## Saving, retries and concurrency

Typing changes a local draft. Blur commits fields; completion/type/mode/reorder/remove are discrete operations. There is no write on every keystroke or Save Workout button. Saved appears only after server acknowledgement; pending, unsaved and failed states are distinct. New rows have stable UUIDs before their first request, and Add is disabled while creating to prevent repeated clicks.

`src/features/sets/model.ts` contains reusable typed validation, conversion and summary logic. Server actions in `actions.ts` verify `getUser()` on every read/write, validate input and call the authenticated `SECURITY INVOKER` RPC `log_workout_set`. It uses the existing RLS, explicit owner checks, parent-first session locks, server revisions and mutation UUIDs. CAS rejects stale revisions; idempotent retries of the same operation do not repeat side effects. Reorder updates both affected rows transactionally. No caller-supplied owner, privileged bypass or service-role key is used. The trigger also protects direct authenticated writes to closed/removed parents and maintains revisions; ordinary roles cannot update the revision column.

Client mutations queue within a workout. Responses cannot overwrite fields edited while saving. Concurrent remote edits produce a visible conflict with saved values and explicit choices to use them or retry the retained draft. Unknown network outcomes retain the original mutation UUID for retry; changing a failed draft creates a new operation against the current revision. Discard explicitly reloads saved values rather than guessing whether a failed request committed.

Dirty drafts are cached synchronously in per-owner/per-workout tab `sessionStorage`, removed after successful persistence. Refresh can recover them as **unconfirmed**, never Saved. Internal links show an inline stay/discard choice; unload warns, and browser Back preserves the tab draft for return. Finish, abandon and exercise mutations are disabled while writes/drafts are unresolved. Active requests cannot be discarded through the navigation prompt. Session storage is tab-local and not guaranteed across browser closure; only confirmed saves persist across devices and browser restarts. This is not offline sync. A failed draft stays on screen with retry, and users should resolve it before closing the browser. Private draft storage is not a service-worker cache and is scoped to the verified owner.

## Completion and retention

The existing `end_workout` transaction now derives an honest summary from nondeleted sets. `none` means no completed sets; `full` requires a completed session, every live set completed, and at least one set for every exercise with any existing prescribed-set count met. All other sessions with completed sets are `partial`. Abandon with completed sets is partial. Pending/skipped rows and their actual drafts remain unchanged; closing never creates reps, loads or completion timestamps. Incomplete finish requires explicit acknowledgement but remains allowed. Exercise status tracks entered live set progress, independently of session closure.

The summary shows selected exercises, completed/pending counts, session/completion status and start/end timestamps. Closed sessions render read-only and reject ordinary database set writes, including DELETE. Historical correction workflows require a future explicit, reviewed contract. Manual or materially recorded set history protects its parent selection; Phase 5.3 permits removal of untouched automatic suggestions. PR detection, volume, program/trainer assignment completion and historical defaults can consume stable IDs, canonical units and explicit types later; none are computed here. Phase 5.3 adds pending historical defaults; see [smart defaults](smart-set-defaults.md).

## Local validation and delivery

Use only the disposable local Supabase/Auth/Mailpit target and public test configuration described in [authentication.md](authentication.md). Run `npm run db:reset`, `db:lint`, `db:test`, lint, typecheck, Vitest, formatting, catalog consistency, Next build, `cf:build`, `cf:check` and desktop/mobile Playwright. Local Worker browser runs need their own output directory. Browser tests cover actual public-role RPCs, fast entry, retained errors, stale-edit conflicts, recovered drafts, unchanged kg on unit changes and partial finish. pgTAP checks actual persisted denial states and migration compatibility alongside prior suites.

No new dependencies, environment keys, Workers bindings or deployment scripts are required. Before any approved rollout, review/apply this migration through the existing single delivery mechanism before the application release; verify intended project, backups/PITR, prior migration order and rollback/forward-recovery plan. Confirm function ACLs, RLS and closed-session denial afterward. Do not run hosted reset, migration repair or remote SQL as validation. Publication relies on the user's repository-wide confirmation that automatic Supabase preview branching is disabled; that is not a live dashboard audit. This work does not authorize merge or production deployment.

## Validation record

Validated 2026-11-03 (America/Los_Angeles):

- Fresh disposable local replay of all six migrations, database lint and **1,166 pgTAP assertions across five suites** passed.
- **99 Vitest tests across 19 files** passed, including exact conversions, default copying, ordering, completion rules, validation and action identity boundaries.
- ESLint, strict typecheck, Prettier, catalog consistency and git whitespace checks passed.
- Next.js production build, OpenNext Workers build and Wrangler no-upload dry-run passed.
- **30 desktop/mobile Playwright tests passed on Next.js and 30 on local Workers**. Four additional final logging tests passed on Next.js after adding delayed-save/typing assertions and the larger completion touch target.
- Light/dark mobile Worker screens were reviewed; three expanded rows, no horizontal overflow and 48px completion targets were checked.

Early validation caught a fast-entry layout shift (fixed by keeping draft-discard controls inside stable advanced options), a skipped-set constraint selection issue, and test-only text/case mismatches. Final runs pass. The retained Next.js middleware deprecation and local Worker Request.cf/proxy fallbacks are existing documented limitations, not deployment validation.

No local functional checks were blocked. Hosted schema/security, real SMTP, production deployment and physical-device behavior were not inspected/tested. GitHub git transport is reachable, but the GitHub GraphQL PR API returns Forbidden; manual draft PR creation may be required.

## Phase 5.3 follow-up

See [smart defaults](smart-set-defaults.md) for transactional initialization, prescribed suggestions versus actual inputs, exact entered-weight metadata, Profile Settings and the forward-only extension. The validation record above describes Phase 5.2.

## Phase 6.1 follow-up

See [workout history](workout-history.md) for paginated owner-scoped History/Look Back, read-only review, local-time display, friendly workout naming, measurement-context snapshots and reps-first bodyweight logging. The new forward migration leaves prior snapshots and SQL immutable, and blocks unsupported duration/assistance completion without weakening historical guards. Internal [record prominence](record-prominence.md) remains display metadata only.
