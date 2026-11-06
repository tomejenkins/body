# Phase 7.4 validation

Base: `b4247a7`, merged PR #18. Branch: `feat/phase-7-4-program-progression`.

All database and browser fixtures use disposable local Supabase. Hosted SQL, remote migration deployment, production deployment and merge are excluded.

| Check                                             | Actual result                                                  |
| ------------------------------------------------- | -------------------------------------------------------------- |
| Fresh local migration replay                      | Passed                                                         |
| Database lint, public/body_private                | Passed, no warnings                                            |
| pgTAP                                             | 1,767 assertions across 16 files passed                        |
| ESLint                                            | Passed                                                         |
| Strict TypeScript                                 | Passed                                                         |
| Vitest                                            | 215 tests across 43 files passed                               |
| Formatting / diff whitespace                      | Passed                                                         |
| Catalog consistency                               | 183 exercises; 12 programs, 46 training days, 205 slots passed |
| Next.js production build                          | Passed                                                         |
| Full production Next.js Playwright desktop/mobile | 88 passed; 10 intentionally skipped duplicate visual cases     |
| Cloudflare/OpenNext build                         | Passed                                                         |
| Wrangler no-upload dry-run                        | Passed                                                         |
| Full local Workers Playwright desktop/mobile      | 88 passed; 10 intentionally skipped duplicate visual cases     |

The ten visual-matrix cases run once in the desktop project, covering five viewport sizes in both themes; the mobile project skips their exact duplicates. Functional tests execute in both projects. New progression browser coverage verifies exact-exercise/rule evidence, compact exact-match tiles, optional explicit load application, manual-weight preservation, persistence after refresh, prescribed outcomes and Programs progress. Retained suites exercise authentication/RLS, actual units, optional effort, PR dominance/exact reps, history/analytics, abandoned duration handling, stale tabs, drafts, substitutions and navigation.

New database cases cover three/four/eight/ten-position rotations, rest wrap, full/partial/abandoned sessions, retries, fixed-duration completion, program/version changes, source isolation, zero-rep/deleted-work recalculation, bodyweight/assisted exclusion and foreign-owner reads/writes. Pure tests cover all six typed strategies, rep boundaries, conservative estimation/rounding, optional/matching effort, high-effort holds, required prescription positions (including warm-up offsets), historical correction, insufficient/stale evidence and varied-target manual fallback.

An initial development-server full run recorded one Next.js router-initialization error while source files were being edited (87 passed, one failed, ten skipped). The stable production run above passed all 88 functional/visual cases without suppressing browser errors. Targeted new desktop/mobile flows also passed before the full run. Prescription-variation safeguards are covered by pure tests and the packaged Worker run. Storage-bound and higher-repetition guards passed the final pure-test/package check; the rebuilt Worker also passed both desktop/mobile progression smoke tests (2/2).

Deployment prerequisite: review/apply `20261106142736_program_progression_evidence.sql` after the existing migrations before releasing the app. No new dependencies, environment variables or Worker bindings. Verify hosted target/backup/recovery separately. Physical Safari/iOS and real-device safe areas are not established by Chromium emulation.

Known limits: recommendations use a recent 180-day / 24-session-per-exercise window, deliberately exclude bodyweight/assistance/duration loading, and decline blanket loading for mixed/varied prescriptions. Older pre-7.4 sessions retain their original unassigned history; assignment adherence starts with the first newly bound program execution. Complex per-set progression, calendar scheduling and editing remain deferred. No local automated check is blocked by Docker or credentials; hosted and physical-device verification are separate release checks.
