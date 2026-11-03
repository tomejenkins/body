# Phase 1.2: Workers and Supabase foundation

## Deployment investigation and choice

The fetched GitHub default branch contained the merged foundation audit, Next.js 16.4.4, webpack builds, and no Wrangler file, Cloudflare adapter, deployment workflow, or `.github/workflows/` directory. No Cloudflare or Supabase credentials were injected. This repository therefore did not describe a reproducible Workers deployment. The current live Worker identity, dashboard build commands, bindings, routes, and deployed revision cannot be established from repository evidence. No live service was inspected or changed.

Current Cloudflare docs recommend vinext for new setups; vinext is a Vite-based implementation of the Next.js API surface. This existing app instead retains its real Next.js compiler and uses the still-documented OpenNext adapter. The pinned `@opennextjs/cloudflare` 1.20.15 declares Next.js `>=15.5.28 <16 || >=16.4.1` and Wrangler `^4.148.0`; installed Next.js 16.4.4 and Wrangler 4.156.2 satisfy those ranges. Do not bypass compatibility checks. No Pages adapter, static-export rewrite, Edge runtime, persistent R2 cache, or image service was introduced.

`npm run cf:build` invokes the adapter, which runs the existing `npm run build` and emits `.open-next/worker.js` plus `.open-next/assets`. Wrangler enables `nodejs_compat`, uses a fixed compatibility date, binds `ASSETS`, and binds the Worker to itself. The current static shell needs no provisioned database, R2, or KV resources. Before adding ISR, cached data, or image optimization, review the adapter's resource requirements. `public/_headers` caches only content-addressed Next static assets. Generated output is ignored by Git, lint, formatting, and TypeScript.

To run the existing desktop/mobile suite against the local Worker, leave `npm run cf:preview -- --port 8787` running in another terminal, then run:

```sh
PLAYWRIGHT_BASE_URL=http://127.0.0.1:8787 npm run test:e2e
# In this cloud workspace add PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium.
```

The optional base URL disables Playwright's automatic Next.js server; without it, the original test workflow is unchanged.

`cf:preview` is local Workers emulation; `cf:check` is `wrangler deploy --dry-run` and does not upload. Neither establishes remote deployment success. The `body-local` name is a local validation identity, not a production target. No deploy npm script, new GitHub workflow, automatic migration mechanism, resource creation command, or production deployment was enabled.

## Local and Cloudflare public configuration

The unchanged browser/server helpers read these exact properties:

