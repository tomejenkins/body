# Cloudflare staging deployment

## Failure and repository fix

The reported staging job ran `npm run build`, then `npx wrangler deploy`. A plain Next.js build generates `.next`, not the OpenNext Worker and compiled adapter configuration. The pinned Wrangler can delegate OpenNext deployment to the adapter, whose deploy helper expects `.open-next/.build/open-next.config.edge.mjs`. That explains “Could not find compiled Open Next config.” Changing the Worker name alone does not generate the missing output.

Use the adapter build before deployment. This PR adds a named `staging` environment and explicit commands while preserving every existing top-level production Wrangler setting and existing production npm script. It changes no application, Supabase migration, Stripe SDK/API version or hosted setting.

| Target              | Wrangler selection             | Worker name    | Self-reference service |
| ------------------- | ------------------------------ | -------------- | ---------------------- |
| Existing production | Top level; no staging selector | `body`         | `body`                 |
| Persistent staging  | `--env staging`                | `body-staging` | `body-staging`         |

Staging redeclares the non-inherited service binding and explicitly declares its own `ASSETS` binding. Its empty `routes` list prevents attaching production routes; `workers_dev: true` allows its separate workers.dev URL. No production custom domain is added. If a staging custom domain is needed, declare only that approved domain/route under `env.staging` in a separate reviewed change before using it as the canonical origin; changing the origin variable alone does not configure routing. `keep_vars` is a top-level-only setting and remains `true`, applying to the selected Worker's own dashboard variables, not copying variables between Workers. Secrets are also separate per Worker.

`open-next.config.ts` needs no change: the existing `defineCloudflareConfig()` has no shared external cache resources or hard-coded production Worker name. The adapter reads the selected Wrangler configuration during build/deploy. The binding name stays `WORKER_SELF_REFERENCE`; its **service target** changes per environment. `--name body-staging` alone is not equivalent to selecting `--env staging`, because renaming alone does not select the staging bindings.

## Exact commands

Run from the repository root after installing the committed dependencies with Node 24 and `npm ci --include=dev`:

```sh
# Builds Next.js and the OpenNext Worker, compiled config and assets.
npm run cf:build:staging

# Validation only: never uploads or deploys.
npm run cf:check:staging

# Local emulator only; not a hosted preview upload or deployment.
npm run cf:preview:staging -- --port 8787
```

The staging deploy command, **for a separately authorized deployment only**, is:

```sh
npm run cf:deploy:staging
```

Its exact expansion is `opennextjs-cloudflare deploy --env staging -- --keep-vars`; the build expansion is `opennextjs-cloudflare build --env staging`. Both use the repository's pinned adapter, and the adapter forwards the staging environment to Wrangler. Do not substitute `npm run build`, bare `npx wrangler deploy`, `--name` alone, or the local preview command.

Build output remains `.open-next/worker.js`, `.open-next/assets` and `.open-next/.build/open-next.config.edge.mjs`. Each environment needs a fresh build with its own public variables. Do not reuse a production artifact in staging or promote a staging artifact to production: `NEXT_PUBLIC_*` values are compiled into browser assets. The shared local output directory is overwritten by builds; use separate clean CI jobs and do not cache/share `.open-next` across environment jobs.

## Cloudflare dashboard settings to apply separately

Select **Workers & Pages → body-staging → Settings → Build**. Do not edit the existing `body` Worker's connection, branch, commands, variables or routing.

| Setting on `body-staging`                                       | Value                                                                                                                                |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Git repository                                                  | `tomejenkins/body`                                                                                                                   |
| Deployment branch (dashboard may call this “production branch”) | `staging`, as a dedicated staging promotion branch                                                                                   |
| Root directory                                                  | `.`                                                                                                                                  |
| Node version / build variable                                   | `NODE_VERSION=24`                                                                                                                    |
| Dependency installation                                         | Include dev dependencies; pinned adapter/Wrangler are dev dependencies. If installation is configurable, use `npm ci --include=dev`. |
| Build command                                                   | **`npm run cf:build:staging`**                                                                                                       |
| Deploy command                                                  | **`npm run cf:deploy:staging`**                                                                                                      |
| Build variable                                                  | **`CLOUDFLARE_ENV=staging`**                                                                                                         |
| Builds for other branches / remote previews                     | Leave disabled for this persistent staging Worker unless separately approved and configured as below.                                |

