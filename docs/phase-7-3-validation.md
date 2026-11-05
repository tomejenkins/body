# Phase 7.3 validation

## Scope and implementation

Direct program starts open the existing logger with all ordered movement placeholders. Selection is persisted per movement; Program Pick and qualifying exact-slot Last Choice precede deterministic compatibility-ranked alternatives. Match grades are independent of those priority labels. Inline search retains broader substitutions. Recorded/edited sets require explicit continuation and retain their original exercise identity. Cross-client replacement cannot silently discard an offline draft or move its values to a different exercise.

One forward migration, `20261105221401_in_workout_program_selection.sql`, adds owner-scoped immutable movement snapshots, guarded selection and start RPCs, remaining prescription identities, and derived qualifying last-choice reads. Earlier migrations, dependencies and Cloudflare configuration are unchanged. See [behavior and architecture](in-workout-exercise-selection.md).

## Executed checks

Validation uses disposable local Supabase and synthetic accounts only; no hosted SQL, migration push, remote history repair or production deployment was performed.

| Check                                  | Result                                         |
| -------------------------------------- | ---------------------------------------------- |
| Fresh local migration replay           | PASS                                           |
| Database lint, public and body_private | PASS, no warnings                              |
| pgTAP                                  | PASS: 1,687 assertions across 14 files         |
| ESLint                                 | PASS                                           |
| Strict TypeScript                      | PASS                                           |
| Vitest                                 | PASS: 180 tests across 40 files                |
| Formatting                             | PASS                                           |
| Exercise catalog consistency           | PASS: 183 exercises                            |
| Program catalog consistency            | PASS: 12 programs, 46 training days, 205 slots |
| Next.js production build               | PASS                                           |
| Playwright against Next.js production  | PASS: 66 desktop/mobile checks                 |

Browser coverage includes direct logger start, all four selectable grades, deterministic priority/deduplication, native mobile touch scrolling and tile sizing, refresh and second-client persistence, explicit continuation, exact-exercise defaults, qualifying historical last choice, offline draft recovery, and retained authentication/logging/history/records/navigation regressions. Light/dark screenshots and accessible control labels are covered in Chromium desktop/mobile emulation.

## Release prerequisites and limitations

Review and apply the single migration through the approved migration mechanism before releasing this app revision. Verify the correct project, backup/recovery readiness, integration automation and deployment permissions separately. No environment keys or dependencies are added. Existing dashboard-managed Worker variables and deployment settings remain intact.

Hosted migration state, live RLS/advisor results, physical-device Safari and real production routing were not verified. Mobile touch behavior was tested using Chromium device emulation, not physical hardware. Existing Next.js middleware deprecation remains a warning; changing the adapter/auth architecture is outside this feature.

This is the direct-start and in-workout-selection foundation. Calendar scheduling, full program creation/editing, activation management, automatic rotation/progression and community features remain deferred. Existing scheduled callers can use the start contract; this phase does not claim a scheduling UI. Catalog search returns bounded client pages but currently reuses a server catalog read; an exceptionally large catalog will need measured SQL search optimization. Archived/unavailable choices are not fabricated as selectable tiles. Unknown match context is labeled Check fit rather than assigned a misleading grade.
