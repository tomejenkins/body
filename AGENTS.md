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

## Phase 1.2 infrastructure boundaries

Keep the normal Next.js app, route structure, and Supabase helper APIs intact. The pinned OpenNext adapter builds the current Next.js output for Workers; `npm run build` remains the Node production build. `wrangler.jsonc` uses `body-local` only for local validation. Before deployment, confirm the actual Worker, account, deployment mechanism, routes, and bindings; never replace or deploy production infrastructure without explicit approval. Keep `name` and `WORKER_SELF_REFERENCE.service` aligned. Keep dashboard-managed runtime variables with `keep_vars`; public Next.js values must also be provided at build time. Never put secrets in Wrangler, client bundles, `.env.example`, logs, or committed files. Avoid importing Cloudflare runtime globals into shared browser code. Read `docs/infrastructure.md` before infrastructure work.

Any modification to a remote Supabase database, including a development project, requires explicit user approval for that target and operation before execution. Documentation, linking instructions, and a successful dry-run do not supply write approval. Do not run remote migration pushes, schema changes, seeds, resets, or migration-history repairs as routine validation.

Future exposed user-data tables must enable PostgreSQL row-level security through versioned SQL migrations before application access is introduced. Default to denied access and add narrowly scoped policies and grants. Require database tests proving the intended owner access and rejection of anonymous and other users' access. Cover each exposed operation; a UI check or lint pass is not an authorization test. Do not create tables or policies during Phase 1.2.

Root `supabase/` is the CLI workspace; `src/lib/supabase/` contains application adapters, never migration SQL. Use the exact CLI version in package-lock.json via `npm run supabase -- ...`. CLI 3 defaults database commands to local; remote access requires `--remote`. Use a dedicated development project, and verify project identity before linking or remote operations. Never run remote reset, repair migration history, or push a migration to production as routine validation.

Create future migrations with `npm run supabase -- migration new <snake_case_description>`. Preserve generated timestamp ordering, review generated SQL, and commit each migration. Once applied to a shared environment, migrations are immutable; use a new forward migration for corrections. Do not commit real seed data, passwords, generated `.temp` files, or tokens. Seeds are disabled in Phase 1.2. Match local PostgreSQL major version to the target project. No application schema or authentication flows should be added during this phase.

Before proposed database changes: recreate the disposable local database with `npm run db:reset`, run `npm run db:lint`, and add meaningful database behavior/security tests when tables exist. A schema with no application objects does not validate application authorization. Database changes need PR review and a verified development run. Production changes require explicit approval, target confirmation, backup/PITR readiness, and a forward recovery plan; use expand/contract changes and review locking/destructive operations.

The single recommended migration delivery path is Supabase's native GitHub integration from protected `main`, with working directory `.`. Configure its preview/migration status as a required check. Do not enable a parallel GitHub Actions `db push` deployer. Enabling the integration is an infrastructure action and is not part of local validation. Any fallback to Actions requires first confirming native integration is unavailable and disabling the original deployment mechanism; keep credentials in protected GitHub environments, never source control.

Infrastructure validation includes `npm run cf:build`, `npm run cf:check`, and representative requests against `npm run cf:preview`, in addition to the usual app checks. `cf:check` is dry-run only. Report local Worker compatibility separately from remote deployment, real Supabase connectivity, and migration application.

## Scope

Keep initial work focused. Review existing code before replacing it, preserve local work, use supported dependencies, and never change package integrity checks to force installation. PWA offline support and platform-specific install validation are separate work.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