The `staging` branch is an operator setup requirement, not created or pushed by this PR. This feature PR does not activate its deployment. Before triggering a fresh build, promote a reviewed commit containing these scripts and the staging environment to that branch; retrying an older commit without them will not apply the repository fix. Keep the production Worker's existing production branch unchanged; do not configure staging promotion pushes to deploy the `body` Worker. If staging deliberately follows a different approved branch, change only `body-staging`'s branch setting and record it operationally.

All staging npm commands include `--env staging`; `CLOUDFLARE_ENV=staging` additionally makes a bare Wrangler command in that **staging job** select staging rather than the top-level production target. CLI `--env` takes precedence. Never set this selector globally for production jobs, append a conflicting `--env`/`--name`, or run another deployment workflow with unscoped commands. The existing production scripts continue to target `body` when run without a staging selector.

If remote branch previews are later enabled on `body-staging`, their build must also use the staging build command and staging public variables. Set the dashboard's **Preview command** to `npx wrangler preview --env staging`. That is a remote preview command, distinct from `npm run cf:preview:staging`, which starts local emulation. Configure any separate Preview variables/secrets against the staging resources only. The existing production `previews` block and production branch-preview workflow are unchanged by this PR.

Under these settings the staging deploy resolves to `body-staging`, never falls back to `body`, and binds only to itself. A repository configuration cannot guarantee safety if an operator replaces the commands, chooses a production selector, or copies production credentials. No Cloudflare dashboard/API configuration was inspected or changed here; the actual Git connection, branch restrictions, token/account selection, routes and settings above must be verified before enabling staging builds. Use approved deployment credentials scoped as narrowly as Cloudflare permits; an account-wide token is not a per-Worker security boundary.

## Staging variables and secrets

Configure **Build variables and secrets** and **Variables & Secrets** on `body-staging` independently. Build variables are not runtime variables. Public Next.js values must exist at build time **and** match runtime. Do not copy the production Worker's settings or rely on inheritance.

