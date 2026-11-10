# Phase 7.6D.1 validation

Base: merged main `b2a24efb1d7393150a0af49b74fd811628a2b174` (PR #30). Branch: `feat/phase-7-6d-1-workout-flow-polish`.

The change is limited to contextual exercise navigation, shared footer presentation/local abandonment arming, opaque mobile header paint and a restrained completion halo. No migrations, dependencies, SQL, logging queue, performance metrics, schedule/lifecycle/retention RPC or session-timing algorithm changed. See [architecture and behavior](workout-flow-mobile-polish.md).

## Executed checks

| Check                           | Actual result                                                                                                                           |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Unchanged-main `npm run build`  | Passed before editing                                                                                                                   |
| Before-state Playwright         | Two-tap abandonment: 2 passed; temporary header capture: 1 passed in mobile project, repeated to persist computed styles                |
| `npm run lint`                  | Passed; repeated after final test additions                                                                                             |
| `npm run typecheck`             | Passed strict checks; repeated after final test additions                                                                               |
| `npm test -- --maxWorkers=2`    | Passed 335 tests across 65 files                                                                                                        |
| `npm run format:check`          | Passed complete tree, including documentation and evidence                                                                              |
| `npm run catalog:check`         | Passed 183 exercises                                                                                                                    |
| `npm run programs:check`        | Passed 12 programs, 46 training days, 205 slots                                                                                         |
| Fresh isolated migration replay | Passed every existing migration into empty local `body_flow_76d1`                                                                       |
| Full pgTAP                      | Passed 2,308 assertions across 26 files                                                                                                 |
| `npm run db:lint`               | Passed `public,body_private`; no warnings or schema errors                                                                              |
| `npm run build`                 | Passed new and final production builds                                                                                                  |
| Focused new flow tests          | Passed 4 desktop/mobile cases, including the complete width/theme matrix, pending-write hold, refresh, 200% text and simulated keyboard |
| Full Playwright desktop/mobile  | Passed 156 cases; 10 existing duplicate viewport cases skipped                                                                          |
| OpenNext/Cloudflare             | Passed `npm run cf:build`, including Next rebuild                                                                                       |
| Wrangler no-upload dry-run      | Passed `npm run cf:check`; exited without upload                                                                                        |
| Local Worker smoke              | Passed 10/10 localhost public/authentication-boundary requests                                                                          |

Actual commands used the committed lockfile, Node 24 and system Chromium with `PLAYWRIGHT_BASE_URL=http://127.0.0.1:3000`. The browser launcher only loads the ignored public localhost Supabase configuration. Tests use two default Playwright workers with no new retries. Desktop and iPhone-viewport projects both run Chromium; neither is a physical Safari test.

Fresh replay created an isolated database, loaded the local Auth/extensions schema-only bootstrap, and applied every `supabase/migrations/*.sql` in order with `psql -v ON_ERROR_STOP=1`. The full suite ran through `ghcr.io/supabase/pg_prove:3.36`, `/tests/*.sql`, `PGHOST=supabase_db_body`, `PGDATABASE=body_flow_76d1`, on local network `body_validation`. No hosted data was read or changed. A clean disposable-stack equivalent is `npm run db:reset` then `npm run db:test`.

The complete browser run passed 156 tests in 8.1 minutes. Its ten skips are the existing duplicate mobile-project viewport-matrix cases: that matrix already runs all requested widths/themes under the desktop Chromium project. The final review additionally retained an initial non-submitting Abandon button type before arming, preserving the same DOM node; all affected flow/closure/timer browser cases and the complete unit suite are rerun after rebuilding that adjustment. The final rerun passed all 12 affected desktop/mobile tests (47.1s), and all 335 unit tests passed again (65 files).

The screenshot framing was then corrected to show the actual newly added unchecked row, with its copied defaults. The four flow/header tests passed again (16.6s); this last test-only adjustment changes no application source. [Corrected evidence run](evidence/phase-7-6d-1/evidence-final.txt).

`npm run cf:preview -- --port 8787 --ip 127.0.0.1` served the final local Worker. Login and manifest returned 200; protected Dashboard, Workout, Programs, History/Archived History, Programs history selector and completion URLs returned 307 as expected. These are public-asset/authentication-boundary smoke checks, not authenticated Worker workout execution: local database services were stopped with retained volumes after the successful Node browser tests to free build space.

Packaging evidence: [OpenNext build](evidence/phase-7-6d-1/cf-build.txt), [Wrangler no-upload dry-run](evidence/phase-7-6d-1/cf-check.txt), [Worker results](evidence/phase-7-6d-1/worker-smoke.json). Existing middleware-convention and webpack cache warnings did not fail builds. No upload, hosted query or deployment occurred.

## New behavior and regression evidence

- The display predicate requires one or more saved, confirmed-completed nondeleted rows and rejects pending/skipped/unconfirmed/dirty/error/conflict/deleting/local-only entries. Removed-only exercises remain incomplete. It does not replace training eligibility.
- Browser tests complete real locally seeded rows, hold an actual set-save request and verify the contextual area stays absent while dirty/pending. After authoritative save it appears; refresh reconstructs it.
- Repeated Add Set taps create exactly one new pending row. Existing preceding values (100 lb and 9 reps in this synthetic fixture) carry forward; completion does not. The contextual area hides until the new row is saved complete.
- Next Exercise returns to the exact same session Home. Workout exercise IDs and canonical selections remain unchanged; no program assignment appears; session remains in progress. Server start instant stays unchanged and effective elapsed time does not decrease.
- Geometry checks compare the same Abandon button before/after arming: identical bounding box; all three footer columns have equal widths and y positions. Timer spans above them. No Cancel button is present.
- Existing abandonment tests verify first-tap no POST, real second-tap closure, saved-work preservation, pending mutual exclusion, transport failure/retry, refresh reset and no schedule or pending-program-end advancement. Unit coverage also verifies persistent DOM identity, Escape/popstate and a nonprevented underlying outside click.
- Header captures assert opaque theme paint, sticky position and y=0 after scrolling. Focused logger retains its hidden header.
- Completion tests assert the halo animation only with normal motion and `none` with reduced motion, alongside existing saved facts/PR/empty/retention navigation behavior.

## Screenshots and inspection

All after screenshots use synthetic, owner-scoped local workouts with actual saved rows. Representative captures were opened and inspected, not inferred solely from assertions.

| State                                 | Evidence                                                                                                                                                                                              |
| ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Before footer and old confirmation    | [Default](evidence/phase-7-6d-1/before/finish-abandon-default.png), [armed](evidence/phase-7-6d-1/before/confirm-abandon-375-light.png)                                                               |
| Final default footer                  | [Back / Abandon / Finish](evidence/phase-7-6d-1/after/footer-default.png)                                                                                                                             |
| Before header                         | [Top](evidence/phase-7-6d-1/before/header-top.png), [scroll](evidence/phase-7-6d-1/before/header-scroll.png), [computed styles](evidence/phase-7-6d-1/before/header-style.json)                       |
| Exercise incomplete                   | [Capture](evidence/phase-7-6d-1/after/exercise-incomplete.png)                                                                                                                                        |
| Confirmed exercise and armed footer   | [375 light](evidence/phase-7-6d-1/after/confirmed-375-light.png), [390 dark](evidence/phase-7-6d-1/after/confirmed-390-dark.png), [430 light](evidence/phase-7-6d-1/after/confirmed-430-light.png)    |
| Add Set result                        | [Pending new row](evidence/phase-7-6d-1/after/add-set-pending.png)                                                                                                                                    |
| Same Workout Home after Next Exercise | [Capture](evidence/phase-7-6d-1/after/same-workout-home.png)                                                                                                                                          |
| Increased text                        | [200% root text](evidence/phase-7-6d-1/after/footer-200-percent.png)                                                                                                                                  |
| Keyboard inset                        | [Simulated 280px visual viewport inset](evidence/phase-7-6d-1/after/keyboard-inset-simulated.png)                                                                                                     |
| Header top and scroll                 | [Top light](evidence/phase-7-6d-1/after/header-top-light.png), [scroll light](evidence/phase-7-6d-1/after/header-scroll-light.png), [scroll dark](evidence/phase-7-6d-1/after/header-scroll-dark.png) |

The after directory includes 375×667, 390×844, 430×932, 768×1024 and 1440×900 confirmed/armed captures in both themes. At normal text the middle label is one line at 375px; 200% text wraps inside its stable column. All footer controls remain at least 48px tall. The fixed contextual area and timer occupy separate rows and do not overlap each other. Their measured height reserves scroll space for logger content.

Completion comparisons use the merged Phase 7.6D evidence already committed on main: [before no PR](evidence/phase-7-6d/after/no-pr-mobile.png) → [after no PR](evidence/phase-7-6d-1/after/complete-ad-hoc-no-pr.png), and [before PRs](evidence/phase-7-6d/after/prs-390-light.png) → [after PRs](evidence/phase-7-6d-1/after/complete-prs-390-light.png). These are different synthetic sessions, not a claim that recorded values should match. The prior captures show the same completion CSS present at this task's base; footer/header before captures were made afresh on unchanged main this task.

Logs: [unit tests](evidence/phase-7-6d-1/vitest.txt), [database tests](evidence/phase-7-6d-1/pgtap.txt), [database lint](evidence/phase-7-6d-1/db-lint.txt), [fresh replay](evidence/phase-7-6d-1/fresh-replay.txt), [focused flow](evidence/phase-7-6d-1/flow-browser-final.txt), [Next build](evidence/phase-7-6d-1/build.txt), [ESLint](evidence/phase-7-6d-1/lint-final.txt) and [strict TypeScript](evidence/phase-7-6d-1/typecheck-final.txt). Authenticated Playwright traces and ignored environment files are deliberately not published.

Final-source logs: [affected browser rerun](evidence/phase-7-6d-1/affected-final.txt), [full browser regression](evidence/phase-7-6d-1/browser-regression.txt), [final unit suite](evidence/phase-7-6d-1/vitest-final.txt), [final production build](evidence/phase-7-6d-1/build-final.txt). The final guard adjustment changes only the initial button's non-submitting type/local click prevention; the complete suite preceded that adjustment, followed by the rebuilt affected-suite rerun. No database, CSS, logger queue or scheduling change occurred between those runs.

## Iterations and limitations

The first focused browser run passed ten cases and failed the two new flow cases because the test counted rows before client navigation completed. Adding an explicit visible Exercise Logger assertion fixed test synchronization; the four new flow/header cases then passed twice, including the expanded pending-save, text-size and keyboard checks. No application saving or navigation behavior was changed to make these tests pass. A later whole-tree formatting check flagged the captured baseline JSON's missing final newline; formatting corrected that evidence file without changing its computed values.

The user referenced iPhone screenshots, but only the text request was attached. Inspection confirms a transparent/static baseline header, with no app-applied filter, mask, opacity or gradient over the wordmark. Solid paint and mobile sticky/safe-area layout are locally verified; the exact reported native iPhone fade cannot be conclusively diagnosed without the referenced images or physical Safari reproduction.

The keyboard test dispatches the existing visualViewport resize path with a synthetic 280px inset. It is not a real iOS keyboard, Dynamic Type, VoiceOver or hardware test. Physical iPhone Safari safe areas, browser scroll-edge chrome, keyboard/focus and 200% text remain release checks. Header hidden-on-logger behavior is retained intentionally.

The managed filesystem uses temporary dependency/Next relocation during local database/browser testing. Native OpenNext packaging requires restoring normal workspace directories after stopping only this task's disposable local stack with retained data. No hosted Supabase, production deployment, merge or new credential is involved.

Phase 7.6E can align Dashboard, Programs and History styling; it should not introduce another active-footer implementation or change set-saving behavior. No migration deployment is required for 7.6D.1.
