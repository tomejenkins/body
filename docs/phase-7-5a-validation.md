# Phase 7.5A validation

Branch: feat/phase-7-5a-adaptive-scheduling. Base: latest fetched main `25a6581` (merged PR #21). Migration: `20261106220839_adaptive_program_scheduling.sql`. Prior migrations remain immutable.

## Results

All runtime users/data are synthetic and local. No hosted SQL, production infrastructure, merge or deployment is performed.

| Check                                | Executed result                                                                                                                       |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------- |
| Fresh local migration replay         | Complete ordered chain into a new empty isolated validation database; pass                                                            |
| Database lint                        | Public/body_private; no errors or warnings                                                                                            |
| pgTAP                                | 1,945 assertions across 19 files; pass (100 scheduling assertions)                                                                    |
| Supabase local advisors              | Executed; only two existing multiple-permissive-policy performance notices on programs/program_versions owner/catalog SELECT policies |
| Vitest                               | 269 tests across 49 files; pass                                                                                                       |
| Strict TypeScript / ESLint           | Pass                                                                                                                                  |
| Formatting / diff whitespace         | Pass                                                                                                                                  |
| Catalog consistency                  | 183 exercises; pass                                                                                                                   |
| Program consistency                  | 12 programs, 46 training days, 205 slots; pass                                                                                        |
| Next.js production build             | Pass, including the final calendar UI                                                                                                 |
| OpenNext build                       | Pass                                                                                                                                  |
| Wrangler no-upload dry-run           | Pass; no deployment                                                                                                                   |
| Playwright full desktop/mobile suite | 102 passed, 10 intentionally skipped duplicate viewport cases; 5.6 minutes                                                            |
| Final scheduling/browser rerun       | All six cases passed against the final production UI; 19.9 seconds                                                                    |
| Current local Worker smoke           | Login/manifest 200; Programs, dated Programs and Workout return expected unauthenticated 307 redirects to canonical local login       |

The ten skips repeat the viewport/theme matrix in the mobile project; the matrix already executes at 375, 390, 430, 768 and 1440 px in light/dark in the desktop project. All other desktop and mobile cases execute. A late-repeat historical-marker refinement was subsequently verified by the final fresh migration replay and all database suites; application bundle/API signatures were unchanged. No failed check is treated as passed.

The retained middleware deprecation notice remains. Wrangler's request.cf metadata fetch used its local placeholder after an environment-network cancellation; representative application requests succeeded. Worker smoke checks do not claim authenticated hosted-provider connectivity. Temporary dependency storage was restored to the normal repository layout for OpenNext packaging; local Docker/database accommodations do not change application configuration or hosted resources.

## Coverage and fixtures

The scheduling database suite covers explicit/legacy initialization; full, partial, abandoned, empty and corrected progress; missed and late training; extra rest and returning after a week; 3/4/7/8/10-position cycles; complete rotations; out-of-order gaps; fixed-duration completion; original due snapshots; bounded distant/month/year windows; owner isolation; command retries/conflicts; protected fields and role grants; timezone changes/default stability; midnight and both DST transitions; minimum rest and distinct recovery labels. Existing program execution, progression, set, continuity, pause and security suites remain in the run.

Date/history fixtures use privileged writes only within rolled-back disposable local tests or validated local-only browser fixtures. No production clock override or correction endpoint exists. Fresh migration replay uses a new isolated empty local database with real Auth/extension schema definitions; existing browser data and validation databases are preserved. Live Supabase docs were blocked by the environment's destination policy; the pinned CLI/repository conventions and actual PostgreSQL replay/lint/role tests provide verification.

Browser tests exercise explicit scheduling setup, confirmation/device timezone assistance, seven dates, carried-forward/overdue training, ordinary logger completion, actual-date markers, rest, next recommendation, adjacent weeks, keyboard navigation, mobile/desktop light/dark widths, partials, cross-owner privacy and concurrent configuration/idempotency. The retained browser suite runs separately from privileged fixture manipulations.

## Screenshots

Screenshots capture synthetic local data at the stated widths. Fixed global navigation/resume chrome remains visible on mobile; the calendar scrolls within the existing safe-area layout.

| Scenario                                                             | Screenshot                                                             |
| -------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Original overdue date plus actual completed date and subsequent rest | [Mobile completion](images/adaptive-scheduling/calendar-completed.png) |
| Carried-forward recommendation, seven dates, 390 px light            | [Mobile light](images/adaptive-scheduling/calendar-390-light.png)      |
| Carried-forward recommendation, 390 px dark                          | [Mobile dark](images/adaptive-scheduling/calendar-390-dark.png)        |
| Seven-column desktop, 1440 px light                                  | [Desktop light](images/adaptive-scheduling/calendar-1440-light.png)    |
| Seven-column desktop, 1440 px dark                                   | [Desktop dark](images/adaptive-scheduling/calendar-1440-dark.png)      |

## Rollout prerequisites and limits

Apply the reviewed forward migration before using this app revision against a shared database. Confirm existing automatic migration/deployment safety remains in place; this work does not enable an alternate deployment path. Legacy calendars require explicit today/future initialization, and assignments keep their timezone. New assignments can use the previously confirmed scheduling preference. No historical attendance is backfilled.

See [architecture and policies](adaptive-program-scheduling.md) for the deliberate partial-workout change on configured assignments, calendar-day minimum-rest guidance, immutable assignment timezone and future override/favorite contracts. Chromium mobile emulation is not physical iOS/Safari keyboard certification. Hosted connectivity and production rollout are separate verification tasks.
