# Body

A mobile-first foundation for a premium workout tracker. The repository was empty at initialization; no existing stack was replaced.

## Stack and scope

Next.js App Router, React, strict TypeScript, Tailwind CSS v4, shadcn/ui-style local components (Radix Slot, CVA, `cn`), and Supabase SSR/browser adapters. ESLint, Prettier, Vitest, Testing Library, and Playwright provide checks. Node 24 LTS and npm are the validated tools; the npm lockfile pins dependencies.

The six existing routes retain the responsive shell and are protected by real Supabase authentication. Phase 3.1 adds email/password signup, confirmation, sign-in/out, recovery and minimal display-name onboarding; Phase 5.2 adds actual set logging with canonical kg/lb display, typed sets, reliable saves and intentional incomplete finish. See [set logging](docs/set-logging.md). Phase 5.3 adds automatic pending rows, private historical defaults, exact entered-weight display and Profile Settings for units; see [smart defaults](docs/smart-set-defaults.md). Phase 5.1 supports real ad-hoc session lifecycles and exercise selection management. Phase 4.1 adds the real exercise library, custom exercises, favorites and deterministic recommendations. Phase 2.1/2.2 provide the versioned schema and owner-isolation policies. Hosted migration state and live signup readiness require administrator verification; local success is not hosted verification. Social features, program generation and trainer capabilities remain unimplemented.

Phase 6.1 adds paginated [workout History and exercise Look Back](docs/workout-history.md), reps-first bodyweight logging and an internal [record prominence foundation](docs/record-prominence.md). Phase 6.2 implements PR calculations; Phase 6.3 adds charts and analytics as documented below.

## Local setup

```sh
nvm use # optional; .nvmrc selects Node 24 LTS
npm ci
cp .env.example .env.local
npm run dev
```

Without configuration, public authentication pages explain the missing settings and protected routes fail closed to login. Set `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` and `NEXT_PUBLIC_SITE_URL` in ignored `.env.local`. Never use a service-role key. See [authentication setup](docs/authentication.md) for the disposable local Supabase/Mailpit stack, exact redirect URLs, confirmation/SMTP setup, Workers build/runtime variables, security boundaries and manual smoke tests.

## Commands

```sh
npm run lint
npm run typecheck
npm test
npm run format:check
npm run build
npm start
npx playwright install --with-deps chromium
npm run test:e2e
```

If browser downloads are restricted, use an installed Chromium with `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium npm run test:e2e` instead.

Playwright starts the development server automatically and exercises desktop Chromium and an emulated mobile Chromium viewport. `npm start` requires a successful build. `npm run format` formats source and configuration. Do not run development and production servers on the same port together.

Production builds use Next.js’s supported webpack builder because Turbopack build workers cannot bind a port in this cloud runtime. The development indicator is disabled so it does not cover the mobile bottom navigation.

## Architecture

- `src/app`: public auth routes, protected `(app)` routes, onboarding, root layout, theme and manifest.
- `src/features/sets` and `src/components/sets`: typed performance validation, secure actions and the workout logger.
- `src/features/auth`: strict validation, server actions, verified sessions and retry-safe account initialization.
- `src/components/auth`: shared accessible authentication presentation.
- `src/components/layout`: responsive application shell and navigation.
- `src/components/ui`: locally owned shadcn-compatible primitives; `components.json` defines generation aliases.
- `src/components/section-placeholder.tsx`: shared empty-state presentation.
- `src/config`: typed navigation configuration.
- `src/lib/supabase`: explicit, lazy browser/server integration boundaries.
- `src/lib/utils.ts`: class name composition.
- `tests/e2e`: user-visible route, theme, and keyboard checks; unit tests sit alongside source.

Add future domain modules under `src/features/<feature>` when business logic exists; avoid empty abstraction layers. Keep routes thin and share domain logic independently of web UI for future trainer/native clients.

## Cloudflare Workers and Supabase infrastructure (Phase 1.2)

The existing application, routes, Next.js build, and `src/lib/supabase/` helpers are preserved. Root `supabase/config.toml` was generated with the pinned official CLI; SQL belongs only in `supabase/migrations/` (Phase 2.1 now contains its initial local-only schema). The config is local-development scaffolding, not a production authentication configuration. The Phase 1.2 setup did not add tables or auth features; the subsequent Phase 2.1 local migration is described below.

