# Phase 6.3 validation and handoff

## Base and delivered behavior

Local feature branch: `feat/phase-6-3-progress-analytics`, based on verified merged main `afb6358` (Phase 6.2 PR #12). The checkout's default fetch refspec updated origin/HEAD rather than origin/main; preflight corrected the tracking reference with an explicit main fetch and verified the fetched merge before branching. No application was reinitialized or redesigned.

- Performance truth stays exact by canonical exercise/rep count. Historical dominance suppresses redundant recognition only; current stronger sets annotate ranking without erasing genuine improvement candidates.
- Postfinish highlights remain deterministic and capped at three different exercises, with category diversity, hidden prominence, strict ties/baselines and repeated-refresh stability.
- Exercise Look Back adds date-range, metric, observed-load and exact-rep controls, real chronological session points, accessible selection/table details and workout links. Existing builder/navigation context remains intact.
- History → Training progress adds completed-workout/day counts, calendar navigation, recent frequency, qualified duration averages and sufficiently populated preceding-period comparisons.
- Weekly sets are counted once overall; external volume stays separated by exercise/category, unloaded bodyweight reps stay separate, and muscle primary/secondary exposure is explicit with Unclassified fallback.
- Personal Records keeps the three featured lifts, searchable other records, Best Single/Triple/Five-Rep Set terminology, actual rep context, dates/workout provenance and separate labeled estimates.

See [progress analytics](progress-analytics.md) and [intelligent recognition](intelligent-pr-recognition.md) for precise algorithms and conventions.

## Executed checks

| Check                                                | Result                                                                                                                          |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Fresh LOCAL Supabase migration replay                | Passed, both new forward migrations in order                                                                                    |
| Database lint, public + body_private                 | Passed, no schema errors/warnings                                                                                               |
| pgTAP                                                | 1,372 assertions passed across 10 suites                                                                                        |
| Vitest                                               | 158 tests passed across 32 files                                                                                                |
| ESLint / strict TypeScript / formatting              | Passed                                                                                                                          |
| Catalog consistency                                  | Passed, 183 exercises unchanged                                                                                                 |
| Next.js production build                             | Passed                                                                                                                          |
| Full desktop/mobile production Next.js browser suite | 52 passed                                                                                                                       |
| OpenNext Worker build                                | Passed, including full Next.js compilation                                                                                      |
| Wrangler no-upload dry-run                           | Passed                                                                                                                          |
| Full desktop/mobile local Worker browser suite       | 52 passed                                                                                                                       |
| Final mobile label/copy polish                       | Rebuilt; 4 affected desktop/mobile analytics browser cases passed                                                               |
| Visual inspection                                    | Desktop light and mobile dark progress/overview captures inspected; final chart scale checked after removing overlapping labels |
| Diff checks                                          | No whitespace errors; previously applied migrations untouched                                                                   |

Retained suites cover authentication, private catalog/custom data, actual logging, drafts/CAS/concurrency, continuity/expiration, exact-rep records and PR #11 navigation. New tests cover historical/current dominance, source preservation, load/rep tradeoffs, date boundaries/DST, same-day workouts, duration exclusions, numeric volume, bodyweight/added distinctions, muscle exposure, archived custom history, invalid filters and foreign-owner aggregate denials. A 227-session chart fixture proves bounded actual-point sampling with full counts and unchanged all-time bests.

No local checks were blocked by Docker or missing credentials. Supabase tests/browser accounts were restricted to the disposable local stack with synthetic data. The existing Next.js middleware deprecation warning remains; the pinned OpenNext deployment approach is preserved. Hosted database state and production deployment were intentionally not tested or modified.

## Migrations and security/performance review

1. `20261104205843_progress_analytics.sql`: central performance source/metric helpers, backwards-compatible existing wrappers, validated local-date window, bounded analytics RPCs and completed owner/start/ID index.
2. `20261104205844_intelligent_record_recognition.sql`: batch meaningful candidates, dominance annotation/filtering and shared history/postfinish wrappers.

All new read models use SECURITY INVOKER, empty search paths, authenticated UID and existing owner RLS. Anonymous/service-role EXECUTE is denied. No authoritative client PR writes, new mutation grants, privileged bypass, secrets, additional dependencies, shared private cache or summary truth tables are introduced. Ordinary range queries filter before aggregation; chart payloads are bounded and recognition history is scoped to relevant exact exercises. Synthetic local tests support correctness and bounds, not a hosted load/capacity claim. Monitor larger hosted data/query plans before adding any reproducible cache.

Worker identity, routing, keep_vars, deployment configuration and package lockfile are unchanged. No hosted SQL, migrations, history repair, production deployment, push or PR creation is performed for this handoff.

## User-managed publication and release

The user requested control of publication. After reviewing the local commit:

```sh
git push -u origin feat/phase-6-3-progress-analytics
```

Then open [the comparison against main](https://github.com/tomejenkins/body/compare/main...feat/phase-6-3-progress-analytics) and choose **Create draft pull request**. This URL requires the branch to be pushed first; no PR is claimed to exist yet. Do not merge automatically.

Before an approved release, review/apply both forward migrations in order to the correct development/preview database and test there; app analytics needs the new RPCs. Use the existing single approved Supabase migration path, not a duplicate deployer. Production SQL and app deployment require target confirmation, normal approval and recovery readiness. Existing public build/runtime variables suffice; no new secrets, service or scheduler is needed. After approved release, smoke-test hosted auth/session, owner-scoped Progress, recorded values/units and preserved logging/navigation.

## Known limits

- Browser IANA timezone is used; no account timezone preference is introduced.
- Long exercise series use disclosed chronological peak sampling (at most 180 real observations); all-time records never use samples. Overview bins may span multiple weeks for very long periods.
- Selectors show 20 frequent loads/exercises and 12 observed rep counts; full records/history remain separately accessible.
- Calendar links a training day to its earliest completed workout; other same-day sessions remain in History. Calendar month and summary range are independent.
- Normal-finish elapsed duration is not verified exercise time. Estimates, legacy/unknown and idle-inclusive sessions are excluded from the primary average.
- Muscle exposure uses current catalog classification, overlapping primary groups and separate secondary involvement, not physiological stimulus estimates or historical classification snapshots.
- Completed empty sessions count as completed workouts/days but contribute zero working sets. Comparisons require three workouts in each period and remain descriptive.
- All-time and recognition queries inspect relevant full owner history on demand; no production-scale capacity claim or cache is made.
- Programs, scheduling, full historical editing, assistance/duration logging, timers, coaching, trainer/social, OAuth, videos, subscriptions and offline sync remain out of scope. Stop after Phase 6.3.
