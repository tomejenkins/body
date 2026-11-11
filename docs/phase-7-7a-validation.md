# Phase 7.7A validation

## Source and boundaries

Branch `fix/phase-7-7a-invalid-completion`, based on latest merged main `33cefeb191a7e904f2e8a9456826e26d71b23955` (PR #34). Read AGENTS, installed Next client/redirect-error guidance, actual set action/RPC/trigger and draft contracts, Phase 7.6F/F.1 validation, footer/viewport behavior and current roadmap. No migration, hosted Supabase operation, infrastructure change, dependency update or deployment.

[Implementation and exact behavior](phase-7-7a-connectivity-hardening.md).

## Executed results

| Check                              | Actual result                                                                                                                                                                                                                                              |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Baseline reproduction              | Passed: one diagnostic case on unchanged merged-main production build, 4.4s. Missing load leaves checked/Not saved without completion request; zero/zero then persists completed; ten emulated viewport scroll events cause ten scrollIntoView calls.      |
| P1 unit checkpoint                 | Passed: 385 tests / 73 files before transport additions.                                                                                                                                                                                                   |
| Final Vitest                       | Passed: 387 tests / 75 files, including field/unit/bounds/bodyweight/correction, bounded keyboard visibility and rejected-transport confirmation/receipt tests.                                                                                            |
| P1 desktop/mobile checkpoint       | Passed: 13 tests / 1 intentional duplicate-matrix skip, 44.7s. Includes invalid values, explicit blank retention, delayed acknowledgement, repeated taps, server-action rejection/retry, completed correction, bodyweight/resistance and mobile stability. |
| Lifecycle/retention transport      | Passed: 8 desktop/mobile cases, 25.9s. Switch/archive before commit and after commit/lost acknowledgement; exact request identity, one transition, same receipt and retained confirmation.                                                                 |
| Set/closure connectivity probes    | Passed: 5 tests, 33.5s. Offline recovery, committed unacknowledged save, later-device conflict, pending refresh/repeated taps, failed Finish/Abandon.                                                                                                      |
| ESLint / strict TypeScript         | Passed on final application and tests.                                                                                                                                                                                                                     |
| Formatting                         | Passed: final repository Prettier check.                                                                                                                                                                                                                   |
| Exercise / program catalog         | Passed: 183 exercises; 12 programs / 46 training days / 205 slots.                                                                                                                                                                                         |
| Fresh isolated migration replay    | Passed: all immutable application migrations in task-owned `body_hardening_77a`, with the executor's schema-only managed bootstrap. No new migration.                                                                                                      |
| Fresh isolated pgTAP               | Passed: 2,308 assertions / 26 files, 15s.                                                                                                                                                                                                                  |
| Corrected standard db:test         | Passed: 2,308 assertions / 26 files, 12s, against the local fixture stack.                                                                                                                                                                                 |
| Database lint                      | Passed: public and body_private, no schema errors.                                                                                                                                                                                                         |
| Next production build              | Passed on final application source.                                                                                                                                                                                                                        |
| Full desktop/mobile regression     | 202 passed / 13 intentional skips / 1 screenshot artifact failure (ENOSPC), 11.7m. This run precedes final contrast and small validation/reset refinements; final affected rerun is recorded separately.                                                   |
| Final affected desktop/mobile      | Passed: 41 tests / 3 intentional duplicate-matrix skips, 2.6m, on final source. Includes all P1 cases, actual pending blanks, invalid-correction discard, contrast, Options, transport and six navigation cases.                                           |
| OpenNext / Wrangler / local Worker | Passed: final OpenNext/Next build and Wrangler no-upload dry-run; 16/16 local public/auth-boundary smoke requests and one retained public offline browser case. No hosted connectivity claim.                                                              |
| Dependency audit                   | 12 development/build/lint findings: 4 high, 8 moderate; production-only audit zero. No dependency changes.                                                                                                                                                 |

Counts above are separate executions, not an aggregated total. No result is inherited from PR #34.

## Failures investigated

- The first baseline capture could not start video because the Playwright ffmpeg download failed. The already installed system `/usr/bin/ffmpeg` was used through the expected local executable path; the corrected baseline ran successfully. No repository dependency was added.
- An initial build inside the restricted process sandbox could not parse TypeScript worker output. The same build outside that process sandbox passed. No compiler option was relaxed.
- The first P1 run was stopped after two invalid-input fixture failures and a stalled mobile case. The weight fixture treated 100,001 **lb** as exceeding 100,000 **kg**; it now uses 220,463 lb. The mobile test selected a dialog panel rather than the fixed controls; its selector was corrected.
- A subsequent P1 run had 6 passes / 3 failures / 1 skip. It exposed the real pending-acknowledgement suggestion issue: cleared reps returned as suggested reps on a later iteration. The response handling was corrected and a dedicated actual-database regression added. The final checkpoint passed all 13 cases with one duplicate skip.
- Initial transport unit verification failed because React reset the confirmation checkbox after a resolved error state. Forms now prevent that reset; both unit cases and actual browser retries pass. A test-only Testing Library option was corrected without casts or compiler relaxation.
- The first standard runner selected the correct 26 files but failed two initial-schema global volume/cascade assertions due to unrelated pre-existing local workouts. Scoping those assertions to their fixture owner preserves their purpose. Both final runners pass.
- The initial broad browser run was stopped after new switch assertions matched both the form error and Next's route announcer. Scoping to the lifecycle form fixed the test; the eight focused transport cases pass. No application error/redirect assertion was removed.

The broad run's navigation failure was `ENOSPC` at `info.outputPath` while creating a screenshot directory, not a failed navigation/data assertion. Its missing failure artifacts have the same cause. Completed captures were preserved in `/tmp`; final affected captures use that storage from the start. The final presentation pass uses the existing theme-aware danger token for readable dark feedback and validates its measured text contrast. A final correction also validates effort constraints before changing Done intent and clears field feedback when accepting a conflicting saved version. The full 387-test/75-file unit suite was rerun on this final source and passed (116.61s); the 41-case affected browser run also passed. The earlier complete browser count is not attributed to these later changes.

## Reproduction

Use Node 24 and the committed dependency lockfile. Disposable local Supabase/Auth/Mailpit only. The existing auth helper refuses hosted targets. Commands executed from repository root include:

```sh
npm run build
npm run lint
npm run typecheck
npm test
npm run catalog:check
npm run programs:check
npm run db:test
npm run db:lint
# Production app server and ignored local public fixture configuration loaded:
PLAYWRIGHT_BASE_URL=http://127.0.0.1:3000 npm run test:e2e -- invalid-set-completion
PLAYWRIGHT_BASE_URL=http://127.0.0.1:3000 npm run test:e2e -- action-transport-recovery
BODY_EXPECT_RETRY_FIX=1 PLAYWRIGHT_BASE_URL=http://127.0.0.1:3000 \
  npm run test:e2e -- --config playwright.audit.config.ts \
  logging-reliability uncertain-save closure-network
PLAYWRIGHT_BASE_URL=http://127.0.0.1:3000 npm run test:e2e
```

The executor supplied `/usr/bin/chromium` through `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`. Fresh replay was into a separate task-owned local database, not a reset of the main browser fixture database. Explicit isolated TAP invocation:

```sh
docker run --rm --network supabase_network_body \
  -e PGPASSWORD=postgres \
  --mount type=bind,src="$PWD/supabase/tests/database",dst=/tests,readonly \
  --entrypoint /bin/sh ghcr.io/supabase/pg_prove:3.36 \
  -c 'pg_prove --host supabase_db_body --username postgres --dbname body_hardening_77a /tests/*.sql'
```

This password is the disposable local default, not a hosted credential. Bootstrap/replay scripts must never be pointed at a hosted target.

## Stability evidence and interpretation

The mobile test uses real local workouts and authoritative mutations at 375, 390 and 430 CSS pixels, light/dark, multiple sets and expanded Options, reduced motion, a 4× CPU throttle and 150ms CDP latency with bounded bandwidth. It settles the first feedback insertion, then measures six repeated invalid clicks: page scroll, focused element, fixed-footer rectangle, layout-shift events and scrollIntoView calls. A separate synthetic visual-viewport event storm exercises keyboard-sized inset reporting. This is reproducible emulation, not a physical keyboard or cellular-network test.

All six settled width/theme cells measured zero repeated layout shifts, zero scroll delta, zero repeated recentering calls and an unchanged footer rectangle/focused element. Ten synthetic viewport scroll events caused zero scrollIntoView calls; coalesced resize caused one. Final text contrast measured 6.18:1 in light and 8.99:1 in dark across every width. One feedback insertion may increase row height. The acceptance check is stable repeated validation, not a claim of zero layout change when text first appears. Valid completion remains unchecked and Saving while acknowledgement is held, even after the local database has committed; only delivery confirms the checkmark/collapse. Server rejection and network failure retain input and original retry commands.

The baseline trace and sampled logger video frames were reviewed; they establish the checkbox/error changes and explicit repeated-scroll calls, not a physical native shaking reproduction. Final light/dark feedback screenshots were visually reviewed.

- [Before: checked invalid set and generic error](evidence/phase-7-7a/before-invalid-completion.png)
- [After: 375 light feedback](evidence/phase-7-7a/feedback-375-light-mobile.png)
- [After: 390 dark feedback](evidence/phase-7-7a/feedback-390-dark-mobile.png)
- [After: 430 light feedback](evidence/phase-7-7a/feedback-430-light-mobile.png)
- [Expanded Options and stable invalid feedback](evidence/phase-7-7a/invalid-390-dark-mobile.png)
- [Confirmed valid completion](evidence/phase-7-7a/valid-completion-mobile.png)
- [Baseline numeric evidence](evidence/phase-7-7a/baseline-metrics.json)
- [Final stability measurements](evidence/phase-7-7a/stability-metrics.json) · [Contrast measurements](evidence/phase-7-7a/contrast.json)
- [Full browser run and storage failure](evidence/phase-7-7a/browser-final.txt) · [Final affected rerun](evidence/phase-7-7a/affected-final.txt)
- [Final unit execution](evidence/phase-7-7a/unit-delivery.txt) · [Fresh pgTAP](evidence/phase-7-7a/pgtap-fresh.txt) · [Corrected standard runner](evidence/phase-7-7a/db-test-fixed.txt)

Raw authenticated Playwright traces/videos, request bodies, session cookies, test inboxes, stack logs and environment values are excluded from committed evidence.

## Limitations and release requirements

Physical iPhone Safari/PWA, native keyboard open/close, VoiceOver, Android/TalkBack, Dynamic Type and real network/hosted-region testing are **not verified**. The software defects and repeat-scroll path are confirmed locally; the precise native iPhone shaking mechanism is not claimed reproduced. A focused input or emulated viewport is not a native-keyboard screenshot.

The managed environment uses local-only container startup workarounds and temporary dependency/build relocation for disk limits; these are not application settings. Supabase changelog access was denied by the managed proxy (CONNECT 403 / HTTP 000). No new SDK API is used.

No historical measurements/classifications are rewritten. No migration rollout is required. Older/direct RPC callers retain the existing zero-inclusive storage contract; shared eligibility still excludes nonqualifying training. Pending automatic rows may still show suggestions on a fresh load under the existing contract; explicit blanks are preserved in the mounted acknowledgement path, not stored as a new preference. Offline storage remains tab-scoped sessionStorage; no durability/automatic replay claim is added.

Build-tool advisories, physical-device confirmation and the existing Auth/email/monitoring/privacy/recovery and MVP feature gates remain open. Nothing here is an MVP launch sign-off.