Cloudflare support uses the documented OpenNext adapter compatible with Next.js 16.4.4. `wrangler.jsonc` and `open-next.config.ts` define a reproducible local Worker build with Node compatibility and static assets. The Worker name `body` is confirmed by its Cloudflare Workers Builds log. The empty `previews` block supports branch previews without tracking dashboard-managed variables. No production deployment script or GitHub deployment workflow is enabled. Cloudflare Workers Builds should use `npm run cf:build` as its build command and retain `npx wrangler preview` for branch deployment.

```sh
npm run cf:build    # Builds Next.js, then adapts it for Workers
npm run cf:check    # Wrangler dry-run; does not upload or deploy
npm run cf:preview  # Local Workers runtime; requires cf:build first
npm run supabase -- --version
npm run db:start   # Docker: local Postgres only
npm run db:reset   # Destructively recreates LOCAL database from migrations
npm run db:lint    # Local database checks, warnings fail
```

See [Phase 1.2 infrastructure guide](docs/infrastructure.md) for the deployment investigation, exact Cloudflare build/runtime variable steps, CLI linking and migration commands, native GitHub migration integration, safeguards, validation evidence, and official references. CLI 3 defaults database commands to local; remote targets require explicit `--remote`. Do not use older CLI examples with the removed `--local` flag.

Manual setup checklist:

- Confirm the existing Worker identity and deployment pipeline; reconcile its routes and bindings with Wrangler before any approved deployment. Do not replace the working deployment based on the local template.
- Create a dedicated Supabase development project, check its PostgreSQL major version against `supabase/config.toml`, and securely configure the public project URL and publishable key in `.env.local`.
- In the existing Cloudflare Worker settings, configure both public values under **Build variables and secrets** and runtime **Variables and Secrets**, using the same target project. Rebuild after changing public values.
- Link the CLI to the development project using personal CLI authentication (not application keys). Remote commands require separate authorization.
- When ready for database delivery, configure **only** Supabase’s native GitHub integration for `main`, working directory `.`, with reviewed migration checks and protected branches. Do not add an Actions migration deployer alongside it.
- Obtain explicit approval before any production Worker deployment or database change.

## Initial database schema (Phase 2.1)

[Database design, relationships, security boundaries, and local validation](docs/database-schema.md) document the 18-table initial migration. It separates private preferences, normalized exercise classifications, non-calendar program cycles, and actual workout history. All exposed tables enable RLS. Phase 2.2 adds narrow authenticated owner/catalog grants and policies; anonymous access remains denied. See [the authorization matrix](docs/database-security.md). Those database phases introduced no auth UI; Phase 3.1 adds it without changing their migrations.

```sh
npm run db:start
npm run db:reset # deletes/recreates the disposable LOCAL database only
npm run db:lint
npm run db:test
```

The tests use synthetic fixtures and temporary grants inside a rollback transaction. Phase 2.1 is merged into main; its existing migration must remain immutable. The new Phase 2.2 security migration is validated locally only. Confirm preview migration automation is disabled for its new branch before publication; the connected integration could otherwise apply SQL remotely. See [database security](docs/database-security.md) for Phase 3 provisioning and the per-table authorization matrix. No remote SQL or migration-history operation was run by Phase 2.2.

## Design and PWA status

System preference controls light and dark themes without client-side theme flashes. Navigation uses a mobile bottom bar and desktop sidebar; links retain visible focus states and a skip link. The layout respects mobile safe areas and reduced motion. No remote fonts or assets are required.

A standalone manifest, SVG icon, viewport metadata, and Apple web-app metadata establish the PWA foundation. Offline support, service worker, raster install icons, update handling, and cross-platform installation validation are intentionally deferred. Do not cache private training data by default. This is not yet a complete installable/offline PWA.

## Foundation requirements audit

All eleven scaffold tasks are implemented. This describes the foundation, not completed workout or backend functionality.

| Requirement                                       | Implementation                                                                                                       |
| ------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| 1–4. Inspect and preserve or initialize the stack | The initial repository had no source or commits. The requested stack was initialized; this audit preserves it.       |
| 5. Scalable folders                               | Thin App Router routes, shared layout/UI components, typed navigation, and separate Supabase integration boundaries. |
| 6. Lint, format, and test tooling                 | ESLint flat config, Prettier with Tailwind ordering, strict typecheck, Vitest/Testing Library, and Playwright.       |
| 7. Six placeholder routes                         | `/dashboard`, `/workout`, `/programs`, `/history`, `/feed`, `/profile`; `/` redirects to dashboard.                  |
| 8. Responsive shell                               | Mobile bottom bar, desktop sidebar, current-page labels, skip link, safe-area spacing, and system light/dark themes. |
| 9. Configuration example                          | `.env.example` documents public Supabase settings and the canonical app origin without credentials.                  |
| 10. Local instructions                            | This README covers Node, dependencies, development, production, checks, and manual Supabase setup.                   |
| 11. Agent instructions                            | `AGENTS.md` covers architecture, conventions, validation, security boundaries, and product decisions.                |

