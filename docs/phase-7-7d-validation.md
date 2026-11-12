# Phase 7.7D validation

## Environment and preflight

Branch: `feat/phase-7-7d-cardio-and-workout-ui-simplification`. Base main `7e3fe36ff22e18fe7bd294e5877c8a3c3390700d` (PR #36), fetched at preflight and rechecked before delivery. Node 24, committed dependencies, production Next.js server, Chromium desktop/iPhone-13 emulation and disposable **local** Supabase/Auth/Mailpit. No new dependencies, hosted SQL, deployment, prior migration edits or production settings changes.

Reviewed actual execution/selection/grouping, set queue/CAS/nonces, invalid Done and blank handling, pause/continuity/footer, exercise taxonomy, immutable source snapshots, Favorites, completion/history, retention and owner grants. The concise implementation plan preceded changes. [Architecture](phase-7-7d-cardio-and-workout-ui.md) documents decisions and deferred template support.

## Executed checks

| Check                     | Actual result                                                                                                                                                            |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| ESLint                    | Pass, `npm run lint`.                                                                                                                                                    |
| Strict TypeScript         | Pass, `npm run typecheck`.                                                                                                                                               |
| Vitest                    | Pass: 404 tests / 80 files.                                                                                                                                              |
| Formatting                | Pass, `npm run format:check`; repeated after final documentation/evidence.                                                                                               |
| Exercise catalog          | Pass: 183 exercises.                                                                                                                                                     |
| Program catalog           | Pass: 14 programs, 53 training days, 238 slots. Original frozen catalog checked unchanged.                                                                               |
| Fresh local replay        | Pass: all 31 migration files into new isolated `body_cardio_final_77d`, after replaying the 30-file main baseline separately. No existing history inferred or rewritten. |
| Standard database suite   | Pass: `npm run db:test`, 2,472 assertions / 28 files.                                                                                                                    |
| Isolated pgTAP            | Pass: same 2,472 assertions / 28 files on fresh replay.                                                                                                                  |
| Database lint             | Pass on local stack and isolated database: public/body_private, zero schema errors. CLI notes deprecated `--db-url` flag separately.                                     |
| Next.js production build  | Pass, `npm run build` (webpack). Existing middleware-to-proxy deprecation remains.                                                                                       |
| OpenNext/Cloudflare build | Pass, `npm run cf:build`; real workspace dependency/build paths restored before packaging.                                                                               |
| Wrangler no-upload check  | Pass, `npm run cf:check`; 178 assets, Worker 8,701.42 KiB / gzip 1,761.07 KiB. Dry-run only.                                                                             |
| Local Worker requests     | Pass, 16/16 public, service-worker/cache and unauthenticated private-route redirect probes at localhost:8787. No authenticated Worker/database workflow claimed.         |

The full Playwright discovery ran **240 scenarios: 220 passed, 15 intentionally skipped, 5 failed** (15.6 minutes). The failures were two lifecycle selectors and one Home selector still expecting the removed management list, one weekday-dependent calendar fixture, and one mobile grouped new-row Save assertion. Corrected Home tests passed **6/6**, calendar tests **10/10**. The unchanged mobile grouped scenario passed **3/3 isolated repeats** (30.8 seconds); no queue code or assertion was changed to obtain that result. The complete corrected lifecycle spec passed **4/4** on desktop/mobile (18.5 seconds). Cloudflare packaging and local Worker smoke checks also passed, as listed above.

This is a full sweep followed by scoped reruns, **not a claim that the initial full sweep was clean**. The 15 skips are duplicate project scopes: ten mobile visual cases, the visual-refinement/logger-help/cardio matrices run once while explicitly varying viewports, plus contrast and viewport-storm checks that run only in mobile. No new manual-cardio functional scenario was skipped. A second full sweep was not repeated after selector/fixture-only changes; the unchanged application was covered by the full run, and affected specs were rerun on both projects.

## Reproducible commands

Use only the ignored local fixture configuration. The authenticated fixture helper rejects hosted targets. Credentials and traces are not committed.

```sh
npm run lint
npm run typecheck
npm test
npm run format:check
npm run catalog:check
npm run programs:check
npm run db:test
npm run db:lint
npm run build
npm run start -- --hostname 127.0.0.1
# In a second shell, with the disposable local fixture environment:
PLAYWRIGHT_BASE_URL=http://127.0.0.1:3000 npm run test:e2e
# Scoped reruns after the full sweep (same production application):
PLAYWRIGHT_BASE_URL=http://127.0.0.1:3000 npm run test:e2e -- tests/e2e/workout-screens.spec.ts
PLAYWRIGHT_BASE_URL=http://127.0.0.1:3000 npm run test:e2e -- tests/e2e/dashboard-calendar.spec.ts --workers=1
PLAYWRIGHT_BASE_URL=http://127.0.0.1:3000 npm run test:e2e -- tests/e2e/workout-lifecycle.spec.ts
PLAYWRIGHT_BASE_URL=http://127.0.0.1:3000 npm run test:e2e -- tests/e2e/superset-groups.spec.ts --project=mobile --grep='two groups before exercise choice' --repeat-each=3 --workers=1
npm run cf:build
npm run cf:check
```

The executor supplied `/usr/bin/chromium`, used two Playwright workers and directed artifacts to `/tmp` due to the workspace disk ceiling. The fresh replay bootstraps only local Auth/roles into a new database then applies each migration in order, with `ON_ERROR_STOP=1`. Isolated suite/lint:

```sh
docker run --rm --network container:supabase_db_body \
  -e PGPASSWORD=postgres \
  -v "$PWD/supabase/tests/database:/tests:ro" \
  --entrypoint sh ghcr.io/supabase/pg_prove:3.36 \
  -c 'pg_prove -h 127.0.0.1 -U postgres -d body_cardio_final_77d /tests/*.sql'
npm run supabase -- db lint \
  --db-url postgresql://postgres:postgres@127.0.0.1:54322/body_cardio_final_77d \
  --schema public,body_private --fail-on warning
```

This is the disposable local default database password, not a hosted credential. Local stack startup required `--ignore-health-check` after this environment's proxy denied the Auth health probe; authenticated HTTP browser and RPC scenarios then exercised the running local services. The upstream Supabase changelog request was also proxy-denied (403); no workaround or new SDK API was introduced. Cloudflare packaging retained the existing middleware deprecation and webpack large-string cache warnings. The local emulator could not fetch optional live Request.cf metadata and used its documented local defaults. Only task-local test containers were stopped/removed without `-v` to free packaging space; retained database volumes remain, and normal CLI startup is needed to run them again. No production setting changed.

## Integrity and regression evidence

`manual_cardio.test.sql` covers pending versus saved duration, all five supported activities, invalid activity/duration, exact-payload retries, no duplicate activity/timing writes, manual-pause preservation/resume, committed lazy expiry, nonce reuse rejection, stale revisions, immutable activity, 20-item and bounded-summary limits, removed-item nonresurrection, owner/foreign/anonymous/service-role grants, closed-session rejection and retention cascade. Cardio produces zero qualifying strength sets and no strength performance evidence. A real assigned session with a pending End After Next Workout request is closed after cardio alone: program classification remains none, assignment active, pending end intact, and no prescribed position resolved.

The new browser scenarios cover cardio-only and mixed grouped sessions, invalid duration, actual completion/history, effort and set type/removal through gears, same actual strength values, source-independent Favorite starts and omitted cardio actuals. Concurrent HTTP saves use the same revision: exactly one wins. A response is dropped after the server commits; explicit retry uses the same request UUID and creates no second command. Foreign reads/mutations are denied.

Retained logger tests now open gears rather than native disclosures. Their saved actuals, invalid Done/blank validation, bodyweight mode, exact pounds, CAS conflict, offline retry, draft discard, newer-edit/older-ack, effort and history assertions remain. The obsolete native-details focus helper/test is removed; a real browser test checks Escape, switching between gears and outside-input focus instead. Home still fits five movement rows above its fixed footer at 390px; direct actions below may scroll, replacing the old assumption that a collapsed one-line management disclosure made the entire page non-scrolling.

During diagnostic runs, browser failures exposed an inaccessible dialog name and a race where the old gear's dismissal closed/focused over a newly opened gear. Explicit dialog labeling, owner-specific popup state and outside-focus handling corrected these, with regression coverage. Movement update now closes its parent sheet. Old tests looking for hidden optional controls were migrated to explicitly open settings. Earlier aborted/failed runs are diagnostic, not counted as final passes. The Home/lifecycle selector fixes retain reorder/remove, pending actuals, draft recovery and finish assertions through the new gear. The calendar fixture now opens the overdue event's actual week: on Thursday, `today-5` and its successor can occupy different weeks. No scheduling implementation changed.

The one grouped-save failure showed **Unsaved changes**, with the synthetic set still pending and no false Saved confirmation. It occurred while another scoped suite overlapped the large run. Three unchanged isolated repeats passed. This does **not** establish a network/CPU cause or prove the timing issue eliminated. The existing new-row/blur/Done path remains a final-hardening stress-test follow-up; no optimistic confirmation, queue rewrite or weakened expectation was introduced.

## Screenshots and accessibility

[Evidence directory](evidence/phase-7-7d/README.md) contains selected actual local screenshots and sanitized check logs. Representative views:

- [Compact set rows, 375px/light](evidence/phase-7-7d/row-375-light.png) and [390px/dark](evidence/phase-7-7d/row-390-dark.png).
- [Set gear, mobile](evidence/phase-7-7d/gear-375-light.png), [dark](evidence/phase-7-7d/gear-390-dark.png), [desktop](evidence/phase-7-7d/gear-1440-light.png) and [saved effort](evidence/phase-7-7d/desktop-set-gear-effort.png).
- [Cardio sheet, 375px](evidence/phase-7-7d/cardio-375-light.png), [390px/dark](evidence/phase-7-7d/cardio-390-dark.png), [430px](evidence/phase-7-7d/cardio-430-light.png), [desktop/dark](evidence/phase-7-7d/cardio-1440-dark.png).
- [Cardio-only Home](evidence/phase-7-7d/desktop-cardio-workout-home.png) and [compact Superset with cardio](evidence/phase-7-7d/desktop-mixed-superset-cardio-home.png).
- [Workout Complete](evidence/phase-7-7d/desktop-cardio-completion.png) and [History detail](evidence/phase-7-7d/desktop-cardio-history.png).
- [Mobile cardio Home](evidence/phase-7-7d/mobile-cardio-workout-home.png), [mixed Superset](evidence/phase-7-7d/mobile-mixed-superset-cardio-home.png), [completion](evidence/phase-7-7d/mobile-cardio-completion.png) and [History](evidence/phase-7-7d/mobile-cardio-history.png).
- [200% text](evidence/phase-7-7d/cardio-large-text.png) and [keyboard emulation](evidence/phase-7-7d/cardio-keyboard-emulation.png).

The new explicit matrix checks 375×667, 390×844, 430×932, 768×1024 and 1440×900 in both themes with reduced motion. It checks gear popup width and position above the real footer, Escape focus return, cardio sheet bounds and synthetic keyboard clearance. Existing tests additionally cover help dialogs, outside dismissal, keyboard navigation, field-error contrast and viewport event storms. These checks do not replace physical VoiceOver/TalkBack or hardware keyboard testing.

## Rollout and limitations

Apply **only the new forward migration `20261111230809_manual_cardio.sql` after all existing migrations**, before deploying this application's new RPC callers. It creates an empty owner-private facts table, input/activity triggers, three narrowly granted invoker RPCs and a compatible History filter replacement. It never changes saved strength measurements, source snapshots, program eligibility or historical session classifications. No hosted migration was applied in this task. Review usual migration/backup/preview gates separately; merge and deployment remain manual.

Cardio is supported in active workouts and retained display, not Favorite/program templates, PRs or active cardio analytics. Mixed Favorites transparently preserve strength/group structure only. Durable drafts, offline replay, final hardening, interval/circuit training, wearables, advanced cardio metrics and monetization/admin remain deferred. Browser network/viewport/keyboard tests are emulation, not physical cellular or iOS/Android validation. Hosted Auth/email, real-device keyboards/safe areas and production edge/database behavior remain unverified release gates.
