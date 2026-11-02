# Body

A mobile-first foundation for a premium workout tracker. The repository was empty at initialization; no existing stack was replaced.

## Stack and scope

Next.js App Router, React, strict TypeScript, Tailwind CSS v4, shadcn/ui-style local components (Radix Slot, CVA, `cn`), and Supabase SSR/browser adapters. ESLint, Prettier, Vitest, Testing Library, and Playwright provide checks. Node 24 LTS and npm are the validated tools; the npm lockfile pins dependencies.

The dashboard, workout, programs, history, feed, and profile routes are presentation placeholders. No workout logic, database schema, session handling, authentication flow, recommendations, social access controls, or trainer capabilities are implemented. Private-by-default sharing is a product requirement, not a claim of implemented database security.

## Local setup

```sh
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

## Design and PWA status

System preference controls light and dark themes without client-side theme flashes. Navigation uses a mobile bottom bar and desktop sidebar; links retain visible focus states and a skip link. The layout respects mobile safe areas and reduced motion. No remote fonts or assets are required.

A standalone manifest, SVG icon, viewport metadata, and Apple web-app metadata establish the PWA foundation. Offline support, service worker, raster install icons, update handling, and cross-platform installation validation are intentionally deferred. Do not cache private training data by default. This is not yet a complete installable/offline PWA.
