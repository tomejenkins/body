# Phase 7.5C validation

Base: main `05e28cc` (merged PR #24). Branch: `feat/phase-7-5c-dashboard-calendar`. Local validation: 9 November 2026.

## Executed checks

| Check                                 | Actual result                                                                                                              |
| ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| ESLint                                | Passed                                                                                                                     |
| Strict TypeScript / route generation  | Passed                                                                                                                     |
| Vitest                                | 292 passed, 55 files; focused model/query and final SVG/keyboard follow-ups also passed                                    |
| Formatting                            | Passed                                                                                                                     |
| Exercise catalog                      | Passed: 183 exercises                                                                                                      |
| Program catalog                       | Passed: 12 programs, 46 training days, 205 slots                                                                           |
| Database lint                         | Passed, no public/body_private schema errors                                                                               |
| Retained pgTAP regression suite       | 2,067 passed, 21 files, on isolated local `body_entry_validation`                                                          |
| New migration / fresh replay          | Not required: no database definition or scheduling logic changes; retained tests use the existing isolated replay database |
| Next.js production build              | Passed                                                                                                                     |
| Full Playwright desktop/mobile        | 126 passed; 10 intentional duplicate-viewport skips                                                                        |
| Affected calendar/setup browser rerun | 22 passed after identity/invalidation refinements                                                                          |
| Final Dashboard browser rerun         | 10 passed after SVG/keyboard refinement                                                                                    |
| OpenNext / Cloudflare build           | Passed                                                                                                                     |
| Wrangler no-upload dry-run            | Passed                                                                                                                     |
| Local Worker requests                 | Passed: login/manifest 200; Dashboard/week/Workout/Programs 307 to configured local login                                  |

The widget reuses `program_schedule` and `startSelection`/`start_assigned_workout`, with no new scheduling or workout engine. Existing database tests continue to cover owner/anonymous/service grants, assignments, immutable versions/source snapshots, nonweekly progression, partial/abandoned/empty evidence, decisions, retries/concurrency, Favorites, date/timezone/DST and historical preservation.

New unit coverage verifies Monday/year/DST boundaries, invalid URL dates, fixed-zone actual completion membership, nullable independent assignment identity, deterministic multiple-event ordering, cursor/revision start fields, completed/archived/unconfigured guards, authenticated bounded query shape, provider errors, selected-versus-today accessibility and keyboard movement. The independent-history query excludes current-program rows already represented by SQL, returns at most 201 summaries and never reads sets/catalogs.

New real-Auth browser scenarios exercise carried-forward Workout 2, exact assignment/day/rotation after a direct one-tap start, no historical/future start, owner history links, Programs agreement, all seven comfortable targets at 375×667/390×844/430×932/768/desktop, light/dark/reduced motion, keyboard date selection, stale decisions, another device's active session, partial+acceptance+skip+defer+independent Favorite on one date, no automatic Favorite progression, no-program and explicit configuration states, actual fixed-program completion/archival, an eight-day rotation, assignment-local today, year transition and browser Back.

Initial focused runs exposed test-fixture issues: historical clock adjustment needed to move effective endpoints with finish time to satisfy the existing continuity constraint, and a year-boundary assertion needed to await the route loading state. Both were corrected without weakening production constraints or adding a production clock override. All timestamp setup is restricted to disposable local Docker accounts.

Local Worker preview used a placeholder when remote `Request.cf` metadata could not be fetched; representative local requests passed. These checks establish local artifact compatibility, not hosted authentication. The disposable Supabase stack was stopped after database/browser checks.

## Screenshots

Synthetic local fixtures only. Final production-build captures include portable SVG decision indicators and the keyboard-focusable multi-event detail surface.

- Full Dashboard: [mobile](images/dashboard-training-calendar/mobile-dashboard-page-390.png), [desktop](images/dashboard-training-calendar/desktop-dashboard-page-1440.png).
- Week: [mobile light](images/dashboard-training-calendar/mobile-dashboard-week-390-light.png), [mobile dark](images/dashboard-training-calendar/mobile-dashboard-week-390-dark.png), [desktop light](images/dashboard-training-calendar/desktop-dashboard-week-1440-light.png), [desktop dark](images/dashboard-training-calendar/desktop-dashboard-week-1440-dark.png).
- [Selected rest date distinct from today](images/dashboard-training-calendar/mobile-dashboard-selected-rest.png).
- [Multiple partial/decision/independent events](images/dashboard-training-calendar/mobile-dashboard-multiple-events.png).
- [Active-session Resume](images/dashboard-training-calendar/mobile-dashboard-resume.png).
- [No-program state](images/dashboard-training-calendar/mobile-dashboard-empty.png).
- [Unconfigured assignment](images/dashboard-training-calendar/mobile-dashboard-unconfigured.png).

## Rollout and limits

No migration is introduced. Previously merged Phase 7.5A/7.5B/7.5B.1 migrations must be present before this app version runs. Review and release through the existing process; no hosted database operation, migration push, deployment, infrastructure change or merge was performed. Supabase preview disablement remains unchanged.

The Dashboard does not poll or subscribe to realtime updates: navigation/refresh gets fresh authoritative dates/facts, and starts revalidate under the existing database locks. Supplemental weekly history is capped at 200 summaries with an explicit overflow note. Its completion date uses the assignment timezone, while the retained Recent training list still displays session start time. Physical iOS/Safari, physical-device screen readers and hosted-provider authentication were not verified. Supabase live documentation remains blocked by the environment's destination policy; existing pinned contracts and local regressions were used. See [architecture, source contracts and behavior](dashboard-training-calendar.md).
