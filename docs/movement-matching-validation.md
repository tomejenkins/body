# Movement matching and smart workouts — validation

Validated November 6, 2026 on branch `fix/movement-matching-smart-workouts`, based on main `a4f1b99` (merged Phase 7.4). See [implementation and rollout](movement-matching-smart-workouts.md).

| Check                                                 | Executed result                                                                               |
| ----------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| ESLint                                                | Passed                                                                                        |
| Strict TypeScript (`next typegen && tsc --noEmit`)    | Passed; production builds also completed type checking                                        |
| Vitest                                                | 246 passed across 44 files                                                                    |
| Final component checks after compact-label adjustment | 7 passed across 2 files                                                                       |
| Exercise catalog consistency                          | Passed: 183 exercises                                                                         |
| Program catalog consistency                           | Passed: 12 programs, 46 training days, 205 slots                                              |
| Formatting                                            | Passed                                                                                        |
| Fresh local migration replay                          | Passed application migration chain, including the new intent migration; recovery detail below |
| Local database lint                                   | No schema errors in public/body_private                                                       |
| Local pgTAP                                           | 1,791 passed across 17 files                                                                  |
| Next.js production build                              | Passed                                                                                        |
| Cloudflare/OpenNext production build                  | Passed                                                                                        |
| Wrangler deployment dry-run                           | Passed; no remote deployment                                                                  |
| Full Playwright desktop/mobile regression             | 90 passed; 10 intentionally skipped duplicate viewport-matrix cases                           |
| Final focused desktop/mobile checks                   | 4 passed after the final compact-layout change                                                |
| Local Worker preview requests                         | Passed: login/manifest 200; protected Workout/Programs 307 to configured local sign-in        |

Worker preview checks exercised the unauthenticated shell and configured canonical redirects; authenticated workout execution was tested in the Node desktop/mobile suite. They do not establish hosted Supabase connectivity.

The 10 skipped browser cases duplicate the same five viewport sizes and two system themes in the mobile project. The matrix executes in the desktop project at 375, 390, 430, 768 and 1440 px, in light and dark. All other desktop/mobile cases execute. The final focused run independently verifies calf-emphasis intent persistence, unbound starts, exact-slot Last Used/cross-client selection and that Start Workout is visible above mobile navigation. It captures the current review screenshots.

Behavior coverage includes equipment-independent exact grading, floor-ROM/close-grip distinctions, incline/fly grades, contextual priority and deduplication, deterministic ranking, explicit equipment filtering, full-library substitutions, selected state and carousel stability. Generation tests cover all body-part pairings/emphases, meaningful small-muscle intents, complementary balance, regional priorities, limited catalogs and supported emphasis menus. Registry checks validate every definition against existing catalog classifications and the exact SQL registry. Retained database/browser suites cover exact-exercise history/records, progression, RPE/RIR/failure, logging/drafts, continuity, concurrent sessions, ownership/privacy, program rotation and two-screen navigation.

The new database suite verifies three curl intents under one pattern, six initial slots, manual seventh-slot additions, protected immutable snapshots, empty actual performance, payload-bound retries, forged/duplicate intent rejection and cross-owner/closed-session denial. Existing ad-hoc editing, programme immutability and Start Blank tests continue to pass.

## Local environment recovery

An initial `db:reset` and all 1,791 database assertions passed. The final clean replay hit the small workspace disk limit while the CLI initialized optional service images. After moving temporary validation artifacts and restoring the real local Auth bootstrap/network, `supabase migration up` completed the application migration chain on the freshly recreated local database; database lint and all 1,791 assertions passed again against the final registry. No historical migration was edited to recover the environment.

BusyBox's local Auth health probe ignored proxy exclusions; a disposable-container-only wrapper disabled the proxy solely for its 127.0.0.1 health URL. External proxy policy was preserved. No such workaround belongs to application code or rollout. The final focused browser checks passed on this recovered local stack. Temporary module paths used during disk recovery were restored before the final production builds. Local Supabase was stopped after validation, retaining its disposable volume.

Initial browser expectations that forced lower compatibility grades into the compact carousel were updated to test those deliberate alternatives through See All; a case-sensitive catalog-text assertion was corrected. Final screenshot review caught an extra-row optional-label layout that hid the primary action behind mobile tabs; the labels/spacing were compacted and the explicit mobile button/navigation bounds check now passes. There are no unresolved test failures from these checks.

## Review images and limits

- [Mobile emphasis setup, light](images/movement-matching/quick-workout-light.png)
- [Mobile emphasis setup, dark](images/movement-matching/quick-workout-dark.png)
- [Program Pick and highlighted Last Used](images/movement-matching/last-used-mobile.png)

These are Chromium desktop/mobile emulation and synthetic local accounts. Physical iOS/Safari, native-device ergonomics and hosted deployment were not tested. Compatibility remains a coarse curated estimate; limited catalogs may return fewer intents, private exercises without curated refinements remain conservative, and some emphasis areas support only one meaningful intent before complementary filling. Last Used retains exact saved-slot identity; new ad-hoc sessions do not invent a cross-session preference model.

Apply `20261106163951_movement_intent_shells.sql` through the approved process before the app rollout. No new package, secret, binding or hosted configuration is needed. No hosted Supabase mutation, production deployment or merge was performed.
