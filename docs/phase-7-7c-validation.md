# Phase 7.7C validation — Supersets

## Environment and scope

Validation used Node 24, the committed dependency lockfile, Chromium, a production Next.js server and disposable **local** Supabase/Auth/Mailpit. Base: main `542beb8f264277ea998fc63b7b8383dd9d5dec69`, fetched before implementation and rechecked before delivery. Branch: `feat/phase-7-7c-superset-groups`. No hosted SQL, remote reset, deployment, production configuration, new dependency or old-migration edit was performed.

Preflight reviewed the actual movement-first execution/selection code, logger queue, Phase 7.7A validation/focus and transport recovery, closure coordinator, performance qualification, immutable program snapshots, Favorites, retention, RLS and tests. The implementation plan was delivered before changes: structural identities/validation → shared Home/builder/logger → immutable program/Favorite mapping → History/retention → regression and packaging. [Architecture](superset-grouping-architecture.md) records the authority decisions.

## Executed checks

| Check                               | Actual result                                                                                                                                                                                                                                                                                                                                          |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| ESLint                              | Pass (`npm run lint`).                                                                                                                                                                                                                                                                                                                                 |
| Strict TypeScript                   | Pass (`npm run typecheck`).                                                                                                                                                                                                                                                                                                                            |
| Vitest                              | Pass: **398 tests / 77 files**, including the final round-confirmation guard.                                                                                                                                                                                                                                                                          |
| Formatting                          | Pass (`npm run format:check`); repeated after final documentation.                                                                                                                                                                                                                                                                                     |
| Exercise catalog                    | Pass: **183 exercises**.                                                                                                                                                                                                                                                                                                                               |
| Program catalog                     | Pass: **14 programs, 53 training days, 238 slots**; frozen original catalog migration checked unchanged.                                                                                                                                                                                                                                               |
| Fresh isolated migration replay     | Pass: all **30 migrations**, including both new forward migrations, replayed into task-owned `body_grouping_final_77c` after the base-only replay.                                                                                                                                                                                                     |
| Isolated full pgTAP                 | Pass: **2,402 assertions / 27 files**.                                                                                                                                                                                                                                                                                                                 |
| Standard `npm run db:test`          | Pass: **2,402 assertions / 27 files** on the local browser fixture database.                                                                                                                                                                                                                                                                           |
| Database lint                       | Pass for `public,body_private` on both local fixture and fresh isolated database; no schema errors.                                                                                                                                                                                                                                                    |
| Next.js production build            | Pass, including the final shared-confirmation correction.                                                                                                                                                                                                                                                                                              |
| Full Playwright desktop/mobile      | Executed: **215 passed, 14 existing project-scoped skips, 1 new assertion mismatch**, in 15.7 minutes. The mismatch expected exactly `Saved` rather than the existing valid `Saved · Bodyweight` label. It was corrected without changing logging behavior and rerun in the focused suite below. This full run is not represented as an all-green run. |
| Final Superset desktop/mobile suite | Pass: **12 tests**, desktop/mobile, on the final production build in **55.8 seconds**, including the held-response round-correction test.                                                                                                                                                                                                              |
| OpenNext/Cloudflare                 | Pass: generated Worker bundle; no deployment.                                                                                                                                                                                                                                                                                                          |
| Wrangler no-upload dry-run          | Pass: 178 static assets; 8,682.48 KiB bundle / 1,758.91 KiB gzip; `--dry-run: exiting now` (no upload).                                                                                                                                                                                                                                                |
| Local Worker requests               | Pass: public login/offline/manifest/service-worker/new media requests and owner-auth redirect for `/workout`; unauthenticated local Worker probes only.                                                                                                                                                                                                |

The 14 retained skips are duplicate project scopes: ten mobile-visual matrix cases run once in the desktop project while explicitly changing viewport/theme; the visual-refinement and compact logger-help matrices likewise run once; the contrast and viewport-storm checks run in mobile only. No new Superset test was skipped. The additional grouped Favorite/retention spec was added after the full run's discovery and executed separately on both projects. Later scoped presentation and round-status changes were checked in the final focused run; the earlier full count is not attributed to those later changes.

## Reproduction commands

Use the ignored local fixture configuration, with local Supabase URL on port 54321 and local application origin on 3000. `auth-helpers.ts` refuses hosted test targets. No credentials belong in documentation or commits.

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
# In a second shell with the local fixture environment:
PLAYWRIGHT_BASE_URL=http://127.0.0.1:3000 npm run test:e2e
PLAYWRIGHT_BASE_URL=http://127.0.0.1:3000 npm run test:e2e -- \
  tests/e2e/superset-groups.spec.ts tests/e2e/superset-reuse.spec.ts
