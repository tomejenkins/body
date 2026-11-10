# Phase 7.6D validation

Base: fetched merged `main`, `9765963b7c768bb10a2e52753fe5fbd04f9edf69` (PR #29). Branch: `feat/phase-7-6d-completion-experience`. Validation date: November 10, 2026. Local only; no hosted Supabase change, merge or deployment.

## Preflight and design

Read AGENTS.md and reviewed the real completion component/route/server loader, statistics/duration/record formatting and ranking, shared Achievements/SaveFavorite, program outcomes/feedback, design tokens, responsive/motion conventions and existing visual coverage. Reviewed Phase 7.5D completion architecture, Phase 7.6B enrollment/lifecycle contracts and Phase 7.6C retention semantics. Inspected committed screenshots and captured unchanged main using genuine local RPC-recorded sessions before editing.

The visual plan was shared before changes: centered restrained success moment → unified three-metric surface → earned-record emphasis → compact program context and native secondary disclosures → clear Done action. The production diff is limited to completion markup, an opt-in achievement presentation variant and completion-scoped CSS. Routes, loaders, model/ranking functions, RPCs, source snapshots, logger, global navigation, auth/RLS, dependencies and all migrations remain unchanged.

Architecture and visual decisions: [workout-completion-visual-refinement.md](workout-completion-visual-refinement.md).

## Executed checks

| Check                                      | Actual result                                                  |
| ------------------------------------------ | -------------------------------------------------------------- |
| Unchanged-main completion browser baseline | Passed 8 desktop/mobile tests; before screenshots captured     |
| `npm run lint`                             | Passed                                                         |
| `npm run typecheck`                        | Passed                                                         |
| `npm test -- --maxWorkers=2`               | Passed 331 tests, 64 files                                     |
| `npm run format:check`                     | Passed                                                         |
| `npm run catalog:check`                    | Passed 183 exercises                                           |
| `npm run programs:check`                   | Passed 12 programs, 46 training days, 205 slots                |
| Fresh isolated existing-migration replay   | Passed `body_completion_76d`; no migration added/modified      |
| Existing full pgTAP suite                  | Passed 2,308 assertions, 26 files                              |
| `npm run db:lint`                          | Passed `public,body_private`, no warnings/errors               |
| `npm run build`                            | Passed final Node production build                             |
| `npm run cf:build`                         | Passed, including Next rebuild                                 |
| `npm run cf:check`                         | Passed; `--dry-run` exited without upload                      |
| Full Playwright desktop/mobile             | Passed 152 tests; 10 existing duplicate viewport cases skipped |
| Local Worker HTTP/auth smoke               | Passed 10/10 local routing/auth-boundary requests              |

Complete outputs: [browser regression](evidence/phase-7-6d/browser-regression.txt), [unit tests](evidence/phase-7-6d/unit-tests.txt), [database regression](evidence/phase-7-6d/database-regression.txt), [OpenNext build](evidence/phase-7-6d/opennext-build.txt), [Wrangler dry-run](evidence/phase-7-6d/wrangler-dry-run.txt), and [Worker smoke checks](evidence/phase-7-6d/worker-smoke.json).

`npm run cf:preview -- --port 8787 --ip 127.0.0.1` served the final local Worker. Login/manifest returned 200; Dashboard, Workout, completion (including additional achievements), Programs, History/Archived History and Program History returned the expected authentication redirects (307). These are public-asset and authentication-boundary checks, not authenticated workout workflows under Worker emulation: the local database was stopped after the successful Node browser suite to free build storage.

Commands used the committed Node 24/npm dependencies, pinned Supabase CLI 3.0.0, local Docker/Supabase and system Chromium. Actual local browser command: `node /workspace/work/active-workout/run-e2e.mjs`; two default workers, no added retries. Unit workers were bounded to two.

For an empty isolated database, `/workspace/work/completion-7-6d/replay.py` created `body_completion_76d`, loaded the local managed Auth/extensions schema-only bootstrap, and applied every existing migration in order with `psql -v ON_ERROR_STOP=1`. No hosted rows were copied. The existing pgTAP files ran using `ghcr.io/supabase/pg_prove:3.36`, `/tests/*.sql`, `PGHOST=supabase_db_body`, `PGDATABASE=body_completion_76d` and the local `body_validation` network. Clean disposable-stack equivalent: `npm run db:reset` followed by `npm run db:test`. No schema or eligibility change was required for the design.

## Functional evidence

Existing completion tests exercise actual closing, authoritative duration/counts, Favorite save/already-saved/cap, disabled Feed, Done/Full Workout links, genuine three-exercise records, exact-versus-estimated metrics, additional records, full/partial program summaries and scheduling links, private/missing/active/abandoned handling and repeat visits. Existing retention/lifecycle/logger suites remain part of the complete regression run.

Added coverage records a real bodyweight improvement from ten to twelve repetitions. The engine returns one record, displayed as Most Bodyweight Reps / 12 reps, without invented external load. It verifies archived/deleted completion routes do not show a celebration and an empty completed session shows zero working sets and no meaningful-training or Favorite claim.

Another scenario requests End After Next Workout on an eight-day enrollment, completes its required actual work through the existing logger/close path, and revisits the completion route. Assignment state, terminal reason/session/time, revision, saved sets and lifecycle receipt identities remain unchanged. Refresh and View All Achievements do not replay ending.

The browser checks compare persisted evidence rather than treating every HTTP POST as a database mutation: the existing active-workout bar makes read-only continuity Server Action requests. No new completion POST/write mechanism was introduced by this phase.

## Visual and accessibility evidence

The long-title three-record scenario covers 375×667, 390×844, 430×932, 768×1024 and 1440×900 in both themes. It checks one-row metric geometry, no horizontal overflow, practical 44px targets, long unbroken exercise-title stress, 200% root text size and lower-page navigation remaining scrollable above the unchanged fixed navigation. Test-only unbroken-name stress is restored before normal screenshots; recorded canonical identities/values are never changed for visual effects.

Normal motion checks assert a single checkmark animation. Reduced motion asserts no animation and the final visible stroke. Layout geometry is measured after reduced motion is enabled, preventing a permitted temporary stagger transform from being mistaken for three grid rows. Headings, definition-list values, labels and native progress/disclosure semantics remain available without animation.

[Declared-color contrast calculations](evidence/phase-7-6d/contrast.json) use WCAG sRGB luminance, including the declared sRGB record-surface mix. All checked normal text pairs exceed 4.5:1: statistics labels 8.03/9.08, record labels 5.68/7.78, record accent 6.19/9.24, and Done 9.45/9.96 in light/dark respectively. The disabled Feed affordance is excluded from that threshold check. This verifies specified colors, not every pixel, OS display or assistive-technology combination.

Screenshots were manually inspected for actual hierarchy and contrast: the former ordinary left-aligned finish page becomes a centered success composition; the integrated metric surface has stronger hierarchy; record values lead their labels; partial progress remains visibly partial; and dark mode uses restrained warm accents without neon effects. Full-page mobile captures can show fixed navigation at the original viewport boundary. Additional scrolled viewport captures make program progress readable in its real on-device position; no screenshot-only hiding of navigation is used.

## Before and after

Actual local recorded evidence; no production records or fabricated PR screenshots.

| State                       | Before                                                   | After                                                                             |
| --------------------------- | -------------------------------------------------------- | --------------------------------------------------------------------------------- |
| Standard, no PR             | [Before](evidence/phase-7-6d/before/no-pr-mobile.png)    | [After / reduced motion](evidence/phase-7-6d/after/no-pr-mobile.png)              |
| Three records, mobile light | [Before](evidence/phase-7-6d/before/prs-390-light.png)   | [After](evidence/phase-7-6d/after/prs-390-light.png)                              |
| Three records, mobile dark  | [Before](evidence/phase-7-6d/before/prs-390-dark.png)    | [After](evidence/phase-7-6d/after/prs-390-dark.png)                               |
| Desktop light               | [Before](evidence/phase-7-6d/before/prs-1440-light.png)  | [After](evidence/phase-7-6d/after/prs-1440-light.png)                             |
| Desktop dark                | [Before](evidence/phase-7-6d/before/prs-1440-dark.png)   | [After](evidence/phase-7-6d/after/prs-1440-dark.png)                              |
| Completed program work      | [Before](evidence/phase-7-6d/before/program-mobile.png)  | [After, scrolled progress](evidence/phase-7-6d/after/program-progress-mobile.png) |
| Partial program work        | [Before](evidence/phase-7-6d/before/partial-mobile.png)  | [After, scrolled progress](evidence/phase-7-6d/after/partial-progress-mobile.png) |
| Saved Favorite              | [Before](evidence/phase-7-6d/before/favorite-mobile.png) | [After](evidence/phase-7-6d/after/favorite-mobile.png)                            |

Additional after states: [one bodyweight PR](evidence/phase-7-6d/after/one-pr-mobile.png), [additional exact/estimated achievements](evidence/phase-7-6d/after/additional-mobile.png), [empty session](evidence/phase-7-6d/after/empty-mobile.png), [200% text](evidence/phase-7-6d/after/large-text.png). The evidence directory includes both themes at 375, 390, 430, 768 and 1440px.

## Performance and scope

[Source compression estimate](evidence/phase-7-6d/presentation-cost.json): `app-ux.css` grows by 7,839 source bytes, or 1,258 bytes when the entire source stylesheet is gzip-compressed. This is a source-size estimate, not an HTTP transfer measurement or device benchmark. No new animation dependency, client component, history query or metric calculation engine was added. Existing components/actions still handle local time and Favorite forms. True values are rendered immediately; motion never delays access or counts numbers up.

The optional achievement variant does not alter default History card content structure. CSS stays beneath `.workout-completion`; no active logger, Workout tab, exercise picker, Programs or global navigation redesign is part of the diff. No set-saving, duration, pause, progression, schedule, completion, lifecycle or retention behavior changed.

## Iterations and environmental limits

The first baseline build overlapped local dependency relocation and encountered missing template files. After relocation completed, the unchanged-main build and all eight baseline browser tests passed. This was a local execution-order problem, not a source change or dependency workaround.

The initial focused run passed the eight retained completion cases and failed four new assertions that equated read-only Server Action POSTs with training writes. Corrected tests compare actual persisted sessions, sets and lifecycle receipts; both new scenarios then passed in both browser projects. A first broader run also sampled stagger transforms during geometry checks; it was interrupted after identifying that test timing issue. Enabling reduced motion before measuring geometry passed the complete viewport/theme/large-text matrix in both projects. The final complete run passed 152 cases with ten existing duplicate viewport cases skipped; no production synchronization behavior was changed to satisfy a test.

Docker VFS and the managed filesystem have limited space. Dependencies and Next output temporarily use `/tmp` while the local database/browser tests run; native OpenNext packaging uses normal workspace directories after the local database is stopped with retained data. The disposable Auth container's health probe uses direct loopback for its own 127.0.0.1 health URL only. The inherited external proxy and TLS policy remain intact. Existing Next middleware-deprecation/build-cache warnings are not application failures.

Chromium mobile emulation and CSS text-size tests are not physical iOS/Android Dynamic Type, VoiceOver/TalkBack or real cellular validation. Physical-device motion/focus review and normal staged app rollout remain release prerequisites. No hosted SQL, migration, data correction or infrastructure action is required for this presentation-only change. The existing Phase 7.6C schema remains the deployed compatibility prerequisite.

Phase 7.6E may align broader Dashboard/Programs/History typography, spacing and secondary navigation. This phase deliberately leaves those surfaces and the highly rated Workout entry/picker/logger untouched.