| Key                                    | Value source                                  | Handling                                                                |
| -------------------------------------- | --------------------------------------------- | ----------------------------------------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`             | Supabase project Connect dialog / project URL | Public URL for the intended development or production project.          |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Supabase API Keys / publishable key           | Browser-safe public key. Never substitute a secret or service-role key. |

Copy `.env.example` to `.env.local` only if that file does not exist; populate both values securely. Next.js loads the root `.env.local` for `next dev` and builds. OpenNext preview loads Next.js environment files too; its default `NEXTJS_ENV` is `production`, and `.env.local` applies there. If using environment-specific development files, put `NEXTJS_ENV=development` in an ignored `.dev.vars` file. Never commit `.env.local` or `.dev.vars`.

Both `NEXT_PUBLIC_*` properties are statically inlined by Next.js. Supply them before `cf:build`; changing only runtime variables cannot change a browser bundle. Rebuild for each target project. The current shell deliberately builds without them because no Supabase call occurs until a helper is invoked. An unconfigured shell passing tests is not a Supabase connectivity check.

For the **existing** Cloudflare Worker, an authorized maintainer should:

1. Open Cloudflare **Workers & Pages**, select the existing Worker, and record its name, account, deployed revision, routes/custom domains, bindings, and current Git/build setup. Do not create a replacement Worker.
2. Before adopting this config, reconcile the Wrangler name and self-reference service with that actual Worker. Import/review all existing bindings and routing configuration so a later deploy cannot silently drop or replace them. Preserve the current pipeline until a non-production validation and production approval are complete.
3. If using Workers Builds, open **Settings → Build → Build variables and secrets** (the build-configuration section), add `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` with the intended project's public values. Set Node to 24 (`NODE_VERSION=24` if required by the build image). Retain root directory `.`. Use `npm ci --include=dev` for installation (the adapter is a build-time dev dependency) and `npm run cf:build` for the adapter build when the change is approved.
4. Separately open **Settings → Variables and Secrets**, add those same two names/values as runtime text variables, and save for the corresponding environment. Build and runtime values must refer to the same project. `keep_vars: true` preserves dashboard-defined variables on future Wrangler deployments; it does not configure build values.
5. Keep preview and production environments separate. For the manual CLI build path, securely export the public values before `npm run cf:build` or use the ignored local environment file. CLI deployment credentials (`CLOUDFLARE_API_TOKEN` and account selection) belong in a secret store/shell, never the repository.
6. Only after confirming the target and receiving deployment approval, the documented adapter deploy command is `npx opennextjs-cloudflare deploy -- --keep-vars`. If using Workers Builds instead, configure that as its deploy command and retain exactly one Worker deployment path. Do not run it as a validation check. Confirm the live root redirect and all six routes afterward.

Do not put database passwords, Supabase personal access tokens, or service-role keys in `NEXT_PUBLIC_*`, Cloudflare public variables, `.env.example`, or `wrangler.jsonc`. Existing future server-only secrets must remain server-only and need a separate authorized configuration change.

## Supabase CLI workspace

The official `supabase init` command generated `supabase/config.toml` and `supabase/.gitignore`. `supabase/migrations/.gitkeep` retains the empty migration directory. Seeds are disabled because there is no application data or seed file. `project_id = "body"` identifies the local Docker stack, **not** a hosted project reference. Generated `.temp` and branch metadata are ignored, along with local `signing_keys.json` private signing material. CLI access tokens belong in the CLI user configuration or a secret manager outside the checkout, never in repository files. No application SQL, tables, authentication code, or subscription behavior exists in this change.

Use the committed CLI 3.0.0 from the repository root:

```sh
npm ci
npm run supabase -- --version
npm run db:start
npm run db:reset
npm run db:lint
```

Docker must be running. `db:start` starts Postgres only for schema work; `npm run supabase -- start` starts the complete local Supabase service stack when later features need it. The CLI's standard system schemas are infrastructure, not application tables. `db:reset` deletes and recreates **local** data; never use it against a shared project. CLI 3 defaults DB commands to local and uses `--remote` for hosted operations. Older `--local`/`--linked` examples are not the pinned CLI's interface.

To link a **dedicated development project**, not production:

1. Create/select a development project in the Supabase dashboard and note its project reference and PostgreSQL version. The generated local default is PostgreSQL 17; reconcile `db.major_version` with the development target before validation.
2. Run `npm run supabase -- login` in a private terminal, or inject a scoped `SUPABASE_ACCESS_TOKEN` from a secret manager. Never paste credentials into chat, commit them, or save CLI credentials in application public variables. Supply `SUPABASE_DB_PASSWORD` securely in the shell if required by the selected project/command; prefer interactive secure entry or your secret manager over command-line arguments/history.
3. Set a non-secret shell selector `SUPABASE_PROJECT_ID` to that development reference and run `npm run supabase -- link --project-ref "$SUPABASE_PROJECT_ID"`. Inspect the selected project in the dashboard before any write. Linking records ignored local metadata; it does not apply migrations.
4. Do not pull an existing production schema or baseline it during this phase. If the development database already contains application objects, stop and plan a separately reviewed baseline so future migration history is consistent.

No remote linking or migration push was run here.

## Future migration workflow (not executed in Phase 1.2)

Use root `supabase/migrations/`, never `src/lib/`. Generate timestamped, descriptive snake_case names with the official CLI:

```sh
npm run supabase -- migration new describe_the_change
# Edit/review the generated supabase/migrations/<timestamp>_describe_the_change.sql.
npm run db:start
npm run db:reset
npm run db:lint
# Add meaningful database/security tests when real application objects exist.
```

No application migration should be authored merely to test infrastructure. `.gitkeep` is not SQL and is not a migration. Commit future reviewed migrations, keep applied shared migrations immutable, and correct mistakes with a new forward migration. Review destructive SQL, locks, grants, RLS, and data backfills. Never use production user data for local seeds.

Any remote database modification—including a development project—requires explicit user approval for the target and operation. These documented commands do not grant that approval. Future exposed user-data tables must enable RLS through versioned migrations and include tests for allowed owner access and denied anonymous/cross-user access before application use. No such tables or policies are added in Phase 1.2.

For a separately authorized development deployment, after verifying the linked target:

```sh
npm run supabase -- migration list --remote
npm run supabase -- db push --remote --dry-run
# Only after reviewing the plan and obtaining authorization for the target:
npm run supabase -- db push --remote
npm run supabase -- migration list --remote
```

Dry-run still requires remote access, and it is not an approval to apply. No remote commands in this section were executed. Do not use remote `db reset`, automatic repair, or broad `--include-all` flags to force deployment. Production changes require target confirmation, reviewed PRs, verified development results, backup/PITR readiness, a forward recovery plan, and explicit approval before enabling an automatic delivery mechanism.

## One automated migration path: native Supabase GitHub integration

Supabase's official GitHub integration supports deploying new migrations on pushes/merges to its configured production branch. It is the recommended path here; no migration-deploy GitHub Actions file was added and no integration was enabled.

When ready and authorized:

1. In the intended project's **Project Settings → Integrations → GitHub Integration**, authorize the official Supabase app for `tomejenkins/body`.
2. Set the working directory to `.` (the parent of root `supabase/`), production branch to `main`, and enable **Deploy to production** only after approving the target and automatic-deployment policy. Confirm plan/organization branching availability first. Start by validating against a dedicated development project or Supabase preview branch.
3. If using automatic preview branching, enable **Supabase changes only** and make the actual Supabase migration/preview status check required on protected `main`. Require review of migration changes before merge. Preview branches need replayable migrations and do not clone production data.
4. Do not configure remote-specific `config.toml` blocks to push local auth/seed settings into production. Inspect integration deployment logs and migration history after each approved merge. The generated config is not a production auth policy.
5. Do not also add a GitHub Actions `db push` deployer or a second manual automatic job. If native integration is unavailable for the account, first disable/abandon it explicitly, then separately review an Actions fallback using protected environments, scoped `SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD`, a verified project reference, and an approval gate. No fallback is enabled in this change.

The native integration uses its authorized GitHub/Supabase connection; it does not require storing production database credentials in this repository.

## Validation record

Verified in the cloud workspace:

| Check                                                        | Result                                                                                                               |
| ------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------- |
| Frozen-lockfile install                                      | `npm ci --include=dev` passed with the committed lockfile.                                                           |
| Lint, strict typecheck, formatting                           | Passed.                                                                                                              |
| Vitest                                                       | 2 tests passed.                                                                                                      |
| Next.js production build                                     | Passed through the adapter's invocation of the unchanged `npm run build`.                                            |
| OpenNext Worker build                                        | Passed for Next.js 16.4.4, OpenNext 1.20.15, Wrangler 4.156.2.                                                       |
| Wrangler dry-run                                             | Passed; Worker and assets packaged locally, no upload.                                                               |
| Local Workers HTTP behavior                                  | Root redirect, all six route responses/headings, 404, manifest, and immutable Next static asset cache header passed. |
| Playwright against local Workers                             | 10 desktop/mobile Chromium tests passed.                                                                             |
| Original Next.js development-server Playwright path          | 10 desktop/mobile Chromium tests passed.                                                                             |
| Official CLI initialization/version                          | Passed with Supabase CLI 3.0.0.                                                                                      |
| Docker/local database start and reset                        | Passed; the empty migration workspace replayed successfully and `.gitkeep` was skipped as expected.                  |
| Local database lint                                          | Passed with warnings configured to fail; no schema errors. There are no application objects to validate.             |
| Application table check                                      | `public` contains zero tables after the reset.                                                                       |
| Real Supabase connection/link, remote migration plan or push | Not run: hosted credentials/project selection unavailable and remote writes outside this task.                       |
| Live Cloudflare deployment/settings/routing inspection       | Not run: no account access or verified Worker identity. No production deployment attempted.                          |

Installation retains upstream deprecation warnings for the existing ESLint 9 and transitive `glob`/`node-domexception` packages; no unsupported forced dependency overrides were added.

Docker was available. ECR image pulls were denied by network policy; the CLI successfully fell back to official GHCR images without disabling verification. Wrangler could not fetch optional live `Request.cf` metadata and used local defaults; that warning did not prevent local runtime checks. Local services used for validation are stopped after checks; the usual startup commands are needed to run them again.

Local build/runtime compatibility is distinct from a production deployment and from real Supabase access. The production Worker identity, route/binding reconciliation, real public values, and native GitHub integration remain manual setup prerequisites. No hosted integration or deployment has been enabled.

## Official references

- [Cloudflare Next.js deployment choices](https://developers.cloudflare.com/workers/framework-guides/web-apps/nextjs/)
- [Cloudflare documented OpenNext setup](https://developers.cloudflare.com/workers/framework-guides/web-apps/opennext/)
- [OpenNext existing-app setup](https://opennext.js.org/cloudflare/get-started)
- [OpenNext public build and runtime environment variables](https://opennext.js.org/cloudflare/howtos/env-vars)
- [Next.js public environment variable inlining](https://nextjs.org/docs/app/guides/environment-variables)
- [Supabase CLI](https://supabase.com/docs/guides/local-development/cli/getting-started)
- [Supabase environments and migrations](https://supabase.com/docs/guides/deployment/managing-environments)
- [Supabase native GitHub integration](https://supabase.com/docs/guides/deployment/branching/github-integration)
