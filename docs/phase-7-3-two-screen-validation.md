# Phase 7.3 two-screen amendment

PR #16 was already merged when this amendment began. Work is based on that merged main (`c0718a0`) on `feat/phase-7-3-two-screen-workout`, rather than rewriting the merged branch.

## Behavior and architecture

- Start/resume targets Workout Home (`/workout/[id]`). Home shows ordered movement/exercise cards, saved status with icon/text, overall completion, elapsed-session duration, Add exercises, and guarded Finish/Abandon actions. Only one program carousel can be expanded.
- Selecting a persisted program tile opens one focused Exercise Logger (`?exercise=<selection UUID>`). Ad-hoc cards open the same logger; its compact navigation strip switches among existing added exercises without substituting identities. The logger retains set inputs, prescriptions, failure/effort controls, instructions and existing illustrations.
- Back does not finish an exercise. One shared component owns the existing save queue, revision/nonces, authoritative rows and tab-local draft recovery across both URL-addressable screens. Dirty/failed/pending drafts can return Home but continue to block closure and unsafe substitutions. Unknown/foreign entry IDs expose no logger.
- Program status aggregates saved qualifying positive working/drop/rest-pause actual sets across preserved continuations against working targets. Warm-ups, deleted, unconfirmed, zero-rep and unsupported measurements do not count. Unprescribed ad-hoc completion requires the persisted exercise state. Viewing or editing a draft never marks a movement complete.
- Earlier continuation exercises remain individually accessible from Home. Exercise details and Look Back verify owner/session/exercise/selection context before returning to that logger. Existing builder filter navigation is preserved.
- The clock is labeled elapsed session, not verified training duration. Passive rendering/navigation creates no activity evidence. The optional 180 ms entrance effect respects reduced motion.

No additional migration, database function/grant change, dependency, environment key or Cloudflare configuration change is introduced. Existing substitution, history, record, unit and duration contracts remain authoritative. See [execution architecture](in-workout-exercise-selection.md).

## Validation

Results below cover the final amendment. Tests use disposable local Supabase/Auth and synthetic users, not hosted data.

| Check                                       | Result                                                        |
| ------------------------------------------- | ------------------------------------------------------------- |
| Fresh local migration replay                | PASS                                                          |
| Database lint                               | PASS, no warnings                                             |
| pgTAP                                       | PASS: 1,687 assertions, 14 files                              |
| ESLint                                      | PASS                                                          |
| Strict TypeScript                           | PASS                                                          |
| Vitest                                      | PASS: 188 tests, 41 files                                     |
| Formatting and git whitespace               | PASS                                                          |
| Catalog consistency                         | PASS: 183 exercises; 12 programs, 46 training days, 205 slots |
| Next.js production build                    | PASS                                                          |
| Next.js desktop/mobile Playwright           | PASS: 72 checks                                               |
| Cloudflare Worker desktop/mobile Playwright | PASS: 72 checks                                               |
| Cloudflare/OpenNext build                   | PASS                                                          |
| Wrangler no-upload dry-run                  | PASS                                                          |

Both complete runtime suites passed 72 checks after the hydration-focus correction. Final ad-hoc reorder button boundaries use the full workout order rather than the single focused row. After that final ordering adjustment, targeted screen checks passed 6/6 on the rebuilt Next.js runtime and 6/6 on the rebuilt Worker, including two-entry strip navigation and moving the second exercise before returning Home. Both final builds, lint/types/format checks and the Worker dry-run passed; no assertions or timeouts were relaxed.

Browser coverage includes starting/resuming Home, one-card accordion expansion/collapse, tile selection and focused URLs, incomplete Back, saved progress states, refresh, original exercise identity after continuation, exact-slot last choice, multiple clients/stale mutations, foreign selection IDs, offline draft recovery, instructions/context navigation, mobile touch scrolling, light/dark and reduced motion. Existing authentication, effort, logging, continuity, PR/history/analytics and PR #11 builder navigation regressions are retained.

An initial database run against leftover browser-fixture data failed two baseline whole-database invariants. Fresh disposable-local migration replay followed by database lint and all 1,687 pgTAP assertions passed. No schema change or invariant weakening was needed. An initial new browser test captured the URL before the start redirect completed; it now waits for the actual Workout Home URL. The full regression run also caught a missing ad-hoc Home thumbnail; the existing visual was restored before final validation. Worker checks exposed initial-hydration focus/scroll timing that could interrupt a quick Finish click; focus restoration now runs before paint on screen changes only, never as a late initial-mount scroll. One Worker login also exceeded the original five-second redirect assertion during local resource contention.

## Release and manual checks

The existing Phase 7.3 execution migration must already be present before this revision runs; this amendment adds none. No hosted SQL, migration push, deployment or merge is performed. Review the app change through the normal PR/release process. Confirm real mobile Safari behavior separately: browser checks use desktop and mobile Chromium emulation. Hosted project security advisors, actual production routing and physical-device behavior are outside local verification.

No calendar scheduler, program editor, activation manager, automatic progression, new video library or offline synchronization is introduced. Existing static illustrations and saved instruction snapshots are used where available. Tab-local unsaved drafts remain recovery inputs, not cross-device persisted performance.
