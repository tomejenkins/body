# Phase 7.6E validation

Base: latest merged main `c276d269d2dff1d5bbc9c22d3c484cdd0251ab3b`, including PR #31. Branch: `feat/phase-7-6e-visual-interaction-refinement`.

The complete Apple-like contextual-interaction addendum is applied: direct common actions, a two-item anchored Favorite menu, compact in-app editors/sheets, and retained useful advanced disclosures. See [architecture, inventory and interaction counts](visual-interaction-refinement.md).

## Executed checks

| Check                               | Actual result                                                             |
| ----------------------------------- | ------------------------------------------------------------------------- |
| Unchanged-main production build     | Passed before implementation                                              |
| Before-state viewport/theme capture | Passed one complete matrix; its duplicate mobile-project case skipped     |
| ESLint                              | Passed final source                                                       |
| Strict TypeScript                   | Passed final source                                                       |
| Vitest                              | Passed 344 tests in 67 files; final source-key/revalidation case included |
| Formatting                          | Passed complete source/test/documentation/evidence checks                 |
| Exercise catalog                    | Passed 183 exercises                                                      |
| Program catalog                     | Passed 12 programs, 46 training days, 205 slots                           |
| Fresh local migration replay        | Passed all existing migrations into empty isolated `body_visual_76e`      |
| Full pgTAP                          | Passed 2,308 assertions in 26 files                                       |
| Database lint                       | Passed `public,body_private`; no warnings/errors                          |
| Release Next.js build               | Passed                                                                    |
| Focused acceptance                  | Passed 7 tests; one duplicate viewport-matrix case skipped                |
| Full desktop/mobile Playwright      | Passed 163 cases; 11 duplicate viewport-matrix cases skipped              |
| Cloudflare/OpenNext                 | Passed `npm run cf:build`, including Next rebuild                         |
| Wrangler no-upload dry-run          | Passed `npm run cf:check`; exited without upload                          |
| Local Worker smoke                  | Passed 12/12 localhost public/authentication-boundary requests            |

Commands use committed dependencies, Node 24, pinned Supabase CLI 3.0.0, local Docker and system Chromium. A portable equivalent is `PLAYWRIGHT_BASE_URL=http://127.0.0.1:3000 PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium npm run test:e2e` with the existing localhost public Supabase variables set. The actual full browser launcher is `node /workspace/work/active-workout/run-e2e.mjs`, with two default workers, no added retries and `PLAYWRIGHT_BASE_URL=http://127.0.0.1:3000`. Both desktop and mobile projects run Chromium; mobile emulation is not Safari or a physical iPhone.

The fresh replay created an empty database, loaded the local managed Auth/extensions schema-only bootstrap, then applied every migration in filename order using `psql -v ON_ERROR_STOP=1`. No hosted rows were copied. All retained SQL tests ran using `ghcr.io/supabase/pg_prove:3.36`, `/tests/*.sql`, `PGHOST=supabase_db_body`, `PGDATABASE=body_visual_76e`, and the local `body_validation` network. Clean disposable-stack equivalent: `npm run db:reset` followed by `npm run db:test`.

No migration, SQL function, RLS policy, grant, dependency or catalog definition changes are part of 7.6E. No hosted Supabase, infrastructure, deployment or merge operation is performed.

The eleven full-run skips are intentional duplicate viewport matrices: ten pre-existing mobile visual-matrix copies and the new matrix's mobile-project copy. Each matrix already visits all requested mobile/tablet/desktop widths in its desktop Chromium run; the actual mobile project separately runs the functional Favorite and protected workout cases.

`npm run cf:preview -- --port 8787 --ip 127.0.0.1` served the final local Worker. Login and manifest returned 200; private Dashboard, Workout, Programs/current/enrollment, History/Archived History, Program History/detail and completion URLs returned the expected 307 authentication redirects. These are public-asset and authentication-boundary checks, not authenticated Worker workout workflows: the local database was stopped with retained volumes after Node browser testing to free packaging storage.

Packaging evidence: [OpenNext build](evidence/phase-7-6e/cf-build.txt), [Wrangler no-upload dry-run](evidence/phase-7-6e/cf-check.txt), [Worker smoke results](evidence/phase-7-6e/worker-smoke.json). Existing middleware-convention, webpack cache and proxy-environment warnings did not fail builds. No upload or deployment occurred.

## Favorite and contextual interaction evidence

The new `favorite-one-tap.spec.ts` exercises:

