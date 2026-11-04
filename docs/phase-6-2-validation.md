# Phase 6.2 validation and release notes

## Delivered

The existing application and PR #11 navigation context are preserved. New continuity and records features live in `src/features/continuity`, `src/features/records`, corresponding shared components, and `/history/records`. Logging retains queue/CAS/nonce/draft protections; History, review and Look Back integrate qualified duration and owner-only records.

The persistent bar resumes the same session outside logging. Database policy implements active <30 minutes, quiet 30–<60, check-in 60 minutes–<12 hours, and lazy automatic abandonment >=12 hours. All sets survive. Administrative close, effective endpoint, evidence and idle gaps are separate; no manual duration or client timestamp authority. Expiration explanation has no arbitrary one-day cutoff.

Actual 1/3/5RM use **exact** actual rep counts (optional further keys supported), distinct from Heaviest Lift and Estimated 1RM. Comparable-load reps, external session volume and separate unloaded/added-bodyweight records are included. Featured bench/back squat/conventional deadlift use existing hidden prominence; other exercises remain eligible. Postfinish/review show at most three deterministic diverse strict improvements, never historical backfill baselines, ties or abandonment.

See [continuity](workout-continuity.md) and [records](personal-records.md) for calculations, eligibility, ranking, legacy behavior and recovery details.

## Executed locally

| Check                                     | Result                                                                                                                   |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Fresh disposable Supabase replay          | Both forward migrations applied in order                                                                                 |
| Database lint, public + body_private      | No schema errors/warnings                                                                                                |
| pgTAP, including retained security suites | 1,322 assertions passed across 9 files                                                                                   |
| Vitest                                    | 144 tests passed across 29 files                                                                                         |
| ESLint / strict typecheck / formatting    | Passed                                                                                                                   |
| Catalog consistency                       | Passed, 183 exercises unchanged                                                                                          |
| Next.js production build                  | Passed                                                                                                                   |
| Production Next.js browser suite          | 48 passed, desktop + mobile                                                                                              |
| OpenNext Worker build                     | Passed                                                                                                                   |
| Wrangler deploy --dry-run                 | Passed; no upload or deployment                                                                                          |
| Local Worker browser suite                | 48 passed, desktop + mobile                                                                                              |
| Visual checks                             | Light/dark record captures and mobile continuity bar inspected; navigation clearance and no horizontal overflow asserted |
| Diff / earlier migrations                 | No whitespace errors; earlier migrations untouched                                                                       |

The exact-rep regression is covered independently by SQL and TypeScript: a heavier five-repetition set cannot change Actual 3RM. Browser assertions show a lower Actual 3RM alongside a heavier Actual 5RM, omit missing Actual 1RM, and label Estimated 1RM separately. Local role tests also cover protected times, passive reads, thresholds, idempotent resume/finish, expiration retention, foreign-user denials, source exclusions, unit buckets, multi-set volume, baselines/ties and recomputation.

Earlier exploratory runs exposed test fixtures that used nonexistent catalog slugs or assumed preloading always produces incomplete sets; those fixtures were corrected before the successful final runs. The pinned Next.js middleware convention still emits its existing deprecation warning; OpenNext compatibility is preserved. No required local checks were blocked by Docker or credentials. Hosted settings/data and real remote deployment were not tested or changed.

## Migration and security review

1. `20261104182136_workout_continuity.sql`: protected continuity metadata, server-derived lifecycle and completion times, atomic activity hooks, expiration gates, NOWAIT direct-DML guards and bounded history projection.
2. `20261104182137_personal_records.sql`: owner-only invoker performance/metric/record/achievement read models and bounded batch history counts. No mutable PR authority table.

All new APIs use SECURITY INVOKER, empty search paths and authenticated owner RLS. No new service-role bypass, public history access, broad timestamp grants, credentials or dependencies were introduced. Existing Worker identity/routing/keep_vars and deployment scripts are unchanged. Local authorization tests establish the tested behavior; this is not live hosted-database verification.

## Manual release checklist and limits

- Review the two forward migrations, especially timestamp grants, invoker guards and record eligibility.
- Confirm the correct Supabase target, backup/recovery readiness and approved release window. Apply migrations in timestamp order through the existing single approved migration path before releasing this app version; refresh older open app tabs afterward. Do not run a second parallel migration deployer.
- Obtain the normal approval for production deployment. This change does not authorize hosted SQL, merge, remote history repair or deployment.
- Retain existing dashboard-managed public build/runtime configuration and keep_vars. No new environment variables, secrets, service or scheduler are required.
- After an approved release, smoke-test real email/session continuity, logging, expired-session recovery and records in the correct hosted project. Local emulation is not proof of hosted deployment.

Cleanup is lazy on relevant authenticated requests; dormant sessions are not physically closed by a background scheduler. Unknown legacy activity is never invented. Idle-inclusive elapsed session duration is not verified exercising time. Device draft recovery is best-effort sessionStorage, not offline sync. Records are reproducible SQL over owner history; monitor latency at larger scale before adding a reproducible cache. Programs, charts, timers, social/trainer flows, OAuth and assistance/duration tracking remain out of scope. Stop after Phase 6.2.
