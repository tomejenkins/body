# Working on Body

## Architecture and conventions

Use the existing checkout: cloud tasks are isolated; do not create worktrees unless explicitly requested. Use Node 24 LTS and npm with the committed lockfile (`npm ci`).

Use Next.js App Router and strict TypeScript. Default to Server Components; add client boundaries only for browser state or interaction. Keep route modules thin. Shared presentation belongs in `src/components`, primitives in `src/components/ui`, typed app configuration in `src/config`, and integration code in `src/lib`. Introduce feature modules under `src/features` as real domain behavior is implemented. Prefer named exports for shared code, explicit props, and no `any` or non-null assertions without evidence. Use the `@/` alias and `cn` for conditional Tailwind classes. Keep shadcn primitives locally owned and accessible.

## Product decisions

Mobile-first, premium and quiet. Follow system light/dark preference, respect reduced motion and safe areas, retain keyboard focus and accessible labels, and keep touch targets usable. Avoid unnecessary modals and navigation. No invented user records or mock production authentication. Workout logging, programs, recommendations, records, trainer support, and social behavior are not implemented in this foundation. Sharing must be private by default when built, enforced with database policies rather than UI labels. Keep business logic reusable for future native clients.

## Supabase and security

Never commit secrets. `.env.example` documents public configuration only. The shell must work unconfigured; adapters fail clearly when invoked without configuration. Never expose service-role credentials. Implement real Supabase auth, server-verified authorization, session refresh, migrations, and row-level security before storing user data. Server adapter cookie writes require a Server Action or Route Handler. Never silently swallow session errors or cache personal information in a service worker.

## Validation

Run `npm run lint`, `npm run typecheck`, `npm test`, `npm run format:check`, and `npm run build` for changes. Run `npm run test:e2e` for routing, shell, accessibility, or layout changes (install Chromium via Playwright first). Add meaningful behavior tests when adding functionality. Unit tests sit next to source; browser tests live in `tests/e2e`. Report skipped or blocked checks accurately. No claim of complete auth, PWA, or workout behavior without functional validation.

## Scope

Keep initial work focused. Review existing code before replacing it, preserve local work, use supported dependencies, and never change package integrity checks to force installation. PWA offline support and platform-specific install validation are separate work.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