PLAYWRIGHT_BASE_URL=http://127.0.0.1:3000 npm run test:e2e -- \
  --config=playwright.audit.config.ts superset-performance
npm run cf:build
npm run cf:check
```

The executor supplied `/usr/bin/chromium` through `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` and directed artifacts into `/tmp` to avoid the workspace's disk ceiling. Fresh replay used a separate task-owned database bootstrapped with local Auth/roles and then every migration in order; it did not reset hosted data or fabricate prior training. The actual isolated TAP command was:

```sh
docker run --rm --network container:supabase_db_body \
  -e PGPASSWORD=postgres \
  -v "$PWD/supabase/tests/database:/tests:ro" \
  --entrypoint sh ghcr.io/supabase/pg_prove:3.36 \
  -c 'pg_prove -h 127.0.0.1 -U postgres -d body_grouping_final_77c /tests/*.sql'
```

This is the disposable local default password, not a hosted secret. Isolated lint used the pinned CLI's `--db-url` against `127.0.0.1:54322/body_grouping_final_77c`; its flag-deprecation warning is recorded separately from the successful SQL lint. Do not point these fixture/replay commands at a remote project.

## Behavior and integrity evidence

`exercise_groups.test.sql` covers real actual sets before create/edit, two/three members, third-member removal, reorder with the same group UUID, stale CAS, invalid sizes/identities, nonoverlap, exact retries and changed-payload rejection. It compares complete saved-set rows byte-for-byte across structural edits and ungrouping. No group command manufactures completion. Closed sessions reject edits; foreign session/member/template identities and raw history writes fail. Both tables' owner/grant boundaries are tested, including zero-row RLS update/delete results.

Both new seeded first days instantiate two groups before any exercise selection. The SQL fixture selects each exact prescribed exercise and records genuine qualifying sets through the existing logger RPC, adds a third group member after recording, closes as fully prescribed and saves the actual final structure as a Favorite. The new Favorite remaps two groups, including three-member structure, with no completed actuals or assignment identity. Local Favorite ungrouping leaves the original snapshot unchanged. Cloning remaps private slot identities, retains metadata and cannot change an earlier immutable version. Repeated catalog installation leaves exactly two new source versions.

Browser tests create two groups before choosing exercises, log alternating rounds, add only an A1 set, render an unequal last round, return to collapsed Home, reorder/add/log/remove A3, ungroup after recording and recreate a group. The original recorded set remains unchanged. Final History reflects the resulting structure. Program tests start each real new seeded program and confirm that completing one group alone still produces a partial program workout, with no fictional advancement or template mutation.

A separate browser flow saves a grouped Favorite through the existing one-tap button, launches it from the existing shortcut, verifies empty/unconfirmed actual fields, archives/restores/deletes the source through existing confirmations and verifies retained Favorite definition plus cascade removal of the source commands.

Actual concurrent HTTP RPCs race overlapping creates and same-revision edits: exactly one succeeds, with the other rejected by overlap/CAS validation. Foreign account reads/mutations are denied. A lost acknowledgement is emulated **after the server commits**; Retry sends the identical command/request UUID and leaves exactly one persisted fact. The final held-response correction test verifies that a round cannot display Saved while a completed row's correction is awaiting acknowledgement. Ordinary set persistence, timing and completion intents are unchanged.

## Measurements and limits

The reproducible `tests/audit/superset-performance.spec.ts` probe compares three ordinary row saves with three grouped row saves at 0 ms and 150 ms Chromium CDP latency. This is local network emulation, not cellular/device testing. Both modes used **six save requests for three completed saves** (the existing blur/confirmation path), **zero grouping writes during set saves** and the same authoritative acknowledgement rule. The grouped logger mounted **zero heavy exercise carousels**, versus one on the ordinary exercise screen. The sample DOM contained about 418 nodes for six grouped rows versus 397–398 for three ordinary rows, including their existing selection surface.

Initial diagnostic Done-to-Saved medians were 570 ms ordinary / 537 ms grouped at 0 ms emulation and 614 ms / 796 ms at 150 ms. Each cell has only three observations and overlapped other regression activity; navigation also had cold/warm effects. These values establish neither an optimization gain nor a verified regression. An isolated final rerun on the final build (no concurrent suites) measured medians **174 / 215 ms** at 0 ms and **582 / 580 ms** at 150 ms, ordinary / grouped respectively; one grouped delayed sample was **1,602 ms**. Each mode still made the same six save requests, with no grouping writes. These tiny samples are descriptive and do not establish p95 or a production latency guarantee. Raw measurements from both runs are included in evidence. Do not infer physical iPhone latency, p95 or production edge/database timing from these samples.

The reproducible [local SQL probe](../tests/audit/superset-layout-probe.sql), executed with `docker exec -i supabase_db_body psql -U postgres -d body_grouping_final_77c -v ON_ERROR_STOP=1 < tests/audit/superset-layout-probe.sql`, created **201 structural commands** and measured the bounded owner-scoped `workout_group_layout` read at **1.816, 0.763 and 0.718 ms** with `EXPLAIN (ANALYZE, BUFFERS)`. This does not include authentication/network/render time. The session command cap is 1,000; the latest-revision index and single combined read bound reconstruction. The loader adds one grouping RPC concurrently with preferences, rather than per member/set. There is no polling or grouping-specific save queue.

## Screenshots and accessibility

The browser matrix captures **375×667, 390×844, 430×932, 768×1024 and 1440×900**, light/dark, reduced motion, two/three members and long real catalog labels. It checks horizontal bounds, lazy picker mounting, keyboard Escape, outside dismissal and focus return. The final root-text checks use 200% root font sizing; the new group labels use relative sizes and wrap rather than clipping. PNG pixel sizes reflect emulated device scale, not physical device evidence.

Representative actual local-fixture captures:

- [375 dark builder](evidence/phase-7-7c/builder-375-dark.png) · [390 light Home](evidence/phase-7-7c/home-390-light.png).
- [Three compact selectors](evidence/phase-7-7c/expanded-three-pickers-390-dark.png).
- [Two-member unequal rounds](evidence/phase-7-7c/rounds-unequal-mobile.png) · [three-member rounds](evidence/phase-7-7c/three-member-rounds-mobile.png).
- [Final History](evidence/phase-7-7c/history-final-groups-mobile.png) · [independent Favorite](evidence/phase-7-7c/favorite-group-remapped-mobile.png).
- [Upper/Lower program](evidence/phase-7-7c/upper-lower-program-mobile.png) · [Full Body program](evidence/phase-7-7c/full-body-program-mobile.png).
- [200% Home](evidence/phase-7-7c/home-200-percent-mobile.png) · [200% member editor](evidence/phase-7-7c/edit-three-200-percent-mobile.png).

[Final browser output](evidence/phase-7-7c/browser-final.txt), [initial full output](evidence/phase-7-7c/browser-full-initial.txt), [unit output](evidence/phase-7-7c/unit.txt), [isolated TAP](evidence/phase-7-7c/pgtap-isolated.txt), [standard TAP](evidence/phase-7-7c/db-test-standard.txt), [performance samples](evidence/phase-7-7c/performance-final.json) [Cloudflare build](evidence/phase-7-7c/cf-build.txt), [no-upload dry-run](evidence/phase-7-7c/cf-check.txt), [local Worker observations](evidence/phase-7-7c/worker-requests.json) and other sanitized command outputs are retained alongside the captures. Raw traces remain local because they can contain authentication data; they are not published with the PR.

## Migrations, rollout and recovery

1. Review and apply `20261111202827_workout_exercise_groups.sql` through the existing approved migration path before the new app version. It adds structural tables/RLS/validation, extends immutable program/Favorite structures and adds the `completed_workout` Favorite source. It does not rewrite actual sets or historical completion classifications.
2. Apply `20261111204706_superset_program_catalog.sql`; it installs two original immutable catalog versions and matching original SVG assets. Existing roots/versions/enrollments are preserved.
3. Retain deployment controls: no hosted Supabase operation or automatic merge/deployment was performed. The established disabled-preview scope remains; production application requires the usual separate reviewed rollout.
4. If correction is necessary, use a forward migration. Do not edit applied files or alter saved performance to repair structural presentation. Reverting application presentation leaves actual training evidence intact; do not remove source columns/constraints out from under deployed readers.

Development corrections caught by tests included an ambiguous SQL alias, a first clone extension based on an older body that omitted current metadata, stale explicit catalog counts and assertions using group-array position rather than stable group UUID. These were corrected before final isolated replay. Browser assertions were corrected to wait for server completion and accept the existing bodyweight status suffix; no logging invariant was relaxed.

Local Worker checks used the fixture canonical origin on port 3000, so its protected redirect correctly targets that local origin while Worker emulation runs on 8787. The initial probe assumed a 200 root and used the wrong `/sw.js` filename; the actual root is an unconditional `/dashboard` redirect and the service worker is `/body-sw.js`. Corrected route assertions passed. Wrangler could not obtain live `Request.cf` metadata and used its documented local placeholder. Authenticated grouped RPC execution on a hosted Worker was not tested.

Physical iPhone Safari/PWA, Android/PWA, native keyboard/Dynamic Type, safe-area hardware and hosted performance/latency remain unverified release checks. No circuits/HIIT, timed stations, cardio, durable offline drafts/replay, billing, promotional/lifetime access or admin features were implemented. See the [MVP roadmap](mvp-readiness-and-next-roadmap.md) for remaining gates.
