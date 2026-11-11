# Phase 7.6F validation

## Source and scope

Started from fetched `origin/main` `b06a850b3b8ce40b242ef3b6ba00a4465bd2cf4e` (merged PR #32), branch `audit/phase-7-6f-performance-release-readiness`. Node 24, committed dependencies, system Chromium, real disposable local Supabase/Postgres 17. No hosted SQL/Auth/email calls, production configuration, schema migrations, dependency upgrades, offline writes, deployment or merge.

The approved logger inputs, completion interactions, timer/footer, Workout entry, picker, Favorites and program/history layouts remain. The queue correction only reuses an existing command for an unchanged failed draft. The only new ordinary visible state is a small browser-offline notice; the public fallback appears on failed full-document navigation.

## Executed commands and results

| Command / scenario                                            | Actual result                                                                                                                                                       |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run lint`                                                | Passed                                                                                                                                                              |
| `npm run typecheck`                                           | Passed, strict TypeScript / route type generation                                                                                                                   |
| `npm test`                                                    | Passed again: 350 tests / 69 files on final static-route/worker source (43.87s)                                                                                     |
| `npm run format:check`                                        | Passed on final source/docs/evidence bundle                                                                                                                         |
| `npm run catalog:check`                                       | Passed: 183 exercises                                                                                                                                               |
| `npm run programs:check`                                      | Passed: 12 programs, 46 days, 205 slots                                                                                                                             |
| Fresh isolated migration replay                               | Passed: every existing migration in sorted order, schema-only managed bootstrap, new local `body_readiness_76f` database                                            |
| `npm run db:test` against retained local stack                | Failed: recursively included three non-TAP historical audit probes; initial-schema assumptions also fail on the populated retained fixture. Not reported as passed. |
| Explicit pgTAP, 26 actual test files, fresh isolated database | Passed: 2,308 assertions / 26 files                                                                                                                                 |
| Replayed security catalog inspection                          | Passed: zero public tables without RLS; zero public/body_private SECURITY DEFINER functions                                                                         |
| `npm run db:lint`                                             | Passed: public and body_private, no schema errors                                                                                                                   |
| `npm run build`                                               | Passed, production webpack build; adapter-compatible middleware warning retained                                                                                    |
| Baseline audit-only tests                                     | Passed: 3 tests, 36 measured saves plus offline/uncertain/refresh scenarios (25.6s)                                                                                 |
| Exact retry baseline probe                                    | Passed as observation: two save UUIDs, same revision, unnecessary conflict; later device write protected                                                            |
| Post-correction audit                                         | Passed: 5 tests (56.3s), 36 save samples, failure/recovery, navigation and exact retry/remote conflict                                                              |
| Controlled final navigation probe                             | Passed: 75 visits, workers blocked only in measurement harness (1.3m)                                                                                               |
| 4× CPU / slow-bandwidth probe                                 | Passed: 48 authoritative edits across four profiles (1.4m); emulation, not physical device                                                                          |
| Finish / Abandon failed-transport probes                      | Passed: 2 tests (23.4s), active session/committed sets preserved before explicit successful retry                                                                   |
| Large-session probe                                           | Passed: 100 real set rows, five confirmed edits under 4× CPU (32.8s)                                                                                                |
| Full desktop/mobile Playwright                                | Passed: 169 tests / 11 intentional duplicate-matrix skips (11.9m), after root redirect correction and before the final static endpoint compatibility change         |
| Final public-route/cache browser cases                        | Passed: 2 desktop/mobile tests (4.0s) after static endpoint change                                                                                                  |
| Final shipped-worker/status unit cases                        | Passed: 6 tests / 2 files after static endpoint change                                                                                                              |
| OpenNext / Cloudflare build                                   | Passed again on final static-route/worker source; includes fresh Next production build                                                                              |
| Wrangler no-upload dry-run                                    | Passed on final package; no upload                                                                                                                                  |
| Local Worker smoke requests                                   | Passed: 16/16 public/auth-boundary requests, including script no-store headers and redirect-free `/offline`                                                         |
| Packaged Worker browser test                                  | Passed: installation, offline 503, public cache keys and online recovery (1 test, 1.8s); no Auth/database connectivity claim                                        |
| Dependency audit                                              | 11 reported development/build/lint packages: 4 high, 7 moderate; production-only audit 0                                                                            |

The baseline and final audit scripts use existing `playwright.audit.config.ts`, synthetic account fixtures, production Node server and numeric-only opt-in `scripts/audit/trace-server.mjs`. Final full regression uses `playwright.config.ts` against the local production server. No result in this document is inherited from PR #32.

The first complete run finished 167 passed / 2 failed / 11 duplicate-matrix skips (12.7m). Both failures were the unchanged root-navigation assertion: a controlled worker Fetch combined the Node adapter's duplicate Location headers into `/dashboard, /dashboard`, yielding 404. Manual redirect mode alone still failed one isolated case. The public root redirect now bypasses worker interception entirely; authentication/navigation assertions were not weakened. Offline fallback for `/` is explicitly unsupported, while the manifest start URL `/dashboard` remains covered. The final full rerun passed 169 tests with 11 intentional duplicate-matrix skips (11.9m). The 20-case focused rerun also passed. Subsequent packaged-Worker testing found Workers Assets redirecting the original raw HTML filename to `/offline`, so installation correctly refused the redirected asset. The final endpoint is an explicit static `/offline` route with the same public HTML and no layout/Auth reads. A fresh Next build and both desktop/mobile public-cache cases passed (2 tests, 4.0s), plus all 6 focused shipped-worker/status unit tests. The final Worker browser and packaging checks are recorded separately; the earlier full-run count is not attributed to this later endpoint change. These counts are separate runs and are not combined.

## Reproduction

Standard static/unit/catalog/build commands run from the root with the committed lockfile. Start only the local Supabase services needed for Auth, Mailpit, Kong, PostgREST and Postgres; optional metadata/UI services are excluded. `tests/e2e/auth-helpers.ts` refuses non-loopback targets and the external browser base URL guard accepts only local ports 3000/8787.

```sh
# Export only the disposable local public configuration using the normal env mechanism.
# Do not point these integration fixtures at hosted Supabase.
npm run build
npm run start -- --hostname 127.0.0.1
PLAYWRIGHT_BASE_URL=http://127.0.0.1:3000 npm run test:e2e
BODY_EXPECT_RETRY_FIX=1 PLAYWRIGHT_BASE_URL=http://127.0.0.1:3000 \
  npm run test:e2e -- --config playwright.audit.config.ts
BODY_AUDIT_STRESS=1 PLAYWRIGHT_BASE_URL=http://127.0.0.1:3000 \
  npm run test:e2e -- --config playwright.audit.config.ts logging-performance
```

The optional system Chromium executable is supplied through `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`. Default Playwright Chromium also works when installed. The executor helper loads ignored local public configuration without printing it. Performance instrumentation is a separate local server process; it is never imported by application code.

Actual isolated pgTAP invocation expands the wildcard **inside** the local test container:

```sh
docker run --rm --network supabase_network_body \
  -e PGPASSWORD=postgres \
  --mount type=bind,src="$PWD/supabase/tests/database",dst=/tests,readonly \
  --entrypoint /bin/sh ghcr.io/supabase/pg_prove:3.36 \
  -c 'pg_prove --host supabase_db_body --username postgres --dbname body_readiness_76f /tests/*.sql'
```

The password here is the disposable stack default, not a hosted credential. The initial attempt passed a literal wildcard without a shell, produced NOTESTS and was corrected; it is not counted as a passed suite. A clean local stack may instead use the pinned CLI reset and an explicitly selected database-test directory. Never run a hosted reset. Historical audit probes remain diagnostics, not TAP test files.

Fresh replay uses the local managed schema-only bootstrap retained by the executor (no Auth account data), then all immutable application migrations and pgTAP extension. SQL scale fixtures run in transactions and roll back. The task-owned isolated replay/scale database was removed after its evidence was captured; the ordinary local test stack and previous task data were left intact until browser validation finished. No prior migration is edited. No migration deployment is required.

## Performance evidence and limitations

[Before/after numeric summary](evidence/phase-7-6f/performance-summary.json), [repeatable aggregation output](evidence/phase-7-6f/reproducible-summary.json), [server spans](evidence/phase-7-6f/server-performance-summary.json), [baseline retry identity](evidence/phase-7-6f/retry-before.json), [corrected retry identity](evidence/phase-7-6f/retry-after.json), [large-session profile](evidence/phase-7-6f/large-session.json).

Ordinary save p50/p95 before → after: local 90.25/122.52 → 79.20/92.57 ms; 80 ms CDP profile 129.10/142.98 → 131.00/135.90 ms; 300 ms profile 357.00/374.69 → 363.30/377.76 ms, 12 samples per cell. Two browser requests remain. No ordinary-save speed gain is established; percentages would misleadingly imply causality. Corrected uncertain retries reduce distinct logical save UUIDs from two to one; physical submissions remain two in the captured blur/retry scenario.

Normal logging shows no >50 ms long tasks in the small fixture. CPU-stress run shows 124 run-wide long tasks; do not sum the repeated per-profile summary field. The stress and final controlled navigation runs overlap regression workload. They are diagnostic emulation, not an isolated physical-device benchmark. The initial worker-enabled final navigation probe was excluded from before/after interpretation because worker-target requests do not share page-target CDP emulation. The corrected performance-only navigation probe blocks workers; cache tests separately enable them.

`navigation-performance.spec.ts` measures five full-document visits per route/profile, not a client-link navigation SLO. No reliable physical app-shell cold-start, login-to-Dashboard, installed-PWA startup, back-forward timing, per-component React CPU profile, packet-level loss distribution or hosted p95 is established. There is no claim that local loopback DB time explains real iPhone latency. [Architecture audit](phase-7-6f-performance-connectivity-audit.md) explains the waterfall and tradeoffs.

Scale probe: new/60/2,000-session rolled-back fixtures, the latter 10,000 selections / 60,000 sets, 400 archived sessions / 10,000 deleted tombstones. Large History page execution 8.843 ms / 9,072 bytes; exact-exercise page 37.002 ms / 265,184 bytes. Individual warm local calls, not p95 or concurrent-production results. Full `EXPLAIN`/buffer logs and reproducible SQL are retained. Several historical enrollments are exercised by the lifecycle browser suite; a large enrollment aggregation benchmark and device memory-pressure simulation remain unverified.

Aggregation can be repeated with `scripts/audit/summarize-readiness.mjs` and `scripts/audit/summarize.mjs`; they read numeric samples, never credentials or raw request bodies. `tests/audit/large-session.spec.ts` records numeric heap/node/task metrics, not a heap snapshot containing private data.

## Failure and cache matrix

| Scenario                                                       | Executed evidence / outcome                                                                                                                                                       |
| -------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Offline before save, then reconnect                            | Mounted exact input retained; Not saved; no write on reconnect; explicit retry persists exactly once logically.                                                                   |
| Commit then dropped acknowledgement                            | `route.fetch()` commits, delivery aborted; no early Saved; unchanged command UUID reused; no own-write conflict.                                                                  |
| Another device edits after uncertain commit                    | Revision conflict remains, remote 90 kg untouched, local 150 retained for review.                                                                                                 |
| Repeated taps / refresh pending                                | Existing audit case verifies one ordered actual set, recovered unconfirmed draft and unchanged session timing.                                                                    |
| Finish/Abandon failed POST                                     | No closure before server request; recorded set preserved; retry closes only after acknowledgement.                                                                                |
| Favorite transport failure                                     | Full existing one-tap suite retains the request UUID and source authorization checks.                                                                                             |
| Fresh online visit / repeat                                    | Registration installs only the two allowlisted public entries; authenticated navigation never adds pages.                                                                         |
| Offline private reload                                         | 503 public fallback, no private values or fake resumed workout.                                                                                                                   |
| Cache eviction                                                 | Deleting owned caches still yields inline public fallback; online retry returns to normal authorization.                                                                          |
| Cache storage denied / oversized asset                         | Shipped-worker VM tests reject unsafe installation; network rendering remains independent.                                                                                        |
| Worker version cleanup                                         | Shipped-worker VM tests remove only older owned-prefix caches; install does not call skipWaiting. Full staged deployment/old-window update remains a device/release rehearsal.    |
| Account/logout/back/reload                                     | Browser test confirms authentication redirect and public-only cache keys; retained owner RLS suites deny foreign private access.                                                  |
| RSC/API/POST/cross-origin/static bundle/query requests         | Shipped-worker tests verify no interception and no cache/mutation replay.                                                                                                         |
| Auth/API unavailable while browser reports online              | Existing server errors remain authoritative; the new indicator makes no reachability claim. Dedicated hosted outage injection not performed.                                      |
| Switch/archive/restore or exercise-change acknowledgement lost | Standard lifecycle/retention/retry SQL/browser coverage retained; a complete browser transport-loss permutation matrix is not executed. Listed as follow-up, not silently passed. |

No generic offline queue, IndexedDB, background sync, persistent Auth cache or reference-data preload is added. Public cache maximum: two entries / 64 KiB body bytes. Existing sessionStorage is tab-local, account/workout scoped, and not guaranteed after termination/eviction. Private navigation is never stored by the worker.

## Screenshots and logs

- [Public offline fallback](evidence/phase-7-6f/public-offline-shell-mobile.png)
- [Mounted mobile logger: exact draft, Not saved, subtle offline notice](evidence/phase-7-6f/offline-retained-logger-mobile.png)
- [Failed Finish retains workout](evidence/phase-7-6f/failed-completed.png)
- [Failed Abandon retains workout](evidence/phase-7-6f/failed-abandoned.png)
- [Final browser execution](evidence/phase-7-6f/browser-final.txt), [initial failed run](evidence/phase-7-6f/browser-full.txt), [20-case redirect/offline/navigation rerun](evidence/phase-7-6f/root-bypass.txt)
- [Fresh database regression](evidence/phase-7-6f/pgtap-isolated-final.txt)
- [Dependency advisories](evidence/phase-7-6f/dependency-audit.json), [production-only](evidence/phase-7-6f/dependency-production.json)

Screenshots use real locally recorded synthetic training. Raw Playwright traces, request payloads, stack logs, Auth messages, cookies and environment files are excluded from the committed bundle. No physical iPhone/Android screenshot is claimed.

## Environment, staged rollout and remaining gates

The managed registry policy rejected optional `public.ecr.aws` metadata images; existing allowed local images and exclusion flags were used. Supabase changelog access returned policy 403. No network policy bypass, new SDK API or dependency was introduced. Local Auth's health probe can misreport through its inherited proxy while real local Auth works; ignore-health-check is confined to this disposable stack. Dependency/build outputs and completed test artifacts temporarily move to `/tmp` to accommodate the constrained filesystem. Normal dependency paths are restored for native Cloudflare packaging.

In staging, serve `/body-sw.js` with the committed no-cache/no-store policy, verify MIME/scope/asset routes and CSP/fallback behavior, then rehearse an old open workout and worker update without forced activation. Public-shell changes require a cache version bump. A rollback can ship an appropriately reviewed worker update that removes only this owned cache namespace; do not indiscriminately delete other origin caches or force-reload an active workout. Do not treat local packaging/dry-run as a deployment. No new infrastructure, secrets or schema rollout is needed.

Physical iPhone Safari/PWA, Android Chrome/PWA, storage eviction/termination, native keyboard/safe areas, VoiceOver/TalkBack, reduced motion, real connectivity and production Auth/monitoring remain unverified. Follow the [practical checklist and MVP gates](mvp-readiness-and-next-roadmap.md). A complete no-connection workout is unsupported by this phase.