- One-click recommended and alternative program saves with exact source-day defaults and no naming input or disclosure.
- An intercepted pending request: Saving… is disabled and no saved confirmation appears before authoritative response.
- A second stale browser page, representing another signed-in client, saving the same source: one retained Favorite, confirmed saved state on both.
- Two-item ellipsis menus across 375, 390, 430, 768 and 1440px, in light/dark themes. Bounds stay inside the viewport, the portal layer is above fixed chrome, and destructive menu text meets a measured 4.5:1 contrast threshold against its actual menu surface.
- Escape, physical outside click, keyboard activation, menu-selection dismissal, automatic rename-input focus/selection and focus return.
- Compact mobile editor sheets, 200% root text, optional rename, confirmed removal and retained workout history.
- One-tap completion and eligible History saves. A long source name is bounded; no caller title is trusted and no performance is copied into a Favorite start.
- Foreign private version/day IDs substituted into the form are denied. A failed transport remains retryable with the same UUID and no false saved feedback.
- Existing regression coverage retains capacity 100, actual source snapshots, independent Favorite launches, active-session protection, program isolation and owner boundaries.

Unit tests separately cover the existing friendly-name fallback, Unicode-safe current length limit, ignored caller title, exact readable non-rest day, owned completed unarchived session, inaccessible sources, post-save concurrent removal, server rejection, pending state, already-saved state and raw transport rejection/retry.

Program management retains explicit end/switch confirmation, revision fields and authoritative lifecycle operations. The existing regression tests now open the direct management panel and close it before inspecting cards beneath the modal. No logger saving or closure behavior is changed to satisfy tests.

## Visual and accessibility checks

The new visual matrix visits Dashboard, Programs, Current Program, Workouts History, Programs History, exact enrollment detail, workout detail, program detail, Workout Complete and the protected Workout entry. It uses actual owner-scoped locally saved program sets and enrollment identity, not invented metrics or static mock screenshots.

Every route is checked at 375×667, 390×844, 430×932, 768×1024 and 1440×900 in both themes, with no horizontal overflow. Additional captures/checks cover empty Dashboard, direct management opening, Archived History and 200% root text on Dashboard, Programs and both History modes. Existing lifecycle tests provide repeated-enrollment and genuine comparable-improvement evidence.

Readiness assertions wait for actual route content rather than merely a matching heading, so a streaming loading placeholder is not treated as final evidence. Protected Workout entry, picker, logger, timer/footer and completion behavior remain covered by the complete regression suite.

### Before/after provenance

The fresh before-state matrix ran on the unchanged merged-main production build. Its initial Dashboard images caught a streaming loading placeholder, which are **not published as final baseline evidence**. Dashboard/weekly-widget baseline captures instead come from the retained actual Phase 7.6D.1 regression run, whose merged Dashboard/component source and styling match this task's base. Those images have a different synthetic account/date and are labeled as that provenance, not a same-session or same-day comparison.

Other before images are from this task's unchanged-main capture. The completion baseline uses the already-committed PR #31 no-PR capture; the Favorite baseline uses that merged implementation's retained Favorite regression capture. After images come from real local 7.6E browser runs. Comparisons establish presentation/interaction changes, not equal performance values between different fixtures.

Representative evidence (different synthetic sessions may show different legitimate values):

| Surface             | Before                                                                                                                         | After                                                                                                                                            |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Dashboard           | [390 light](evidence/phase-7-6e/before/dashboard-390-light.png), [calendar](evidence/phase-7-6e/before/calendar-390-light.png) | [390 light](evidence/phase-7-6e/after/dashboard-390-light.png), [dark](evidence/phase-7-6e/after/dashboard-390-dark.png)                         |
| Programs            | [Before](evidence/phase-7-6e/before/programs-390-light.png)                                                                    | [After](evidence/phase-7-6e/after/programs-390-light.png), [desktop](evidence/phase-7-6e/after/programs-1440-light.png)                          |
| Current Program     | [Before](evidence/phase-7-6e/before/current-390-light.png)                                                                     | [After](evidence/phase-7-6e/after/current-390-light.png), [actual strength improvement](evidence/phase-7-6e/after/strength-current.png)          |
| Workouts History    | [Before](evidence/phase-7-6e/before/history-390-light.png)                                                                     | [After](evidence/phase-7-6e/after/history-390-light.png), [dark](evidence/phase-7-6e/after/history-390-dark.png)                                 |
| Programs History    | [Before](evidence/phase-7-6e/before/program-history-390-light.png)                                                             | [After](evidence/phase-7-6e/after/program-history-390-light.png), [separate repeats](evidence/phase-7-6e/after/repeat-enrollments-390-light.png) |
| Workout detail      | [Before](evidence/phase-7-6e/before/workout-detail-390-light.png)                                                              | [After](evidence/phase-7-6e/after/workout-detail-390-light.png)                                                                                  |
| Program detail      | [Before](evidence/phase-7-6e/before/program-detail-390-light.png)                                                              | [After](evidence/phase-7-6e/after/program-detail-390-light.png)                                                                                  |
| Favorite saving     | [Disclosure before](evidence/phase-7-6e/before/complete-independent.png)                                                       | [Direct button](evidence/phase-7-6e/after/complete-ad-hoc-no-pr.png), [confirmed saved](evidence/phase-7-6e/after/complete-favorite-saved.png)   |
| Favorite management | [Before](evidence/phase-7-6e/before/favorites.png)                                                                             | [Two-action menu](evidence/phase-7-6e/menus/menu-390-dark.png), [mobile rename sheet](evidence/phase-7-6e/menus/editor-375-light.png)            |

