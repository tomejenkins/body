# Body

A mobile-first foundation for a premium workout tracker. The repository was empty at initialization; no existing stack was replaced.

## Stack and scope

Next.js App Router, React, strict TypeScript, Tailwind CSS v4, shadcn/ui-style local components (Radix Slot, CVA, `cn`), and Supabase SSR/browser adapters. ESLint, Prettier, Vitest, Testing Library, and Playwright provide checks. Node 24 LTS and npm are the validated tools; the npm lockfile pins dependencies.

The dashboard, workout, programs, history, feed, and profile routes are presentation placeholders. A local-only initial database schema is available in Phase 2.1. No application workout logic, session handling, authentication flow, recommendations, social access controls, or trainer capabilities are implemented. Private-by-default sharing is a product requirement, not a claim of implemented database security.

## Local setup

```sh
nvm use # optional; .nvmrc selects Node 24 LTS
npm ci
cp .env.example .env.local
npm run dev
```

The shell runs without Supabase configuration. Before using the adapters, create a Supabase project and set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` using its project settings. These are public client settings; never add a service-role key to a public variable. No backend calls occur until an adapter is invoked. Configure auth callbacks, session refresh, migrations, and row-level security in a separate feature task before handling user data. The server adapter writes cookies and must be called from a context that permits cookie writes (Server Action or Route Handler); do not use it for session refresh in a Server Component.

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

- `src/app`: route entry points, root layout, theme, and web manifest.
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

[Database design, relationships, security boundaries, and local validation](docs/database-schema.md) document the 18-table initial migration. It separates private preferences, normalized exercise classifications, non-calendar program cycles, and actual workout history. All exposed tables enable RLS. Phase 2.2 adds narrow authenticated owner/catalog grants and policies; anonymous access remains denied. See [the authorization matrix](docs/database-security.md). No UI, auth flow, remote migration, or deployment is included.

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
| 9. Configuration example                          | `.env.example` documents the two public Supabase settings without credentials.                                       |
| 10. Local instructions                            | This README covers Node, dependencies, development, production, checks, and manual Supabase setup.                   |
| 11. Agent instructions                            | `AGENTS.md` covers architecture, conventions, validation, security boundaries, and product decisions.                |

The shadcn approach uses locally owned component source and `components.json`, rather than a runtime component-library package. The initial Button uses Radix Slot, CVA, and the shared `cn` helper. Supabase is configured as an integration boundary; a hosted project and real authentication/database policies still require separate setup. The webpack build choice is explained above.

Node types track Node 24 to avoid accidentally accepting APIs unavailable in the supported runtime. ESLint 9 is retained for compatibility with the React and accessibility plugins used by Next.js; that major is deprecated upstream. Upgrade when the plugin peer ranges support ESLint 10 rather than forcing incompatible peers.

Browser checks cover all routes, active navigation, desktop/sidebar and mobile/bottom positioning, mobile touch-target dimensions, narrow-screen overflow, system theme changes, primary-action colors, the manifest, and keyboard skip navigation. These checks do not establish a complete accessibility audit or native-device compatibility. Run the commands above to validate future changes.
