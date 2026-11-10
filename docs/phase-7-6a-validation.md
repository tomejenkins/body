# Phase 7.6A — Validation and evidence

Executed 2026-11-10 UTC against merged main `932e7e8` (PR #26), on `audit/phase-7-6a-technical-review`. Findings and the scoped 7.6B–F plan are in [the technical audit](phase-7-6a-technical-audit.md).

## Changes and boundaries

This branch changes documentation/evidence, audit-only Playwright configuration/tests, local opt-in instrumentation/aggregation scripts and rollback-only SQL probes. **No application source, production schema/migration, dependency, logger layout/control/default/navigation behavior or save-confirmation semantics is changed.** No optimization gain is claimed. No hosted Supabase query/write/configuration change, merge or deployment was performed.

The existing 37-table schema and all migrations were replayed into a newly created isolated local database `body_audit_76a`, using schema-only managed Auth/extensions bootstrap from the disposable local stack. Application migrations were then applied in filename order with `ON_ERROR_STOP=1`; pgTAP ran in that fresh database. Real browser Auth/PostgREST tests used the normal disposable local stack. These are separate local databases; SQL role tests do not substitute for JWT/browser verification.

## Executed checks

| Command/check                                                         | Actual result                                                                                                                                     |
| --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `git fetch origin main` and branch from `origin/main`                 | Base `932e7e8`, merged PR #26                                                                                                                     |
| `npm run lint`                                                        | Passed; audit additions also checked                                                                                                              |
| `npm run typecheck`                                                   | Passed; strict TypeScript and route generation                                                                                                    |
| `npm test`                                                            | 304 passed, 59 files                                                                                                                              |
| `npm run format:check`                                                | Passed, including final audit docs/evidence                                                                                                       |
| `npm run catalog:check`                                               | Passed; 183 exercises                                                                                                                             |
| `npm run programs:check`                                              | Passed; 12 programs, 46 training days, 205 slots                                                                                                  |
| Fresh isolated migration replay                                       | Passed; all existing migrations, no new migration                                                                                                 |
| Full pgTAP suite in fresh `body_audit_76a`                            | 2,089 assertions / 22 files passed                                                                                                                |
| `npm run db:lint`                                                     | Passed, `public,body_private`; no schema errors                                                                                                   |
| `npm run supabase -- db advisors`                                     | Two existing multiple-permissive-SELECT performance notices (`programs`, `program_versions`); no new finding                                      |
| Effective RLS/ACL/search-path inventory                               | 37 public tables with RLS; no application definer functions or missing empty search paths; reviewed function grants and policy/index/FK inventory |
| `npm audit --json`                                                    | Completed, exit 1: 11 entries (4 high / 7 moderate); documented build/lint supply-chain finding, not a passing security scan                      |
| `npm audit --omit=dev --fetch-retries=0 --fetch-timeout=20000 --json` | Passed, zero runtime-only advisories; not proof of bundle/pipeline reachability                                                                   |
| `npm run build`                                                       | Passed, production webpack build                                                                                                                  |
| Existing desktop/mobile Playwright                                    | 134 passed, 10 intentional duplicate-viewport skips, 7.6 minutes                                                                                  |
| Audit-only performance + integrity Playwright                         | 3 passed, 24.8 seconds; 36 measured edits plus offline/uncertain/pending-refresh scenarios                                                        |
| Uninstrumented control                                                | 1 passed, 4.8 seconds; 12 measured edits                                                                                                          |
| OpenNext build / Wrangler no-upload dry-run                           | Passed                                                                                                                                            |
| Representative local Worker HTTP requests                             | Passed                                                                                                                                            |

The 10 standard browser skips are the existing mobile-project copies of a five-viewport/two-theme matrix already executed in the desktop project. They are not untested widths or failed tests. Standard coverage includes auth/onboarding/owner boundaries, scheduling/nonweekly/timezone/calendar, selection/decisions/Favorites, movement matching, Full Body/exercise-first, logger/CAS/defaults/effort, pause/continuity/drafts, records/history and completion.

Raw execution logs remain under `/workspace/work/audit-7-6a/` in this executor. They are not all committed: Auth/stack startup logs, browser trace archives and HAR-like artifacts can contain test credentials/cookies or internal IDs. The committed evidence is numeric/redacted metadata and a synthetic-account screenshot. This is deliberate evidence minimization, not hosted-user data collection.

## Commands and local setup

The project-standard commands above ran from the repository root with Node 24 and the committed dependencies. No package update/install was required. Read-only registry advisory checks and `npm ls glob minimatch --all` were also executed; their finding is retained in [dependency evidence](evidence/phase-7-6a/dependency-audit.json), with no lockfile edit. Docker local socket was explicitly verified (28.4.0, VFS). Minimal local services were started with:

```sh
SUPABASE_TELEMETRY_DISABLED=1 npm run supabase -- start \
  --ignore-health-check --network-id body_validation \
  -x realtime,storage-api,imgproxy,postgres-meta,studio,edge-runtime,logflare,vector,supavisor
```

The environment's inherited proxy made the disposable Auth container's BusyBox wget health probe incorrectly contact the proxy for loopback. Its local `/usr/local/bin/wget` wrapper was scoped to pass `-Y off` for `http://127.0.0.1:9999/health`; Auth/API itself remained real and unchanged. This is an executor workaround, not a production Auth fix.

Storage limits required moving installed dependencies/Next output into `/tmp` with local symlinks while Docker ran, then restoring normal directories before the native OpenNext bundle. An initial concurrent dependency move conflicted with a test cache writer; its resulting missing-binary/module runs were discarded. Corrected setup completed the fresh commands reported above. No lockfile or application change was used to resolve it.

Fresh replay command was the local helper `/workspace/work/audit-7-6a/replay.py`: `CREATE DATABASE body_audit_76a`, apply the managed schema-only bootstrap, then execute every `supabase/migrations/*.sql` in sorted order. Bootstrap was a schema-only dump, not copied Auth account data. Reproducing from a clean checkout should use the pinned `npm run db:reset` in a **disposable local stack**, or create an isolated database with that stack's actual managed Auth/extensions bootstrap; do not apply executor bootstrap dumps to a hosted project.

Actual pgTAP invocation:

```sh
docker run --rm --network body_validation \
  --mount type=bind,src=/workspace/body/supabase/tests/database,dst=/tests,readonly \
  -e PGHOST=supabase_db_body -e PGUSER=postgres \
  -e PGDATABASE=body_audit_76a -e PGPASSWORD=postgres \
  ghcr.io/supabase/pg_prove:3.36 /bin/sh -c 'pg_prove /tests/*.sql'
```

The password shown is the documented disposable local fixture password, not a hosted credential. The separate rollback-only audit probes were executed with:

```sh
docker exec -i supabase_db_body psql -U postgres -d body_audit_76a \
  -v ON_ERROR_STOP=1 < supabase/tests/audit/phase-7-6a-probes.sql

docker exec -i supabase_db_body psql -U postgres -d body_audit_76a \
  -v ON_ERROR_STOP=1 < supabase/tests/audit/phase-7-6a-db-timing.sql

docker exec -i supabase_db_body psql -U postgres -d body_audit_76a \
  -v ON_ERROR_STOP=1 < supabase/tests/audit/phase-7-6a-security.sql
```

The first two scripts perform synthetic test writes inside `BEGIN/ROLLBACK`; the security script is catalog-read-only. They live outside the standard pgTAP directory because they report audit observations, **not assertions that defects are desired behavior**. Never run the fixture scripts against hosted data.

## Performance harness and reproduction

Start the existing production app normally for the control. Use only an ignored local public configuration pointing to `127.0.0.1:54321` and canonical `http://127.0.0.1:3000`. Test helpers refuse hosted Auth/app targets. This executor's launcher reads those ignored public local settings and selects system `/usr/bin/chromium`; on another machine configure installed Chromium through the normal Playwright mechanism.

```sh
npm run build
npm start
# In another terminal with the local test environment configured:
BODY_AUDIT_CONTROL=1 npm run test:e2e -- \
  --config=playwright.audit.config.ts \
  tests/audit/logging-performance.spec.ts --output=/tmp/body-audit-control
```

Stop that local server before starting the opt-in instrumented version:

```sh
BODY_AUDIT_TRACE=/tmp/body-audit-server.jsonl \
  node --import ./scripts/audit/trace-server.mjs \
  ./node_modules/next/dist/bin/next start

npm run test:e2e -- --config=playwright.audit.config.ts \
  --output=/tmp/body-audit-results

node scripts/audit/summarize.mjs \
  /tmp/body-audit-results/logging-performance-measur-31f3e-le-browser-network-profiles-audit-chromium/logging-samples.json \
  /tmp/body-audit-control/logging-performance-measur-31f3e-le-browser-network-profiles-audit-chromium/logging-samples.json \
  /tmp/body-audit-server.jsonl
```

The audit config imports the base local-target guard and replaces the project list with one desktop Chromium project/worker. Its performance test applies CDP latency/throughput emulation; that does not make it a physical mobile-device or cellular test. Existing mobile browser regressions run separately under the unchanged normal config. Instrumentation is loaded only by the explicit command, not imported into production application code. It records route-normalized HTTP and upstream timing metadata, never request headers, JWTs, body values or URL query strings.

| Scenario                            | Evidence/result                                                                                                                                                                                            |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Low-latency control                 | 12 edits; DOM Saved p50 76.40 ms, p95 93.79 ms                                                                                                                                                             |
| Instrumented loopback               | 12 edits; DOM Saved p50 86.50 ms, p95 201.48 ms                                                                                                                                                            |
| 80 ms emulated browser latency      | 12 edits; DOM Saved p50 135.00 ms, p95 143.45 ms                                                                                                                                                           |
| 300 ms emulated browser latency     | 12 edits; DOM Saved p50 355.90 ms, p95 381.25 ms                                                                                                                                                           |
| Payload and requests                | Exactly two browser fetches per measured edit; median combined request bodies 415–416 B, response bodies ~1.16 KB for three set rows                                                                       |
| Server processing                   | 36 correlated mutations: HTTP p50 35.23 ms, p95 52.79 ms; two Auth reads plus one set RPC per mutation action, repeated Auth + continuity RPC in follow-up action                                          |
| Database execution                  | 30 authenticated calls: median 0.9745 ms, p95 2.9952 ms; independent EXPLAIN execution 1.018 ms                                                                                                            |
| DOM reconciliation proxy            | ~3.9–4.9 ms median after full mutation-resource end; no >50 ms long tasks in measured samples; not a React CPU/paint profile                                                                               |
| Offline                             | Server actual remains unchanged; Not saved and retained tab draft; refresh/retry recovers intended values                                                                                                  |
| Commit with dropped acknowledgement | Actual commit verified before dropping response. No false Saved. Ordinary Retry can require conflict review; explicit saved-version review preserves the same revision and three actual rows               |
| Repeated taps/pending refresh       | Disabled pending checkbox ignores repeated programmatic clicks; committed response held through reload; recovered draft detects newer server revision; explicit review restores exact intended state/order |

[Performance summary](evidence/phase-7-6a/performance-summary.json) and raw numeric samples retain the sample counts, p95 interpolation and outlier range. Input-to-DOM timing includes scripted fill/blur; it is not an isolated touch-dispatch timing. Browser Resource Timing contains completed fetch durations. Playwright poll completion is recorded separately because polling inflated high-latency observed assertion time to ~849 ms although the DOM had confirmed at ~356 ms. Full response streaming can finish slightly after the Saved DOM change; a small negative residual is not a false-success finding.

The uninstrumented control precedes the instrumented sequential runs, without randomized repetitions or confidence intervals. The local ~10 ms median difference is not cleanly attributable to instrumentation. No actual optimization/gain or production bottleneck is claimed. Browser emulation does not add latency to the server–Auth/database network leg. CPU/region/DB load, large owner histories and real hosted radio conditions remain unmeasured.

## Reproductions and findings

[Integrity observations](evidence/phase-7-6a/integrity-observations.json) record four SQL observations:

1. Zero external-load working sets: stored `full`, two program sets, zero qualifying performance sets, cursor advanced to position 2. Confirmed P1 eligibility mismatch.
2. Zero repetitions on the next day: stored `full`, zero program sets, cursor still position 2. Confirms stored fullness differs from effective evidence; no advancement from that second case.
3. Owner directly archives assignment while its workout is `in_progress`. Confirmed 7.6B transition-guard gap.
4. Reenrollment after ending uses a distinct assignment, retains three prior sessions and maintains exactly one active assignment.

[Uncertain retry screenshot](images/technical-audit/uncertain-retry-conflict.png) shows identical intended/saved 145 lb × 8 with a Not saved/conflict review prompt after the acknowledgement was deliberately dropped. The final test records this behavior via an attachment and validates explicit recovery. **Passing the recovery test does not mean that the ordinary one-click retry defect was fixed.** No product fix was made.

Early harness runs were not accepted as final measurements: the first audit config accidentally merged three projects; CDP loading-finished collection missed some stream completions and was replaced with complete Resource Timing plus request metadata; an initial callback attachment lacked its test-info parameter. The first pending-refresh probe also released the request too early and could legitimately finish before navigation. The final test instead holds an already-committed response until refresh completes. These test corrections are distinct from the confirmed product observations above.

## Worker and delivery checks

After the full browser suite completed, the disposable stack was stopped with backup preservation and normal dependency directories restored. `npm run cf:build` runs a fresh Next.js/OpenNext build. `npm run cf:check` is Wrangler's **no-upload dry-run**, not a deployment. Local `npm run cf:preview` is emulation only.

Local Worker smoke returned 200 for `/login` and `/manifest.webmanifest`, and 307 to login for Dashboard, Workout, Programs, History and the protected completion URL. Final ESLint, strict TypeScript and full formatting checks passed with the audit scripts/tests/docs. The optional Request.cf metadata fetch could not complete under the environment proxy and Wrangler used its local placeholder; representative requests succeeded. No hosted auth flow, shared schema, real SMTP, production deployment or Cloudflare dashboard settings are verified by local Worker smoke requests.

## Environmental and release limitations

- Current Supabase changelog fetch was attempted and denied by the environment's HTTP CONNECT policy (403); no bypass or hosted SQL fallback was used. Analysis relies on pinned installed SDK/CLI, actual current source and local execution, not a claim of live documentation verification.
- Physical iOS/Safari/Android, install/update/storage eviction, VoiceOver and real cellular networks were not tested. The normal mobile project uses Chromium/iPhone viewport emulation.
- No production load test, large-owner-history benchmark, heap/React CPU profile, remote edge/Auth/database timing, real SMTP/delivery, billing/entitlement audit of a live service, external penetration test or backup restoration was performed.
- Runtime-proxy Docker health/storage workarounds are executor-only. Existing Next middleware deprecation and local optional Request.cf fallback warnings are not production deployment proof or newly introduced product regressions.
- New lifecycle/statistics/retention/design features are proposals only. Their schema, guards, legacy-data migration, calculation and physical-device tests belong to the scoped follow-on phases.