Additional evidence: [direct Program management](evidence/phase-7-6e/after/manage-program-direct.png), [pending end](evidence/phase-7-6e/after/pending-end.png), [switch confirmation](evidence/phase-7-6e/after/switch-confirmation.png), [Archived History](evidence/phase-7-6e/after/archived-history.png), [enrollment detail](evidence/phase-7-6e/after/enrollment-390-light.png), [200% History](evidence/phase-7-6e/after/large-text--history.png), [200% Favorite editor](evidence/phase-7-6e/menus/favorite-editor-200-percent.png), and [retained-baseline Git-tree provenance](evidence/phase-7-6e/baseline-provenance.json).

The evidence directories include all requested widths/themes for representative Dashboard/History and menu/editor states. Representative captures were opened and inspected. Names, sets, program states and improvements come from actual local fixture operations; no UI values were painted into screenshots.

Logs: [final units](evidence/phase-7-6e/vitest-final-authoritative.txt), [database regression](evidence/phase-7-6e/pgtap.txt), [database lint](evidence/phase-7-6e/db-lint.txt), [fresh replay](evidence/phase-7-6e/fresh-replay.txt), [release build](evidence/phase-7-6e/build-final-authoritative.txt), [source/ownership browser case](evidence/phase-7-6e/foreign-request.txt), and [final full browser run](evidence/phase-7-6e/browser-final.txt), and [final-source affected rerun](evidence/phase-7-6e/affected-final.txt). Authenticated traces and ignored local environment/stack configuration are excluded.

## Iterations and known limits

The initial baseline locator found both streaming headings briefly. Requiring one accessible heading fixed that synchronization issue; later inspection additionally identified a Dashboard loading-placeholder capture, so final screenshots require the actual training region/content.

The first broader focused run passed 25 cases and failed two assertions that inspected renamed cards while the new modal correctly hid the page from accessibility queries. Tests were corrected to inspect confirmed editor closure and then the visible card. A subsequent focused run exposed genuine Rename autofocus and 200% text issues: shortcut icons and the History segment grid overflowed. Explicit input focus, minmax columns and responsive shortcut sizing corrected those defects. The final acceptance run passed all seven nonduplicate cases, including the complete width/theme and increased-text checks.

The menu outside-click test originally attempted to click an underlying DOM heading while Radix's modal menu intentionally disabled outside pointer targets. A physical pointer-coordinate click now verifies the actual outside-dismiss interaction. It does not bypass actionability for a protected or destructive operation.

The first full run passed 162 cases with 11 duplicate-matrix skips and one new mobile adversarial-source fixture failure. Its pre-hydration hidden-input edits had been restored to the valid owned source, so it never exercised the intended foreign request. The fixture now intercepts form serialization and asserts the actual outgoing foreign version/day IDs before checking denial. Both projects passed that request-level test; the entire suite then passed 163 cases with 11 duplicate-matrix skips (9.1m). No authorization rule was relaxed.

The final review keys save state by exact source and authoritative saved status, retaining its initial UUID through unchanged-state server revalidation. A new unit test proves request stability; source changes remount the control so saved state cannot carry into a different recommendation.

After that complete run, the control key was further tied to the authoritative saved/removed state. The final targeted test now removes a just-saved Favorite and saves it again, verifying enabled/confirmed feedback, preserved custom name, two retained shortcuts and unchanged assignment progress. The schedule anchor offset also includes the header's safe-area inset. A fresh production rebuild, all 344 unit tests, lint/types, and all 10 affected desktop/mobile Favorite/calendar cases passed on this final source (44.6s). The preceding full run and final targeted run are reported separately rather than combining their counts.

The final name formatter preserves the existing web validation cap without splitting a Unicode character. There is no alternate naming, performance, eligibility or scheduling engine. The source action uses the existing SQL RPC plus authorized source/default and retained-row reads.

The managed filesystem requires temporary dependency/Next relocation while the disposable database and browser tests run. Native Cloudflare packaging uses restored normal workspace paths after stopping only task-owned local services with retained volumes. A local Auth-container loopback health probe uses direct loopback only; inherited external proxy/TLS behavior remains intact. Supabase's external changelog/documentation host returned policy 403, so no new SDK or database API was introduced.

Physical Safari scroll-edge/safe-area behavior, Dynamic Type, actual keyboard geometry, VoiceOver/TalkBack and real device performance remain release checks. Root-font and Chromium emulation do not establish those results. Saved Favorite state is a point-in-time owner read; no new realtime subscription, offline queue or polling system is introduced. Later device changes are reconciled by normal refresh and server validation.

Phase 7.6F should perform the final staged device, connectivity, accessibility and release-readiness review. No migration deployment or hosted data correction is required for this phase.