| Variable                               | Staging value source                                                                                          | Where                                  |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`             | URL of Body's dedicated staging Supabase project                                                              | Build and runtime                      |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Publishable key of that same staging project; never its secret/service-role key                               | Build and runtime                      |
| `NEXT_PUBLIC_SITE_URL`                 | Exact HTTPS origin of the staging Worker (its actual workers.dev URL or a separately approved staging domain) | Build and runtime                      |
| `CLOUDFLARE_ENV`                       | `staging`                                                                                                     | Build/deploy job only                  |
| `BODY_BILLING_MODE`                    | `test`                                                                                                        | Staging Wrangler vars; do not override |
| `BODY_BILLING_LIVE_APPROVED`           | `false`                                                                                                       | Staging Wrangler vars; do not override |

`staging` is a Wrangler environment, not a Next.js `NODE_ENV`. Keep the normal production Next build; do not set `NODE_ENV=staging` or `NEXTJS_ENV=staging`. Do not commit `.env*` or `.dev.vars*` files. Next also loads production-mode/local dotenv files: use a clean staging CI checkout and staging-only process variables, never a workstation's production `.env.local`. Worker selection does not rewrite an already-built Supabase URL or callback origin.

On the dedicated staging Supabase project, an authorized operator must verify its reviewed migration baseline (including both 7.7E entitlement migrations and 7.7F billing), set Auth's Site URL to the staging origin and allow its exact `/auth/callback` redirect used by signup/password recovery. Do not add production redirects or copy production users/training data. These are deployment prerequisites, not actions executed by this PR. Local `supabase/config.toml` does not configure hosted staging Auth.

For billing, use a dedicated **Stripe sandbox** with its test-mode resources. Configure these on `body-staging` as server-only runtime secrets/configuration, not `NEXT_PUBLIC_*`, committed Wrangler values or shared production build secrets:

| Name                                                | Required isolation                                                                     |
| --------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `SUPABASE_BILLING_SECRET_KEY`                       | Secret/service-role credential of the **staging Supabase project only**                |
| `STRIPE_SECRET_KEY`                                 | Supported sandbox/test credential, never a live key                                    |
| `STRIPE_WEBHOOK_SECRET`                             | Signing secret for the sandbox endpoint at the staging origin's `/api/billing/webhook` |
| `STRIPE_PREMIUM_PRODUCT_ID`                         | Sandbox Body Premium product                                                           |
| `STRIPE_MONTHLY_PRICE_ID`, `STRIPE_ANNUAL_PRICE_ID` | Sandbox prices matching the existing USD $6.99/month and $49.99/year contract          |
| `STRIPE_PORTAL_CONFIGURATION_ID`                    | Sandbox Portal configuration matching the existing billing policy                      |

The current billing adapter checks for `sk_test_` in test mode; using a least-privilege restricted `rk_test_` key would require a separate reviewed adapter change and tests. This deployment fix does not change that parser or upgrade billing APIs. The staging database's private billing environment must remain `test`. The committed staging flags reject live mode through the existing application guard; runtime catalog/webhook checks also verify resource mode. They do not validate that a copied Supabase credential belongs to the intended project—verify that identity separately.

Leave billing credentials absent until the staging project and sandbox are ready: the app then keeps its trial/history behavior and shows billing unavailable. Use the [existing billing setup/validation runbook](stripe-billing-setup.md) for signed events, reconciliation and Portal restrictions. No new Stripe resource, secret, webhook endpoint, hosted migration or Auth setting was created or changed here.

## Validation and release boundary

Local validation on Node 24.19.0, Next.js 16.4.4, OpenNext 1.20.15 and Wrangler 4.156.2:

| Check                                 | Result                                                                                                                                           |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `npm ci` with the committed lockfile  | Passed; no dependency/lockfile change                                                                                                            |
| Production configuration comparison   | Every top-level Wrangler property and existing npm script unchanged from main                                                                    |
| Wrangler normalized configuration     | Default `body`/self-reference `body`; staging `body-staging`/self-reference `body-staging`; staging assets, empty routes and test flags verified |
| Staging CI selector                   | `CLOUDFLARE_ENV=staging` without a CLI environment flag resolved to `body-staging`                                                               |
| `npm run cf:build:staging`            | Passed; generated Worker, assets and compiled OpenNext config                                                                                    |
| `npm run cf:check:staging`            | Passed; `WORKER_SELF_REFERENCE (body-staging)`, `ASSETS`, test mode and live-approval false; no upload                                           |
| Existing `npm run cf:check`           | Passed; `WORKER_SELF_REFERENCE (body)` and `ASSETS`, no staging vars; no upload                                                                  |
| ESLint / strict TypeScript / Prettier | Passed                                                                                                                                           |
| Vitest                                | 477 tests passed across 84 files                                                                                                                 |
| `cf:preview:staging` local smoke      | Root 307; login 200; Access/History 307 with private/no-store; offline 200; unconfigured billing webhook 503                                     |

The local smoke used the checkout's ignored loopback-only public configuration (canonical origin `http://127.0.0.1:3000`), not hosted staging credentials. Its protected-route redirects therefore pointed to that local origin. Miniflare reported a failed request-metadata fetch and used its existing local fallback; this did not prevent the smoke checks. No application/UI or database source was changed, and no full browser/authenticated-provider suite is claimed for this configuration PR. Prior billing release gates remain in the existing validation documents.

Local checks cannot confirm hosted variables, project identities, GitHub branch settings or actual sandbox Checkout/webhooks. Applying dashboard settings, retrying a hosted build, creating a staging Worker/domain or applying hosted migrations requires a separate authorized operational step. This PR neither merges nor deploys automatically.

Sources: [Cloudflare named environments](https://developers.cloudflare.com/workers/wrangler/environments/), [Workers Builds advanced setups](https://developers.cloudflare.com/workers/ci-cd/builds/advanced-setups/), [build settings](https://developers.cloudflare.com/workers/ci-cd/builds/configuration/), [OpenNext environment variables](https://opennext.js.org/cloudflare/howtos/env-vars), and [OpenNext bindings](https://opennext.js.org/cloudflare/bindings). CLI behavior was also checked against the installed, pinned adapter and Wrangler source/help.
