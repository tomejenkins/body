# Phase 7.7E validation

Base: `ef3811fcbd2dd3ccfdadf92329fb1d1ee349b942` (merged PR #37).
Branch: `feat/phase-7-7e-trial-entitlement-foundation`.
Node 24, committed lockfile, local PostgreSQL 17 and disposable Supabase/Auth/Mailpit.
No hosted migrations, deployments, payment configuration or production variables changed.

## Results and final-source boundary

| Check                            | Result                                                                                                                                                                               |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| ESLint                           | Pass, final application source                                                                                                                                                       |
| Strict TypeScript                | Pass, final application source                                                                                                                                                       |
| Vitest                           | 410 tests / 82 files passed, final application source                                                                                                                                |
| Formatting                       | Pass, final delivery source                                                                                                                                                          |
| Exercise catalog                 | Pass                                                                                                                                                                                 |
| Program catalog                  | Pass                                                                                                                                                                                 |
| Standard `npm run db:test`       | **2,553 assertions / 29 files passed**, final SQL source                                                                                                                             |
| Standard database lint           | Pass, public and body_private                                                                                                                                                        |
| Fresh isolated migration replay  | All **33 migrations** replayed from empty fixture database                                                                                                                           |
| Isolated pgTAP (`pg_prove`)      | **2,553 assertions / 29 files passed**                                                                                                                                               |
| Isolated lint                    | Pass, public and body_private                                                                                                                                                        |
| Concurrent activation and writes | Six local multi-connection scenarios passed                                                                                                                                          |
| Focused entitlement browsers     | Four scenarios passed in the final production sweep, desktop/mobile                                                                                                                  |
| Full desktop/mobile Playwright   | 244 discovered: 220 passed / 14 skipped / 10 failed initially; unchanged isolated rerun 9 passed / 1 conditional skip. All 229 executable cases passed across the final-source runs. |
| Next production build            | Pass, final application source                                                                                                                                                       |
| OpenNext production build        | Pass, final application source                                                                                                                                                       |
| Wrangler no-upload dry-run       | Pass, final application source; no upload                                                                                                                                            |

Final SQL includes the locked-grant-ID correction, owner lock-order index and set-receipt amendment. The exact
final authorizer definition was reapplied to the disposable standard local database,
then the full standard suite/lint reran. The fresh isolated replay independently
recreated every migration from zero and ran every SQL file and concurrency checks.
The separate final `pg_prove` run also passed 2,553 assertions / 29 files, with proper TAP plans. No historical migration changed.

Earlier diagnostic runs are not final passes. In particular: one run began before a
reset finished and is invalid; early guard ordering changed existing rejection codes
and blocked legacy/FK cleanup; those failures were corrected without weakening the
original owner/lifecycle/CAS assertions. The direct movement denial fixture originally
omitted required movement intent, so it hit input validation first; it now supplies a
valid supported movement before asserting entitlement denial. The new History browser
assertion originally used the wrong existing heading, then passed after correction.
A development-server broad browser attempt was interrupted after transport-recovery
failures; the retained baseline's production harness is required for final regression.

The final broad sweep took 24.8 minutes. Eight desktop video-context cases failed before execution because FFmpeg was absent (one is normally skipped on desktop). Seven then passed with the available system recorder; the desktop-only duplicate correctly skipped. Two desktop UI waits (offline selection navigation and recorded-movement replacement) timed out in the broad sweep, then passed unchanged with one worker; their mobile counterparts also passed. No timeout/assertion was relaxed and no cause/fix is claimed. The final isolated rerun took 47.4 seconds. The final source has 229 distinct executable scenarios passed and 15 project-conditional duplicates skipped across these runs; the initial full command itself was not green. Preserve these timing observations as release risks.

Five additional scoped audits passed in 1.8 minutes: 200% text/keyboard/light-dark access surfaces, entitlement navigation timing, local/80ms/300ms save measurements, route/offline readiness, and ordinary-versus-grouped save request counts.

## Security, boundaries and recovery evidence

`entitlements.test.sql` contains 80 assertions. It covers verified/unverified/anonymous
activation, existing accounts, repeated activation and immutable expiration, fourteen
consecutive days, exact microsecond expiration boundaries, leap-day and DST arithmetic,
private provenance, denied owner/foreign lifetime INSERTs, denied trial edit/delete and
grant revocation, denied client continuation/time inputs, overlapping grant precedence,
subscription/promotion/lifetime, revoked grants, direct-session/new-Favorite denials,
set/movement/Superset/cardio denials, independent/Favorite/program/enrollment start RPC
denials, and retained profile/preferences/Favorite management/History/records.

A saved session continues under its fixed snapshot while full account access is denied.
The suite saves sets, edits groups and saves cardio within grace, verifies stricter
inactivity expiry, rejects new work after grace, recovers an identical committed cardio
receipt, rejects a changed payload, permits Finish within grace and explicit Abandon
after grace, and verifies restoration never reopens terminal sessions. Expiration alone
never changes session status. Retained 28 suites continue to prove owner isolation,
CAS/revision conflicts, nonces, closed history, program evidence, retention, effort,
Superset and cardio contracts; entitlement does not rewrite evidence eligibility.

`scripts/validation/entitlement-concurrency.py` uses only a fixed disposable local Docker
container/database. Eight simultaneous activation connections return one shared exact
expiration and exactly one trial/grant. Two device saves at one set revision produce one payload receipt and one CAS winner. Two cardio saves at one revision yield
one committed winner. A revoker holds the grant lock while a save waits; a newly inserted
lifetime grant is deliberately committed after that lock scan starts. The waiting save
must deny rather than select an unlocked grant from a later READ COMMITTED snapshot.
The next command safely sees the new grant. After revocation, identical committed set/cardio
receipt recovery succeeds and changed-payload recovery fails. No real-time sleeping or
production clock override is used.

## Browser evidence

Focused tests create real disposable users, verify them through local email/Auth, log
in through the app, inspect trial dates, refresh activation, finish a workout, expire
protected fixtures, read History and settings, deny new training, inspect the clearly
nontransactional access-options page, restore access with a protected local lifetime
fixture, and retain prior history. The active-session scenario proves logging remains
available during grace and disabled after its fixed deadline, with saved cardio visible
and no silent closure. These are fixture SQL operations, not exposed admin endpoints.

Screenshots in [the evidence directory](evidence/phase-7-7e/README.md) cover 375/390/430px,
light/dark and an expired continuation. They are Chromium emulation, not physical
Safari/iPhone/Android/installed-PWA validation. Final production captures are included.

The known Phase 7.7D timing-sensitive grouped new-row/blur/Done scenario remains a
release-hardening concern. Passing retained regression does not establish that this
intermittent behavior is fixed. No queue/CAS/draft expectation was weakened here.

## Performance

The isolated rolled-back benchmark is reproducible with
`scripts/validation/entitlement-performance.sql`. On this local container, with concurrent
packaging activity, representative mean SQL execution times were: account summary 0.160ms,
set save 5.93ms, Superset edit 1.46ms, cardio save 2.43ms and expired History 5.91ms.
One independent start took 30.44ms. These are warm synthetic database timings, **not**
HTTP, physical-device or production-region latency, nor a before/after comparison.
The source adds zero standalone entitlement HTTP requests to set/cardio/group saves:
authority is checked in their existing SQL transaction. Request-local React cache
shares account status during a render; no cross-user/positive TTL cache is used.
Five focused production audits passed. Representative full navigations measured Dashboard 913ms, Workout entry 1,131ms, Profile 980ms, Workout Home 919ms and expired History 750ms. New-workout HTTP RPC measured 89ms and cardio-save RPC 73ms. Local set acknowledgement median was 324ms (12 samples), 306ms under the 80ms CDP profile and 530ms under the 300ms profile. Each observed save used two existing action requests (save plus continuity), with no new standalone entitlement request. Ordinary and Superset cells both used six action requests for three completed saves and zero grouping writes during sets. These descriptive samples do not establish causal improvements or a hosted latency budget. [Raw sanitized measurements](evidence/phase-7-7e/README.md) distinguish full navigation, in-app readiness, RPC and SQL timing protocols. No new polling/socket/service-worker entitlement cache.

## Reproduction and environment limits

Use Node 24 and `npm ci` with a writable task-local npm cache if the default cache is
read-only. The CLI also needed permission to write its local telemetry directory.
Local Auth container health probes to a private IP were proxy-denied (403); starting
with `--ignore-health-check` preserved the services, and the real localhost Auth
endpoint and disposable-user tests verified actual reachability. The Supabase changelog
and RLS markdown fetches were also 403-denied. Existing pinned Auth/RPC APIs were reused;
no SDK upgrade or TLS/proxy-policy bypass was introduced. A registry mirror supplied
the same local Kong version when the default registry was denied. Video scenarios initially
could not start because Playwright FFmpeg was absent. Its download domains were also
403-denied; the available system FFmpeg 7.1.5 is linked into the task-local expected
runner path. Actual video scenarios are rerun without disabling recording or changing
completion assertions.

```sh
npm run db:reset
npm run db:test
npm run db:lint
bash scripts/validation/entitlement-database.sh
# Separate explicit TAP run on that newly replayed database:
docker run --rm --network container:supabase_db_body \
  -e PGPASSWORD=postgres -v "$PWD/supabase/tests/database:/tests:ro" \
  --entrypoint sh ghcr.io/supabase/pg_prove:3.36 \
  -c 'pg_prove -h 127.0.0.1 -p 5432 -U postgres -d body_entitlement_isolated /tests/*.sql'
# Standard application checks:
npm run lint
npm run typecheck
npm test
npm run format:check
npm run catalog:check
npm run programs:check
npm run build
npm run start -- --hostname 127.0.0.1
# In another shell with PUBLIC LOCAL Supabase configuration:
PLAYWRIGHT_BASE_URL=http://127.0.0.1:3000 npm run test:e2e
npm run cf:build
npm run cf:check
```

## Rollout and remaining release gates

See [architecture and exact seven-step ordering](entitlement-architecture.md#exact-proposed-release-order).
Expansion `20261113222401` → app status support → staging validation → separately reviewed
enforcement `20261113222402`. Confirm hosted baseline through Cardio, backup/PITR,
version-selective delivery/integration settings, legacy active clients and forward
recovery before any deployment. Old verified clients initialize once on first guarded
write, but cannot explain later entitlement denials; refresh them onto the supported app.
Legacy set mutations have no invented payload receipts: resolve uncertain old commands and refresh old tabs before enforcement; missing legacy receipts require explicit saved-state review. Do not apply both migrations blindly through an unattended integration. No bypass is
enabled. Recovery preserves all facts and requires a reviewed forward migration.

Physical-device accessibility (VoiceOver/TalkBack, real keyboard/safe areas, 200% system
text), installed PWA lifecycle/cache eviction, hosted email/auth, actual production
latency, monitoring and operational recovery remain release gates. This phase adds no
checkout/webhook, promo redemption, lifetime admin endpoint or production launch claim.
Multiple-account trial abuse is not solved by account UUID uniqueness.

## Local Worker smoke

The final OpenNext output was run through `npm run cf:preview` locally: `/` returned
307, `/login` 200, `/history` 307 to the configured canonical login origin
`http://127.0.0.1:3000`, and `/offline` 200. That Node server had been stopped for
packaging, so the cross-port redirect was not followed successfully in this smoke. Optional live `Request.cf` metadata was unavailable; the
emulator used its documented local defaults. This verifies local packaging/public
rendering/private redirect behavior, not authenticated Worker flows, hosted Auth or
physical-device behavior. Authenticated browser coverage used the Node production server.
