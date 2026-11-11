# Phase 7.6F.1 validation

## Source and boundaries

Fetched latest main at `8fa756a336695c72771cae9f2065d9b0af1e5222` (PR #33). Branch: `feat/phase-7-6f-1-logger-simplification`. Reviewed repository instructions, installed Next client-boundary guidance, prior workout-flow/interaction/connectivity architecture, actual effort SQL/model/Profile preference and the current MVP roadmap before implementation.

The presentation uses existing logger draft sequences, authoritative returned rows, native Options disclosures and Home's `expanded` movement ID. No migration, schema/grant/RPC, dependency, set-command payload, queue/retry algorithm, PR/eligibility, program lifecycle or fixed-footer behavior changes. Superset Support is a required future MVP roadmap item only; there is no Superset implementation or placeholder.

## Executed checks

| Check                                       | Actual result                                                                                                                                                  |
| ------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ESLint                                      | Passed on current source/tests                                                                                                                                 |
| Strict TypeScript                           | Passed on current source/tests                                                                                                                                 |
| Vitest                                      | Passed on final source: 357 tests / 71 files, including four optional-effort/independent-failure and three focus-preservation tests                            |
| Formatting                                  | Passed: final repository Prettier check                                                                                                                        |
| Exercise catalog                            | Passed: 183 exercises                                                                                                                                          |
| Program catalog                             | Passed: 12 programs / 46 days / 205 slots                                                                                                                      |
| Fresh isolated replay                       | Passed: all existing immutable migrations into `body_logger_ux_76f1`; no migration added                                                                       |
| Explicit valid pgTAP suite                  | Passed: 2,308 assertions / 26 files, 14s                                                                                                                       |
| Database lint                               | Passed: public and body_private, no schema errors                                                                                                              |
| Next production build                       | Passed; existing adapter-compatible middleware deprecation retained                                                                                            |
| Initial focused desktop/mobile              | 19 passed / 2 failed / 1 intentional duplicate-matrix skip (3.2m); failures were premature enumeration of dynamic logger rows in the new Home fixture          |
| Corrected Home + visual checks              | Passed: 3 tests / 1 intentional duplicate-matrix skip (29.2s)                                                                                                  |
| Full desktop/mobile regression              | Passed: 180 tests / 12 intentional duplicate-matrix skips (11.4m), before the final display/focus refinements                                                  |
| Final affected display checks               | Passed: fresh production build, 21 desktop/mobile tests / 1 duplicate-matrix skip (1.4m); final native focus helper additionally passed 2 desktop/mobile cases |
| OpenNext/Cloudflare production build        | Passed on final focus-safe source; includes a fresh Next production build                                                                                      |
| Wrangler no-upload dry-run                  | Passed on final package; no upload                                                                                                                             |
| Local Worker smoke / public offline browser | Passed: 16/16 public/auth-boundary requests and retained public-only offline browser case; no hosted authenticated-connectivity claim                          |

The initial Home fixture called `.all()` before the selection response finished navigating, so it sometimes enumerated zero set rows and waited for a Next button that could never appear. The correction waits for the actual Exercise Logger and three prescribed rows before interacting. No production navigation or completion guard was changed to satisfy that test.

A test-only strict-type error in the new focus probe used an element interface where Playwright expects a tag-name generic. Using literal `"details"` inference fixed it without casts or relaxed checks; final strict types and packaging were rerun.

A final native Chromium probe showed that setting `details.open=false` leaves an inner select as the active element. The added shipping focus helper closes the panel and moves only that hidden focus to its visible summary; it never steals focus from another row. Three unit cases pass, and two desktop/mobile browser cases execute the actual imported helper rather than a duplicate policy. The helper is invoked only after the already-tested completion guards.

The later display refinements only label an unrated effort control with its selected RPE/RIR scale and expose existing `0/N` targets on unselected prescribed movements. Their final build/affected test counts are reported separately from the earlier complete run; no previous result is silently attributed to changed source.

## Functional evidence

`tests/e2e/logger-simplification.spec.ts` exercises real local Supabase sessions and saved sets:

- Hold the response **after** committing a completion. Options remains open and Saving remains visible until acknowledgement; only its own row collapses afterward. Other open rows stay open, actual inputs/checkmark remain, manual reopen and later ordinary edits stay available, and refresh reconstructs saved values.
- Disconnect before completion. Exact draft values remain, status is Not saved, error/retry/discard are accessible and Options stays open. Reconnection does not replay the write; explicit retry confirms before collapse.
- Close/reopen Options while an older completion response is held. The newer interaction survives acknowledgement.
- Edit the weight while an older completion response is held. The old saved value remains authoritative until the newer retained input is deliberately saved; neither its panel nor its input is overwritten by the old response.
- Complete one program movement, partially train another, leave the remaining movements unstarted, and return via Next Exercise. The exact Home/session, selected names, full/partial/unstarted status and working-set counts remain. All movement carousels close; manual expansion still works. Session identity/timing/source fields, item identities/status and assignment rows remain unchanged by Next.
- Exercise compact options and help at 375, 390 and 430 CSS pixels in light/dark, outside/Escape dismissal, help-trigger focus return, 200% root text and focused mobile input.

The retained advanced-effort browser tests still verify independent RIR 0 / RPE 10 / explicit failure, no scale conversion, historical reload/history, Profile preference, copied/new-set effort reset, failed effort drafts, revision conflict and warm-up restrictions. Test helpers now deliberately open Record effort / More effort options because those controls are intentionally secondary; the actual persistence/eligibility assertions are retained. Workout-mode coverage explicitly verifies that the failure checkbox is absent from ordinary Options and available through the rare action.

The three final-source Phase 7.6F reliability probes also passed (10.9s): offline recovery, committed-but-unacknowledged retry, pending refresh/repeated taps, exact mutation identity and later-device conflict protection. These runs are separate, not combined counts.

The full regression retains smart defaults, set ordering/deletion, same-session navigation, Add Set, timers/pause, closure/two-tap abandon, calendar/decisions, Favorites, PR/recognition, retention and Program History. Phase 7.6F uncertain-save UUID and remote-conflict audit probes are also rerun separately on final source; no offline queue is introduced.

## Database method

No hosted Supabase was accessed. Use the pinned local CLI and disposable synthetic users. Fresh replay used the executor's schema-only managed bootstrap, then every application migration in sorted order. After preserving results, the task-owned isolated database was removed to stay within storage limits. The main local fixture database is not reset or mistaken for a clean pgTAP target.

The explicit test invocation was:

```sh
docker run --rm --network supabase_network_body \
  -e PGPASSWORD=postgres \
  --mount type=bind,src="$PWD/supabase/tests/database",dst=/tests,readonly \
  --entrypoint /bin/sh ghcr.io/supabase/pg_prove:3.36 \
  -c 'pg_prove --host supabase_db_body --username postgres --dbname body_logger_ux_76f1 /tests/*.sql'
```

This password is the disposable local default. Standard `npm run db:test` is not claimed passed or rerun here: Phase 7.6F documented that its recursive selection includes non-TAP historical probes, and the request explicitly prefers the valid isolated runner until a separate tooling correction. Do not apply the bootstrap/replay helper to a hosted target or alter old migrations.

## Screenshots

All images come from real synthetic local workouts, not invented rendered values. Before uses the unchanged merged-main production build. After captures show actual confirmed/pending/failed work. Representative screenshots were opened and visually inspected, including dark compact controls, RIR help, Home with completed/partial work and increased-text layout.

- [Normal saved rows, Options collapsed](evidence/phase-7-6f-1/normal-saved-options-collapsed.png)
- [Before: original expanded Options](evidence/phase-7-6f-1/before-options-390-light.png)
- [Confirmed completion: Options collapsed](evidence/phase-7-6f-1/confirmed-options-collapsed-mobile.png)
- [Incomplete row: compact Options, 390 light](evidence/phase-7-6f-1/compact-options-390-light.png)
- [Compact Options, 375 dark](evidence/phase-7-6f-1/compact-options-375-dark.png)
- [Compact Options, 430 light](evidence/phase-7-6f-1/compact-options-430-light.png)
- [RIR help](evidence/phase-7-6f-1/rir-help-390.png) · [RPE help](evidence/phase-7-6f-1/rpe-help-390.png)
- [Rare failure/scale controls](evidence/phase-7-6f-1/rare-failure-options.png)
- [Actual offline draft recovery](evidence/phase-7-6f-1/offline-recoverable-options-mobile.png)
- [Collapsed Home with full/partial/unstarted work](evidence/phase-7-6f-1/collapsed-home-partial-and-complete-mobile.png)
- [200% text](evidence/phase-7-6f-1/options-200-percent.png)
- [Focused mobile input — native keyboard unverified](evidence/phase-7-6f-1/mobile-focused-input-keyboard-unverified.png)

The six compact-options captures cover all three widths and both themes. Full-page captures are not proof that every control is simultaneously visible above the fixed footer without scrolling. Test-only centering is used to inspect the Options surface; no such automatic scrolling is added to the application.

## Limitations and release checks

Chromium iPhone-sized emulation is not a physical iPhone, Safari, VoiceOver or Dynamic Type test. Native on-screen keyboard display is unavailable in this headless desktop harness: the named screenshot shows a focused field, not a fabricated keyboard. Existing viewport-inset/footer regressions remain; physical keyboard/safe-area/scroll anchoring and assistive-technology review are still required.

The managed environment temporarily relocates dependencies/Next output and completed captures to `/tmp` while the local database runs; normal paths are restored for Cloudflare packaging. The local Auth container may report an unhealthy proxy-based health probe while the actual local Auth workflows pass; this executor workaround is not a production setting. Supabase changelog access could not complete through the managed network/proxy (curl 56, HTTP 000); no new Supabase API or version assumption is introduced.

No performance gain, new durable draft support, offline completion, production deployment or hosted configuration validation is claimed. No migration deployment is required. Superset design/implementation, cardio, trials/subscriptions, entitlements/admin and the prior MVP release gates remain separate required work in the [updated roadmap](mvp-readiness-and-next-roadmap.md).

[Presentation contracts](phase-7-6f-1-logger-ux.md)
