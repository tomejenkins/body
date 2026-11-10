# Phase 7.6B validation

Base: latest fetched `main`, `e9b4573` (PR #27). Branch: `feat/phase-7-6b-program-lifecycle-history`. Validation date: 2026-11-10 UTC. Local only; no hosted schema changes, deploy or merge.

## Preflight and implementation order

Read AGENTS.md, both Phase 7.6A audit/validation documents, SQL integrity probes, architecture/security/schema and recent scheduling/selection/entry/Dashboard/completion docs. Inspected assignment grants/triggers, immutable versions, workout start/binding/assigned selection, shared saved progress, performance metrics, cursor/full rotations, closure/timers, owner RLS, Programs browsing and History pagination. Reviewed audit's7.6C archive/delete dependency map.

The plan was presented before changes: shared qualifying evidence and mandatory P1 checkpoint → atomic lifecycle → enrollment metrics → history UI → regression/security/browser validation. Automatic ending was implemented only after the P1 checkpoint passed.

## P1 before/after evidence

[Before](evidence/phase-7-6b/p1-before.txt) and [after](evidence/phase-7-6b/p1-after.txt) are actual local SQL probe output. Zero-load external bench work formerly had `full`, two saved program sets and zero qualifying performance. Zero-repetition work formerly had `full` with zero progress. After the first migration both derive `none`, zero qualifying progress and cursor position 1.

Before lifecycle implementation: focused qualification tests passed 52 assertions; isolated all-migration replay plus retained full suite passed 2,141 assertions across 23 files; eight progress unit tests passed. An initial run on the populated browser database hit the old schema test's global-empty fixture assertions; the corrected isolated replay passed. No actual set values/timestamps were rewritten to make the probe agree.

Final code review also reconciled other-program Dashboard labels through bounded classification batches and removed calendar-configuration dependence from actual full-rotation completion. The final eligibility tests also cover unweighted bodyweight, warm-ups, pending/skipped/removed/deleted work, unsupported legacy categories, partial/full prescribed work, out-of-order/repeated days, nonweekly rotations, effective history labels, calendar reconciliation and evidence correction/restoration.

## Schema and rollout

New forward migrations, generated with the pinned Supabase CLI:

- `20261110055140_shared_program_qualification.sql`: common eligible session/set sources, compatible performance wrapper, shared prescribed progress, correct new completion classification and derived historical labels/filter.
- `20261110055935_program_lifecycle_and_history.sql`: minimal assignment lifecycle fields, owner-only immutable command receipts, protected transition triggers, atomic invoker commands, post-close ending hook, history/statistics RPCs and enrollment ordering index.

No earlier migration, catalog snapshot, dependency or secret changed. Deploy the ordered migrations through the existing reviewed migration process only after environment-specific approval, backup/recovery readiness and staging validation. Keep app/migration rollout coordinated: older raw assignment archival/silent-switch clients are intentionally rejected after the lifecycle migration. Reconcile historical mismatches using the owner-scoped detection query in [architecture](program-lifecycle-and-history.md); there is no blanket historical actual-data backfill.

Existing active assignments are preserved with legacy provenance and can use the existing explicit calendar setup when needed. Legacy duration is unavailable; exact enrollment time is not invented. Old complete active fixed programs cannot launch another rotation; explicitly end and reenroll. Repeated enrollments use distinct UUIDs.

## Executed checks

Results below are from this branch, not copied from previous PRs.

| Check                                   | Actual result                                                                        |
| --------------------------------------- | ------------------------------------------------------------------------------------ |
| `npm run lint`                          | Passed                                                                               |
| `npm run typecheck`                     | Passed, strict TypeScript and route generation                                       |
| `npm test`                              | Passed 320 tests across 62 files                                                     |
| `npm run catalog:check`                 | Passed                                                                               |
| `npm run programs:check`                | Passed                                                                               |
| Fresh isolated migration replay         | Passed, final database `body_lifecycle_final_review_76b`                             |
| Full pgTAP suite on final fresh replay  | Passed 2,247 assertions across 25 files                                              |
| `npm run db:lint`                       | Passed both `public,body_private`, no issues                                         |
| `npm run build`                         | Passed, final production build and OpenNext rebuild                                  |
| `npm run format:check`                  | Passed                                                                               |
| `npm run cf:build` / `npm run cf:check` | Passed; OpenNext bundle built and Wrangler exited `--dry-run`, no upload             |
| Playwright desktop/mobile               | Passed 140 tests, 10 duplicate viewport-matrix cases deliberately skipped; 150 total |

Actual final replay command: `python /workspace/work/lifecycle-7-6b/replay-final-review.py`. The executor helper is local validation tooling; the clean-checkout CLI alternative is given below. Fresh replay creates a new disposable local database, applies the local stack's managed schema-only Auth/extensions bootstrap, then executes every `supabase/migrations/*.sql` in sorted order with `psql -v ON_ERROR_STOP=1`. No hosted accounts or data are copied. The standard equivalent on a clean disposable local stack is `npm run db:reset`. The all-suite runner uses `ghcr.io/supabase/pg_prove:3.36` against the isolated database on the local `body_validation` network. Pinned CLI lint runs against the local incremental browser database with the same final function definitions.

Unit/database tests cover exact assignment counts, full versus partial actual sessions, exclusion of independent work, deterministic best-first-session baseline, strictly later best, exact repetitions/exercise/category, canonical conversion, negative/insufficient comparisons, no invented bodyweight resistance, evidence withdrawal/restoration, legacy provenance, immutable titles and archived-template history. Duration units cover short days/weeks, month-end, leap-year, DST, stable timezone and long enrollment anniversaries.

Lifecycle tests cover same-version continuation, repeat enrollment, inaccessible source/foreign assignment denial, protected raw fields, immutable receipts, stale revisions, changed-payload nonce rejection, one-active enforcement, active-workout conflict, pending cancellation, partial/skip/defer/accepted-partial/Favorite exclusion, natural fixed completion, pending/natural precedence, post-end retries, old attribution and source-edition switches.

Real cancel/finish concurrency also exercised the existing `55P03` NOWAIT response: cancellation won, the close rolled back safely, and an ordinary retry preserved all sets and completed without ending the cancelled assignment. Tests explicitly accept this existing contention contract; logger behavior was not changed. The first regression pass exposed a real first-use SQL visibility bug while resolving a newly cloned version in the same SELECT; resolving then selecting in separate statements corrected it. Database lint caught an unused variable, removed before the final replay. Browser review caught the removed Programs Resume shortcut; it was restored without changing logger code. Existing fixtures relying on silent switch, post-completion extra rotation or unconfirmed initial timezone now explicitly enroll/switch or seed a privileged **local legacy fixture**, retaining their logger assertions.

Complete retained outputs: [pgTAP](evidence/phase-7-6b/database-regression.txt), [Vitest](evidence/phase-7-6b/unit-tests.txt), [Playwright](evidence/phase-7-6b/browser-regression.txt). The final unit run used `npm test -- --maxWorkers=2` to bound local resource use; all 320 tests ran. Strict types, ESLint and catalogs passed independently.

`npm run cf:preview -- --port 8787 --ip 127.0.0.1` served the local Worker. [HTTP smoke results](evidence/phase-7-6b/worker-smoke.json) show 200 for login/manifest and 307 to authentication for Dashboard, Workout, Programs, current-program management, enrollment, History and both program-history routes. These are routing/auth-boundary smoke checks, not authenticated database workflows in Worker emulation; the local database was stopped after the successful Node browser suite to free build storage.

## Screenshots and browser evidence

Actual local accounts, immutable programs and normal saved-set RPCs were used. The comparison fixture records 50 kg × 5 then 55 kg × 5; the visible 11.02 lb gain is converted from that real canonical evidence, not a screenshot overlay or invented production record.

- [Start Program](evidence/phase-7-6b/start-program.png)
- [Current statistics](evidence/phase-7-6b/current-program-statistics.png)
- [Management actions](evidence/phase-7-6b/manage-program.png)
- [Pending end](evidence/phase-7-6b/pending-end.png)
- [Switch confirmation](evidence/phase-7-6b/switch-program-confirmation.png)
- [Workouts selector](evidence/phase-7-6b/history-workouts-selector.png)
- [Program History and repeat enrollment](evidence/phase-7-6b/program-history-repeat-enrollments.png)
- [Private enrollment detail](evidence/phase-7-6b/program-history-detail.png)
- [375px dark](evidence/phase-7-6b/program-history-375-dark.png), [390px light](evidence/phase-7-6b/program-history-390-light.png), [430px dark](evidence/phase-7-6b/program-history-430-dark.png)

Browser tests cover enrollment without a session, direct management and browsing convergence, pending/cancel/automatic ending, switching, repeat cards, exact history attribution, active-session protection, request retry/concurrent switch, foreign metric privacy and viewport/theme overflow checks. The unchanged full suite exercises scheduling, overrides, Favorites, Full Body/exercise-first setup, Dashboard, Workout Complete, smart defaults, continuity, pause/resume, logging revisions, records and history.

## Environment and remaining limits

Node 24, committed dependencies, pinned CLI 3.0.0, local Docker/Supabase and system Chromium. Browser mobile projects emulate mobile Chromium; no claim of physical iOS/Android, cellular, hosted Auth/SMTP, production-scale query plans or deployed migration validation. Trace files can contain disposable test authentication and remain ignored outside the committed evidence directory.

The restricted sandbox could not parse the TypeScript subprocess during the first production-build attempt; the same build passed with ordinary approved local subprocess access. Dependency/Next directories temporarily use `/tmp` storage while Docker runs; they are restored before native OpenNext bundling. No dependency change was used as a workaround. The existing middleware deprecation and optional Cloudflare metadata/network restrictions are infrastructure limitations, not reasons to alter logger workflows.

Archive/restore/permanent delete remains Phase 7.6C. Extend the shared eligibility gate and history-list retention predicates before that phase ships; no retention UI/schema is implemented here. Legacy exact enrollment times and terminal intent cannot be reconstructed. Strength payloads disclose the100-comparison cap; larger real enrollments need hosted query-plan verification before release.
