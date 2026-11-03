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

Keep the normal Next.js app, route structure, and Supabase helper APIs intact. The pinned OpenNext adapter builds the current Next.js output for Workers; `npm run build` remains the Node production build. `wrangler.jsonc` names the existing `body` Worker, confirmed by its Workers Builds log. Remote branch previews require the `previews` block; keep their values dashboard-managed. Workers Builds must use `npm run cf:build` before `npx wrangler preview`; `cf:preview` is only local emulation. Before deployment, confirm the actual Worker, account, deployment mechanism, routes, and bindings; never replace or deploy production infrastructure without explicit approval. Keep `name` and `WORKER_SELF_REFERENCE.service` aligned. Keep dashboard-managed runtime variables with `keep_vars`; public Next.js values must also be provided at build time. Never put secrets in Wrangler, client bundles, `.env.example`, logs, or committed files. Avoid importing Cloudflare runtime globals into shared browser code. Read `docs/infrastructure.md` before infrastructure work.

Any modification to a remote Supabase database, including a development project, requires explicit user approval for that target and operation before execution. Documentation, linking instructions, and a successful dry-run do not supply write approval. Do not run remote migration pushes, schema changes, seeds, resets, or migration-history repairs as routine validation.

Future exposed user-data tables must enable PostgreSQL row-level security through versioned SQL migrations before application access is introduced. Default to denied access and add narrowly scoped policies and grants. Require database tests proving the intended owner access and rejection of anonymous and other users' access. Cover each exposed operation; a UI check or lint pass is not an authorization test. Do not create tables or policies during Phase 1.2.

Root `supabase/` is the CLI workspace; `src/lib/supabase/` contains application adapters, never migration SQL. Use the exact CLI version in package-lock.json via `npm run supabase -- ...`. CLI 3 defaults database commands to local; remote access requires `--remote`. Use a dedicated development project, and verify project identity before linking or remote operations. Never run remote reset, repair migration history, or push a migration to production as routine validation.

Create future migrations with `npm run supabase -- migration new <snake_case_description>`. Preserve generated timestamp ordering, review generated SQL, and commit each migration. Once applied to a shared environment, migrations are immutable; use a new forward migration for corrections. Do not commit real seed data, passwords, generated `.temp` files, or tokens. Seeds are disabled in Phase 1.2. Match local PostgreSQL major version to the target project. Phase 1.2 added no application schema or authentication flows. Phase 2.1 is authorized to add the initial model and tests locally only; authentication UI remains out of scope.

Before proposed database changes: recreate the disposable local database with `npm run db:reset`, run `npm run db:lint`, and add meaningful database behavior/security tests when tables exist. A schema with no application objects does not validate application authorization. Database changes need PR review and a verified development run. Production changes require explicit approval, target confirmation, backup/PITR readiness, and a forward recovery plan; use expand/contract changes and review locking/destructive operations.

The single recommended migration delivery path is Supabase's native GitHub integration from protected `main`, with working directory `.`. Configure its preview/migration status as a required check. Do not enable a parallel GitHub Actions `db push` deployer. Enabling the integration is an infrastructure action and is not part of local validation. Any fallback to Actions requires first confirming native integration is unavailable and disabling the original deployment mechanism; keep credentials in protected GitHub environments, never source control.

Infrastructure validation includes `npm run cf:build`, `npm run cf:check`, and representative requests against `npm run cf:preview`, in addition to the usual app checks. `cf:check` is dry-run only. Report local Worker compatibility separately from remote deployment, real Supabase connectivity, and migration application.

## Phase 2.1 database model

Read `docs/database-schema.md` before schema changes. The initial 18-table migration is merged into main and may already be deployed; never edit it. Run `npm run db:start`, `npm run db:reset`, `npm run db:lint`, and `npm run db:test` using the pinned CLI; all default to the disposable local target. Lint includes both `public` and internal `body_private` and excludes extension-owned test internals. Do not use `--remote`, hosted credentials, remote history repair, or remote reset as validation.

Phase 2.1 initially denied all client access. The Phase 2.2 forward migration adds reviewed authenticated owner/catalog policies and column-limited writes. Read `docs/database-security.md` for the current matrix; keep anonymous and service-role grants revoked and test success/denial together. Do not expose profiles, private preferences, catalogs, or security-invoker trigger helpers by accident. Weights are normalized external load in kilograms. Cycle positions are not weekdays. Historical snapshots and actual measurements are independent of mutable plans; derived records must be correctable.

Before publishing any new migration branch, confirm that the connected Supabase integration will not violate its local-only scope. Branch-specific exceptions do not authorize other branches or automatic merges. Present migrations/tests for review.

