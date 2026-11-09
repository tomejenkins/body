# Phase 7.5B.1 validation

Base main: `792f428` (merged PR #23). Branch: `refine/phase-7-5b-1-workout-entry`. Local validation: 9 November 2026.

## Executed checks

| Check                                | Actual result                                                                                                         |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------------------- |
| ESLint                               | Passed                                                                                                                |
| Strict TypeScript / generated routes | Passed                                                                                                                |
| Vitest                               | 281 passed, 52 files                                                                                                  |
| Formatting                           | Passed                                                                                                                |
| Exercise catalog                     | Passed: 183 exercises                                                                                                 |
| Program catalog                      | Passed: 12 programs, 46 training days, 205 slots                                                                      |
| Fresh local migration replay         | Passed, all migrations into new isolated `body_entry_validation` with the local stack's real Auth/extension bootstrap |
| Full pgTAP suite on fresh replay     | 2,067 passed, 21 files                                                                                                |
| Database lint                        | Passed, no schema errors                                                                                              |
| Database advisors                    | Only the two pre-existing multiple-permissive-SELECT-policy performance warnings on programs/program_versions         |
| Next.js production build             | Passed                                                                                                                |
| Playwright full desktop/mobile       | 116 passed; 10 intentional duplicate-viewport skips                                                                   |
| Final new-flow desktop/mobile rerun  | 6 passed, including keyboard search and concurrent starts                                                             |
| OpenNext / Cloudflare build          | Passed                                                                                                                |
| Wrangler no-upload dry-run           | Passed                                                                                                                |
| Local Worker requests                | Passed: login/manifest 200; Workout/setup/Programs 307 to configured local login                                      |

Database tests cover authentic owner access, foreign/archived/unsupported IDs, clean initial actuals, canonical ordering, explicit repeated intents with ordinary-shell rejection retained, atomic invalid-start rollback, immutable metadata validation, private exercises without curated intents, six-slot limit, retries after catalog archival, single active session, qualifying recents, cross-owner isolation, anonymous/service-role denial. Existing database suites retain all scheduling, Favorites, logger, source, progression and continuity checks.

Browser coverage includes one-click recommendation, disclosed alternatives, direct Other setup with no repeated recommendation/Favorites, no-program entry, active Resume/redirect, Full Body with five unselected categories, stale muscle-state resets, existing focus/emphasis behavior, 375/390/430-width layout checks, light/dark and reduced motion, real completed recents, case-insensitive bounded catalog search, selected-list removal/reorder, intentional shared intents, chosen exercises already bound, normal logging, concurrent starts/retries and unchanged assigned schedule. Native radios, labeled search and named reorder/removal buttons retain keyboard/screen-reader semantics; retained browser suites cover keyboard navigation, focus, matching, smart defaults, pause, draft recovery, completion/history and PR feedback.

The complete browser suite passed before the final search-area CSS adjustment; all six new desktop/mobile cases passed again against the final build with that compact scroll region and keyboard assertions.

The first focused run exposed a real mobile layout issue: optional focus controls pushed Start below the tab bar. The final candidate uses a compact mode toggle and two-column optional controls. New test selectors were corrected for exact catalog casing and the existing Open exercise logger action. Initial fixture creation also required privileged synthetic setup, while all tested application operations run authenticated under RLS.

Local Worker preview used a placeholder after remote `Request.cf` metadata retrieval failed; representative local requests passed. This is local compatibility validation, not hosted authentication validation. The disposable Supabase stack was stopped after database/browser checks.

## Before and after screenshots

Synthetic disposable local accounts only. Before images came from the retained pre-refinement Phase 7.5B Worker artifact; after images come from the Next production build.

- [Before: program entry](images/workout-entry-refinement/before-program.png).
- [Before: no-program entry](images/workout-entry-refinement/before-no-program.png).
- [Before: duplicated setup](images/workout-entry-refinement/before-setup.png).

- Program entry: [mobile](images/workout-entry-refinement/mobile-entry-program.png), [desktop](images/workout-entry-refinement/desktop-entry-program.png).
- No-program entry: [mobile](images/workout-entry-refinement/mobile-entry-no-program.png), [desktop](images/workout-entry-refinement/desktop-entry-no-program.png).
- Ad-hoc muscle setup: [mobile](images/workout-entry-refinement/mobile-setup-muscle.png).
- Full Body: [light](images/workout-entry-refinement/mobile-setup-full-body-light.png), [dark](images/workout-entry-refinement/mobile-setup-full-body-dark.png), [generated Workout Home](images/workout-entry-refinement/mobile-full-body-home.png).
- Choose by Exercise: [recents](images/workout-entry-refinement/mobile-exercise-recents.png), [search and selected list](images/workout-entry-refinement/mobile-exercise-search.png).
- Chosen exercises ready: [mobile](images/workout-entry-refinement/mobile-exercise-ready.png), [desktop](images/workout-entry-refinement/desktop-exercise-ready.png).
- Resume: [mobile](images/workout-entry-refinement/mobile-entry-resume.png), [desktop](images/workout-entry-refinement/desktop-entry-resume.png).

## Rollout prerequisites

Apply the reviewed forward migration `20261109185258_exercise_first_workout_entry.sql` before the new setup app code. It adds three explicitly granted invoker functions and replaces the existing ad-hoc validation/initialization triggers; there are no new tables, client-write grants or historical backfills. Existing migrations remain untouched. Validate on an explicitly authorized development target before shared rollout.

No hosted SQL, remote migration push, production deployment, merge, new secrets/services or dependency changes are part of this delivery. Supabase preview disablement remains intact. Validation uses a fresh additional local database rather than resetting existing local training history.

## Known limits

Setup permits six explicit exercises; existing in-workout additions remain available. Search bounds displayed results to 20 and recents to six; catalog loading reuses the existing batched library rather than a new paginated search endpoint. Missing Full Body categories are disclosed through a reduced supported count after category-specific alternatives are exhausted. Physical iOS/Safari, physical-device touch and hosted-provider authentication were not verified. Live Supabase documentation access is unavailable under the environment's destination policy; pinned CLI/local database validation completed. See [architecture and contracts](workout-entry-refinement.md).
