# Focused workout mode validation

Scope: `refine/active-workout-mode-compression`, based on latest fetched merged main `21bf1e3` (PR #20). All runtime accounts and data are synthetic and local. No hosted SQL, remote configuration, merge or production deployment was performed.

## Executed checks

| Check                                    | Result                                                                    |
| ---------------------------------------- | ------------------------------------------------------------------------- |
| Fresh local application migration replay | Pass, complete ordered migration chain into a new isolated empty database |
| Database lint                            | Pass, public and body_private, no schema errors/warnings                  |
| Database behavior/security suite         | 1,845 assertions, 18 files passed                                         |
| Vitest                                   | 259 tests, 46 files passed                                                |
| ESLint and strict TypeScript             | Pass                                                                      |
| Catalog/program consistency              | 183 exercises; 12 programs, 46 training days, 205 slots passed            |
| Formatting and diff whitespace           | Pass                                                                      |
| Next.js production build                 | Pass                                                                      |
| OpenNext / Wrangler no-upload dry-run    | Pass                                                                      |
| Playwright desktop/mobile                | 96 distinct cases pass across full + targeted runs; 10 duplicates skipped |
| Local Worker representative requests     | Pass                                                                      |

Database validation preserves the existing local database and replays migrations into a separate empty validation database using the real local Auth/extensions schema definitions. The retained invariant suite therefore runs without synthetic browser records affecting its global-count assertions. No historical migration or real user data is changed. Docker uses the disposable local validation network. Auth's local health probe bypasses the environment proxy; these runtime accommodations are not application changes.

The restricted command sandbox returned empty stdout from Next.js's spawned TypeScript compiler. Running the same build with local runtime network access succeeded. The dependency layout was restored after browser validation so OpenNext could package native dependencies using its normal paths. The build retains the repository's existing middleware deprecation notice; no routing/infrastructure migration is bundled here.

The full browser run executed 94 passing cases and found two old settings-navigation selectors that still expected visible global tabs. After correcting those selectors, both defaults cases passed. The final focused/visual run passed 16 cases (including the ten viewport/theme matrix cases); an added short-screen fixture was then corrected and the six focused-mode cases passed across their final targeted runs (four timer/management cases plus two Home cases). All 96 distinct non-skipped cases are therefore covered by passing runs. Ten duplicate mobile-project viewport/theme cases are intentionally skipped because that matrix already runs in the desktop project at mobile/tablet/desktop dimensions. Earlier fixture/selector failures are not counted as successful runs.

The final local Worker preview used port 8788 because 8787 was occupied. Login and manifest returned 200; unauthenticated Workout and Programs returned the expected 307 canonical login redirects. Wrangler's request.cf metadata fetch used its local placeholder after an environment-network cancellation; the representative application requests succeeded. This smoke check does not claim authenticated hosted-provider connectivity.

## Coverage

The new SQL suite verifies authoritative paused time, payload-bound retries, CAS revision conflicts, owner isolation, exact column/function grants, no client duration/timestamp authority, passive/no-op behavior, verified selection/set auto-resume, explicit continuation, paused inactivity expiry, estimated recovery endpoints, ordinary paused closure and adjusted reliable-duration analytics. Legacy untracked sessions cannot create an indefinite manual pause.

Unit tests cover interval clipping/overlap/invalid timestamps, legacy duration compatibility, recovery previews, stale response rejection, action identity validation, uncertain transport retries, timer-panel tap behavior and one bounded owner-scoped history timing query with explicit failure handling.

The browser suite retains authentication, catalog, program execution/progression, exact-slot Last Used, logging types/units/defaults/manual overrides, optional effort/failure, draft/queue/conflict, history/records/recognition, ownership, continuity and two-screen navigation tests. Common helpers now open existing management/ending disclosures before accessing their controls; data assertions remain intact.

Focused browser cases verify five collapsed rows at 390 × 844, short-screen six-row scrolling, one carousel, natural titles, accessible status, no row editing controls, global navigation replacement, Back/resume, guarded End Workout, paused reload/second-client persistence, simultaneous resume conflict, auto-resume on saved logging, retained actual values/advanced controls, and blank/generated management without fabricated provenance. Layouts cover 375 × 667, 390 × 844, 430 × 932, 768 × 1024 and 1440 × 900, light/dark and reduced motion.

## Review screenshots

Final review images use synthetic local sessions; dynamic elapsed time comes from actual runtime.

| View                                                 | Screenshots                                                                                                                 |
| ---------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Workout Home, 390 × 844                              | [Light](images/active-workout-mode/home-390-light.png) · [Dark](images/active-workout-mode/home-390-dark.png)               |
| Workout Home, 375 px / desktop                       | [Small phone](images/active-workout-mode/home-375-light.png) · [Desktop](images/active-workout-mode/home-desktop-light.png) |
| Logger with suggestion and three set rows, 390 × 844 | [Light](images/active-workout-mode/logger-390-light.png) · [Dark](images/active-workout-mode/logger-390-dark.png)           |
| Logger, 375 × 667                                    | [Small phone](images/active-workout-mode/logger-375-light.png)                                                              |
| Paused timer panel                                   | [Mobile panel](images/active-workout-mode/paused-timer.png)                                                                 |

## Limits

- Chromium desktop/mobile emulation verifies responsive layouts; physical iOS/Safari keyboard, browser chrome and home-indicator behavior require device review. visualViewport/safe-area handling is implemented but not represented as physical-device certification.
- Cross-device timer updates refresh on focus/reload or the visible 30-second poll; this does not add Realtime infrastructure or offline synchronization.
- Ad-hoc cross-session same-intent Last Used is deferred. Existing exact program-slot provenance is reused; no ad-hoc history is fabricated.
- Inactivity expiration remains lazy on the next relevant request. Manual pause never extends its activity anchor. Idle gaps remain qualified and excluded from reliable-duration analytics using the existing rules.
- Shared use requires the new forward migration through the reviewed delivery process. Hosted connectivity, migrations and production behavior are not validated by local tests.
