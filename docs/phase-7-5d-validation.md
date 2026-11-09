# Phase 7.5D validation

Branch: `feat/phase-7-5d-workout-completion`. Base: merged main `93c3728` (PR #25). Architecture and semantics: [workout-completion-experience.md](workout-completion-experience.md).

## Executed local checks

| Check                                            | Result                                                                                                              |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------- |
| ESLint                                           | Passed                                                                                                              |
| Strict TypeScript / Next route generation        | Passed                                                                                                              |
| Vitest                                           | 304 tests, 59 files passed                                                                                          |
| Prettier                                         | Passed                                                                                                              |
| Exercise catalog                                 | Passed; 183 canonical exercises                                                                                     |
| Program catalog                                  | Passed; 12 programs, 46 workout days, 205 movement slots                                                            |
| Fresh local migration replay                     | Passed, all migrations including the new forward migration                                                          |
| pgTAP                                            | 2,089 assertions across 22 files passed                                                                             |
| Database lint (`public,body_private`)            | Passed                                                                                                              |
| Database performance advisors                    | Two existing multiple-permissive-SELECT-policy notices on programs/program_versions; no new notice                  |
| Next.js production build                         | Passed                                                                                                              |
| Desktop/mobile Playwright                        | 134 passed, 10 intentional duplicate-viewport skips (8.2 min); final completion-specific rerun 8/8 passed (1.0 min) |
| OpenNext / Wrangler dry-run / local Worker smoke | Passed                                                                                                              |

The 10 skipped cases are the existing mobile-project duplicates of the viewport/theme matrix already executed by the desktop project; all five widths and both themes ran. The final full suite ran against the final production UI. Completion-only test refinements (keyboard, long-title stress and post-refresh screenshot readiness) were additionally verified in their separate 8/8 run.

The initial browser runs caught an incorrect action-response guard, retained History-label expectations and a legacy-URL redirect race in an existing test. These were corrected before the final suite. No failed run is represented as passing. The final full run includes scheduling, calendar, overrides, Favorites, Full Body/exercise-first, records, logger queues, drafts, continuity, manual pause, completion and ownership regressions.

The local Worker returned HTTP 200 for `/login` and `/manifest.webmanifest`; Dashboard, Workout, Programs and the protected completion URL returned 307 to login. Wrangler could not fetch optional `Request.cf` metadata and used its local placeholder, as in prior phases; local requests succeeded. This verifies local bundle/runtime compatibility and unauthenticated route protection, not authenticated hosted-provider connectivity. Authenticated workout flows were exercised against the Node production app and disposable local Supabase stack.

## New coverage

The eight new desktop/mobile completion cases cover real ad-hoc and program finishes, empty/pending/warm-up/zero-rep exclusions, no-PR confirmation, three diverse featured achievements and additional earned records, exact versus estimated metrics, actual repetitions, prescribed completion and partial outcomes, existing next-time suggestions, separate partial acceptance, Favorite save/revisit/cap state, effective paused duration, refresh/Back/legacy redirects, Dashboard/History agreement and restored navigation. Disabled Feed publication is asserted without a publication request.

The completion route is checked with invalid, foreign, missing, active and abandoned session IDs and anonymous access. Streamed Next.js not-found responses can carry HTTP 200 after streaming starts; the tests verify the not-found UI and absence of private content rather than claiming every streamed response is HTTP 404.

The 22 new pgTAP assertions exercise owner-scoped summary aggregation, repeated canonical exercises as separate performed selections, exclusions, empty completed sessions, batched validation, duplicate close/read safety, owner/anonymous/service-role denial, retention and recalculation after a privileged local evidence correction. Existing concurrency, Favorite deduplication, schedule identity and session-lock assertions remain in the complete suite.

## Screenshots

Screenshots from the final completion-specific production browser run (8/8 passed), using real disposable local test accounts and saved workouts, with no hosted user data:

| Scenario                                  | Screenshot                                                                                                        |
| ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Completed ad-hoc workout without a new PR | [Mobile](images/workout-completion/ad-hoc-no-pr-mobile.png)                                                       |
| Completed program workout                 | [Mobile](images/workout-completion/program-mobile.png)                                                            |
| Partial program workout                   | [Mobile](images/workout-completion/partial-mobile.png)                                                            |
| Saved Favorite state                      | [Mobile](images/workout-completion/favorite-saved-mobile.png)                                                     |
| Three featured PRs, mobile                | [Light](images/workout-completion/prs-mobile-light.png) · [Dark](images/workout-completion/prs-mobile-dark.png)   |
| Three featured PRs, desktop               | [Light](images/workout-completion/prs-desktop-light.png) · [Dark](images/workout-completion/prs-desktop-dark.png) |

Mobile captures are 390 px wide; desktop PR captures are 1440 px wide. Full-page captures retain the fixed navigation at its viewport position; normal scrolling exposes content below it. Images were inspected, including an explicit post-refresh wait for the partial result rather than capturing its loading shell.

## Migration and rollout

The only new migration is `supabase/migrations/20261109224811_workout_completion_summary.sql`. It adds the authenticated, owner-scoped SECURITY INVOKER `workout_training_summary(uuid[])` read helper and updates closed History totals to use the same qualifying source. There are no new tables, mutable counters, backfilled completions, changes to actual sets, PR SQL or assignment progression. Older migrations are untouched.

Apply this forward migration through the established reviewed migration process **before** releasing the app that calls it. Confirm target identity, approval, backup/PITR readiness and existing prerequisite migrations; run smoke checks with owned completed, empty and foreign sessions. Historical completed working-set totals may decrease when previous raw-status counts included zero-rep or otherwise nonqualifying evidence. This is derived presentation correction, without rewriting saved measurements. A rollback to the old UI can leave this additive helper installed; schema corrections should use another forward migration.

Validation used only a disposable local Docker Supabase stack. All migrations were replayed into a fresh isolated local database with Auth/extension bootstrap, then the complete SQL suite ran there. No hosted database, integration setting, migration history, production infrastructure, dependency, credential or secret was changed. Supabase automatic previews remain disabled as previously confirmed in AGENTS.md. Delivery is a draft PR; no merge or deployment.

## Limits

Physical iOS/Safari, native installation, VoiceOver and hosted-provider verification were not performed. Browser coverage uses system Chromium with desktop/mobile viewport emulation; accessibility checks cover semantic labels, keyboard navigation, themes, reduced motion and overflow, not a full external accessibility audit. Long exercise-name layout is stress-tested with temporary DOM text, restored before screenshot capture; canonical catalog records are never renamed. Tested widths are 375, 390, 430, 768 and 1440 px. Timed/assisted legacy exercise entries retain existing unsupported strength-metric behavior and remain viewable in History. No combined volume metric, new progression algorithm, achievement notification, Feed publication or new social capability is introduced.
