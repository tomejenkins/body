# Phase 7.5B validation

Validated locally on 9 November 2026 against main `9537aa9`, branch `feat/phase-7-5b-workout-selection-favorites`.

## Result

Recommendation-first starts, explicit alternative/repeat identities, partial acceptance, confirmed skip, defer/replacement/cancellation and independent source-aware Favorites extend the existing assignment cursor and logger. Actual performance, incomplete classifications, immutable source snapshots, continuity and historical clocks remain authoritative. See [architecture and contracts](workout-selection-and-favorites.md).

## Executed checks

| Check                                    | Actual result                                                                                                                               |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| ESLint                                   | Passed                                                                                                                                      |
| Strict TypeScript / Next route types     | Passed                                                                                                                                      |
| Vitest                                   | 277 passed, 51 files                                                                                                                        |
| Prettier                                 | Passed                                                                                                                                      |
| Exercise catalog                         | Passed: 183 exercises                                                                                                                       |
| Program catalog                          | Passed: 12 programs, 46 training days, 205 slots                                                                                            |
| Fresh local migration replay             | Passed: all forward migrations into new isolated `body_selection_validation_release`, using the local stack's real Auth/extension bootstrap |
| pgTAP on fresh replay                    | 2,036 passed, 20 files                                                                                                                      |
| Local database lint, public/body_private | Passed, no schema errors                                                                                                                    |
| Local database advisors                  | Two pre-existing multiple-permissive-SELECT-policy performance warnings on programs/program_versions; no new finding                        |
| Next.js production build                 | Passed                                                                                                                                      |
| Full Playwright desktop/mobile           | 110 passed; 10 intentional duplicate-viewport skips                                                                                         |
| Final-build new-flow Playwright rerun    | 8 passed                                                                                                                                    |
| OpenNext/Cloudflare build                | Passed                                                                                                                                      |
| Wrangler no-upload dry-run               | Passed                                                                                                                                      |
| Local Worker requests                    | Passed: login/manifest 200; protected Workout/Programs 307 to configured local login                                                        |

Browser tests use real local Supabase Auth/RLS and production Next.js. Coverage includes source IDs, pending gaps after alternative/repeat completion, partial/skip/defer and stale/concurrent decisions, independent Favorite starts with empty actuals, normal movement/logging/history, rename/archive, responsive widths 375/390/430/768/1440, system themes, semantic controls, and closed-session progression evidence (3×12 versus 12/10/9). Retained suites cover keyboard/accessibility, continuity, logger queues, history and program scheduling. Database tests cover cross-owner/anonymous/service denial, protected snapshot writes, source retirement, qualifying actuals, nonweekly rotations, bounded Favorite restoration and idempotent/concurrent starts/decisions.

Initial focused test runs found a fixture missing a required progression-rule name; the fixture was corrected and both progression cases passed before the full suite. No production progression cutoff change was necessary.

Local Worker emulation warned that remote `Request.cf` metadata could not be fetched and used a placeholder; representative requests still passed. This is local compatibility verification, not hosted authentication validation.

## Screenshots

Synthetic local fixtures only. These are review artifacts, not user records.

- Recommendation: [mobile light](images/workout-selection-favorites/recommended-390-light.png), [mobile dark](images/workout-selection-favorites/recommended-390-dark.png), [desktop light](images/workout-selection-favorites/recommended-1440-light.png), [desktop dark](images/workout-selection-favorites/recommended-1440-dark.png).
- Alternatives: [mobile light](images/workout-selection-favorites/alternatives-390-light.png), [mobile dark](images/workout-selection-favorites/alternatives-390-dark.png), [desktop light](images/workout-selection-favorites/alternatives-1440-light.png), [desktop dark](images/workout-selection-favorites/alternatives-1440-dark.png).
- [Your Favorites](images/workout-selection-favorites/favorites.png).
- [Partial acceptance](images/workout-selection-favorites/partial-acceptance.png).
- [Defer and confirmed skip controls](images/workout-selection-favorites/defer-skip.png).
- [Updated decisions calendar](images/workout-selection-favorites/decisions-calendar.png).

## Migration and rollout prerequisites

One new forward migration: `20261109155417_workout_selection_decisions_favorites.sql`. It adds two owner-private RLS tables, protected Favorite session inputs/snapshots, indexes, validated invoker functions/triggers and explicit grants. No older migration, production set/PR data or assignment identity is rewritten. Apply the reviewed migration before serving the new app code. Review database integration status and verify it on an explicitly authorized development target before production rollout.

No hosted SQL, hosted migration push, production deployment, merge, new secrets or paid services were performed. Repository-wide Supabase preview disablement remains intact. Fresh replay used a new disposable database rather than resetting existing local history. The stack was stopped after browser/database validation.

## Limits

Physical iOS/Safari, hosted authentication and remote infrastructure were not tested. The environment blocked live Supabase documentation fetches; pinned CLI/local database verification completed. Favorite list capacity is 100 active items; structural editing and automatic program linking remain excluded. Original overdue dates remain informational alongside explicit defer events. Dashboard weekly tiles, polished completion, Feed/social, billing and premium builders are later phases.