The shadcn approach uses locally owned component source and `components.json`, rather than a runtime component-library package. The initial Button uses Radix Slot, CVA, and the shared `cn` helper. Supabase Auth and owner database policies are implemented and tested locally; hosted configuration and deployment verification still require manual setup. The webpack build choice is explained above.

Node types track Node 24 to avoid accidentally accepting APIs unavailable in the supported runtime. ESLint 9 is retained for compatibility with the React and accessibility plugins used by Next.js; that major is deprecated upstream. Upgrade when the plugin peer ranges support ESLint 10 rather than forcing incompatible peers.

Browser checks cover all routes, active navigation, desktop/sidebar and mobile/bottom positioning, mobile touch-target dimensions, narrow-screen overflow, system theme changes, primary-action colors, the manifest, and keyboard skip navigation. These checks do not establish a complete accessibility audit or native-device compatibility. Run the commands above to validate future changes.

## Phase 3.1 authentication

Read [the authentication guide](docs/authentication.md) before enabling live signup. It records the read-only code/database preflight, local functional tests, account-deletion boundaries, session/caching behavior, SMTP sender versus inbox distinction, manual Cloudflare/Supabase setup and future OAuth requirements. No hosted data/schema, deployed migrations, production secrets or infrastructure are changed by this phase. Publication remains gated on confirming branch deployment automation will not violate this scope.

## Phase 4.1 exercise library

Open **Workout → Explore exercise library**. The protected library supports name search, combined movement/muscle/equipment/type filters, details, favorites/preferences and private custom creation/editing/archiving. The initial versioned catalog has 183 exercises (105 compound, 63 isolation, 15 other). Recommendations use explicit hard constraints and deterministic ranking; they do not log workouts or generate programs.

Read [the exercise library guide](docs/exercise-library.md) for taxonomy, machine-specific equipment, migration strategy, atomic invoker writes, local test setup, ranking weights, history behavior and reviewed deployment requirements. Run `npm run catalog:check` alongside app/database checks. The two new migrations require review and explicit approval before hosted application; existing applied migrations are unchanged.

## Phase 4.2 / 5.1 visuals and workouts

The Workout page now starts or resumes one ad-hoc session, saves exercise selections, supports adjacent reordering/non-destructive removal and closes by finishing or abandoning. No set logging or program generator is implemented. Finishing without sets stays explicitly unlogged rather than fabricating work.

Local SVG thumbnails cover library cards/details, the shared selector and workout lists: 8 specific mappings, 29 movement-family assets and a generic fallback. Read [exercise visuals](docs/exercise-visuals.md) and [workout lifecycle](docs/workout-lifecycle.md) for architecture, safeguards, tests and manual delivery steps. The single new forward migration requires reviewed application before deploying this version; old migrations and Workers configuration are unchanged.

## Phase 6.2 continuity and records

See [workout continuity](docs/workout-continuity.md) and [Personal Records](docs/personal-records.md) for server activity, recovery, expiration, exact rep records and validation. The two new forward migrations must be reviewed/applied in order before this app version is deployed. Local tests use disposable Supabase only; no hosted changes or production deploy are included.

See the [Phase 6.2 validation and release checklist](docs/phase-6-2-validation.md) for executed checks, migration order and known limits.

## Phase 6.3 progress and meaningful recognition

History → Training progress opens the workout overview/calendar, qualified duration averages, weekly sets, per-exercise external volume and separate muscle exposure. Exercise Look Back adds interactive date/metric/load views with accessible point details and tables. Records now use Best Single/Triple/Five-Rep Set terminology and show source dates/workouts. Historical dominance suppresses redundant recognition without changing exact records. Read [progress analytics](docs/progress-analytics.md) and [intelligent PR recognition](docs/intelligent-pr-recognition.md). Two forward migrations require reviewed application in order before deployment. This phase is handed over locally for the user to push and create a PR; no remote database change or production deployment is performed.

See the [Phase 6.3 validation and handoff](docs/phase-6-3-validation.md) for actual check counts, migration prerequisites, limitations and manual push/PR instructions.