## Phase 2.2 authorization

The Phase 2.1 migration is merged and immutable. All Phase 2.2 changes go in a new forward migration. Use verified `auth.uid()`, explicit `TO authenticated`, both `USING` and `WITH CHECK` on UPDATE, narrow column grants, and the preserved composite owner/parent constraints. Keep identities, ownership, parent references and server timestamps out of client UPDATE grants. No user-metadata authorization, broad catalog writes, recursive policies, public profile/history reads, or privileged RPC shortcuts.

Profile, session and performed-exercise deletion remains denied to avoid cascaded history loss. Custom exercises/programs use archival; individual sets support explicit owner corrections/deletion. Classification writes require an owned custom parent; system catalogs are authenticated-read-only. Invoker exercise reference checks use ordinary SELECT so read-only system records remain usable without broadening write grants. Keep the private helper schema inaccessible and do not add SECURITY DEFINER just to pass tests.

Run the retained invariant suite and the exhaustive role/grant suite after a fresh local reset. A denial test must distinguish permission errors from zero-row RLS results and verify persisted state. No hosted SQL, remote migration, Cloudflare setting, auth UI or logging UI changes. Keep this branch local unless Supabase automatic migration deployment has been disabled specifically for Phase 2.2 and publication is authorized; previous branch exceptions do not carry over.

## Phase 3.1 authentication

Read `docs/authentication.md` before changing authentication. The earlier phase-specific bans on auth UI describe those completed phases; Phase 3.1 authorizes real email/password flows locally. Keep all previously deployed SQL immutable. No hosted database/auth settings or production accounts may be changed for validation.

Use `getUser()` to verify identity in server data loaders and write actions; protected layouts alone do not secure future actions. Never trust `getSession()` or editable metadata for authorization. Keep SSR cookie refresh and SDK cache headers, no-store private data, trusted canonical callback origins, and strict internal redirect validation. Preserve the Edge middleware compatibility choice until the pinned OpenNext adapter supports a verified replacement. Never log passwords, email callback queries, sessions or tokens.

Profile initialization must use verified user IDs, owner-scoped RLS, permitted INSERT columns, duplicate-safe rereads and partial retry. Never upsert immutable owner keys or overwrite existing profiles during initialization. Keep tests for validation, login failures, confirmation, refresh/expiry, sign-out, recovery, account retries, open redirects and cross-owner denials. Browser integration tests may use only disposable local Supabase/Mailpit synthetic users; their helper refuses hosted targets. Run all app, browser, database and Worker checks, reporting hosted verification separately.

Do not push this phase or open its PR until branch automation is verified compatible with no remote migration/deployment. Previous branch-specific authorizations do not carry over. No new schema, workout, subscription, social, OAuth or trainer logic belongs in Phase 3.1.

## Phase 4.1 exercise library

Read `docs/exercise-library.md` before exercise/catalog work. Phase 4.1 authorizes additive local forward migrations, curated system data, browsing, private custom edits/favorites and deterministic recommendations; it does not authorize hosted SQL or production deployment. Keep Phase 3.1 authentication intact and email/password-only for MVP. Do not add OAuth, workout logging, programs, social or trainer behavior.

Keep `exercise_type` independent and constrained to compound/isolation/other; require it in the editor and apply requested type as a hard recommendation constraint. Preserve the reviewed primary/secondary movement distinction, muscle roles, conjunctive equipment model, explicit None and machine-specific stations. Never fill a small recommendation pool with incompatible alternatives. Keep ranking weights, exclusions, duplicate rules and stable tie-breaking explicit in UI-independent TypeScript and covered by tests.

All system data belongs in reviewed forward migrations, never runtime seeding. Run `npm run catalog:check` to keep the initial snapshot and SQL in sync before first deployment; freeze them once shared. Future corrections require new migrations, not regenerating an applied file. Preserve user custom records and historical references. Keep SQL in root `supabase/`.

Custom writes verify identity and use the atomic SECURITY INVOKER editor with existing RLS/column grants, no owner parameter or privileged bypass. Never grant system catalog writes. Favorites and preference are independent; do not upsert immutable keys. Archive rather than delete exercises. Read actual owner-scoped history for recents without fabricating activity or persisting browse clicks. Validate forms both client/server and test cross-owner/system denials, atomic failures and archive/history preservation. Run app, database, catalog, browser and Workers checks. Publication must respect confirmed preview safety and explicit no-production-deployment scope.

## Scope

Keep initial work focused. Review existing code before replacing it, preserve local work, use supported dependencies, and never change package integrity checks to force installation. PWA offline support and platform-specific install validation are separate work.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
